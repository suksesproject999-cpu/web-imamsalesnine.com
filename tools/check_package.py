#!/usr/bin/env python3
"""Static checks, not an end-to-end or security certification."""
import pathlib,re,json,sys
root=pathlib.Path(__file__).resolve().parents[1]
errors=[]; warnings=[]
for page in ('index','history'):
    html=(root/'vip'/f'{page}.html').read_text()
    manifest=json.loads((root/'vip'/'js'/f'{page}-manifest.json').read_text())
    if '/vip/js/bootstrap.js' not in html: errors.append(f'{page}: missing bootstrap')
    for url in manifest['scripts']:
        if not (root/url.lstrip('/')).exists(): errors.append(f'{page}: missing {url}')
    js='\n'.join((root/url.lstrip('/')).read_text() for url in manifest['scripts'] if (root/url.lstrip('/')).exists())
    if 'window.__VIP_FIREBASE_APP.firestore()' not in js: errors.append(f'{page}: not using named app firestore')
    if 'window.__VIP_CONTEXT.vipId' not in js: errors.append(f'{page}: missing vipId')
    if page=='history' and '.where("vipId"' not in js: errors.append('history: missing tenant filter')
    if 'aktivitas_vip' in js: warnings.append(f'{page}: activity writes require matching rules')
for path in (root/'vip'/'js').glob('*.js'):
    s=path.read_text()
    if re.search(r'\.where\(["\']nama["\'],\s*["\']==',s): warnings.append(f'{path.name}: legacy name query')
print(json.dumps({'errors':errors,'warnings':warnings,'status':'FAIL' if errors else 'STATIC_ONLY_PASS'},indent=2))
sys.exit(bool(errors))
