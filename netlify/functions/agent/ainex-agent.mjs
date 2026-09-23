
import fs from "fs";
import path from "path";
import {pathToFileURL} from "url";

const PROJECT=process.env.AINEX_FIREBASE_PROJECT||"apin-web";
const API_KEY=process.env.AINEX_FIREBASE_API_KEY||"AIzaSyBkyMCw47sYQb2BBkGMxgfsXppozWw4Cec";
const AGENT_VERSION="3.3.0";
const MODEL=process.env.AINEX_AGENT_MODEL||process.env.NEXAI_MODEL_SMART||process.env.NEXAI_MODEL||"gpt-4.1-mini";
const DATA_ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),"../data");
const RUNTIME_FILE=path.join(DATA_ROOT,"nexai_runtime_engine_v1_1.mjs");

let runtimePromise=null,configCache={value:null,at:0};
const TTL=5000;
const CAR_BRANDS=new Set(["toyota","daihatsu","suzuki","mitsubishi","nissan","wuling","hyundai","kia","mazda","isuzu","chevrolet","ford","honda"]);
const MOTOR_BRANDS=new Set(["yamaha","kawasaki","vespa","benelli"]);

const norm=v=>String(v||"").toLowerCase().replace(/\s+/g," ").trim();
const up=v=>String(v||"").toUpperCase().trim();

function readJSON(name,fallback){
  try{return JSON.parse(fs.readFileSync(path.join(DATA_ROOT,name),"utf8"))}
  catch{return fallback}
}
function fv(v){
  if(v===null)return{nullValue:null};
  if(typeof v==="boolean")return{booleanValue:v};
  if(typeof v==="number")return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(Array.isArray(v))return{arrayValue:{values:v.map(fv)}};
  if(typeof v==="object"){const fields={};for(const[k,x]of Object.entries(v))fields[k]=fv(x);return{mapValue:{fields}}}
  return{stringValue:String(v)};
}
function dv(v){
  if(!v)return null;
  if("stringValue"in v)return v.stringValue;
  if("booleanValue"in v)return v.booleanValue;
  if("integerValue"in v)return Number(v.integerValue);
  if("doubleValue"in v)return Number(v.doubleValue);
  if("timestampValue"in v)return v.timestampValue;
  if("nullValue"in v)return null;
  if(v.arrayValue)return(v.arrayValue.values||[]).map(dv);
  if(v.mapValue){const o={};for(const[k,x]of Object.entries(v.mapValue.fields||{}))o[k]=dv(x);return o}
  return null;
}
function decodeDoc(d){const o={};for(const[k,v]of Object.entries(d?.fields||{}))o[k]=dv(v);return o}
const docUrl=name=>`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/ainex_system/${name}?key=${encodeURIComponent(API_KEY)}`;

async function getConfig(){
  const now=Date.now();
  if(configCache.value&&now-configCache.at<TTL)return configCache.value;
  const fallback={enabled:process.env.AINEX_AGENT_ENABLED==="1",mode:process.env.AINEX_AGENT_MODE||"hybrid",monitor:true};
  try{
    const r=await fetch(docUrl("agent_control"));
    if(!r.ok){configCache={value:fallback,at:now};return fallback}
    const cfg={...fallback,...decodeDoc(await r.json())};
    cfg.enabled=cfg.enabled===true;
    cfg.monitor=cfg.monitor!==false;
    cfg.mode=["shadow","hybrid","full"].includes(cfg.mode)?cfg.mode:"hybrid";
    configCache={value:cfg,at:now};
    return cfg;
  }catch{
    configCache={value:fallback,at:now};
    return fallback;
  }
}

async function updateMetrics(delta){
  try{
    let prev={};
    const r=await fetch(docUrl("agent_metrics"));
    if(r.ok)prev=decodeDoc(await r.json());
    const next={
      requests:Number(prev.requests||0)+Number(delta.requests||0),
      agent_used:Number(prev.agent_used||0)+Number(delta.agent_used||0),
      bypass:Number(prev.bypass||0)+Number(delta.bypass||0),
      fallback:Number(prev.fallback||0)+Number(delta.fallback||0),
      errors:Number(prev.errors||0)+Number(delta.errors||0),
      total_agent_ms:Number(prev.total_agent_ms||0)+Number(delta.agent_ms||0),
      agent_time_count:Number(prev.agent_time_count||0)+Number(delta.agent_ms?1:0),
      last_status:delta.last_status||prev.last_status||"IDLE",
      last_route:delta.last_route||prev.last_route||"",
      last_request_id:delta.last_request_id||prev.last_request_id||"",
      last_tools:delta.last_tools||prev.last_tools||[],
      last_total_ms:Number(delta.last_total_ms||0),
      updated_at:new Date().toISOString()
    };
    const fields={};for(const[k,v]of Object.entries(next))fields[k]=fv(v);
    await fetch(docUrl("agent_metrics"),{
      method:"PATCH",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({fields})
    });
  }catch{}
}

async function runtime(){
  if(runtimePromise)return runtimePromise;
  runtimePromise=(async()=>{
    try{
      if(!fs.existsSync(RUNTIME_FILE))return null;
      const m=await import(pathToFileURL(RUNTIME_FILE).href);
      return m?.NexaiRuntimeEngine?new m.NexaiRuntimeEngine(DATA_ROOT):null;
    }catch{return null}
  })();
  return runtimePromise;
}

function complex(q){
  q=norm(q);
  return q.length>100||[
    /\bkalau\b|\balternatif\b/,
    /\bsekalian\b|\bsekaligus\b|\bdan juga\b/,
    /\bbandingkan\b|\bpilihkan\b/,
    /\brekomendasi.*(putih|watt|warna|foglamp|mundur|senja|biled|bi-led)/,
    /\bcocok.*(apa|mana).*(produk|nine)/,
    /\bproduk nine\b.*\b(mobil|motor)\b/
  ].some(x=>x.test(q));
}

function explicitVehicleFromText(text){
  const raw=String(text||"");
  const q=norm(raw);
  const yearRaw=raw.match(/\b(19|20)\d{2}\b/)?.[0]||null;
  const year=yearRaw?Number(yearRaw):null;

  const manualAliases={
    "avansa":"avanza",
    "avanza":"avanza",
    "veloz":"veloz",
    "expander":"xpander",
    "xpander":"xpander",
    "pajero":"pajero",
    "pajero dakar":"pajero dakar",
    "brio":"brio",
    "xenia":"xenia",
    "fortuner":"fortuner",
    "stargazer":"stargazer",
    "vixion":"vixion",
    "beat":"beat",
    "vario":"vario"
  };

  const aliases=[];
  const vdb=vehicleDB();
  for(const v of vdb?.vehicles||[]){
    const i=v?.identity||{};
    const brand=norm(i.brand);
    const model=norm(i.model_source);
    const all=[model,...(i.aliases||[]).map(norm)].filter(Boolean);
    for(const a of all)aliases.push({alias:a,brand,model,record:v});
  }
  for(const [a,canonical] of Object.entries(manualAliases)){
    const hit=aliases.find(x=>x.model===canonical||x.alias===canonical);
    aliases.push({alias:a,brand:hit?.brand||"",model:hit?.model||canonical,record:hit?.record||null});
  }

  aliases.sort((a,b)=>b.alias.length-a.alias.length);
  for(const x of aliases){
    const rx=new RegExp(`(^|\\b)${x.alias.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}($|\\b)`,"i");
    if(rx.test(q))return{brand:x.brand,model:x.model,year,source:"current_message",record:x.record||null};
  }

  const tokens=q.split(/[^a-z0-9-]+/).filter(x=>x.length>=4);
  let best=null;
  for(const token of tokens){
    for(const x of aliases){
      if(x.alias.includes(" "))continue;
      const a=token,b=x.alias;
      const max=Math.max(a.length,b.length);
      if(max<4||Math.abs(a.length-b.length)>2)continue;
      let same=0;
      for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]===b[i])same++;
      const score=same/max;
      if(score>=0.72&&(!best||score>best.score))best={...x,score};
    }
  }
  if(best)return{brand:best.brand,model:best.model,year,source:"current_message_fuzzy",record:best.record||null};

  const brandMatch=raw.match(/\b(honda|toyota|daihatsu|suzuki|mitsubishi|yamaha|kawasaki|nissan|wuling|hyundai|kia|mazda|isuzu|chevrolet|ford|vespa|benelli)\b\s+([a-z0-9-]+)/i);
  if(brandMatch)return{brand:brandMatch[1],model:brandMatch[2],year,source:"current_message_brand_model"};
  return null;
}

function stateVehicle(ctx){
  const v=ctx?.conversationContext?.authoritativeVehicle||ctx?.conversationContext?.vehicle||ctx?.state?.vehicle||null;
  if(v&&typeof v==="object"&&(v.brand||v.model)){
    return{
      brand:String(v.brand||"").trim(),
      model:String(v.model||v.name||"").trim(),
      year:v.year?Number(v.year):null,
      source:"conversation_state"
    };
  }
  return null;
}

function vehicleFromHistory(ctx){
  const mem=Array.isArray(ctx?.memory)?ctx.memory:[];
  for(let i=mem.length-1;i>=0;i--){
    const row=mem[i];
    if(row?.role!=="user"||typeof row.content!=="string")continue;
    const v=explicitVehicleFromText(row.content);
    if(v)return{...v,source:"chat_history"};
  }
  return null;
}

function lockedVehicle(ctx){
  const current=explicitVehicleFromText(ctx.message);
  if(current)return current;

  const q=norm(ctx.message||"");
  const looksLikeVehicleSwitch=/\b(mobil|motor|kendaraan|avansa|avanza|veloz|xenia|brio|fortuner|xpander|expander|pajero|stargazer)\b/i.test(q);
  if(looksLikeVehicleSwitch&&/\b(lampu|foglamp|headlamp|mundur|senja|sein|rem|rekomendasi|cocok)\b/i.test(q)){
    return null;
  }

  return vehicleFromHistory(ctx)||stateVehicle(ctx)||null;
}

function vehicleLabel(v){
  if(!v)return"";
  return [v.brand,v.model,v.year].filter(Boolean).join(" ").replace(/\s+/g," ").trim();
}

function vehicleDB(){
  return readJSON("vehicle_intelligence_kamar4_v3_normalized.json",{vehicles:[]});
}
function classificationDB(){
  return readJSON("product_vehicle_classification_v1.json",{groups:{}});
}
function shortlistDB(){
  return readJSON("recommended_product_shortlist_v1.json",{});
}
function lifecycleDB(){
  return readJSON("product_lifecycle_v1.json",{policy:{default_status:"active"},products:{}});
}
function productKnowledge(){
  return readJSON("product_knowledge_center.json",{products:[]});
}

function resolveVehicleRecord(lock){
  if(!lock?.model)return null;
  const db=vehicleDB();
  const modelQ=norm(lock.model).replace(/\b(mobil|motor)\b/g,"").trim();
  const brandQ=norm(lock.brand);
  const year=Number(lock.year)||null;

  const scored=(db.vehicles||[]).map(v=>{
    const id=v?.identity||{};
    const aliases=[id.model_source,...(id.aliases||[])].filter(Boolean).map(norm);
    const model=norm(id.model_source);
    const brand=norm(id.brand);
    let score=0;
    if(brandQ&&brand===brandQ)score+=30;
    if(model===modelQ)score+=50;
    if(aliases.includes(modelQ))score+=45;
    if(model.includes(modelQ)||modelQ.includes(model))score+=25;
    const ys=Number(id?.year?.start),ye=Number(id?.year?.end);
    if(year&&Number.isFinite(ys)&&Number.isFinite(ye)&&year>=ys&&year<=ye)score+=35;
    else if(year&&score>0)score-=4; // model match remains possible when source year range is incomplete.
    return{v,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);

  if(!scored.length)return null;
  const top=scored[0];
  return{
    record:top.v,
    match_score:top.score,
    requested_year:year,
    year_exact:year?(
      year>=Number(top.v?.identity?.year?.start)&&
      year<=Number(top.v?.identity?.year?.end)
    ):null
  };
}


function flattenKnownMotorcycles(record){
  const kv=record?.known_vehicle_examples;
  const out=[];
  if(Array.isArray(kv)){
    for(const x of kv)if(x)out.push(String(x));
  }else if(kv&&typeof kv==="object"){
    for(const [brand,list] of Object.entries(kv)){
      for(const x of Array.isArray(list)?list:[])if(x)out.push(`${brand} ${x}`);
    }
  }
  return out;
}

function motorcycleApplications(){
  const db=classificationDB();
  const apps=[];
  for(const [groupName,group] of Object.entries(db?.groups||{})){
    if(group?.vehicle_class!=="motorcycle")continue;
    for(const r of group?.records||[]){
      if(r?.allow_motorcycle_recommendation!==true)continue;
      for(const full of flattenKnownMotorcycles(r)){
        const text=norm(full);
        if(!text)continue;
        const parts=text.split(" ");
        const brand=parts[0]||"";
        const model=parts.slice(1).join(" ")||text;
        apps.push({groupName,brand,model,full:text,record:r});
      }
    }
  }
  return apps;
}

function resolveMotorcycleContext(text){
  const q=norm(text||"");
  if(!q)return null;

  const manual={
    "verza":"honda verza",
    "vixion":"yamaha vixion",
    "new v-ixion lightning":"yamaha new v-ixion lightning",
    "nvl":"yamaha new v-ixion lightning",
    "r15":"yamaha r15",
    "cb150r":"honda cb150r",
    "cbr150":"honda cbr150",
    "byson":"yamaha byson",
    "scoopy fi esp":"honda scoopy fi esp 2013-2017",
    "klx 150":"kawasaki klx 150",
    "klx 250":"kawasaki klx 250",
    "inazuma":"suzuki inazuma",
    "zafferano":"benelli zafferano",
    "beat":"honda beat",
    "beat fi":"honda beat fi",
    "vario 125 techno fi":"honda vario 125 techno fi",
    "jupiter mx 135":"yamaha jupiter mx 135",
    "jupiter z":"yamaha jupiter z"
  };

  const apps=motorcycleApplications();
  const candidates=[];

  for(const a of apps){
    const names=[a.full,a.model];
    for(const n of names){
      if(!n)continue;
      const rx=new RegExp(`(^|\\b)${n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}($|\\b)`,"i");
      if(rx.test(q))candidates.push({...a,matched:n,score:n.length});
    }
  }

  for(const [alias,canonical] of Object.entries(manual)){
    const rx=new RegExp(`(^|\\b)${alias.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}($|\\b)`,"i");
    if(!rx.test(q))continue;
    const hit=apps.find(a=>a.full===canonical||a.model===canonical.replace(/^[^ ]+ /,""));
    if(hit)candidates.push({...hit,matched:alias,score:alias.length+100});
  }

  if(!candidates.length)return null;
  candidates.sort((a,b)=>b.score-a.score);
  const best=candidates[0];
  const groups=[...new Set(candidates.filter(x=>x.matched===best.matched||x.full===best.full).map(x=>x.groupName))];

  return{
    brand:best.brand,
    model:best.model,
    full:best.full,
    groups:groups.length?groups:[best.groupName],
    source:"motorcycle_classification"
  };
}

function motorcycleCandidatesForContext(mctx){
  if(!mctx?.groups?.length)return[];
  const db=classificationDB();
  const lifecycle=lifecycleDB();
  const out=[],seen=new Set();

  for(const groupName of mctx.groups){
    const group=db?.groups?.[groupName];
    if(!group||group.vehicle_class!=="motorcycle")continue;

    for(const r of group.records||[]){
      if(r?.allow_motorcycle_recommendation!==true||!r?.product_id)continue;

      const lc=lifecycle?.products?.[r.product_id]||{};
      const status=lc.status||lifecycle?.policy?.default_status||"active";
      if(["hidden","discontinued","upcoming"].includes(status))continue;
      if(lc.recommendation_enabled===false)continue;

      if(seen.has(r.product_id))continue;
      seen.add(r.product_id);
      out.push({
        product_id:r.product_id,
        name:r.canonical_name||r.clue_name||r.product_id,
        sku:r.sku||"",
        group:groupName,
        application_note:r.application_note||"",
        lifecycle:{status}
      });
    }
  }

  out.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  return out;
}

function vehicleClass(lock,vehicleMatch){
  const mctx=resolveMotorcycleContext([lock?.brand,lock?.model].filter(Boolean).join(" "));
  if(mctx)return"motorcycle";
  if(vehicleMatch?.record)return"car";
  const b=norm(lock?.brand);
  if(MOTOR_BRANDS.has(b))return"motorcycle";
  if(CAR_BRANDS.has(b)&&!["honda","suzuki"].includes(b))return"car";
  return"unknown";
}

function classificationIndex(){
  const db=classificationDB(),idx={};
  for(const [groupName,group] of Object.entries(db?.groups||{})){
    for(const r of group?.records||[]){
      if(!r?.product_id)continue;
      idx[r.product_id]={
        group:groupName,
        group_vehicle_class:group?.vehicle_class||null,
        allow_car:r.allow_car_recommendation,
        allow_motorcycle:r.allow_motorcycle_recommendation,
        vehicle_class:r.vehicle_class||[],
        canonical_name:r.canonical_name||r.clue_name||r.product_id
      };
    }
  }
  return idx;
}
function eligibleForClass(productId,klass,source){
  const c=classificationIndex()[productId];

  // Explicit classification always wins.
  if(c){
    if(klass==="car"&&c.allow_car===false)return false;
    if(klass==="motorcycle"&&c.allow_motorcycle===false)return false;
    if(klass==="car"&&c.allow_car===true)return true;
    if(klass==="motorcycle"&&c.allow_motorcycle===true)return true;
  }

  // Curated car recommendation sources are safe for car use.
  if(klass==="car"&&["curated_small_bulb","headlamp_family"].includes(source))return true;

  // Unknown classification must never leak via generic socket match.
  // Cross-class socket similarity is NEVER sufficient evidence.
  return false;
}

function lifecycleFor(productId){
  const db=lifecycleDB(),e=db?.products?.[productId]||{};
  return{product_id:productId,status:e.status||db?.policy?.default_status||"active",entry:e};
}
function recommendationEnabled(productId){
  const lc=lifecycleFor(productId);
  if(["hidden","discontinued","upcoming"].includes(lc.status))return false;
  return lc?.entry?.recommendation_enabled!==false;
}

function policyForSocket(socket){
  const db=shortlistDB(),s=up(socket);
  return{
    socket:s,
    policy:db?.socket_policy?.equivalences?.[s]||null,
    curated:db?.curated_socket_products?.[s]||[],
    headlamp_candidates:db?.headlamp_family_candidates||[]
  };
}
function replacementSocket(socket){
  const p=policyForSocket(socket);
  return up(p?.policy?.replacement_socket||socket);
}

function exactCandidatesForCar(socket,position){
  const db=shortlistDB(),original=up(socket),target=replacementSocket(original);
  const out=[],seen=new Set();

  // HARD BUSINESS RULE: factory H8/H16 -> LH1PRO only.
  if(["H8","H16"].includes(original)){
    const allowedIds=new Set(["lh1-pro"]);
    const sources=[
      ...(db?.headlamp_family_candidates||[]),
      ...Object.entries(db?.product_socket_catalog||{}).map(([product_id,x])=>({product_id,...x}))
    ];
    for(const x of sources){
      if(!x?.product_id||!allowedIds.has(x.product_id)||seen.has(x.product_id))continue;
      if(!recommendationEnabled(x.product_id))continue;
      const variants=(x.socket_variants||[]).map(up);
      if(!variants.includes(target))continue;
      seen.add(x.product_id);
      out.push({product_id:x.product_id,name:x.name||"LED HEADLIGHT LH1-PRO CSP PLUG N PLAY.",sku:x.sku||"",socket:target,source:"hard_h8_h16_lh1pro"});
    }
    return out;
  }

  // Small bulbs: ONLY curated shortlist chosen by business rules.
  if(["T10","T15","T20","S25"].includes(target)){
    for(const x of db?.curated_socket_products?.[target]||[]){
      if(!x?.product_id||seen.has(x.product_id)||!recommendationEnabled(x.product_id))continue;
      if(!eligibleForClass(x.product_id,"car","curated_small_bulb"))continue;
      seen.add(x.product_id);
      out.push({product_id:x.product_id,name:x.name,sku:x.sku||"",socket:target,source:"curated_small_bulb"});
    }
    return out.slice(0,6);
  }

  // Headlamp/foglamp car families explicitly curated.
  for(const x of db?.headlamp_family_candidates||[]){
    if(!x?.product_id||seen.has(x.product_id)||!recommendationEnabled(x.product_id))continue;
    const variants=(x.socket_variants||[]).map(up);
    if(!variants.includes(target))continue;

    const policy=db?.socket_policy?.equivalences?.[original]||{};
    const preferred=policy.preferred_product_ids||[];
    if(preferred.length&&!preferred.includes(x.product_id))continue;

    if(["D2","D2R","D2S","D4","D4R","D4S"].includes(original)&&x.product_id!=="v9pro")continue;
    if(!eligibleForClass(x.product_id,"car","headlamp_family"))continue;

    seen.add(x.product_id);
    out.push({product_id:x.product_id,name:x.name,sku:x.sku||"",socket:target,source:"headlamp_family"});
  }

  // Explicit CAR classification records (e.g. H4 MP1 / MP3 families).
  const cidx=classificationIndex();
  const catalog=db?.product_socket_catalog||{};
  for(const [productId,c] of Object.entries(cidx)){
    if(seen.has(productId)||!recommendationEnabled(productId))continue;
    if(!eligibleForClass(productId,"car","classification"))continue;
    const entry=catalog[productId];
    if(!entry)continue;
    const variants=(entry.socket_variants||[]).map(up);
    if(!variants.includes(target))continue;
    seen.add(productId);
    out.push({product_id:productId,name:entry.name||c.canonical_name,sku:entry.sku||"",socket:target,source:"car_classification"});
  }

  return out.slice(0,6);
}

function vehiclePositions(match){
  const l=match?.record?.lighting||{};
  const rows=[];
  const add=(key,label,sockets)=>{
    const clean=(sockets||[]).map(up).filter(x=>x&&!x.includes("OEM"));
    if(clean.length)rows.push({key,label,sockets:[...new Set(clean)]});
  };

  const h=l.headlamp||{};
  add("headlamp_low","Headlamp dekat",h.low_beam);
  add("headlamp_high","Headlamp jauh",h.high_beam);
  add("headlamp_combined","Headlamp utama",h.combined);
  add("foglamp","Foglamp",l.foglamp?.options);
  add("parking_front","Senja depan",l.parking_front?.options);
  add("reverse","Lampu mundur",l.reverse?.options);
  add("turn_signal_front","Sein depan",l.turn_signal_front?.options);
  add("turn_signal_rear","Sein belakang",l.turn_signal_rear?.options);
  add("brake","Lampu rem",l.brake?.options);
  add("license_plate_rear","Plat belakang",l.license_plate_rear?.options);
  return rows;
}

function requestedPositions(message){
  const q=norm(message);
  const want=[];
  const add=k=>{if(!want.includes(k))want.push(k)};
  if(/\bfog|kabut/.test(q))add("foglamp");
  if(/\bmundur|reverse/.test(q))add("reverse");
  if(/\bsenja|parking/.test(q))add("parking_front");
  if(/\bsein depan/.test(q))add("turn_signal_front");
  if(/\bsein belakang/.test(q))add("turn_signal_rear");
  if(/\brem|brake/.test(q))add("brake");
  if(/\bplat|license/.test(q))add("license_plate_rear");
  if(/\blampu dekat|low beam/.test(q))add("headlamp_low");
  if(/\blampu jauh|high beam/.test(q))add("headlamp_high");
  if(/\bheadlamp|lampu utama|lampu depan|bi-led|biled/.test(q)){
    add("headlamp_low");add("headlamp_high");add("headlamp_combined");
  }
  return want;
}

function isBiLedQuery(message){
  return /\bbi[\s-]?led\b/i.test(String(message||""));
}
function biledProducts(ctx){
  // Category-safe: scan live product data passed by core, so deployment does not depend on produk.json existing locally.
  const products=Array.isArray(ctx?.products)?ctx.products:[];
  const out=[];
  for(const p of products){
    const name=String(p?.nama||p?.name||"");
    const sku=String(p?.sku||"");
    if(!/\bbi[\s-]?led\b/i.test(`${name} ${sku}`))continue;
    const pid=String(p?.product_id||p?.id||"").trim();
    if(pid&&!recommendationEnabled(pid))continue;
    out.push({name,sku,variants:p?.varian||p?.variants||[],product_id:pid||null});
  }
  return out.slice(0,16);
}


function requestedPositionFromTurn(message){
  const q=norm(message||"");
  if(/\b(headlamp|lampu depan|lampu utama)\b/.test(q))return["headlamp_low","headlamp_high","headlamp_combined"];
  if(/\b(foglamp|lampu kabut)\b/.test(q))return["foglamp"];
  if(/\b(lampu mundur|reverse)\b/.test(q))return["reverse"];
  if(/\b(senja|parking)\b/.test(q))return["parking_front"];
  if(/\b(sein depan)\b/.test(q))return["turn_signal_front"];
  if(/\b(sein belakang)\b/.test(q))return["turn_signal_rear"];
  if(/\b(rem|brake)\b/.test(q))return["brake"];
  return[];
}
function deterministicPack(ctx){
  const lock=lockedVehicle(ctx);
  const mctx=resolveMotorcycleContext(ctx.message)||resolveMotorcycleContext([lock?.brand,lock?.model].filter(Boolean).join(" "));
  const match=mctx?null:resolveVehicleRecord(lock);
  const klass=mctx?"motorcycle":vehicleClass(lock,match);

  if(mctx){
    return{
      locked_vehicle:{
        brand:mctx.brand,
        model:mctx.model,
        year:lock?.year||null,
        source:mctx.source
      },
      vehicle_label:[mctx.brand,mctx.model,lock?.year].filter(Boolean).join(" "),
      vehicle_class:"motorcycle",
      motorcycle_groups:mctx.groups,
      motorcycle_candidates:motorcycleCandidatesForContext(mctx),
      vehicle_record:null,
      positions:[],
      biled_query:isBiLedQuery(ctx.message),
      biled_catalog:isBiLedQuery(ctx.message)?biledProducts(ctx):[]
    };
  }
  const allPositions=vehiclePositions(match);
  const turnWanted=requestedPositionFromTurn(ctx.message);
  const wanted=turnWanted.length?turnWanted:requestedPositions(ctx.message);
  const filtered=wanted.length
    ?allPositions.filter(p=>wanted.includes(p.key))
    :allPositions;

  const biled=isBiLedQuery(ctx.message);
  const positions=filtered.map(p=>({
    position:p.label,
    key:p.key,
    sockets:p.sockets.map(s=>{
      const target=replacementSocket(s);
      return{
        source_socket:s,
        equivalent_socket:target!==up(s)?target:"",
        candidates:biled?[]:(klass==="car"
          ?exactCandidatesForCar(s,p.key).map(c=>({...c,lifecycle:lifecycleFor(c.product_id)}))
          :[])
      };
    })
  }));

  return{
    locked_vehicle:lock,
    vehicle_label:vehicleLabel(lock),
    vehicle_class:klass,
    vehicle_record:match?{
      vehicle_id:match.record?.vehicle_id,
      identity:match.record?.identity,
      year_exact:match.year_exact,
      requested_year:match.requested_year
    }:null,
    positions,
    biled_query:biled,
    biled_catalog:biled?biledProducts(ctx):[]
  };
}


function requestedWhite(message){
  return /\bputih|white\b/i.test(String(message||""));
}
function requestedLowWatt(message){
  return /\b(watt jangan terlalu tinggi|watt rendah|low watt|hemat daya)\b/i.test(String(message||""));
}
function formatVehicleTitle(pack){
  const v=pack?.locked_vehicle||{};
  const brand=v.brand?String(v.brand).replace(/\b\w/g,c=>c.toUpperCase()):"";
  const model=v.model?String(v.model).replace(/\b\w/g,c=>c.toUpperCase()):"";
  return [brand,model,v.year].filter(Boolean).join(" ").trim()||pack?.vehicle_label||"Kendaraan";
}
function candidateLine(c){
  return `- ${c.name||c.product_id} — Socket ${c.socket}`;
}
function renderDeterministicRecommendation(pack,message){
  const title=formatVehicleTitle(pack);
  const out=[title];
  if(pack?.vehicle_record?.year_exact===false&&pack?.vehicle_record?.requested_year){
    out.push(`Catatan: tahun ${pack.vehicle_record.requested_year} tidak tercakup persis pada rentang record sumber yang tersedia; data socket di bawah mengikuti record model yang tersedia.`);
  }

  if(pack?.vehicle_class==="motorcycle"){
    out.push("");
    const groups=(pack.motorcycle_groups||[]).join(", ");
    out.push(`Kelompok aplikasi: ${groups||"motorcycle"}`);
    out.push("");
    out.push("Rekomendasi Nine:");
    const candidates=pack.motorcycle_candidates||[];
    if(!candidates.length){
      out.push("- [Saat ini produk Nine belum tersedia untuk kelompok aplikasi motor tersebut]");
    }else{
      for(const c of candidates){
        out.push(`- ${c.name}${c.application_note?` (${c.application_note})`:""}`);
      }
    }
    out.push("");
    out.push("Catatan: rekomendasi mengikuti klasifikasi aplikasi motor yang sudah ditetapkan. Tahun/generasi dan kondisi socket tetap perlu diverifikasi sebelum pemasangan.");
    return out.join("\n");
  }

  if(pack?.biled_query){
    out.push("");
    out.push("BiLED:");
    out.push("- Fitment BiLED kendaraan ini belum terverifikasi secara spesifik.");
    if(Array.isArray(pack.biled_catalog)&&pack.biled_catalog.length){
      out.push("- Opsi katalog BiLED Nine untuk kebutuhan custom:");
      for(const p of pack.biled_catalog){
        out.push(`  - ${p.name}${p.sku?` (${p.sku})`:""}`);
      }
      out.push("- Opsi di atas bukan klaim plug-and-play; pemasangan tetap perlu verifikasi dimensi, dudukan, projector, wiring, dan ruang headlamp.");
    }else{
      out.push("- [Saat ini produk Nine belum tersedia/terverifikasi sebagai BiLED spesifik untuk kendaraan ini]");
    }
    return out.join("\n");
  }

  if(!Array.isArray(pack?.positions)||!pack.positions.length){
    return `${title}\n\nData posisi/socket untuk kebutuhan ini belum terverifikasi cukup. Saya tidak akan menebak rekomendasi produk.`;
  }

  if(requestedWhite(message)||requestedLowWatt(message)){
    out.push("");
    out.push("Preferensi user:");
    if(requestedWhite(message))out.push("- Warna: putih");
    if(requestedLowWatt(message))out.push("- Watt: tidak terlalu tinggi; angka watt hanya akan dianggap pasti bila tersedia pada data produk.");
  }

  for(const pos of pack.positions){
    out.push("");
    out.push(`${pos.position}:`);
    const sockets=pos.sockets||[];
    if(sockets.length>1){
      out.push(`- Database mencatat alternatif socket: ${sockets.map(x=>x.source_socket).join(" / ")}. Verifikasi socket fisik kendaraan sebelum pemasangan.`);
    }
    for(const s of sockets){
      out.push(`- Socket bawaan: ${s.source_socket}`);
      if(s.equivalent_socket)out.push(`- Socket rekomendasi ekuivalen: ${s.equivalent_socket}`);
      const candidates=s.candidates||[];
      if(!candidates.length){
        out.push("- Rekomendasi Nine: [Saat ini produk Nine belum tersedia untuk kebutuhan/socket tersebut]");
        continue;
      }
      out.push("- Rekomendasi Nine:");
      for(const c of candidates)out.push(`  ${candidateLine(c)}`);
    }
  }
  return out.join("\n");
}

function tools(){
  return[
    {
      type:"function",
      name:"inspect_locked_vehicle",
      description:"Baca kendaraan yang dikunci dari state/history dan record kendaraan yang cocok.",
      parameters:{type:"object",properties:{},additionalProperties:false}
    },
    {
      type:"function",
      name:"inspect_recommendation_pack",
      description:"Baca posisi, socket bawaan, equivalence, classification gate, lifecycle, dan kandidat final.",
      parameters:{type:"object",properties:{},additionalProperties:false}
    }
  ];
}

async function execTool(call,ctx){
  if(call.name==="inspect_locked_vehicle"){
    const pack=deterministicPack(ctx);
    return{
      locked_vehicle:pack.locked_vehicle,
      vehicle_label:pack.vehicle_label,
      vehicle_class:pack.vehicle_class,
      vehicle_record:pack.vehicle_record
    };
  }
  if(call.name==="inspect_recommendation_pack"){
    return deterministicPack(ctx);
  }
  return{error:"unknown_tool"};
}

function outputText(data){
  if(typeof data?.output_text==="string"&&data.output_text.trim())return data.output_text.trim();
  const out=[];
  for(const x of data?.output||[])for(const c of x?.content||[])if(c?.type==="output_text"&&c?.text)out.push(c.text);
  return out.join("\n").trim();
}




function activeUniversalTask(ctx){
  const t=ctx?.conversationContext?.activeTask||null;
  if(!t||!t.intent)return null;
  return t;
}

function currentTurnExplicitVehicle(ctx){
  return explicitVehicleFromText(ctx?.message||"")||resolveMotorcycleContext(ctx?.message||"")||null;
}

function contextConflict(ctx){
  const current=currentTurnExplicitVehicle(ctx);
  const inherited=ctx?.conversationContext?.vehicle||ctx?.state?.vehicle||null;
  if(!current||!inherited?.model)return null;
  const cm=norm(current.model),im=norm(inherited.model);
  if(cm&&im&&cm!==im)return{current,inherited};
  return null;
}

function blockedByUniversalTask(ctx){
  const t=activeUniversalTask(ctx);
  return !!(t&&["landing_page","storyboard","video_prompt","image_prompt","copywriting","caption","comparison","creative_general"].includes(t.intent));
}
function mandatoryAutomotiveRecommendation(ctx){
  if(blockedByUniversalTask(ctx))return false;
  const q=String(ctx?.message||"");
  const hasRecommendationIntent=
    /\b(rekomendasi|recommend|cocok|pilih|carikan|pakai apa|tipe apa|type apa|bi[\s-]?led)\b/i.test(q) ||
    /\bsekalian\b|\bsekaligus\b/i.test(q);
  if(!hasRecommendationIntent)return false;

  const hasVehicleContext=
    !!resolveMotorcycleContext(q) ||
    !!lockedVehicle(ctx)?.model ||
    !!ctx?.conversationContext?.vehicle?.model ||
    !!ctx?.state?.vehicle?.model ||
    /\b(mobil|motor|headlamp|foglamp|lampu|socket|soket)\b/i.test(q);

  return hasVehicleContext;
}

export async function getAinexAgentControl(){
  const cfg=await getConfig();
  return {enabled:cfg.enabled===true,mode:cfg.mode||"hybrid",monitor:cfg.monitor!==false,version:AGENT_VERSION};
}

export async function runAinexAgent(ctx={}){
  const start=Date.now(),requestId="AG-"+String(Date.now()).slice(-8),cfg=await getConfig();
  await updateMetrics({requests:1,last_status:cfg.enabled?"STANDBY":"OFF",last_request_id:requestId,last_route:ctx.route?.type||""});

  if(!cfg.enabled)return{used:false,reason:"disabled",mode:cfg.mode,request_id:requestId,version:AGENT_VERSION};
  const mandatoryRecommendation=mandatoryAutomotiveRecommendation(ctx);
  if(cfg.mode==="hybrid"&&!complex(ctx.message||"")&&!mandatoryRecommendation){
    await updateMetrics({bypass:1,last_status:"BYPASSED",last_request_id:requestId,last_route:ctx.route?.type||""});
    return{used:false,reason:"simple_bypass",mode:cfg.mode,request_id:requestId,version:AGENT_VERSION};
  }
  if(!process.env.OPENAI_API_KEY){
    await updateMetrics({errors:1,last_status:"ERROR",last_request_id:requestId,last_route:ctx.route?.type||""});
    return{used:false,reason:"api_key_missing",mode:cfg.mode,request_id:requestId};
  }

  const conflict=contextConflict(ctx);
  if(conflict){
    ctx={...ctx,conversationContext:{...(ctx.conversationContext||{}),vehicle:conflict.current},memory:(ctx.memory||[]).filter(x=>x?.role!=="user"||!explicitVehicleFromText(x?.content||"")||norm(explicitVehicleFromText(x.content)?.model)===norm(conflict.current?.model))};
  }

  const pack=deterministicPack(ctx);
  const usedTools=["inspect_locked_vehicle","inspect_recommendation_pack"];

  const currentLooksVehicleSpecific=/\b(mobil|motor|kendaraan|avansa|avanza|veloz|xenia|brio|fortuner|xpander|expander|pajero|stargazer)\b/i.test(ctx.message||"");
  if(currentLooksVehicleSpecific&&!pack?.locked_vehicle?.model){
    const ms=Date.now()-start;
    const reply="Kendaraan pada pertanyaan terbaru belum berhasil saya identifikasi dengan aman. Sebutkan model kendaraan dengan jelas agar saya tidak membawa konteks kendaraan sebelumnya.";
    await updateMetrics({
      agent_used:1,agent_ms:ms,last_total_ms:ms,last_status:"COMPLETED",
      last_request_id:requestId,last_route:ctx.route?.type||"",
      last_tools:[...new Set(usedTools)]
    });
    return{
      used:true,reply,mode:cfg.mode,shadow:false,safe_shadow_override:cfg.mode==="shadow",
      request_id:requestId,tools:[...new Set(usedTools)],duration_ms:ms,
      locked_vehicle:null,vehicle_class:"unknown",deterministic:true
    };
  }

  // High-risk fitment/recommendation lane: NO model discretion.
  // Agent orchestrates deterministic data and renders the answer directly.
  const automotiveRecommendation=mandatoryRecommendation&&!!pack?.locked_vehicle?.model;
  if(automotiveRecommendation){
    const reply=renderDeterministicRecommendation(pack,ctx.message||"");
    const ms=Date.now()-start;
    await updateMetrics({
      agent_used:1,agent_ms:ms,last_total_ms:ms,last_status:"COMPLETED",
      last_request_id:requestId,last_route:ctx.route?.type||"",
      last_tools:[...new Set(usedTools)]
    });
    return{
      used:true,reply,mode:cfg.mode,
      shadow:false,
      safe_shadow_override:cfg.mode==="shadow",
      request_id:requestId,tools:[...new Set(usedTools)],duration_ms:ms,
      locked_vehicle:pack.locked_vehicle||null,
      vehicle_class:pack.vehicle_class,
      deterministic:true,
      confidence:ctx?.conversationContext?.confidence||null,
      evidence:{
        vehicle:pack?.vehicle_record?"vehicle_database":(pack?.vehicle_class==="motorcycle"?"motorcycle_classification":"context"),
        products:"classification+lifecycle+socket_policy",
        factual_mode:"deterministic"
      },
      version:AGENT_VERSION
    };
  }

  const instructions=`Kamu adalah AINEX Agent V1.5 Adaptive Orchestrator.

KAMU HANYA MENYUSUN JAWABAN DARI FINAL_PACK.
Tidak boleh menciptakan kendaraan, socket, produk, fitment, atau klasifikasi.

ATURAN MUTLAK:
1. LOCKED VEHICLE:
   - Jika CURRENT message tidak menyebut kendaraan baru, kendaraan di FINAL_PACK wajib dipertahankan.
   - DILARANG mengganti kendaraan dengan model lain. Jangan pernah mengubah Xpander menjadi Fortuner, dll.
2. VEHICLE CLASS:
   - Kandidat FINAL_PACK sudah melewati gate car/motor.
   - Jangan menambahkan kandidat di luar FINAL_PACK.
   - Socket yang sama TIDAK berarti produk lintas kelas boleh dipakai.
3. REKOMENDASI:
   - Jika user meminta rekomendasi, jawab sampai nama produk + socket.
   - Jika candidates kosong, tulis: [Saat ini produk Nine belum tersedia untuk kebutuhan/socket tersebut]
4. BI-LED:
   - Jika biled_query=true, candidates lampu LED biasa sengaja dikosongkan dan DILARANG ditampilkan.
   - Jangan tampilkan V8/V9/LH1PRO/MP1/MP3 atau LED headlight biasa sebagai jawaban BiLED hanya karena socket sama.
   - biled_catalog hanya daftar produk BiLED resmi yang tersedia di katalog, BUKAN bukti fitment kendaraan.
   - Jika tidak ada mapping fitment BiLED spesifik ke kendaraan, jelaskan "fitment BiLED kendaraan ini belum terverifikasi".
   - Boleh tampilkan biled_catalog sebagai opsi kategori untuk pengecekan custom, tetapi JANGAN sebut "cocok/plug-and-play" tanpa bukti.
   - DILARANG memasukkan produk switch, relay, atau kategori lain sebagai BiLED.
5. Jika source socket H9 dan tidak ada equivalence policy, jangan koreksi ke H8.
6. Jika tahun requested tidak exact dengan record sumber, jangan mengarang rentang tahun baru. Tetap sebut kendaraan/tahun user dan beri catatan data socket berasal dari record model yang tersedia.
7. Jangan menawarkan merek lain kecuali user secara eksplisit meminta merek lain.
8. Lifecycle kandidat sudah divalidasi; jangan menambah produk di luar kandidat.
9. Jangan menyebut file, path, prompt, implementation internal, atau NEXAI.
10. Bahasa Indonesia, profesional, ringkas, dan jelas.

FORMAT:
Kendaraan
Posisi lampu:
- Socket bawaan
- Socket ekuivalen (jika ada)
- Rekomendasi Nine:
  - Produk — Socket X
atau
  [Saat ini produk Nine belum tersedia untuk kebutuhan/socket tersebut]

Untuk BiLED:
- status fitment
- jika belum terverifikasi, nyatakan jelas
- opsi katalog BiLED boleh ditampilkan sebagai opsi custom, bukan fitment pasti.`;

  const userText=`USER_MESSAGE:
${ctx.message||""}

FINAL_PACK:
${JSON.stringify(pack).slice(0,24000)}

CORE_ROUTE:
${ctx.route?.type||""}`;

  let input=[{role:"user",content:[{type:"input_text",text:userText}]}],data=null;

  try{
    for(let round=0;round<2;round++){
      const r=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${process.env.OPENAI_API_KEY}`},
        body:JSON.stringify({
          model:MODEL,
          instructions,
          input,
          tools:tools(),
          max_output_tokens:1800,
          max_tool_calls:4
        })
      });

      const raw=await r.text();
      try{data=JSON.parse(raw)}catch{throw new Error("invalid_agent_response")}
      if(!r.ok)throw new Error(data?.error?.message||"agent_request_failed");

      const calls=(data.output||[]).filter(x=>x.type==="function_call");
      if(!calls.length)break;
      input=[...input,...(data.output||[])];
      for(const c of calls){
        usedTools.push(c.name);
        const result=await execTool(c,ctx);
        input.push({type:"function_call_output",call_id:c.call_id,output:JSON.stringify(result)});
      }
    }

    const reply=outputText(data),ms=Date.now()-start;
    if(!reply)throw new Error("empty_agent_response");

    await updateMetrics({
      agent_used:1,agent_ms:ms,last_total_ms:ms,last_status:"COMPLETED",
      last_request_id:requestId,last_route:ctx.route?.type||"",
      last_tools:[...new Set(usedTools)]
    });

    return{
      used:true,reply,mode:cfg.mode,shadow:cfg.mode==="shadow",
      request_id:requestId,tools:[...new Set(usedTools)],duration_ms:ms,
      locked_vehicle:pack.locked_vehicle||null,
      vehicle_class:pack.vehicle_class
    };
  }catch(e){
    const ms=Date.now()-start;
    await updateMetrics({
      fallback:1,errors:1,last_total_ms:ms,last_status:"FALLBACK",
      last_request_id:requestId,last_route:ctx.route?.type||"",
      last_tools:[...new Set(usedTools)]
    });
    return{
      used:false,reason:"agent_error",error:e.message,mode:cfg.mode,
      request_id:requestId,duration_ms:ms,fallback:true
    };
  }
}
