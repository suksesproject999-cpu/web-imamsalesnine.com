
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

function readJSON(name,fallback){
  try{return JSON.parse(fs.readFileSync(path.join(DATA_ROOT,name),"utf8"))}
  catch{return fallback}
}
function fv(v){
  if(v===null)return{nullValue:null};
  if(typeof v==="boolean")return{booleanValue:v};
  if(typeof v==="number")return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(Array.isArray(v))return{arrayValue:{values:v.map(fv)}};
  if(typeof v==="object"){
    const fields={};for(const[k,x]of Object.entries(v))fields[k]=fv(x);
    return{mapValue:{fields}};
  }
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
function decodeDoc(d){
  const o={};for(const[k,v]of Object.entries(d?.fields||{}))o[k]=dv(v);return o;
}
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
  return q.length>115||[
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

function psummary(p){
  return{
    id:p?.id??null,
    name:p?.nama||"",
    sku:p?.sku||"",
    brand:p?.brand||"",
    variants:Array.isArray(p?.varian)?p.varian:[],
    spec:p?.spesifikasi||{},
    price:p?.harga||{},
    stock:p?.stok||{}
  };
}
function searchProducts(products,q,limit=6){
  q=norm(q);const ts=q.split(" ").filter(Boolean);
  return(products||[]).map(p=>{
    const h=norm(`${p?.nama||""} ${p?.sku||""} ${(p?.varian||[]).join(" ")}`);
    let s=h.includes(q)?20:0;
    for(const t of ts)if(h.includes(t))s+=2;
    return{p,s};
  }).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,limit).map(x=>psummary(x.p));
}

function contextualQuery(ctx){
  const current=String(ctx.message||"").trim();
  const stateVehicle=ctx?.state?.vehicle||ctx?.state?.activeVehicle||ctx?.state?.lastVehicle||null;
  const memoryVehicle=ctx?.memory?.vehicle||ctx?.memory?.last_vehicle||ctx?.memory?.lastVehicle||ctx?.memory?.activeVehicle||null;
  const bits=[current];
  if(stateVehicle)bits.push(`KONTEKS_KENDARAAN_STATE: ${typeof stateVehicle==="string"?stateVehicle:JSON.stringify(stateVehicle)}`);
  if(memoryVehicle)bits.push(`KONTEKS_KENDARAAN_MEMORY: ${typeof memoryVehicle==="string"?memoryVehicle:JSON.stringify(memoryVehicle)}`);
  if(ctx?.memory)bits.push(`KONTEKS_CHAT_RINGKAS: ${JSON.stringify(ctx.memory).slice(0,5000)}`);
  return bits.join("\n");
}

function collectSockets(value){
  const raw=JSON.stringify(value||{});
  const re=/\b(H1|H3|H4|H6|H7|H8|H9|H10|H11|H13|H15|H16|HB3|HB4|9005|9006|D1S|D1R|D2|D2S|D2R|D3S|D3R|D4|D4S|D4R|T10|T15|T20|S25)\b/gi;
  const out=[],seen=new Set();let m;
  while((m=re.exec(raw))!==null){
    const s=m[1].toUpperCase();
    if(!seen.has(s)){seen.add(s);out.push(s)}
  }
  return out.slice(0,12);
}

function policyForSocket(socket){
  const db=readJSON("recommended_product_shortlist_v1.json",{});
  const s=String(socket||"").toUpperCase();
  return{
    socket:s,
    policy:db?.socket_policy?.equivalences?.[s]||null,
    curated:db?.curated_socket_products?.[s]||[],
    headlamp_candidates:db?.headlamp_family_candidates||[]
  };
}

function lifecycleFor(productId){
  const db=readJSON("product_lifecycle_v1.json",{policy:{default_status:"active"},products:{}});
  const e=db?.products?.[productId]||{};
  return{product_id:productId,status:e.status||db?.policy?.default_status||"active",entry:e};
}

async function vehicleRuntime(query){
  const r=await runtime();
  if(!r)return{error:"runtime_unavailable"};
  try{return r.handle(query,{last_product_id:null,last_vehicle_id:null,last_intent:null})}
  catch(e){return{error:e.message}}
}

function tools(){
  return[
    {
      type:"function",
      name:"search_nine_products",
      description:"Cari produk Nine dari data live.",
      parameters:{type:"object",properties:{query:{type:"string"},limit:{type:"integer"}},required:["query"],additionalProperties:false}
    },
    {
      type:"function",
      name:"inspect_vehicle_runtime",
      description:"Resolve kendaraan, intent, socket, dan fitment lewat runtime deterministic.",
      parameters:{type:"object",properties:{query:{type:"string"}},required:["query"],additionalProperties:false}
    },
    {
      type:"function",
      name:"inspect_recommendation_policy",
      description:"Baca shortlist dan equivalence socket terverifikasi.",
      parameters:{type:"object",properties:{socket:{type:"string"}},required:["socket"],additionalProperties:false}
    },
    {
      type:"function",
      name:"inspect_product_lifecycle",
      description:"Cek lifecycle product_id.",
      parameters:{type:"object",properties:{product_id:{type:"string"}},required:["product_id"],additionalProperties:false}
    }
  ];
}

async function execTool(call,ctx){
  let a={};try{a=JSON.parse(call.arguments||"{}")}catch{}
  if(call.name==="search_nine_products")return{products:searchProducts(ctx.products,a.query||"",Math.max(1,Math.min(8,Number(a.limit)||6)))};
  if(call.name==="inspect_vehicle_runtime")return await vehicleRuntime(a.query||contextualQuery(ctx));
  if(call.name==="inspect_recommendation_policy")return policyForSocket(a.socket);
  if(call.name==="inspect_product_lifecycle")return lifecycleFor(a.product_id);
  return{error:"unknown_tool"};
}

async function mandatoryGrounding(ctx,usedTools){
  const pack={
    contextual_query:contextualQuery(ctx),
    vehicle_runtime:null,
    sockets:[],
    policies:[],
    product_search:null,
    lifecycles:[]
  };

  // Automotive/recommendation query wajib menyentuh runtime.
  if(automotiveIntent(ctx.message,ctx.route)){
    usedTools.push("inspect_vehicle_runtime");
    pack.vehicle_runtime=ctx.runtimeResult||await vehicleRuntime(pack.contextual_query);
    pack.sockets=collectSockets(pack.vehicle_runtime);

    // Setiap socket yang ditemukan wajib dicek policy/equivalence.
    for(const s of pack.sockets){
      usedTools.push("inspect_recommendation_policy");
      pack.policies.push(policyForSocket(s));
    }

    // Cari produk Nine dari query + socket agar Agent tidak menjawab dari ingatan model.
    usedTools.push("search_nine_products");
    const searchQ=`${ctx.message||""} ${pack.sockets.join(" ")}`.trim();
    pack.product_search={products:searchProducts(ctx.products,searchQ,8)};

    // Lifecycle kandidat yang benar-benar muncul dari curated/search.
    const ids=[];
    for(const p of pack.policies){
      for(const x of p.curated||[])if(x?.product_id)ids.push(x.product_id);
    }
    for(const x of pack.product_search.products||[])if(x?.id)ids.push(String(x.id));
    const unique=[...new Set(ids)].slice(0,10);
    for(const id of unique){
      usedTools.push("inspect_product_lifecycle");
      pack.lifecycles.push(lifecycleFor(id));
    }
  }

  return pack;
}

function outputText(data){
  if(typeof data?.output_text==="string"&&data.output_text.trim())return data.output_text.trim();
  const out=[];
  for(const x of data?.output||[]){
    for(const c of x?.content||[]){
      if(c?.type==="output_text"&&c?.text)out.push(c.text);
    }
  }
  return out.join("\n").trim();
}

export async function runAinexAgent(ctx={}){
  const start=Date.now();
  const requestId="AG-"+String(Date.now()).slice(-8);
  const cfg=await getConfig();

  await updateMetrics({
    requests:1,
    last_status:cfg.enabled?"STANDBY":"OFF",
    last_request_id:requestId,
    last_route:ctx.route?.type||""
  });

  if(!cfg.enabled){
    return{used:false,reason:"disabled",mode:cfg.mode,request_id:requestId};
  }

  if(cfg.mode==="hybrid"&&!complex(ctx.message||"")){
    await updateMetrics({
      bypass:1,last_status:"BYPASSED",last_request_id:requestId,last_route:ctx.route?.type||""
    });
    return{used:false,reason:"simple_bypass",mode:cfg.mode,request_id:requestId};
  }

  if(!process.env.OPENAI_API_KEY){
    await updateMetrics({
      errors:1,last_status:"ERROR",last_request_id:requestId,last_route:ctx.route?.type||""
    });
    return{used:false,reason:"api_key_missing",mode:cfg.mode,request_id:requestId};
  }

  const usedTools=[];
  const grounding=await mandatoryGrounding(ctx,usedTools);

  const instructions=`Kamu adalah AINEX Agent V1.1 Mandatory Grounded Tools.
Tugasmu BUKAN menjawab dari ingatan model. Kamu adalah orchestrator di atas core AINEX.

ATURAN KERAS:
1) Untuk pertanyaan otomotif/rekomendasi, gunakan GROUNDING_PACK sebagai sumber utama.
2) Fakta kendaraan/socket hanya boleh berasal dari vehicle_runtime / runtimeResult.
3) Fakta produk Nine hanya boleh berasal dari product_search, recommendation policy, lifecycle, atau tool.
4) Jangan menawarkan merek lain kecuali user secara eksplisit meminta produk di luar Nine.
5) Pertahankan konteks kendaraan dari percakapan sebelumnya. Jangan tanya ulang merek/tahun jika sudah ada di state/memory/context.
6) Jika user meminta rekomendasi, selesaikan tujuan sampai level produk:
   - posisi lampu
   - socket bawaan
   - socket ekuivalen jika ada
   - kandidat produk Nine
   - kalau tidak ada kandidat tervalidasi, tulis: [Saat ini produk Nine belum tersedia untuk kebutuhan/socket tersebut]
7) Jangan berhenti hanya pada daftar socket bila user meminta produk.
8) Lifecycle hidden/discontinued/upcoming harus dihormati. Jangan rekomendasikan yang tidak eligible.
9) Jangan mengarang socket/varian/fitment.
10) Jika data konflik atau kurang, katakan belum terverifikasi.
11) Jawab Bahasa Indonesia, ringkas, profesional, dan langsung menyelesaikan pertanyaan.
12) Jangan menyebut file, path, prompt, implementasi internal, atau nama NEXAI.
13) Core deterministic adalah otoritas. Jangan menimpa hasil deterministic yang sudah tervalidasi.`;

  const userText=`USER_MESSAGE:
${ctx.message||""}

CORE_ROUTE:
${ctx.route?.type||""}

CORE_STATE:
${JSON.stringify(ctx.state||{})}

MEMORY:
${JSON.stringify(ctx.memory||{}).slice(0,7000)}

GROUNDING_PACK:
${JSON.stringify(grounding).slice(0,22000)}

CORE_RUNTIME_RESULT:
${JSON.stringify(ctx.runtimeResult||null).slice(0,12000)}`;

  let input=[{role:"user",content:[{type:"input_text",text:userText}]}];
  let data=null;

  try{
    for(let round=0;round<3;round++){
      const r=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`
        },
        body:JSON.stringify({
          model:MODEL,
          instructions,
          input,
          tools:tools(),
          max_output_tokens:1700,
          max_tool_calls:6
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
        input.push({
          type:"function_call_output",
          call_id:c.call_id,
          output:JSON.stringify(result)
        });
      }
    }

    const reply=outputText(data);
    const ms=Date.now()-start;
    if(!reply)throw new Error("empty_agent_response");

    await updateMetrics({
      agent_used:1,
      agent_ms:ms,
      last_total_ms:ms,
      last_status:"COMPLETED",
      last_request_id:requestId,
      last_route:ctx.route?.type||"",
      last_tools:[...new Set(usedTools)]
    });

    return{
      used:true,
      reply,
      mode:cfg.mode,
      shadow:cfg.mode==="shadow",
      request_id:requestId,
      tools:[...new Set(usedTools)],
      duration_ms:ms
    };
  }catch(e){
    const ms=Date.now()-start;
    await updateMetrics({
      fallback:1,
      errors:1,
      last_total_ms:ms,
      last_status:"FALLBACK",
      last_request_id:requestId,
      last_route:ctx.route?.type||"",
      last_tools:[...new Set(usedTools)]
    });

    return{
      used:false,
      reason:"agent_error",
      error:e.message,
      mode:cfg.mode,
      request_id:requestId,
      duration_ms:ms,
      fallback:true
    };
  }
}
