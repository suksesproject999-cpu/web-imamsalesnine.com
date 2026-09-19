
exports.config={api:{bodyParser:false}};
const fs=require("fs");
const {Readable}=require("stream");
const {formidable}=require("formidable");
const K=require("./nexai/knowledge");
const Router=require("./nexai/router");
const AI=require("./nexai/ai");

function val(fields,k,d=""){const v=fields?.[k];return Array.isArray(v)?(v[0]??d):(v??d);}
function parseJSON(v,d){try{return JSON.parse(v||"");}catch{return d;}}
async function parse(event){
  if(!event.body) throw new Error("Empty body");
  const b=Buffer.from(event.body,event.isBase64Encoded?"base64":"utf8");
  const req=new Readable();req.push(b);req.push(null);
  req.headers={...(event.headers||{}),"content-length":b.length};
  req.method=event.httpMethod;req.url="/";
  const form=formidable({multiples:false});
  return await new Promise((resolve,reject)=>form.parse(req,(e,fields,files)=>e?reject(e):resolve({fields:fields||{},files:files||{}})));
}
function imageData(files){
  const x=files?.image;if(!x)return null;
  const f=Array.isArray(x)?x[0]:x;if(!f?.filepath)return null;
  return `data:${f.mimetype||"image/jpeg"};base64,${fs.readFileSync(f.filepath).toString("base64")}`;
}
function stateFrom(memory,productMemory,message){
  const st={activeProduct:null,vehicle:{},recentUserText:[]};
  const pm=Array.isArray(productMemory)?productMemory:[];
  if(pm.length){
    const p=pm[pm.length-1];
    st.activeProduct={name:p.nama||p.name||"",sku:p.sku||"",product_id:p.product_id||""};
  }
  for(const x of (Array.isArray(memory)?memory:[]).slice(-10)){
    if(x?.role==="user"&&typeof x.content==="string"){
      st.recentUserText.push(x.content);
      const y=x.content.match(/\b(19|20)\d{2}\b/)?.[0];if(y)st.vehicle.year=y;
      const m=x.content.match(/\b(honda|toyota|daihatsu|suzuki|mitsubishi|yamaha|kawasaki|nissan|wuling|hyundai|kia|mazda|isuzu)\b\s+([a-z0-9-]+)/i);
      if(m){st.vehicle.brand=m[1];st.vehicle.model=m[2];}
    }
  }

  // Any explicit product in CURRENT message overwrites previous product.
  const explicit=K.resolveMention(message);
  if(explicit){
    const p=K.byIdentity(explicit.product_id);
    if(p) st.activeProduct={name:p.name,sku:p.sku,product_id:p.product_id};
  }
  return st;
}
function publicState(st,p){
  const x=p||(st.activeProduct?K.byIdentity(st.activeProduct.product_id||st.activeProduct.sku||st.activeProduct.name):null);
  return {
    activeProduct:x?{
      product_id:x.product_id,name:x.name,nama:x.name,sku:x.sku,
      gambar:x.visual?.main||"",visual:x.visual||{}
    }:st.activeProduct,
    vehicle:st.vehicle
  };
}
function productResponse(p){
  return K.productPayload(p);
}
function specsText(p){
  const entries=Object.entries(p.specs||{}).filter(([k])=>k!=="_catalog_page");
  if(!entries.length)return `${p.name}\nSpesifikasi teknis belum tersedia pada katalog resmi.`;
  return [p.name,"Spesifikasi resmi:",...entries.map(([k,v])=>`- ${k}: ${Array.isArray(v)?v.join(", "):v}`)].join("\n");
}
function direct(route){
  const p=route.product;if(!p)return null;

  if(route.type==="product_price"){
    return `${p.name}\n${p.regular_price&&p.price&&p.regular_price!==p.price?`Harga normal: ${p.regular_price}\nHarga promo: ${p.price}`:`Harga: ${p.price||"Belum tersedia"}`}${p.stock!==""?`\nStok: ${p.stock}`:""}`;
  }
  if(route.type==="product_stock") return `${p.name}\nStok: ${p.stock!==""?p.stock:"Belum tersedia"}`;
  if(route.type==="product_variant") return `${p.name}\nVarian:\n${p.variants?.length?p.variants.map(x=>"- "+x).join("\n"):"Belum tersedia"}`;
  if(route.type==="product_spec") return specsText(p);
  if(route.type==="product_photo") return `${p.name}\nGambar: ${p.visual?.main||"Foto resmi belum tersedia"}`;
  if(route.type==="product_photo_spec") return `${p.name}\nGambar: ${p.visual?.main||"Foto resmi belum tersedia"}\n\n${specsText(p)}`;
  if(route.type==="catalog_page") return `${p.name}\n${p.visual?.full_page?`Halaman katalog: ${p.visual.full_page}`:"Halaman katalog resmi belum tersedia."}`;
  if(route.type==="product_detail"){
    return [p.name,p.brand&&`Brand: ${p.brand}`,p.category&&`Kategori: ${p.category}`,
      p.sku&&`SKU: ${p.sku}`,p.price&&`Harga: ${p.price}`,p.stock!==""&&`Stok: ${p.stock}`,
      p.description&&`Deskripsi: ${p.description}`].filter(Boolean).join("\n");
  }
  return null;
}
function isTime(q){return /\b(jam berapa|sekarang jam|pukul berapa|waktu sekarang)\b/i.test(q);}
function timeText(iso,tz){
  try{
    const d=iso?new Date(iso):new Date();
    const t=new Intl.DateTimeFormat("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false,timeZone:tz||undefined}).format(d);
    const dt=new Intl.DateTimeFormat("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:tz||undefined}).format(d);
    return `Sekarang pukul ${t}${tz?` (${tz})`:""}, ${dt}.`;
  }catch{return null;}
}
function jsonResp(code,body){
  return {statusCode:code,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(body)};
}

exports.handler=async(event)=>{
  try{
    const {fields,files}=await parse(event);
    const raw=String(val(fields,"message","")).trim();
    const memory=parseJSON(val(fields,"memory","[]"),[]);
    const productMemory=parseJSON(val(fields,"productMemory","[]"),[]);
    const admin=/^\/imam\b/i.test(raw)||String(val(fields,"imamMode","0"))==="1";
    const message=admin?raw.replace(/^\/imam\b/i,"").trim():raw;
    const img=imageData(files);
    if(!message&&!img)return jsonResp(400,{reply:"Pesan kosong.",image:null});

    if(isTime(message)){
      const t=timeText(val(fields,"clientTime",""),val(fields,"clientTimezone",""));
      if(t)return jsonResp(200,{reply:t,image:null,route:"local_time",usedAI:false});
    }

    const state=stateFrom(memory,productMemory,message);
    const route=Router.classify(message,state);
    const fast=direct(route);

    if(fast){
      return jsonResp(200,{
        reply:fast,image:null,route:route.type,source:Router.sourceFor(route),
        usedAI:false,product:productResponse(route.product),
        state:publicState(state,route.product)
      });
    }

    const ai=await AI.respond({message,route,state,memory,image:img,admin});
    return jsonResp(200,{
      reply:ai.reply,image:null,route:route.type,source:Router.sourceFor(route),
      usedAI:true,usedWeb:ai.usedWeb,sources:ai.sources,
      product:route.product?productResponse(route.product):null,
      state:publicState(state,route.product)
    });
  }catch(e){
    console.error("NEXAI V8 ERROR:",e);
    return jsonResp(500,{reply:"Maaf, sistem sedang mengalami gangguan. Silakan coba lagi.",image:null,error:e.message});
  }
};
