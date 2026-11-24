#!/usr/bin/env python3
"""Generate ImamStore product sitemap with stdlib only.

The canonical product URL is /?product=ID while /p/ID/ still redirects.
The normal share catalog sync calls update_from_generated() using its exact
active ID set. Local --from-snapshots mode reads existing generated records
and verified generated share pages; it does NOT connect to Firestore.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import re
from urllib.parse import quote
from xml.sax.saxutils import escape

HOST='https://store.imamsales.com'
VALID_ID=re.compile(r'^[A-Za-z0-9_-]{1,120}$')
MARKER='<!-- ImamStore pre-generated share page -->'
MAX_URLS=49000  # reserve a slot for home, under sitemap standard 50k limit


def sitemap_content(ids):
    unique={str(pid) for pid in ids if VALID_ID.fullmatch(str(pid))}
    if not unique:
        raise ValueError('Refusing to replace sitemap with an empty product catalog')
    if len(unique)>MAX_URLS:
        raise ValueError('Too many URLs for one sitemap; split into sitemap index')
    # Deterministic sort; source is authoritative IDs, never external URLs.
    urls=[HOST+'/']+[HOST+'/?product='+quote(pid,safe='') for pid in sorted(unique)]
    data=['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for url in urls:
        data.append('  <url><loc>'+escape(url)+'</loc></url>')
    data.append('</urlset>')
    return ('\n'.join(data)+'\n').encode('utf-8')


def update_from_generated(root, active_ids):
    """Called only after share generator successfully updates/cleans snapshots."""
    root=Path(root)
    data=sitemap_content(active_ids)
    target=root/'store'/'sitemap.xml'
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file() and target.read_bytes()==data:
        return 0
    target.write_bytes(data)
    return 1


def ids_from_snapshots(root):
    """Read existing public snapshots only, with a matching generated share page."""
    store=Path(root)/'store'
    records=store/'share-data'
    result=[]
    for path in sorted(records.glob('*.json')):
        pid=path.stem
        if not VALID_ID.fullmatch(pid):
            continue
        page=store/'p'/pid/'index.html'
        if not page.is_file():
            continue
        try:
            if MARKER not in page.read_text(encoding='utf-8',errors='replace'):
                continue
            row=json.loads(path.read_text(encoding='utf-8'))
            if (str(row.get('id'))==pid and row.get('sharePath')=='/p/'+pid+'/'
                and isinstance(row.get('nama'),str) and row['nama'].strip()):
                result.append(pid)
        except (OSError,UnicodeError,ValueError,TypeError):
            continue
    return result


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--repo-root',default='.')
    parser.add_argument('--from-snapshots',action='store_true',required=True,
                        help='Generate sitemap from already-generated local share-data')
    args=parser.parse_args()
    root=Path(args.repo_root).resolve()
    if not (root/'store').is_dir():
        parser.error('store/ directory missing')
    ids=ids_from_snapshots(root)
    if not ids:
        raise SystemExit('REFUSED: No valid share snapshots + generated pages found. Sitemap unchanged.')
    count=update_from_generated(root,ids)
    print(f'SEO-3A sitemap: {len(ids)} products + homepage; {count} file changed')
    print('URL pattern: https://store.imamsales.com/?product=ID')


if __name__=='__main__':
    main()
