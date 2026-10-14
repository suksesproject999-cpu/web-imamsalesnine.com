#!/usr/bin/env python3
"""OFFLINE only. Generate a reviewed Firestore migration plan, NEVER write to Firestore.
Usage: python3 tools/plan_migration.py export.json vip-map.json plan.json
Export: {"invoice":[{"id":"...","nama":"..."}],"pesanan":[...]}
Map: {"DISTRIBUTOR":"server_username", "OXY":"other_username"}
"""
import json,sys,re,collections,pathlib
if len(sys.argv)!=4: raise SystemExit(__doc__)
source,mapping_file,out=sys.argv[1:]
data=json.loads(pathlib.Path(source).read_text(encoding='utf-8'))
mapping=json.loads(pathlib.Path(mapping_file).read_text(encoding='utf-8'))
if not isinstance(mapping,dict) or len(set(mapping.values()))!=len(mapping): raise SystemExit('ERROR: mapping must be 1-to-1')
for name,vip in mapping.items():
    if not isinstance(name,str) or not isinstance(vip,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',vip): raise SystemExit('ERROR: invalid mapping')
plan={'mode':'OFFLINE_REVIEW_ONLY','operations':[],'blocked':[],'counts':{}}
for coll in ('invoice','pesanan'):
    docs=data.get(coll,[])
    if not isinstance(docs,list): raise SystemExit('ERROR: collection must be a list')
    counts=collections.Counter()
    for doc in docs:
        ident=doc.get('id'); name=doc.get('nama'); existing=doc.get('vipId'); target=mapping.get(name)
        if not isinstance(ident,str) or not ident or '/' in ident: reason='INVALID_ID'
        elif not target: reason='UNMAPPED_NAME'
        elif existing and existing!=target: reason='VIP_ID_CONFLICT'
        elif existing==target: reason='ALREADY_TAGGED'
        else: reason='READY'
        counts[reason]+=1
        record={'collection':coll,'id':ident,'nama':name,'existingVipId':existing,'proposedVipId':target,'status':reason}
        if reason=='READY': plan['operations'].append(record)
        elif reason!='ALREADY_TAGGED': plan['blocked'].append(record)
    plan['counts'][coll]=dict(counts)
pathlib.Path(out).write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'counts':plan['counts'],'planned':len(plan['operations']),'blocked':len(plan['blocked']),'output':out},ensure_ascii=False,indent=2))
if plan['blocked']: sys.exit(2)
