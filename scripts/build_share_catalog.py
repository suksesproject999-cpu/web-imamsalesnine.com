#!/usr/bin/env python3
"""Generate public share pages + lightweight OG images + image/QR posters.

Uses read-only service-account OAuth to list cms_products (Firestore project apin-web).
Credentials MUST be provided via GitHub Actions secret FIREBASE_SERVICE_ACCOUNT_JSON.
Optional seed is store/produk.json. Does NOT write to Firestore.
Run from repository root: python scripts/build_share_catalog.py
Testing: python scripts/build_share_catalog.py --fixture tests/products-fixture.json
Requires: Pillow, qrcode. Network only required for public CMS and external images.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import html
import io
import json
import os
from pathlib import Path
import re
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps
import qrcode

HOST = 'https://store.imamsales.com'
DB = 'https://firestore.googleapis.com/v1/projects/apin-web/databases/(default)/documents'
ID_PATTERN = re.compile(r'^[A-Za-z0-9_-]{1,120}$')
MARKER = '<!-- ImamStore pre-generated share page -->'
MAX_IMAGE = 12 * 1024 * 1024
HEADERS = {'User-Agent':'ImamStore-ShareSnapshot/1.0', 'Accept':'application/json'}


def get_bytes(url: str, timeout=14, max_bytes=MAX_IMAGE, extra_headers=None) -> bytes:
    req = urllib.request.Request(url, headers={**HEADERS, **(extra_headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        length = response.headers.get('Content-Length')
        if length and int(length) > max_bytes:
            raise ValueError('image/file exceeds limit')
        data = response.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError('image/file exceeds limit')
    return data


def decode_field(v):
    if not isinstance(v, dict):
        return None
    for key in ('stringValue','booleanValue','timestampValue'):
        if key in v:
            return v[key]
    for key in ('integerValue','doubleValue'):
        if key in v:
            return float(v[key]) if key=='doubleValue' else int(v[key])
    if 'nullValue' in v:
        return None
    if 'arrayValue' in v:
        return [decode_field(x) for x in v['arrayValue'].get('values', [])]
    if 'mapValue' in v:
        return {k:decode_field(x) for k,x in v['mapValue'].get('fields',{}).items()}
    return None


def _firestore_bearer_header():
    """Use scoped service-account OAuth, never credentials embedded in source code."""
    credential_json = os.environ.get('FIREBASE_SERVICE_ACCOUNT_JSON', '').strip()
    if not credential_json:
        raise RuntimeError(
            'FIREBASE_SERVICE_ACCOUNT_JSON missing. Create a read-only service account '
            'in Firebase/Google Cloud and save its JSON securely under '
            'GitHub repository Settings > Secrets and variables > Actions. '
            'Do not put the JSON in Git or in chat.'
        )
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request
        info = json.loads(credential_json)
        if info.get('type') != 'service_account' or info.get('project_id') != 'apin-web':
            raise ValueError('Service account must belong to Firebase project apin-web')
        credentials = service_account.Credentials.from_service_account_info(
            info, scopes=['https://www.googleapis.com/auth/datastore'])
        credentials.refresh(Request())
        if not credentials.token:
            raise ValueError('Google OAuth did not return an access token')
    except Exception as exc:
        # No credential contents in logs.
        raise RuntimeError('Firestore authentication failed; verify the GitHub secret and service-account IAM role') from exc
    return {'Authorization': 'Bearer ' + credentials.token}


def load_firestore():
    auth_headers = _firestore_bearer_header()
    products=[]
    token=None
    for _ in range(200):
        qs={'pageSize':'50'}
        if token:
            qs['pageToken']=token
        url=DB+'/cms_products?'+urllib.parse.urlencode(qs)
        result=json.loads(get_bytes(url,timeout=24,max_bytes=48*1024*1024,extra_headers=auth_headers).decode('utf-8'))
        for row in result.get('documents', []):
            item={k:decode_field(v) for k,v in row.get('fields',{}).items()}
            item['id']=str(item.get('id') or row.get('name','').split('/')[-1])
            products.append(item)
        token=result.get('nextPageToken')
        if not token:
            return products
    raise RuntimeError('Too many CMS pages: stopped rather than silently truncating')


def clean_text(value, maximum=200):
    text=str(value if value is not None else '')
    text=re.sub(r'<[^>]*>',' ',text)
    return ' '.join(text.split())[:maximum]


def price(product):
    raw=product.get('harga')
    if isinstance(raw, dict):
        normal=raw.get('normal')
        promo=raw.get('promo')
    else:
        normal=raw
        promo=product.get('hargaPromo')
    try:
        normal=float(normal or 0)
    except (TypeError,ValueError):
        normal=0
    try:
        promo=float(promo or 0)
    except (TypeError,ValueError):
        promo=0
    return int(promo if 0<promo<normal or (promo>0 and not normal) else normal)


def photo_candidates(p):
    keys=('gambar','image','thumbnail','foto','fotoUtama','mainImage','photo','imageUrl')
    items=[p.get(key) for key in keys]
    for key in ('gallery','galeri','images','fotoProduk'):
        if isinstance(p.get(key),list):
            items.extend(p[key])
    for item in items:
        if isinstance(item,dict):
            item=next((item.get(k) for k in ('url','src','gambar','image') if item.get(k)),None)
        if isinstance(item,str) and item.strip() and not re.search(r'no-image|placeholder',item,re.I):
            yield item.strip()


def raw_photo(p, root:Path):
    for value in photo_candidates(p):
        try:
            if value.startswith('data:image/'):
                match=re.match(r'^data:image/(png|jpeg|jpg|webp|gif);base64,([\s\S]+)$',value,re.I)
                if match:
                    content=base64.b64decode(''.join(match.group(2).split()),validate=True)
                    if 0<len(content)<MAX_IMAGE:
                        return content
                continue
            parsed=urllib.parse.urlparse(urllib.parse.urljoin(HOST+'/',value))
            if parsed.scheme!='https' or parsed.username or parsed.password:
                continue
            if parsed.hostname in ('store.imamsales.com','www.store.imamsales.com'):
                path=urllib.parse.unquote(parsed.path).lstrip('/')
                # Don't allow path traversal or access outside store folder.
                local=(root/'store'/path).resolve()
                if local.is_relative_to((root/'store').resolve()) and local.is_file() and local.stat().st_size<=MAX_IMAGE:
                    return local.read_bytes()
            # Remote photo fallback. Skip local/private IP literals.
            host=parsed.hostname or ''
            if host in ('localhost','0.0.0.0','::1') or host.endswith('.local'):
                continue
            if re.match(r'^(127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)',host):
                continue
            return get_bytes(parsed.geturl(),timeout=12)
        except Exception as e:
            print(f'[foto] kandidat gagal: {type(e).__name__}',file=sys.stderr)
    return None


def font(size=35, bold=False):
    names=(
        ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf']
        if bold else ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'])
    for file in names:
        if Path(file).exists():
            return ImageFont.truetype(file,size)
    return ImageFont.load_default()


def normalize_picture(data):
    image=Image.open(io.BytesIO(data))
    image=ImageOps.exif_transpose(image).convert('RGB')
    if image.width<=0 or image.height<=0:
        raise ValueError('empty image')
    return image


def jpg_bytes(image,quality=68):
    buf=io.BytesIO()
    image.save(buf,format='JPEG',quality=quality,optimize=True,progressive=True,subsampling=2)
    return buf.getvalue()


def photo_backdrop(source, size, *, blur=36, brightness=0.42):
    """Photo-colored, edge-to-edge background without hardcoded white bars.

    The background is a blurred, dimmed *copy* of the source. The foreground
    preserves the full original product artwork and aspect ratio. A landscape
    WhatsApp OG frame cannot be completely filled by a square/portrait poster
    without cropping, stretching or adding a background.
    """
    canvas=ImageOps.fit(source,size,method=Image.Resampling.LANCZOS)
    canvas=canvas.filter(ImageFilter.GaussianBlur(blur))
    canvas=ImageEnhance.Brightness(canvas).enhance(brightness)
    return canvas


def og_picture(source):
    """1200x630 preview: full-size, uncropped art on a full-bleed photo backdrop."""
    width,height=1200,630
    canvas=photo_backdrop(source,(width,height),blur=34,brightness=0.47)
    # No artificial white margin. Never stretch or crop the product art itself.
    fitted=ImageOps.contain(source,(width,height),Image.Resampling.LANCZOS)
    canvas.paste(fitted,((width-fitted.width)//2,(height-fitted.height)//2))
    data=jpg_bytes(canvas,70)
    if len(data)>200_000:
        data=jpg_bytes(canvas,53)
    return data


def wrap_two(draw, text, fnt, max_width, max_lines=2):
    words=clean_text(text,130).split()
    lines=[];line=''
    for word in words:
        test=(line+' '+word).strip()
        if draw.textbbox((0,0),test,font=fnt)[2] <=max_width:
            line=test
        else:
            if line: lines.append(line)
            line=word
    if line:lines.append(line)
    if len(lines)>max_lines:
        lines=lines[:max_lines]
        while draw.textbbox((0,0),lines[-1]+'…',font=fnt)[2]>max_width and lines[-1]:
            lines[-1]=lines[-1][:-1]
        lines[-1]+='…'
    return lines


def share_poster(source,p,link):
    """Optional photo + QR share card; only the scannable QR stays white."""
    canvas=photo_backdrop(source,(1200,630),blur=38,brightness=0.33)
    draw=ImageDraw.Draw(canvas)
    draw.rectangle((747,0,1199,629),fill='#11251b')
    draw.rectangle((747,0,752,629),fill='#8cc63f')
    # Original poster fills the available height, without stretching/cropping.
    fitted=ImageOps.contain(source,(747,630),Image.Resampling.LANCZOS)
    canvas.paste(fitted,((747-fitted.width)//2,(630-fitted.height)//2))
    draw=ImageDraw.Draw(canvas)
    draw.text((778,45),'IMAMSTORE',fill='#a5d66a',font=font(30,True))
    title_font=font(34,True)
    y=120
    for line in wrap_two(draw,p.get('nama') or p.get('name') or 'Produk ImamStore',title_font,390,3):
        draw.text((778,y),line,font=title_font,fill='#f5faee')
        y+=48
    amount=price(p)
    if amount:
        draw.text((778,max(y+14,305)),'Rp '+f'{amount:,}'.replace(',','.'),font=font(34,True),fill='#ff8b73')
    qr=qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M,box_size=7,border=2)
    qr.add_data(link); qr.make(fit=True)
    # White pixels immediately around the QR are required for reliable scanning.
    code=qr.make_image(fill_color='#17311e',back_color='white').convert('RGB')
    code=code.resize((156,156),Image.Resampling.NEAREST)
    canvas.paste(code,(994,424))
    draw.text((778,467),'SCAN UNTUK',font=font(21,True),fill='#d7e8cc')
    draw.text((778,502),'LIHAT PRODUK',font=font(21,True),fill='#d7e8cc')
    draw.text((778,575),'store.imamsales.com',font=font(17),fill='#b2c8ad')
    data=jpg_bytes(canvas,72)
    if len(data)>260_000:
        data=jpg_bytes(canvas,55)
    return data


def quote(v):
    return html.escape(str(v),quote=True)


def share_page(p,meta):
    title=clean_text(p.get('nama') or p.get('name') or 'Produk ImamStore',90)+' | ImamStore'
    description=' '.join(filter(None,[clean_text(p.get('deskripsi') or p.get('description') or '',135),
                                  ('Harga Rp '+f'{price(p):,}'.replace(',','.')) if price(p)>0 else '',
                                  'Lihat foto, varian dan ulasan di ImamStore.']))[:240]
    link=HOST+meta['sharePath']; target='/?product='+urllib.parse.quote(meta['id'])
    img=HOST+meta['gambar'] if meta.get('gambar','').startswith('/') else meta.get('gambar','')
    attrs=[('property','og:type','product'),('property','og:site_name','ImamStore'),('property','og:locale','id_ID'),
           ('property','og:title',title),('property','og:description',description),('property','og:url',link),
           ('name','twitter:card','summary_large_image' if img else 'summary'),('name','twitter:title',title),('name','twitter:description',description)]
    if img:
        attrs.extend([('property','og:image',img),('property','og:image:secure_url',img),
                      ('property','og:image:alt',clean_text(p.get('nama'),90)),('name','twitter:image',img)])
        if meta.get('gambar','').startswith('/images/share/'):
            attrs.extend([('property','og:image:type','image/jpeg'),('property','og:image:width','1200'),('property','og:image:height','630')])
    tags='\n'.join(f'<meta {kind}="{quote(k)}" content="{quote(value)}">' for kind,k,value in attrs)
    # Inline redirect runs before first paint; noscript + meta refresh work for other clients.
    return f'''<!doctype html>
{MARKER}
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{quote(title)}</title><meta name="description" content="{quote(description)}">
<link rel="canonical" href="{quote(link)}">
{tags}
<meta http-equiv="refresh" content="0;url={quote(target)}">
<style>html,body{{margin:0;background:#fff;color:#243321;font:15px system-ui,sans-serif}}main{{display:grid;min-height:100dvh;place-items:center;text-align:center;padding:20px}}a{{color:#57862c}}</style>
<script>location.replace({json.dumps(target)});</script></head>
<body><main><p>Membuka produk ImamStore… <a href="{quote(target)}">Lihat produk</a></p></main></body></html>
'''


def write_if_changed(path:Path, data:bytes):
    path.parent.mkdir(parents=True,exist_ok=True)
    if path.is_file() and path.read_bytes()==data:
        return False
    path.write_bytes(data)
    return True


def ensure_json(path:Path,value):
    return write_if_changed(path,(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode())


def remove_old_versions(folder:Path,pid:str,keep:str):
    if not folder.is_dir():return
    for file in folder.glob(pid+'-*.jpg'):
        if file.name!=keep:
            file.unlink()


def generate(root:Path,items:list):
    store=root/'store'; output=store/'p'; records=store/'share-data'; pictures=store/'images'/'share'; posters=store/'images'/'share-posters'
    changed=0;count=0;with_photo=0
    used=set()
    for p in sorted(items,key=lambda p:str(p.get('id',''))):
        pid=str(p.get('id',''))
        # A service account may read drafts too; only publish storefront-visible items.
        status=str(p.get('status') or '').strip().lower()
        visibility=str(p.get('visibility') or '').strip().lower()
        if (not ID_PATTERN.fullmatch(pid) or pid in used or
            p.get('active') is False or p.get('deleted') is True or
            status in ('draft','private','unpublished','deleted','archived','hidden','inactive','pending') or
            visibility in ('private','hidden','draft','unpublished')):
            continue
        used.add(pid)
        name=clean_text(p.get('nama') or p.get('name') or 'Produk ImamStore',180)
        if not name.strip(): continue
        target={'id':pid,'nama':name,'deskripsi':clean_text(p.get('deskripsi') or p.get('description') or '',300),
                'harga':price(p),'gambar':'','poster':'','sharePath':'/p/'+pid+'/'}
        try:
            image_data=raw_photo(p,root)
            if image_data:
                image=normalize_picture(image_data)
                photo=og_picture(image)
                digest=hashlib.sha256(photo).hexdigest()[:12]
                filename=pid+'-'+digest+'.jpg'
                changed+=write_if_changed(pictures/filename,photo)
                target['gambar']='/images/share/'+filename
                remove_old_versions(pictures,pid,filename)
                poster=share_poster(image,p,HOST+target['sharePath'])
                poster_digest=hashlib.sha256(poster).hexdigest()[:12]
                poster_filename=pid+'-'+poster_digest+'.jpg'
                changed+=write_if_changed(posters/poster_filename,poster)
                target['poster']='/images/share-posters/'+poster_filename
                remove_old_versions(posters,pid,poster_filename)
                with_photo+=1
        except Exception as e:
            print(f'[foto] Produk {pid}: {e}',file=sys.stderr)
        if not target['gambar']:
            for raw in photo_candidates(p):
                parsed=urllib.parse.urlparse(urllib.parse.urljoin(HOST+'/',raw)) if not raw.startswith('data:') else None
                if parsed and parsed.scheme=='https' and parsed.hostname and parsed.hostname not in ('localhost','127.0.0.1'):
                    target['gambar']=parsed.geturl();break
        changed+=ensure_json(records/(pid+'.json'),target)
        changed+=write_if_changed(output/pid/'index.html',share_page(p,target).encode('utf-8'))
        count+=1
    if count==0:
        raise RuntimeError('No valid products; no output was deleted')
    # Remove ONLY files created by this generator for removed/inactive products.
    for page in output.glob('*/index.html'):
        if page.parent.name not in used and MARKER in page.read_text('utf-8',errors='ignore'):
            page.unlink();page.parent.rmdir();changed+=1
    for file in records.glob('*.json'):
        if ID_PATTERN.fullmatch(file.stem) and file.stem not in used:
            try:
                content=json.loads(file.read_text('utf-8'))
                if content.get('sharePath')=='/p/'+file.stem+'/':file.unlink();changed+=1
            except Exception:pass
    for folder in (pictures,posters):
        if folder.exists():
            for file in folder.glob('*.jpg'):
                match=re.match(r'^([A-Za-z0-9_-]+)-([0-9a-f]{12})\.jpg$',file.name)
                if match and match.group(1) not in used:
                    file.unlink();changed+=1
    print(f'ImamStore Share: {count} products, {with_photo} optimized images, {changed} changed files')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--repo-root',default='.')
    parser.add_argument('--fixture',default=None,help='JSON list of products, for local test only')
    args=parser.parse_args()
    root=Path(args.repo_root).resolve()
    seed=[]
    if (root/'store'/'produk.json').exists():
        try:
            rows=json.loads((root/'store'/'produk.json').read_text('utf-8'))
            if isinstance(rows,list):seed=rows
        except Exception as e:
            print('[seed] Cannot read produk.json:',e,file=sys.stderr)
    if args.fixture:
        cms=json.loads(Path(args.fixture).read_text('utf-8'))
    else:
        try:
            cms=load_firestore()
        except Exception as e:
            # Do not delete CMS-only snapshots during a transient Firestore outage.
            # The last successfully deployed Share catalog stays available.
            raise RuntimeError('CMS authentication/list failed; no Share files changed (check FIREBASE_SERVICE_ACCOUNT_JSON and Cloud Datastore Viewer IAM)') from e
    combined={}
    for p in seed:
        if isinstance(p,dict) and ID_PATTERN.fullmatch(str(p.get('id',''))):
            combined[str(p['id'])]=p
    for p in cms:
        if isinstance(p,dict) and ID_PATTERN.fullmatch(str(p.get('id',''))):
            pid=str(p['id']);combined[pid]={**combined.get(pid,{}),**p}
    generate(root,list(combined.values()))

if __name__=='__main__':main()
