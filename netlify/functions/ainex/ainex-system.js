
"use strict";
const fs=require("fs");
const path=require("path");
const {AsyncLocalStorage}=require("async_hooks");

const VERSION="3.0.0";
const als=new AsyncLocalStorage();
const DATA_ROOT=path.join(__dirname,"..","data");
const PROJECT=process.env.AINEX_FIREBASE_PROJECT||"apin-web";
const API_KEY=process.env.AINEX_FIREBASE_API_KEY||"AIzaSyBkyMCw47sYQb2BBkGMxgfsXppozWw4Cec";
const TRACE_ENABLED=process.env.AINEX_TRACE_ENABLED!=="0";
const LEARNING_ENABLED=process.env.AINEX_LEARNING_ENABLED!=="0";

function readJSON(name,fallback){
  try{return JSON.parse(fs.readFileSync(path.join(DATA_ROOT,name),"utf8"));}
  catch{return fallback;}
}
const aliasDB=readJSON("ainex_aliases_v1.json",{vehicle_aliases:{},product_aliases:{},intent_aliases:{}});
const contractDB=readJSON("ainex_answer_contracts_v1.json",{contracts:{}});
const regressionDB=readJSON("ainex_regression_suite_v1.json",{cases:[]});

const norm=v=>String(v||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
const compact=v=>norm(v).replace(/[^a-z0-9]/g,"");
const esc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");

function applyMap(text,map){
  let out=String(text||"");
  const rows=Object.entries(map||{}).sort((a,b)=>b[0].length-a[0].length);
  for(const [from,to] of rows){
    const rx=new RegExp(`(^|\\b)${esc(from)}(?=\\b|$)`,"ig");
    out=out.replace(rx,(m,p1)=>`${p1}${to}`);
  }
  return out;
}
function normalizeAliases(text){
  let out=String(text||"");
  out=applyMap(out,aliasDB.vehicle_aliases);
  out=applyMap(out,aliasDB.product_aliases);
  out=applyMap(out,aliasDB.intent_aliases);
  return out;
}

function requestId(){
  return "NX-"+Date.now().toString(36).toUpperCase()+"-"+Math.random().toString(36).slice(2,7).toUpperCase();
}
function runRequest(seed,fn){
  const store={
    request_id:requestId(),
    started_at:Date.now(),
    started_iso:new Date().toISOString(),
    method:seed?.method||"",
    path:seed?.path||"",
    message:"",
    route:"",
    intent:"",
    mode:"",
    vehicle:null,
    products:[],
    confidence:null,
    state_machine:null
  };
  return als.run(store,fn);
}
function getStore(){return als.getStore()||null;}
function updateRequestMeta(delta){
  const s=getStore(); if(!s||!delta)return;
  Object.assign(s,delta);
}

function confidenceFor({message,ctx,state}){
  const current=norm(message);
  const v=ctx?.vehicle||null;
  const ps=Array.isArray(ctx?.products)?ctx.products:[];
  let vehicle=0,product=0,intent=0.85;

  if(v?.model){
    const m=norm(v.model);
    vehicle=current.includes(m)?0.99:(ctx?.followup?0.86:0.78);
  }
  if(ps.length){
    const exact=ps.some(p=>{
      const sku=norm(p?.sku||p?.kode||"");
      const name=norm(p?.nama||p?.name||"");
      return (sku&&current.includes(sku))||(name&&current.includes(name));
    });
    product=exact?0.99:(ctx?.followup?0.84:0.76);
  }
  if(ctx?.intent==="general")intent=0.68;
  if(ctx?.intent==="comparison"&&ps.length>=2)intent=0.99;

  const relevant=[intent];
  if(v?.model)relevant.push(vehicle);
  if(ps.length)relevant.push(product);
  const overall=relevant.reduce((a,b)=>a+b,0)/relevant.length;
  return{
    overall:Number(overall.toFixed(3)),
    intent:Number(intent.toFixed(3)),
    vehicle:Number(vehicle.toFixed(3)),
    product:Number(product.toFixed(3))
  };
}

function positionFromMessage(message){
  const q=norm(message);
  if(/\b(headlamp|lampu depan|lampu utama)\b/.test(q))return"headlamp";
  if(/\b(foglamp|lampu kabut)\b/.test(q))return"foglamp";
  if(/\b(lampu mundur|reverse)\b/.test(q))return"reverse";
  if(/\b(senja|parking)\b/.test(q))return"parking";
  if(/\b(sein depan)\b/.test(q))return"turn_front";
  if(/\b(sein belakang)\b/.test(q))return"turn_rear";
  if(/\b(rem|brake)\b/.test(q))return"brake";
  return null;
}

function buildStateMachine({message,ctx,state,memory}){
  const confidence=confidenceFor({message,ctx,state});
  const previousIntent=Array.isArray(memory)&&memory.length
    ? norm([...memory].reverse().find(x=>x?.role==="user")?.content||"")
    : "";
  const activeProducts=(ctx?.products||[]).map(p=>({
    sku:p?.sku||p?.kode||"",
    name:p?.nama||p?.name||""
  }));
  const focus=ctx?.vehicle?.model?"vehicle":activeProducts.length?"product":ctx?.intent!=="general"?"task":"general";
  const machine={
    version:"3.0",
    focus_type:focus,
    active_vehicle:ctx?.vehicle||null,
    active_products:activeProducts,
    active_position:positionFromMessage(message),
    active_intent:ctx?.intent||"general",
    previous_user_text:previousIntent,
    turn_type:ctx?.followup?"followup":"new_turn",
    context_source:ctx?.followup?"latest_valid_context":"current_turn",
    confidence
  };
  updateRequestMeta({intent:machine.active_intent,vehicle:machine.active_vehicle,products:activeProducts,confidence,state_machine:machine});
  return machine;
}

function evidenceFromBody(body){
  const rows=[];
  const push=(type,detail,confidence=1)=>rows.push({type,detail,confidence});
  const addProduct=p=>{
    if(!p)return;
    const ss=p.source_status||{};
    if(ss.catalog_verified)push("catalog_verified",p.sku||p.name,1);
    if(ss.live_commercial)push("commercial_live",p.sku||p.name,0.98);
    if(ss.visual_verified)push("visual_verified",p.sku||p.name,1);
    if(!ss.catalog_verified&&!ss.live_commercial)push("product_identity",p.sku||p.name,0.85);
  };
  if(body?.product)addProduct(body.product);
  for(const p of body?.products||[])addProduct(p);
  if(String(body?.route||"").includes("vehicle"))push("vehicle_database",body.route,0.98);
  if(String(body?.route||"").includes("fitment")||String(body?.route||"").includes("recommend"))push("fitment_policy",body.route,0.95);
  if(body?.usedAI)push("generated_language","AI composition; factual claims still subject to source guards",0.7);
  return rows.slice(0,20);
}

function contractForRoute(route){
  const r=String(route||"");
  if(r==="compare"||r.includes("comparison"))return contractDB.contracts?.comparison||{};
  if(r.includes("fitment"))return contractDB.contracts?.fitment||{};
  if(r.includes("recommend")||r.includes("agent:"))return contractDB.contracts?.recommendation||{};
  for(const k of["landing_page","storyboard","video_prompt","image_prompt","copywriting","caption"]){
    if(r.includes(k))return contractDB.contracts?.[k]||{};
  }
  return{};
}

function sanitizeReply(reply){
  let s=String(reply||"");
  s=s.replace(/\bNEXAI\b/g,"AINEX");
  s=s.replace(/\bmotorcycle_h4_group\b/gi,"kelompok aplikasi H4 motor");
  s=s.replace(/\bmotorcycle_h6_group\b/gi,"kelompok aplikasi H6 motor");
  s=s.replace(/\n{3,}/g,"\n\n").trim();
  return s;
}

function applyAnswerContract(body){
  if(!body||typeof body!=="object"||Array.isArray(body))return body;
  const out={...body};
  if(typeof out.reply==="string")out.reply=sanitizeReply(out.reply);

  const contract=contractForRoute(out.route);
  if((out.route==="compare"||String(out.route||"").includes("comparison"))&&Array.isArray(out.products)&&out.products.length<2){
    out.reply="Untuk perbandingan yang akurat, sebutkan minimal dua produk Nine yang ingin dibandingkan.";
    out.route="guard:comparison";
    out.usedAI=false;
  }
  const s=getStore();
  out._ainex={
    version:VERSION,
    request_id:s?.request_id||null,
    contract:contract&&Object.keys(contract).length?contract:null,
    confidence:s?.confidence||null,
    evidence:evidenceFromBody(out)
  };
  return out;
}

function firestoreBase(collection,doc){
  if(!PROJECT||!API_KEY)return null;
  return `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collection}/${doc}?key=${encodeURIComponent(API_KEY)}`;
}
function fv(v){
  if(v===null||v===undefined)return{nullValue:null};
  if(typeof v==="boolean")return{booleanValue:v};
  if(typeof v==="number")return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(Array.isArray(v))return{arrayValue:{values:v.slice(0,30).map(fv)}};
  if(typeof v==="object"){
    const fields={}; for(const[k,x]of Object.entries(v))fields[k]=fv(x);
    return{mapValue:{fields}};
  }
  return{stringValue:String(v).slice(0,4000)};
}
async function patchDoc(collection,doc,obj){
  const url=firestoreBase(collection,doc); if(!url)return false;
  try{
    const fields={};for(const[k,v]of Object.entries(obj))fields[k]=fv(v);
    const r=await fetch(url,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({fields})});
    return r.ok;
  }catch{return false;}
}

function shouldQueueLearning(body,s){
  if(!LEARNING_ENABLED)return false;
  const route=String(body?.route||"");
  if(body?.error)return true;
  if(route.startsWith("guard:")||route.includes("not_identified")||route.includes("clarification")||route.includes("blocked"))return true;
  if((s?.confidence?.overall||1)<0.62)return true;
  return false;
}

async function persistTrace(body,statusCode){
  const s=getStore(); if(!s)return;
  const duration=Date.now()-s.started_at;
  const trace={
    request_id:s.request_id,
    status_code:statusCode,
    route:body?.route||"",
    intent:s.intent||"",
    mode:s.mode||"",
    duration_ms:duration,
    confidence:s.confidence||null,
    vehicle:s.vehicle||null,
    products:s.products||[],
    evidence:evidenceFromBody(body),
    updated_at:new Date().toISOString()
  };
  if(TRACE_ENABLED)await patchDoc("ainex_traces",s.request_id,trace);

  const metrics={
    last_request_id:s.request_id,
    last_route:trace.route,
    last_intent:trace.intent,
    last_duration_ms:duration,
    last_confidence:s.confidence?.overall||null,
    last_vehicle:s.vehicle||null,
    last_products:s.products||[],
    updated_at:trace.updated_at
  };
  if(TRACE_ENABLED)await patchDoc("ainex_system","quality_metrics",metrics);

  if(shouldQueueLearning(body,s)){
    const learning={
      request_id:s.request_id,
      status:"pending_review",
      reason:body?.error?"error":String(body?.route||"").startsWith("guard:")?"guard":"low_confidence_or_unresolved",
      message:String(s.message||"").slice(0,1200),
      route:trace.route,
      intent:trace.intent,
      confidence:s.confidence||null,
      vehicle:s.vehicle||null,
      products:s.products||[],
      created_at:trace.updated_at,
      auto_apply:false
    };
    await patchDoc("ainex_learning_queue",s.request_id,learning);
  }
}

function recordResponse(body,statusCode){
  const s=getStore(); if(s){s.route=body?.route||s.route||"";}
  Promise.resolve().then(()=>persistTrace(body,statusCode)).catch(()=>{});
}

function runSelfTests({products,resolveComparison,detectIntent,isFollowup,resolveVehicle}){
  const results=[];
  for(const tc of regressionDB.cases||[]){
    let pass=false,actual=null;
    try{
      if(tc.type==="comparison"){
        const got=(resolveComparison(tc.input)||[]).map(p=>String(p?.sku||p?.kode||"").toUpperCase());
        actual=got;
        pass=(tc.expected_products||[]).every(x=>got.includes(String(x).toUpperCase()));
      }else if(tc.type==="intent"){
        actual=detectIntent(tc.input);
        pass=actual===tc.expected;
      }else if(tc.type==="followup"){
        actual=!!isFollowup(tc.input);
        pass=actual===!!tc.expected;
      }else if(tc.type==="alias"){
        actual=normalizeAliases(tc.input);
        pass=norm(actual).includes(norm(tc.contains));
      }else if(tc.type==="vehicle"){
        actual=resolveVehicle(tc.input);
        pass=norm(actual?.model)===norm(tc.expected);
      }
    }catch(e){actual=`ERROR:${e.message}`;pass=false;}
    results.push({id:tc.id,type:tc.type,pass,actual});
  }
  const passed=results.filter(x=>x.pass).length;
  return{
    version:VERSION,
    passed,
    failed:results.length-passed,
    total:results.length,
    ok:passed===results.length,
    results
  };
}

module.exports={
  VERSION,
  normalizeAliases,
  runRequest,
  getStore,
  updateRequestMeta,
  buildStateMachine,
  applyAnswerContract,
  recordResponse,
  runSelfTests,
  evidenceFromBody
};
