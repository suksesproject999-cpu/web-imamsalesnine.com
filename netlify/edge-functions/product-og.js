/**
 * ImamStore product Open Graph response - Netlify Edge Function.
 * Receives /?product=<ID> and /_share-image/<ID>.
 * Sends real Open Graph tags IN THE INITIAL HTML, before any JS runs.
 * Uses only product data that is already public in Firestore Security Rules.
 */
const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/apin-web/databases/(default)/documents';
const ORIGIN = 'https://store.imamsales.com';
const PRODUCT_ID = /^[A-Za-z0-9_-]{1,120}$/;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
// Standard landscape share preview. Only the preview is resized; product gallery stays original.
const SHARE_WIDTH = 960;
const SHARE_HEIGHT = 504;
const SHARE_JPEG_QUALITY = 58;
const PRODUCT_CDN_TTL = 15 * 60;
const PRODUCT_STALE_TTL = 30 * 60;
const cache = new Map();

function validId(id) { return typeof id === 'string' && PRODUCT_ID.test(id); }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function plain(value, max=190) {
  return String(value ?? '').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|quot|lt|gt);/gi,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function decodeField(v) {
  if (!v || typeof v !== 'object') return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue?.values || []).map(decodeField);
  if ('mapValue' in v) return decodeFields(v.mapValue?.fields || {});
  return undefined;
}
function decodeFields(fields) { return Object.fromEntries(Object.entries(fields || {}).map(([k,v]) => [k,decodeField(v)])); }
function productFromDocument(doc) {
  if (!doc?.fields) return null;
  const id = decodeField(doc.fields.id) ?? String(doc.name || '').split('/').pop();
  return { ...decodeFields(doc.fields), id:String(id) };
}
async function requestJson(url, options={}) {
  const signal = AbortSignal.timeout(3500);
  const response = await fetch(url, { ...options, signal, headers:{Accept:'application/json',...(options.headers||{})} });
  if (!response.ok) {
    if (response.status !== 404) {
      const source = url.includes(':runQuery') ? 'cms-query' : url.includes('/cms_products/') ? 'cms-document' : 'seed-catalog';
      console.warn('[ImamStore Share] Public catalog HTTP status:', source, response.status);
    }
    return null;
  }
  return response.json();
}
function rawPhotoCandidates(product) {
  if (!product) return [];
  return [product.gambar,product.image,product.thumbnail,product.foto,product.fotoUtama,
    product.mainImage,product.photo,product.imageUrl,
    ...(Array.isArray(product.gallery)?product.gallery:[]),
    ...(Array.isArray(product.galeri)?product.galeri:[]),
    ...(Array.isArray(product.images)?product.images:[]),
    ...(Array.isArray(product.fotoProduk)?product.fotoProduk:[])];
}
function photoSource(product) {
  for (const candidate of rawPhotoCandidates(product)) {
    const value = typeof candidate === 'string' ? candidate : (candidate?.url || candidate?.src || candidate?.gambar || candidate?.image);
    if (typeof value !== 'string') continue;
    const raw = value.trim();
    if (!raw || /(?:no-image\.|placeholder\.)/i.test(raw)) continue;
    if (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(raw)) return {kind:'inline',source:raw};
    try {
      const url = new URL(raw, ORIGIN + '/');
      if (url.protocol !== 'https:' || url.username || url.password) continue;
      const host = url.hostname.toLowerCase();
      if (host==='localhost'||host.endsWith('.local')||host==='0.0.0.0'||host==='::1'||/^127\./.test(host)||/^10\./.test(host)||/^192\.168\./.test(host)||/^169\.254\./.test(host)||/^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) continue;
      return {kind:'url',source:url.href};
    } catch { /* Try next photo */ }
  }
  return null;
}
async function cmsProduct(id) {
  // A CMS product ID is not always the Firestore document ID. Try both lookups
  // concurrently, and return as soon as either finds the real product.
  const values = [{stringValue:id}];
  if (/^(0|[1-9]\d{0,14})$/.test(id)) values.push({integerValue:id});
  const direct = (async () => {
    const row = await requestJson(FIRESTORE+'/cms_products/'+encodeURIComponent(id));
    const product = productFromDocument(row);
    if (product && String(product.id)===id) return product;
    throw new Error('No matching direct document');
  })();
  const query = (async () => {
    const rows = await requestJson(FIRESTORE+':runQuery', {
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({structuredQuery:{from:[{collectionId:'cms_products'}],where:{fieldFilter:{field:{fieldPath:'id'},op:'IN',value:{arrayValue:{values}}}},limit:5}})
    });
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const product = productFromDocument(row.document);
        if (product && String(product.id)===id) return product;
      }
    }
    throw new Error('No matching CMS ID');
  })();
  try { return await Promise.any([direct, query]); }
  catch { return null; }
}
async function seedProduct(request, id) {
  try {
    const site = new URL('/produk.json', request.url);
    const rows = await requestJson(site.href);
    return Array.isArray(rows) ? rows.find(p => p && String(p.id) === id) || null : null;
  } catch { return null; }
}
// Fast path: publicly pre-generated metadata, served as a small static JSON file.
// The periodic GitHub sync prepares it from the public CMS before any link is shared.
// When it does not exist yet, preserve the original Firestore/produk.json fallback.
async function preparedProduct(id) {
  try {
    const response = await fetch(ORIGIN + '/share-data/' + encodeURIComponent(id) + '.json', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(1700),
    });
    if (!response.ok || !(response.headers.get('content-type') || '').includes('json')) return null;
    const item = await response.json();
    if (!item || String(item.id) !== id || item.sharePath !== '/p/' + id + '/') return null;
    if (typeof item.nama !== 'string' || !item.nama.trim()) return null;
    const gambar = typeof item.gambar === 'string' && item.gambar.trim() ? item.gambar : '';
    return { id, nama: item.nama, deskripsi: item.deskripsi || '', harga: item.harga || 0,
      gambar, sharePath: item.sharePath,
      gambarWidth: Number(item.gambarWidth) || 0,
      gambarHeight: Number(item.gambarHeight) || 0, active: true };
  } catch { return null; }
}

async function loadProduct(request, id) {
  const key = id;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.product;
  const ready = await preparedProduct(id);
  if (ready && photoSource(ready)) {
    cache.set(key, {product:ready, until:Date.now()+2*60*1000});
    return ready;
  }
  // CMS wins, but use seed values for missing fields (matching the web index's merge order).
  // Begin the public seed request at the same time as CMS. When CMS lookup
  // fails or has no public picture, the fallback is already loaded instead of
  // making crawlers wait for a second network round-trip.
  const cmsTask = cmsProduct(id);
  const seedTask = seedProduct(request,id);
  const cms = await cmsTask;
  const seed = !cms || !photoSource(cms) || !cms.nama ? await seedTask : null;
  const product = cms ? {...(seed||{}),...cms} : seed;
  const safe = product && product.active !== false && product.deleted !== true ? product : null;
  cache.set(key,{product:safe,until:Date.now()+(safe?3*60*1000:25*1000)});
  // Bound in-memory cache in reused edge isolates.
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return safe;
}
function shareImage(photo,id,product) {
  if (!photo) return {url:'',kind:'missing'};
  if (photo.kind==='inline') {
    // Image CDN is intended for deployed images. Base64 cannot be used as og:image;
    // preserve the existing public image endpoint without pretending it's compressed.
    return {url:ORIGIN+'/_share-image/'+encodeURIComponent(id),kind:'inline'};
  }
  let src;
  try { src=new URL(photo.source); } catch { return {url:'',kind:'missing'}; }
  // Netlify Image CDN reliably transforms local deployed images, with a fixed JPG
  // output independent of Accept / User-Agent. Remote images are left untouched
  // unless their domain is explicitly allowlisted by the site's own config.
  // Generated JPEG is already lightweight. Preserve its actual source ratio.
  // The static /share-data/<id>.json stores dimensions from the Python generator.
  if (src.origin===ORIGIN && src.pathname.startsWith('/images/share/')) {
    const w=Number(product?.gambarWidth)||0;
    const h=Number(product?.gambarHeight)||0;
    return {url:src.href,kind:'prebuilt',
      width:w>0&&w<=10000?w:null,height:h>0&&h<=10000?h:null,mime:'image/jpeg'};
  }
  if (src.origin===ORIGIN && !src.pathname.startsWith('/.netlify/') &&
      !src.pathname.startsWith('/_share-image/')) {
    const transformed=new URL('/.netlify/images',ORIGIN);
    transformed.searchParams.set('url',src.pathname+src.search);
    transformed.searchParams.set('w',String(SHARE_WIDTH));
    transformed.searchParams.set('h',String(SHARE_HEIGHT));
    transformed.searchParams.set('fit','cover');
    transformed.searchParams.set('fm','jpg');
    transformed.searchParams.set('q',String(SHARE_JPEG_QUALITY));
    return {url:transformed.href,kind:'image-cdn',width:SHARE_WIDTH,height:SHARE_HEIGHT,mime:'image/jpeg'};
  }
  return {url:src.href,kind:'original'};
}
function priceText(product) {
  const normal = Number(typeof product.harga==='object' ? product.harga?.normal : product.harga);
  const promo = Number(typeof product.harga==='object' ? product.harga?.promo : product.hargaPromo);
  const actual = promo > 0 && (!normal || promo < normal) ? promo : normal;
  return Number.isFinite(actual) && actual > 0 ? 'Harga Rp '+Math.round(actual).toLocaleString('id-ID')+'.' : '';
}
function pageTags(product,id, photo) {
  const title = plain(product.nama || product.name || 'Produk ImamStore', 90) + ' | ImamStore';
  const descr = [plain(product.deskripsi || product.description || '',150),priceText(product),'Lihat foto, varian dan ulasan di ImamStore.'].filter(Boolean).join(' ').slice(0,250);
  const canonical = product.sharePath === '/p/' + id + '/'
    ? ORIGIN + product.sharePath
    : ORIGIN + '/?product=' + encodeURIComponent(id);
  // Only the shared preview image is transformed. Detail/gallery images stay intact.
  const preview = shareImage(photo,id,product);
  const image = preview.url;
  const pairs = [
    ['property','og:type','website'], ['property','og:site_name','ImamStore'],
    ['property','og:locale','id_ID'], ['property','og:title',title],
    ['property','og:description',descr], ['property','og:url',canonical],
    ['name','twitter:card',image?'summary_large_image':'summary'],
    ['name','twitter:title',title],['name','twitter:description',descr]
  ];
  if (image) {
    pairs.push(['property','og:image',image],['property','og:image:secure_url',image],
      ['property','og:image:alt',plain(product.nama || product.name,90)],['name','twitter:image',image]);
    if (preview.kind==='image-cdn' || preview.kind==='prebuilt') {
      pairs.push(['property','og:image:type','image/jpeg']);
      if (preview.width && preview.height) {
        pairs.push(['property','og:image:width',String(preview.width)],
          ['property','og:image:height',String(preview.height)]);
      }
    } else if (photo.kind==='inline') {
      const mime = /^data:(image\/(?:png|jpe?g|webp|gif));base64,/i.exec(photo.source)?.[1];
      if (mime) pairs.push(['property','og:image:type',mime==='image/jpg'?'image/jpeg':mime]);
    }
  }
  const tags = pairs.map(([attr,key,value])=>`<meta ${attr}="${escapeHtml(key)}" content="${escapeHtml(value)}">`).join('\n');
  return {tags,title,descr,canonical,image,imageKind:preview.kind};
}
function inject(html,meta) {
  // Only transform HEAD; never modify a product's body, CSS, or JS.
  const end = html.search(/<\/head\s*>/i);
  if (end < 0) return html;
  const head = html.slice(0,end);
  const body = html.slice(end);
  // Remove OLD static social tags instead of stacking conflicting OG values.
  let updated = head.replace(/<meta\b[^>]*>/gi, tag => /\b(?:property|name)\s*=\s*["'](?:og:|twitter:)/i.test(tag) ? '' : tag);
  updated = updated.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i,'<title>'+escapeHtml(meta.title)+'</title>');
  updated = updated.replace(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*>/i,
    `<meta name="description" content="${escapeHtml(meta.descr)}">`);
  updated = updated.replace(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i,
    `<link rel="canonical" href="${escapeHtml(meta.canonical)}">`);
  updated = updated.replace(/<head\b([^>]*)>/i,(match)=>match+'\n<!-- ImamStore: OG metadata generated server-side -->\n'+meta.tags+'\n');
  return updated+body;
}

function inlineImage(source) {
  const match=/^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i.exec(source);
  if (!match) return null;
  const base64=match[2].replace(/\s/g,'');
  const size=Math.floor(base64.length*3/4);
  if (size<40 || size>MAX_IMAGE_BYTES) return null;
  try {
    const binary=atob(base64);
    if (binary.length>MAX_IMAGE_BYTES) return null;
    const data=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const mime=match[1].toLowerCase()==='image/jpg'?'image/jpeg':match[1].toLowerCase();
    return {data,mime};
  } catch {return null;}
}
export default async function productOpenGraph(request,context) {
  const url = new URL(request.url);
  // This repository also deploys the main website. Never alter responses there.
  if (url.hostname !== 'store.imamsales.com') return context.next();
  const imagePrefix = '/_share-image/';
  if (url.pathname.startsWith(imagePrefix)) {
    const id=decodeURIComponent(url.pathname.slice(imagePrefix.length));
    if (!validId(id)) return new Response('Not found',{status:404});
    if (request.method!=='GET'&&request.method!=='HEAD') return new Response('Method Not Allowed',{status:405});
    const product=await loadProduct(request,id);
    const photo=photoSource(product);
    const image=photo?.kind==='inline'?inlineImage(photo.source):null;
    if (!image) return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
    const headers={'Content-Type':image.mime,'Cache-Control':'public, max-age=3600','Netlify-CDN-Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'};
    return new Response(request.method==='HEAD'?null:image.data,{status:200,headers});
  }
  if (url.pathname !== '/' || request.method !== 'GET') return context.next();
  const id=url.searchParams.get('product');
  if (!validId(id)) return context.next();
  // Keep non-HTML/API requests on the original route.
  const accept=request.headers.get('accept')||'';
  if (accept && !accept.includes('text/html') && !accept.includes('*/*')) return context.next();
  const product = await loadProduct(request,id);
  if (!product) {
    // Do not invent product titles or images. Preserve normal deep-link error behavior.
    console.warn('[ImamStore Share] Product metadata not found:',id);
    return context.next();
  }
  const photo = photoSource(product);
  const meta=pageTags(product,id,photo);
  const originResponse=await context.next();
  if (!originResponse.ok || !(originResponse.headers.get('content-type')||'').includes('text/html')) return originResponse;
  const html=await originResponse.text();
  const headers=new Headers(originResponse.headers);
  headers.delete('content-length'); headers.delete('content-encoding');headers.delete('etag');
  headers.set('Content-Type','text/html; charset=utf-8');
  // Cache only public product HTML; the product query key isolates products.
  // No response with authentication, customer data, or user-specific content is generated.
  // Cache identical public product HTML across crawlers and ignore tracking params.
  // A new deploy invalidates Netlify's deploy-specific cache; CMS changes refresh
  // after this short TTL. Browser cache remains disabled for HTML.
  headers.set('Cache-Control','public, max-age=0, must-revalidate');
  headers.set('Netlify-CDN-Cache-Control',
    `public, max-age=${PRODUCT_CDN_TTL}, stale-while-revalidate=${PRODUCT_STALE_TTL}`);
  headers.set('Netlify-Vary','query=product');
  headers.set('Netlify-Cache-Tag','imamstore-og,imamstore-product-'+id);
  headers.set('X-ImamStore-OG',meta.image?'server-image-ready':'server-product-no-image');
  headers.set('X-ImamStore-OG-Image',meta.imageKind);
  return new Response(inject(html,meta),{status:originResponse.status,headers});
}
export const config = { path:['/','/_share-image/:id'], cache:'manual' };
