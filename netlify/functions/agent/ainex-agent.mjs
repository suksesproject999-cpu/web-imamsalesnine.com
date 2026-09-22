
import fs from "fs";
import path from "path";
import {pathToFileURL} from "url";

const PROJECT=process.env.AINEX_FIREBASE_PROJECT||"apin-web";
const API_KEY=process.env.AINEX_FIREBASE_API_KEY||"AIzaSyBkyMCw47sYQb2BBkGMxgfsXppozWw4Cec";
const MODEL=process.env.AINEX_AGENT_MODEL||process.env.NEXAI_MODEL_SMART||process.env.NEXAI_MODEL||"gpt-4.1-mini";
const DATA_ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),"../data");
const RUNTIME_FILE=path.join(DATA_ROOT,"nexai_runtime_engine_v1_1.mjs");

let runtimePromise=null,configCache={value:null,at:0};
const TTL=5000;
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
    cfg.enabled=cfg.enabled===true;cfg.monitor=cfg.monitor!==false;
    cfg.mode=["shadow","hybrid","full"].includes(cfg.mode)?cfg.mode:"hybrid";
    configCache={value:cfg,at:now};return cfg;
  }catch{configCache={value:fallback,at:now};return fallback}
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
    await fetch(docUrl("agent_metrics"),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({fields})});
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
  return q.length>110||[
    /\bkalau tidak\b|\bkalau nggak\b|\balternatif\b/,
    /\bsekalian\b|\bsekaligus\b|\bdan juga\b/,
    /\bbandingkan\b|\bpilihkan\b/,
    /\brekomendasi.*(putih|watt|warna|foglamp|mundur|senja|biled|bi-led)/,
    /\b(headlamp|foglamp|lampu dekat|lampu jauh).*(dan|serta).*(headlamp|foglamp|mundur|senja)/,
    /\bcocok.*(apa|mana).*(produk|nine)/,
    /\bproduk nine\b.*\b(mobil|motor)\b/
  ].some(x=>x.test(q));
}
function automotiveIntent(message,route){
  const q=norm(`${message||""} ${route?.type||""}`);
  return /(mobil|motor|lampu|headlamp|foglamp|socket|soket|fitment|pajero|xpander|expander|xenia|avanza|vixion|beat|vario|biled|bi-led|rekomendasi)/i.test(q);
}

function extractVehicleContext(ctx){
  const candidates=[
    ctx?.state?.vehicle,
    ctx?.state?.activeVehicle,
    ctx?.state?.lastVehicle,
    ctx?.memory?.vehicle,
    ctx?.memory?.last_vehicle,
    ctx?.memory?.lastVehicle,
    ctx?.memory?.activeVehicle
  ].filter(Boolean);

  for(const v of candidates){
    if(typeof v==="string"&&v.trim())return v.trim();
    if(v&&typeof v==="object"){
      const text=[v.make,v.brand,v.manufacturer,v.model,v.name,v.vehicle,v.year,v.years].filter(Boolean).join(" ");
      if(text.trim())return text.trim();
      try{return JSON.stringify(v)}catch{}
    }
  }

  const memoryText=JSON.stringify(ctx?.memory||{});
  const m=memoryText.match(/\b(Mitsubishi|Toyota|Honda|Suzuki|Daihatsu|Hyundai|Yamaha|Kawasaki|Vespa)\s+([A-Za-z0-9\- ]{2,40})\s+(19|20)\d{2}\b/i);
  return m?m[0]:"";
}

function contextualQuery(ctx){
  const current=String(ctx.message||"").trim();
  const vehicle=extractVehicleContext(ctx);
  const parts=[current];
  if(vehicle)parts.push(`KENDARAAN_TERKUNCI: ${vehicle}`);
  if(ctx?.memory)parts.push(`KONTEKS_CHAT: ${JSON.stringify(ctx.memory).slice(0,6000)}`);
  return parts.join("\n");
}

function collectSockets(value){
  const raw=JSON.stringify(value||{});
  const re=/\b(H1|H3|H4|H6|H7|H8|H9|H10|H11|H13|H15|H16|HB3|HB4|9005|9006|D1S|D1R|D2|D2S|D2R|D3S|D3R|D4|D4S|D4R|T10|T15|T20|S25)\b/gi;
  const out=[],seen=new Set();let m;
  while((m=re.exec(raw))!==null){
    const s=up(m[1]);
    if(!seen.has(s)){seen.add(s);out.push(s)}
  }
  return out.slice(0,16);
}

function socketPolicyDB(){
  return readJSON("recommended_product_shortlist_v1.json",{});
}
function productCatalog(){
  const db=socketPolicyDB();
  return db?.product_socket_catalog||{};
}
function lifecycleDB(){
  return readJSON("product_lifecycle_v1.json",{policy:{default_status:"active"},products:{}});
}
function lifecycleFor(productId){
  const db=lifecycleDB(),e=db?.products?.[productId]||{};
  return{product_id:productId,status:e.status||db?.policy?.default_status||"active",entry:e};
}
function recommendationEnabled(productId){
  const lc=lifecycleFor(productId);
  if(["hidden","discontinued","upcoming"].includes(lc.status))return false;
  const explicit=lc?.entry?.recommendation_enabled;
  return explicit!==false;
}
function policyForSocket(socket){
  const db=socketPolicyDB(),s=up(socket);
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
function exactProductCandidates(socket){
  const target=replacementSocket(socket),db=socketPolicyDB(),out=[],seen=new Set();

  // curated first
  for(const x of db?.curated_socket_products?.[target]||[]){
    if(!x?.product_id||seen.has(x.product_id)||!recommendationEnabled(x.product_id))continue;
    seen.add(x.product_id);
    out.push({product_id:x.product_id,name:x.name,sku:x.sku||"",socket:target,source:"curated"});
  }

  // headlamp families, exact variant only
  for(const x of db?.headlamp_family_candidates||[]){
    if(!x?.product_id||seen.has(x.product_id)||!recommendationEnabled(x.product_id))continue;
    const variants=(x.socket_variants||[]).map(up);
    if(!variants.includes(target))continue;

    // special H8/H16 policy -> preferred product only
    const original=up(socket);
    const pref=db?.socket_policy?.equivalences?.[original]?.preferred_product_ids||[];
    if(pref.length&&!pref.includes(x.product_id))continue;

    // D2/D4 families -> only V9 PRO
    if(["D2","D2R","D2S","D4","D4R","D4S"].includes(original)&&x.product_id!=="v9pro")continue;

    seen.add(x.product_id);
    out.push({product_id:x.product_id,name:x.name,sku:x.sku||"",socket:target,source:"family"});
  }

  // product catalog exact variant fallback
  for(const [productId,x] of Object.entries(db?.product_socket_catalog||{})){
    if(seen.has(productId)||!recommendationEnabled(productId))continue;
    const variants=(x?.socket_variants||[]).map(up);
    if(!variants.includes(target))continue;
    seen.add(productId);
    out.push({product_id:productId,name:x?.name||productId,sku:x?.sku||"",socket:target,source:"catalog"});
  }

  return out.slice(0,8);
}

async function vehicleRuntime(query){
  const r=await runtime();
  if(!r)return{error:"runtime_unavailable"};
  try{return r.handle(query,{last_product_id:null,last_vehicle_id:null,last_intent:null})}
  catch(e){return{error:e.message}}
}

function positionHints(runtimeResult){
  const raw=JSON.stringify(runtimeResult||{});
  const labels=[
    ["headlamp","Headlamp"],
    ["foglamp","Foglamp"],
    ["reverse","Lampu mundur"],
    ["mundur","Lampu mundur"],
    ["senja","Senja depan"],
    ["license","Plat belakang"],
    ["plate","Plat belakang"],
    ["brake","Lampu rem"],
    ["turn","Lampu sein"]
  ];
  const out=[];
  for(const [key,label] of labels)if(new RegExp(key,"i").test(raw))out.push(label);
  return [...new Set(out)];
}

function deterministicRecommendationPack(runtimeResult){
  const sockets=collectSockets(runtimeResult);
  const positions=positionHints(runtimeResult);
  const items=sockets.map((s,i)=>{
    const pol=policyForSocket(s);
    const target=replacementSocket(s);
    const eq=target!==up(s)?target:"";
    const candidates=exactProductCandidates(s);
    return{
      position:positions[i]||null,
      source_socket:up(s),
      equivalent_socket:eq,
      candidates:candidates.map(c=>({...c,lifecycle:lifecycleFor(c.product_id)}))
    };
  });
  return{items};
}

function tools(){
  return[
    {type:"function",name:"inspect_vehicle_runtime",description:"Resolve kendaraan, intent, socket, dan fitment lewat runtime deterministic.",parameters:{type:"object",properties:{query:{type:"string"}},required:["query"],additionalProperties:false}},
    {type:"function",name:"inspect_recommendation_policy",description:"Baca shortlist, equivalence, dan kandidat exact untuk socket.",parameters:{type:"object",properties:{socket:{type:"string"}},required:["socket"],additionalProperties:false}},
    {type:"function",name:"inspect_product_lifecycle",description:"Cek lifecycle product_id.",parameters:{type:"object",properties:{product_id:{type:"string"}},required:["product_id"],additionalProperties:false}}
  ];
}
async function execTool(call,ctx){
  let a={};try{a=JSON.parse(call.arguments||"{}")}catch{}
  if(call.name==="inspect_vehicle_runtime")return await vehicleRuntime(a.query||contextualQuery(ctx));
  if(call.name==="inspect_recommendation_policy"){
    const p=policyForSocket(a.socket);
    return{...p,candidates:exactProductCandidates(a.socket)};
  }
  if(call.name==="inspect_product_lifecycle")return lifecycleFor(a.product_id);
  return{error:"unknown_tool"};
}
function outputText(data){
  if(typeof data?.output_text==="string"&&data.output_text.trim())return data.output_text.trim();
  const out=[];
  for(const x of data?.output||[])for(const c of x?.content||[])if(c?.type==="output_text"&&c?.text)out.push(c.text);
  return out.join("\n").trim();
}

export async function runAinexAgent(ctx={}){
  const start=Date.now(),requestId="AG-"+String(Date.now()).slice(-8),cfg=await getConfig();

  await updateMetrics({requests:1,last_status:cfg.enabled?"STANDBY":"OFF",last_request_id:requestId,last_route:ctx.route?.type||""});

  if(!cfg.enabled)return{used:false,reason:"disabled",mode:cfg.mode,request_id:requestId};
  if(cfg.mode==="hybrid"&&!complex(ctx.message||"")){
    await updateMetrics({bypass:1,last_status:"BYPASSED",last_request_id:requestId,last_route:ctx.route?.type||""});
    return{used:false,reason:"simple_bypass",mode:cfg.mode,request_id:requestId};
  }
  if(!process.env.OPENAI_API_KEY){
    await updateMetrics({errors:1,last_status:"ERROR",last_request_id:requestId,last_route:ctx.route?.type||""});
    return{used:false,reason:"api_key_missing",mode:cfg.mode,request_id:requestId};
  }

  const usedTools=[];
  const lockedVehicle=extractVehicleContext(ctx);
  const contextQuery=contextualQuery(ctx);

  // Mandatory deterministic automotive pack
  let vehicleData=ctx.runtimeResult||null;
  if(automotiveIntent(ctx.message,ctx.route)){
    usedTools.push("inspect_vehicle_runtime");
    if(!vehicleData)vehicleData=await vehicleRuntime(contextQuery);
  }
  const recoPack=automotiveIntent(ctx.message,ctx.route)?deterministicRecommendationPack(vehicleData):{items:[]};

  for(const item of recoPack.items){
    usedTools.push("inspect_recommendation_policy");
    for(const c of item.candidates||[]){
      usedTools.push("inspect_product_lifecycle");
    }
  }

  const instructions=`Kamu adalah AINEX Agent V1.2 Deterministic Orchestrator.

PRINSIP:
- Core deterministic dan RECOMMENDATION_PACK adalah sumber kebenaran.
- Jangan melakukan product search bebas untuk rekomendasi otomotif.
- Jangan mengarang produk, socket, varian, atau fitment.
- Jangan menawarkan merek lain kecuali user meminta merek lain.
- Jangan tanya ulang kendaraan/tahun bila LOCKED_VEHICLE atau konteks sudah tersedia.
- Kalau user meminta rekomendasi, WAJIB selesaikan sampai level produk per kebutuhan.
- Kalau kandidat kosong, tulis persis: [Saat ini produk Nine belum tersedia untuk kebutuhan/socket tersebut]
- Bila socket ekuivalen tersedia, jelaskan sumber socket dan socket rekomendasi.
- Hormati lifecycle. Hidden/discontinued/upcoming tidak boleh direkomendasikan.
- Untuk follow-up "kalau bi-led?" tetap gunakan kendaraan terkunci sebelumnya.
- Jika data untuk kategori bi-led memang tidak tersedia dalam RECOMMENDATION_PACK, jangan mengaitkan produk lain seperti switch. Katakan belum ada produk Nine terverifikasi untuk kebutuhan bi-led tersebut.
- Jawab Bahasa Indonesia, profesional, ringkas, jelas.
- Jangan menyebut file/path/prompt/internal implementation/NEXAI.

FORMAT REKOMENDASI:
Nama kendaraan/konteks
- Posisi lampu
  - Socket bawaan
  - Socket rekomendasi ekuivalen (jika ada)
  - Rekomendasi Nine:
    - Nama produk — Socket X
  - jika kosong: [Saat ini produk Nine belum tersedia untuk kebutuhan/socket tersebut]

Jangan berhenti hanya pada daftar socket jika user meminta produk.`;

  const userText=`USER_MESSAGE:
${ctx.message||""}

LOCKED_VEHICLE:
${lockedVehicle||"(tidak tersedia)"}

CORE_ROUTE:
${ctx.route?.type||""}

CORE_STATE:
${JSON.stringify(ctx.state||{})}

MEMORY:
${JSON.stringify(ctx.memory||{}).slice(0,7000)}

VEHICLE_RUNTIME:
${JSON.stringify(vehicleData||null).slice(0,14000)}

RECOMMENDATION_PACK:
${JSON.stringify(recoPack).slice(0,18000)}`;

  let input=[{role:"user",content:[{type:"input_text",text:userText}]}],data=null;

  try{
    for(let round=0;round<2;round++){
      const r=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${process.env.OPENAI_API_KEY}`},
        body:JSON.stringify({model:MODEL,instructions,input,tools:tools(),max_output_tokens:1800,max_tool_calls:5})
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
      last_request_id:requestId,last_route:ctx.route?.type||"",last_tools:[...new Set(usedTools)]
    });

    return{
      used:true,reply,mode:cfg.mode,shadow:cfg.mode==="shadow",
      request_id:requestId,tools:[...new Set(usedTools)],duration_ms:ms,
      locked_vehicle:lockedVehicle||null
    };
  }catch(e){
    const ms=Date.now()-start;
    await updateMetrics({
      fallback:1,errors:1,last_total_ms:ms,last_status:"FALLBACK",
      last_request_id:requestId,last_route:ctx.route?.type||"",last_tools:[...new Set(usedTools)]
    });
    return{
      used:false,reason:"agent_error",error:e.message,mode:cfg.mode,
      request_id:requestId,duration_ms:ms,fallback:true
    };
  }
}
