
exports.config={api:{bodyParser:false}};
const fs=require("fs");
const path=require("path");
const {pathToFileURL}=require("url");
const {Readable}=require("stream");
const {formidable}=require("formidable");

const PRODUCT_REMOTE_URL=process.env.NEXAI_PRODUCT_JSON_URL||"https://imamsalesnine.com/produk.json";
const MODEL_FAST=process.env.NEXAI_MODEL_FAST||process.env.NEXAI_MODEL||"gpt-4.1-mini";
const MODEL_SMART=process.env.NEXAI_MODEL_SMART||process.env.NEXAI_MODEL||"gpt-4.1-mini";
const PUBLIC_IMAGE_ENABLED=process.env.NEXAI_PUBLIC_IMAGE==="1";
const IMAGE_MODEL=process.env.NEXAI_IMAGE_MODEL||"gpt-image-1";

function readJSON(file,fallback){try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch{return fallback;}}
const knowledgeDB=readJSON(path.join(__dirname,"data","product_knowledge_center.json"),{products:[]});
const businessDB=readJSON(path.join(__dirname,"data","business_knowledge.json"),{});
const brandDB=readJSON(path.join(__dirname,"data","brand_knowledge.json"),{});
const vehicleClassDB=readJSON(path.join(__dirname,"data","product_vehicle_classification_v1.json"),{groups:{}});
const productLifecycleDB=readJSON(path.join(__dirname,"data","product_lifecycle_v1.json"),{policy:{default_status:"active",status_rules:{}},products:{}});

const RUNTIME_ENGINE_FILE=path.join(__dirname,"data","nexai_runtime_engine_v1_1.mjs");
const RUNTIME_DATA_ROOT=path.join(__dirname,"data");
let nexaiRuntimePromise=null;

async function getNexaiRuntime(){
  if(nexaiRuntimePromise)return nexaiRuntimePromise;
  nexaiRuntimePromise=(async()=>{
    try{
      if(!fs.existsSync(RUNTIME_ENGINE_FILE))return null;
      const mod=await import(pathToFileURL(RUNTIME_ENGINE_FILE).href);
      if(!mod?.NexaiRuntimeEngine)return null;
      return new mod.NexaiRuntimeEngine(RUNTIME_DATA_ROOT);
    }catch(e){
      console.warn("NEXAI runtime warning:",e.message);
      return null;
    }
  })();
  return nexaiRuntimePromise;
}

let productCache=null,productCacheAt=0;
const PRODUCT_TTL=60000;

async function loadProducts(){
  const now=Date.now();
  if(Array.isArray(productCache)&&productCache.length&&now-productCacheAt<PRODUCT_TTL)return productCache;

  try{
    const r=await fetch(PRODUCT_REMOTE_URL,{headers:{"Accept":"application/json"}});
    if(r.ok){
      const data=await r.json();
      if(Array.isArray(data)&&data.length){
        productCache=data;productCacheAt=now;return data;
      }
    }
  }catch(e){console.warn("Product remote warning:",e.message);}

  for(const file of[
    path.join(process.cwd(),"produk.json"),
    path.join(process.cwd(),"public","produk.json"),
    path.join(__dirname,"..","..","produk.json")
  ]){
    const data=readJSON(file,null);
    if(Array.isArray(data)&&data.length){productCache=data;productCacheAt=now;return data;}
  }
  throw new Error("Data produk resmi tidak berhasil dimuat.");
}

function normalize(v){return String(v||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9\s.+/-]/g," ").replace(/\s+/g," ").trim();}
function compact(v){return normalize(v).replace(/[^a-z0-9]/g,"");}
function arr(v){if(Array.isArray(v))return v;if(v===undefined||v===null||v==="")return[];if(typeof v==="string")return v.split(/\s*\|\s*|\s*,\s*/).map(x=>x.trim()).filter(Boolean);return[String(v)];}
function money(v){
  if(v===null||v===undefined||v==="")return"";
  if(typeof v==="number")return"Rp"+Math.round(v).toLocaleString("id-ID");
  if(typeof v==="object"){
    for(const k of["promo","harga_promo","sale","current","final","price","harga","normal","regular"])if(v[k]!==undefined)return money(v[k]);
    const x=Object.values(v).find(x=>typeof x==="string"||typeof x==="number");return x!==undefined?money(x):"";
  }
  const s=String(v).trim();if(/^rp/i.test(s))return s;const n=s.replace(/[^\d]/g,"");return n?"Rp"+Number(n).toLocaleString("id-ID"):s;
}
function stockText(v){
  if(v===null||v===undefined||v==="")return"";
  if(typeof v==="object"){
    const status=v.status??v.availability??v.stok??v.stock??"",qty=v.qty??v.quantity??null;
    if(status&&qty!==null&&qty!==undefined&&qty!=="")return`${status} (${qty})`;
    if(status)return String(status);
    const x=Object.values(v).find(x=>typeof x==="string"||typeof x==="number");return x!==undefined?String(x):"";
  }
  return String(v);
}

function pName(p){return p?.nama||p?.name||"Produk Nine";}
function pSku(p){return p?.sku||p?.kode||"";}
function pBrand(p){return p?.brand||p?.subbrand||"";}
function pCategory(p){return p?.kategori||p?.category||"";}
function pDescription(p){return p?.deskripsi||p?.description||"";}
function pVariants(p){return arr(p?.varian||p?.variants);}
function pPrice(p){return money(p?.harga_promo??p?.promo_price??p?.harga??p?.price??"");}
function pRegularPrice(p){return money(p?.harga_normal??p?.regular_price??p?.harga?.normal??"");}
function pStock(p){return stockText(p?.stok??p?.stock??p?.availability??"");}
function pImage(p){return p?.visual?.foto_utama||p?.visual?.main||p?.gambar||p?.image||p?.foto||p?.foto_utama||"";}
function pFullPage(p){return p?.visual?.full_page||p?.full_page||"";}
function pCatalogPage(p){return p?.visual?.catalog_page||p?.catalog_page||"";}
function pWhatsapp(p){return p?.whatsapp||"";}

function aliases(p){
  const values=[pSku(p),pName(p),...arr(p?.alias),...arr(p?.aliases)].filter(Boolean);
  for(const val of[...values])for(const t of normalize(val).split(/\s+/))if(/[a-z]/i.test(t)&&/\d/.test(t))values.push(t);
  return[...new Set(values.flatMap(v=>[normalize(v),compact(v)]).filter(Boolean))];
}
function mentionScore(p,message){
  const q=normalize(message),tokens=new Set(q.split(/\s+/).map(compact).filter(Boolean));let score=0;
  for(const alias of aliases(p)){
    if(q===alias)score=Math.max(score,100000+alias.length);
    const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    if(new RegExp(`(^|\\s)${escaped}(?=\\s|$|[,.!?/+-])`,"i").test(q))score=Math.max(score,60000+alias.length);
    const ac=compact(alias);if(ac&&tokens.has(ac))score=Math.max(score,50000+ac.length);
  }
  return score;
}
function resolveProducts(products,message,limit=4){
  const q=normalize(message);
  const requestedFamily=/\bh4\b/.test(q)?"h4":/\bh6\b/.test(q)?"h6":null;
  let ranked=products.map(product=>({product,score:mentionScore(product,message)})).filter(x=>x.score>0);
  if(requestedFamily){
    const strict=ranked.filter(x=>{
      const h=normalize(`${pSku(x.product)} ${pName(x.product)}`);
      return new RegExp(`(^|\\s)${requestedFamily}(?=\\s|$|[-_/])`,"i").test(h);
    });
    if(strict.length)ranked=strict;
  }
  ranked.sort((a,b)=>b.score-a.score);
  const out=[],seen=new Set();
  for(const x of ranked){
    const key=compact(pSku(x.product)||pName(x.product));if(!key||seen.has(key))continue;
    seen.add(key);out.push(x.product);if(out.length>=limit)break;
  }
  return out;
}

function knowledgeFor(p){
  if(!p)return null;
  const page=String(pCatalogPage(p)||""),sku=compact(pSku(p)),name=compact(pName(p));

  if(sku){
    const hit=(knowledgeDB.products||[]).find(x=>compact(x?.identity?.sku)===sku);
    if(hit)return hit;
  }

  if(page){
    const hit=(knowledgeDB.products||[]).find(x=>String(x?.catalog?.page||"")===page);
    if(hit)return hit;
  }

  if(name){
    const hit=(knowledgeDB.products||[]).find(x=>compact(x?.identity?.name)===name);
    if(hit)return hit;
  }

  return null;
}

function productPayload(p){
  const k=knowledgeFor(p);

  const catalogDescription=k?.catalog?.description||"";
  const catalogFeatures=Array.isArray(k?.catalog?.features)?k.catalog.features:[];
  const catalogSpecs=k?.catalog?.specifications||{};

  return{
    product_id:k?.product_id||null,
    name:k?.identity?.name||pName(p),
    sku:pSku(p)||k?.identity?.sku||"",
    brand:pBrand(p)||k?.brand?.subbrand||k?.brand?.master||"",
    master_brand:"Nine Autoseries",
    subbrand:pBrand(p)||k?.brand?.subbrand||"",
    category:pCategory(p)||k?.classification?.category||"",
    description:catalogDescription||pDescription(p)||"",
    features:catalogFeatures.length?catalogFeatures:arr(p?.keunggulan||p?.features),
    specifications:Object.keys(catalogSpecs).length?catalogSpecs:(p?.spesifikasi&&typeof p.spesifikasi==="object"?p.spesifikasi:{}),
    function:k?.classification?.function||catalogSpecs["Fungsi"]||"",
    application:k?.classification?.application||catalogSpecs["Cocok untuk"]||"",
    socket:k?.compatibility?.socket||catalogSpecs["Soket"]||catalogSpecs["Tipe Soket"]||"",
    variants:[...new Set([...(k?.variants||[]),...pVariants(p)])],
    price:pPrice(p),
    regular_price:pRegularPrice(p),
    stock:pStock(p),
    whatsapp:pWhatsapp(p),
    catalog_page:k?.catalog?.page||pCatalogPage(p)||null,
    raw_catalog_text:k?.catalog?.raw_text||"",
    visual:{
      main:k?.visual?.main||pImage(p),
      additional:k?.visual?.additional||[],
      full_page:k?.visual?.full_page||pFullPage(p)
    },
    source_status:{
      catalog_verified:k?.catalog?.verified===true,
      live_commercial:p?.__nexai_identity_source!=="knowledge_center",
      visual_verified:!!(k?.visual?.main||k?.visual?.full_page)
    }
  };
}


function unifiedProducts(liveProducts){
  const live = Array.isArray(liveProducts) ? liveProducts : [];
  const out = [];
  const seen = new Set();

  function liveForKnowledge(k){
    const sku = compact(k?.identity?.sku || "");
    const name = compact(k?.identity?.name || "");

    return live.find(p=>{
      const ps = compact(pSku(p));
      const pn = compact(pName(p));

      return (
        (sku && ps && sku === ps) ||
        (name && pn && name === pn)
      );
    }) || null;
  }

  // Product Knowledge Center is the permanent identity backbone.
  for(const k of knowledgeDB.products || []){
    const sku = k?.identity?.sku || "";
    const name = k?.identity?.name || "";
    const key = compact(sku || name);

    if(!key || seen.has(key)) continue;

    const lp = liveForKnowledge(k);

    if(lp){
      out.push(lp);
    }else{
      // Synthetic runtime product keeps identity/catalog/visual searchable
      // even when commercial live JSON does not contain the product.
      out.push({
        sku,
        nama: name,
        alias: k?.identity?.aliases || [],
        varian: k?.variants || [],
        catalog_page: k?.catalog?.page || null,
        visual: {
          foto_utama: k?.visual?.main || "",
          full_page: k?.visual?.full_page || "",
          catalog_page: k?.visual?.catalog_page || k?.catalog?.page || null
        },
        __nexai_identity_source: "knowledge_center"
      });
    }

    seen.add(key);
  }

  // Keep every live product too, including future products not yet added to PKC.
  for(const p of live){
    const key = compact(pSku(p) || pName(p));
    if(!key || seen.has(key)) continue;

    out.push({
      ...p,
      __nexai_identity_source: "live_product_data"
    });

    seen.add(key);
  }

  return out;
}

function identityCoverageStats(liveProducts, unified){
  const knowledgeCount = (knowledgeDB.products || []).length;
  const liveCount = Array.isArray(liveProducts) ? liveProducts.length : 0;

  const liveKeys = new Set(
    (liveProducts || [])
      .map(p=>compact(pSku(p) || pName(p)))
      .filter(Boolean)
  );

  const knowledgeKeys = new Set(
    (knowledgeDB.products || [])
      .map(k=>compact(k?.identity?.sku || k?.identity?.name || ""))
      .filter(Boolean)
  );

  let liveOnly = 0;

  for(const key of liveKeys){
    if(!knowledgeKeys.has(key)) liveOnly++;
  }

  return {
    knowledge_center: knowledgeCount,
    live_products: liveCount,
    live_only_new_products: liveOnly,
    unified_identities: Array.isArray(unified) ? unified.length : 0
  };
}


const STOP=new Set(["apa","yang","dan","atau","dengan","untuk","dari","di","ke","ini","itu","nya","bro","bang","gan","mas","pak","minta","tolong","coba","produk","lampu","nine","autoseries","berapa","harga","stok","ready","tersedia","foto","gambar","lihat","spek","spec","spesifikasi","fitur","varian","warna","tipe","type","seri","model","kode","sku"]);
function fuzzySearch(products,q,limit=8){
  const tokens=[...new Set(normalize(q).split(/\s+/).filter(x=>x.length>1&&!STOP.has(x)))];
  return products.map(p=>{
    const x=productPayload(p),hay=normalize([pName(p),pSku(p),pBrand(p),pCategory(p),x.description,...(x.features||[]),JSON.stringify(x.specifications||{}),...pVariants(p)].join(" "));
    let score=0;for(const t of tokens){if(compact(pSku(p))===compact(t))score+=2000;if(hay.includes(t))score+=50;}return{p,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>x.p);
}

function isBusiness(message){return/\b(imam siapa|siapa imam|imam sales nine|imamsalesnine|kontak imam|nomor imam|whatsapp imam|website imam|siapa pemilik|siapa owner)\b/.test(normalize(message));}
function businessReply(message){
  const m=normalize(message);
  if(/\b(imam siapa|siapa imam|imam sales nine|imamsalesnine)\b/.test(m))return`Imam adalah ${businessDB.role}. ${businessDB.context} Website Imam Sales Nine dibuat untuk ${String(businessDB.website_purpose||"").toLowerCase()}`;
  if(/\b(kontak imam|nomor imam|whatsapp imam)\b/.test(m))return`WhatsApp Imam Sales Nine: ${businessDB.whatsapp}`;
  if(/\b(website imam|website)\b/.test(m))return`Website resmi Imam Sales Nine: ${businessDB.website}`;
  return null;
}
function isBrand(message){return/\b(nine autoseries|luximos|lx-trix|lxtrix|securicle|soundblax|optimus|cady|nine power|9power|subbrand|master brand)\b/.test(normalize(message));}
function brandReply(message,products){
  const m=normalize(message);
  if(/\b(master brand|nine autoseries itu apa|hirarki nine|hierarki nine|subbrand)\b/.test(m))return`Nine Autoseries adalah master brand. Subbrand yang dikenali dalam NEXAI: ${(brandDB.subbrands||[]).join(", ")}. Kategori dan fungsi setiap subbrand dijelaskan berdasarkan data produk dan katalog yang tersedia.`;
  for(const brand of brandDB.subbrands||[]){
    const list=[brand,...((brandDB.aliases||{})[brand]||[])];
    if(list.some(a=>m.includes(normalize(a)))){
      const matches=products.filter(p=>list.some(a=>normalize(pBrand(p)).includes(normalize(a))));
      const cats=[...new Set(matches.map(p=>pCategory(p)).filter(Boolean))];
      const funcs=[...new Set(matches.flatMap(p=>{const x=productPayload(p),s=x.specifications||{};return[s["Fungsi"],s["Cocok untuk"],x.category].filter(Boolean);} ))].slice(0,12);
      return[`${brand} adalah subbrand di bawah Nine Autoseries.`,cats.length?`Kategori yang terdeteksi: ${cats.join(", ")}.`:"",funcs.length?`Fungsi/konteks produk yang terdeteksi: ${funcs.join(", ")}.`:""].filter(Boolean).join(" ");
    }
  }
  return null;
}
function isTime(message){return/\b(jam berapa|sekarang jam|pukul berapa|waktu sekarang)\b/i.test(message);}
function isCurrent(message){return/\b(terbaru|latest|hari ini|sekarang|saat ini|update|berita|presiden|wakil presiden|menteri|gubernur|walikota|bupati|kurs|harga emas|cuaca|jadwal)\b/.test(normalize(message));}

function classify(message,hasProduct){
  const m=normalize(message),f={
    smalltalk:/^(bro|broo+|halo|hai|hi|hello|gas|gaskeun|sip|siap|oke|ok|makasih|terima kasih|thanks)[.!?\s]*$/.test(m),
    price:/\b(harga|price|harganya)\b/.test(m),stock:/\b(stok|stock|ready|tersedia|availability)\b/.test(m)||(hasProduct&&/\b(ada|ready)\b/.test(m)),
    photo:/\b(foto|gambar|lihat|tampilkan|tunjukkan)\b/.test(m),gallery:/\b(semua foto|galeri|foto tambahan|foto lainnya)\b/.test(m),catalog:/\b(halaman katalog|foto katalog|full page|katalog)\b/.test(m),
    spec:/\b(spek|spec|spesifikasi|watt|daya|volt|tegangan|lumen|material|kelvin|suhu|pendingin|chip|ampere|arus)\b/.test(m),
    variant:/\b(varian|warna|variant|color)\b/.test(m),features:/\b(fitur|keunggulan|kelebihan)\b/.test(m),
    description:/\b(deskripsi|jelaskan produk|produk ini apa|itu apa)\b/.test(m),full:/\b(detail lengkap|lengkap dong|semua informasi|full detail|semua detail)\b/.test(m),compare:/\b(vs|versus|beda|perbedaan|bandingkan|bandingin)\b/.test(m),
    fitment:/\b(cocok|fitment|socket|soket|wiring|plug.?and.?play|pakai apa|buat .*20\d{2})\b/.test(m),
    creative:/\b(buat|bikin|generate|render|ciptakan)\b.*\b(foto|gambar|image|poster|banner|visual|ilustrasi)\b/.test(m)
  };
  let type="general";
  if(isBusiness(message))type="business_profile";else if(isBrand(message)&&!hasProduct)type="brand_knowledge";else if(f.smalltalk)type="smalltalk";
  else if(isTime(message))type="local_time";else if(f.creative)type="creative_image";else if(f.fitment)type="fitment";else if(f.compare)type="compare";
  else if(f.catalog)type="catalog_page";else if(f.gallery)type="product_gallery";else if(f.photo&&f.spec)type="product_photo_spec";else if(f.photo)type="product_photo";else if(f.price)type="product_price";
  else if(f.stock)type="product_stock";else if(f.spec)type="product_spec";else if(f.features)type="product_features";else if(f.description)type="product_description";
  else if(f.variant)type="product_variant";else if(f.full&&hasProduct)type="product_full";else if(isCurrent(message))type="current_web";else if(hasProduct)type="product_detail";
  return{type,flags:f};
}
function referential(message){
  const m=normalize(message),w=m.split(/\s+/).filter(Boolean);if(w.length>7)return false;
  return/^(harganya|harga|fotonya|foto|gambarnya|gambar|speknya|spek|spec|spesifikasinya|spesifikasi|stoknya|stok|variannya|varian|fiturnya|fitur|deskripsinya|deskripsi|warnanya|warna|berapa watt|berapa volt|berapa lumen|yang ini|yang itu|yang tadi|ini|itu)$/.test(m)||/\b(nya|yang tadi|yang ini|yang itu)\b/.test(m);
}

function safeParse(v,f){try{return v?JSON.parse(v):f;}catch{return f;}}
function buildState(memory,productMemory){
  const s={activeProduct:null,vehicle:{},recentUserText:[]},pm=Array.isArray(productMemory)?productMemory:[];
  if(pm.length){const p=pm[pm.length-1];s.activeProduct={name:p?.nama||p?.name||"",sku:p?.sku||""};}
  for(const x of(Array.isArray(memory)?memory:[]).slice(-8)){
    if(x?.role==="user"&&typeof x.content==="string"){
      s.recentUserText.push(x.content);const y=x.content.match(/\b(19|20)\d{2}\b/)?.[0];if(y)s.vehicle.year=y;
      const v=x.content.match(/\b(honda|toyota|daihatsu|suzuki|mitsubishi|yamaha|kawasaki|nissan|wuling|hyundai|kia|mazda|isuzu)\b\s+([a-z0-9-]+)/i);if(v){s.vehicle.brand=v[1];s.vehicle.model=v[2];}
    }
  }return s;
}
function activeProduct(products,state){if(!state?.activeProduct)return null;const key=state.activeProduct.sku||state.activeProduct.name;return key?resolveProducts(products,key,1)[0]||null:null;}

function smalltalk(message){const m=normalize(message);if(/^broo*$/.test(m))return"Siap bro 👋 Mau tanya apa?";if(/^(halo|hai|hi|hello)$/.test(m))return"Halo bro 👋 Mau tanya produk Nine, otomotif, fitment, atau hal lain?";if(/^(gas|gaskeun)$/.test(m))return"Gas bro. Mau lanjut bahas apa?";if(/^(makasih|terima kasih|thanks)$/.test(m))return"Sama-sama bro 👌";return"Siap bro.";}
function specText(x){const e=Object.entries(x.specifications||{});return e.length?[x.name,"Spesifikasi resmi:",...e.map(([k,v])=>`- ${k}: ${Array.isArray(v)?v.join(", "):v}`)].join("\n"):`${x.name}\nSpesifikasi teknis belum tersedia pada katalog resmi.`;}
function direct(type,p){
  const x=productPayload(p);
  if(type==="product_price"){const r=[x.name];if(x.regular_price&&x.price&&x.regular_price!==x.price){r.push(`Harga normal: ${x.regular_price}`,`Harga promo: ${x.price}`);}else r.push(`Harga: ${x.price||"Belum tersedia"}`);if(x.stock!=="")r.push(`Stok: ${x.stock}`);return r.join("\n");}
  if(type==="product_stock")return`${x.name}\nStok: ${x.stock||"Belum tersedia"}`;
  if(type==="product_photo")return`${x.name}\nGambar: ${x.visual.main||"Foto resmi belum tersedia"}`;
  if(type==="product_gallery")return[x.name,"Galeri resmi:",x.visual.main?`- ${x.visual.main}`:"",...(x.visual.additional||[]).map(v=>`- ${v}`)].filter(Boolean).join("\n");
  if(type==="product_photo_spec")return`${x.name}\nGambar: ${x.visual.main||"Foto resmi belum tersedia"}\n\n${specText(x)}`;
  if(type==="product_spec")return specText(x);
  if(type==="product_features")return[x.name,"Fitur resmi:",...(x.features?.length?x.features.map(v=>`- ${v}`):["- Fitur belum tersedia pada katalog resmi."])].join("\n");
  if(type==="product_description")return`${x.name}\n${x.description||"Deskripsi resmi belum tersedia pada katalog."}`;
  if(type==="product_variant")return`${x.name}\nVarian:\n${x.variants?.length?x.variants.map(v=>`- ${v}`).join("\n"):"Belum tersedia"}`;
  if(type==="catalog_page")return`${x.name}\n${x.visual.full_page?`Halaman katalog: ${x.visual.full_page}`:`Halaman katalog: ${x.catalog_page||"Belum tersedia"}`}`;
  if(type==="product_detail"||type==="product_full"){const r=[x.name];if(x.description)r.push(`Deskripsi: ${x.description}`);if(x.master_brand)r.push(`Master brand: ${x.master_brand}`);if(x.subbrand)r.push(`Subbrand: ${x.subbrand}`);if(x.category)r.push(`Kategori: ${x.category}`);if(x.features?.length){r.push("Fitur:",...x.features.slice(0,type==="product_full"?24:10).map(v=>`- ${v}`));}const specs=Object.entries(x.specifications||{});if(specs.length)r.push("Spesifikasi:",...specs.slice(0,type==="product_full"?50:14).map(([k,v])=>`- ${k}: ${v}`));if(x.function)r.push(`Fungsi: ${x.function}`);if(x.application)r.push(`Aplikasi: ${x.application}`);if(x.socket)r.push(`Socket: ${x.socket}`);if(x.variants?.length)r.push(`Varian: ${x.variants.join(", ")}`);if(x.price)r.push(`Harga: ${x.price}`);if(x.stock!=="")r.push(`Stok: ${x.stock}`);return r.join("\n");}
  return null;
}
function compare(products){const ps=products.slice(0,4).map(productPayload),r=[`Perbandingan ${ps.map(x=>x.sku||x.name).join(" vs ")}:`];for(const p of ps){r.push("",`${p.name}${p.sku?` (${p.sku})`:""}`);if(p.description)r.push(`- Deskripsi: ${p.description}`);for(const[k,v]of Object.entries(p.specifications||{}).slice(0,10))r.push(`- ${k}: ${v}`);if(p.price)r.push(`- Harga: ${p.price}`);if(p.stock!=="")r.push(`- Stok: ${p.stock}`);}r.push("","Perbandingan di atas hanya menggunakan data resmi yang tersedia.");return r.join("\n");}
function localTime(iso,tz){try{const d=iso?new Date(iso):new Date();const t=new Intl.DateTimeFormat("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false,timeZone:tz||undefined}).format(d);const dt=new Intl.DateTimeFormat("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:tz||undefined}).format(d);return`Sekarang pukul ${t}${tz?` (${tz})`:""}, ${dt}.`;}catch{return null;}}


function runtimeProductFromId(products,productId){
  if(!productId)return null;
  const k=(knowledgeDB.products||[]).find(x=>x?.product_id===productId);
  if(!k)return null;
  const sku=compact(k?.identity?.sku||""),name=compact(k?.identity?.name||"");
  return products.find(p=>{
    const ps=compact(pSku(p)),pn=compact(pName(p));
    return (sku&&ps&&sku===ps)||(name&&pn&&name===pn);
  })||null;
}
function runtimeVehicleReply(v){
  if(!v)return null;
  const id=v.identity||{},yr=id.year||{},L=v.lighting||{};
  const title=[id.brand,id.model_source].filter(Boolean).join(" ");
  const range=yr.start&&yr.end?(yr.start===yr.end?String(yr.start):`${yr.start}-${yr.end}`):yr.raw||"";
  const rows=[];
  const add=(label,obj)=>{
    if(!obj)return;
    const vals=[
      ...(obj.low_beam||[]),
      ...(obj.high_beam||[]),
      ...(obj.combined||[]),
      ...(obj.options||[])
    ].filter(Boolean);
    const raw=obj.raw||"";
    const val=[...new Set(vals)].join(" / ")||raw;
    if(val)rows.push(`- ${label}: ${val}`);
  };
  add("Headlamp",L.headlamp);
  add("Foglamp",L.foglamp);
  add("Senja depan",L.parking_front);
  add("Lampu mundur",L.reverse);
  add("Sein depan",L.turn_signal_front);
  add("Sein belakang",L.turn_signal_rear);
  add("Lampu rem",L.brake);
  add("Plat belakang",L.license_plate_rear);
  return [`${title}${range?` (${range})`:""}`,...rows].join("\n");
}
function runtimeFitmentReply(runtimeResult,direction,runtime){
  const key=direction==="vehicle"?"fitment_vehicle_to_product":"fitment_product_to_vehicle";
  const gs=runtimeResult?.facts?.[key]||[]; if(!gs.length)return null;
  const cs=(gs[0]?.candidates||[]).filter(x=>x&&["high","medium"].includes(x.confidence));
  if(!cs.length)return null;
  const lines=cs.slice(0,12).map((x,i)=>{
    const left=direction==="vehicle"
      ?`${x.product_name||x.product_id}${x.position?` — ${humanPosition(x.position)}`:""}`
      :`${humanVehicle(runtime,x.vehicle_id)}${x.position?` — ${humanPosition(x.position)}`:""}`;
    return `${i+1}. ${left} (${x.confidence==="high"?"kandidat kuat":"perlu verifikasi"})`;
  });
  lines.push("Catatan: kandidat fitment belum otomatis berarti plug-and-play terverifikasi.");
  return lines.join("\n");
}



function lifecycleForProductId(productId){
  const policy=productLifecycleDB?.policy||{};
  const rules=policy.status_rules||{};
  const entry=productLifecycleDB?.products?.[productId]||{};
  const status=entry.status||policy.default_status||"active";
  const rule=rules[status]||rules.active||{
    search_enabled:true,
    direct_answer_enabled:true,
    recommendation_enabled:true
  };
  return{
    product_id:productId,
    status,
    search_enabled:entry.search_enabled ?? rule.search_enabled ?? true,
    direct_answer_enabled:entry.direct_answer_enabled ?? rule.direct_answer_enabled ?? true,
    recommendation_enabled:entry.recommendation_enabled ?? rule.recommendation_enabled ?? true,
    note:entry.note||""
  };
}
function lifecycleForProduct(product){
  if(!product)return lifecycleForProductId("");
  const payload=productPayload(product);
  return lifecycleForProductId(payload.product_id||"");
}
function lifecycleLabel(lf){
  if(!lf)return "";
  if(lf.status==="discontinued")return "Produk ini sudah discontinue dan tidak lagi masuk rekomendasi produk aktif.";
  if(lf.status==="upcoming")return "Produk ini berstatus upcoming / segera hadir dan belum masuk rekomendasi aktif.";
  if(lf.status==="hidden")return "Produk ini tidak tersedia untuk ditampilkan.";
  return "";
}
function withLifecycleNotice(text,product){
  const lf=lifecycleForProduct(product);
  const label=lifecycleLabel(lf);
  return label?`${label}\n\n${text}`:text;
}

function classificationRecords(){
  const out=[];
  for(const [groupName,group] of Object.entries(vehicleClassDB?.groups||{})){
    for(const r of group?.records||[]) out.push({...r,__group:groupName,__vehicleClass:group?.vehicle_class});
  }
  return out;
}
function classRuleFor({productId,product,message}){
  const rs=classificationRecords(), q=normalize(message||""), qc=compact(message||"");
  const family=/\bh4\b/.test(q)?"h4":/\bh6\b/.test(q)?"h6":null;
  const familyOK=r=>{
    if(!family)return true;
    const h=normalize(`${r?.clue_name||""} ${r?.canonical_name||""} ${r?.sku||""}`);
    return new RegExp(`(^|\\s)${family}(?=\\s|$)`).test(h);
  };
  // Explicit clue in the current user message outranks runtime product resolution.
  // This prevents "H4 MH2" from inheriting an H6 MH2 identity.
  let explicitBest=null,explicitScore=0;
  for(const r of rs){
    if(!familyOK(r))continue;
    const ac=compact(r.clue_name||"");
    if(!ac)continue;
    let sc=0;
    if(qc===ac)sc=200000+ac.length;
    else if(qc.includes(ac))sc=150000+ac.length;
    if(sc>explicitScore){explicitScore=sc;explicitBest=r;}
  }
  if(explicitBest)return explicitBest;

  if(productId){
    const x=rs.find(r=>r.product_id===productId&&familyOK(r)); if(x)return x;
  }
  const pn=compact(product?productPayload(product).name:""), ps=compact(product?productPayload(product).sku:"");
  if(ps){const x=rs.find(r=>familyOK(r)&&compact(r.sku||"")===ps);if(x)return x;}
  if(pn){const x=rs.find(r=>familyOK(r)&&compact(r.canonical_name||"")===pn);if(x)return x;}
  let best=null,score=0;
  for(const r of rs){
    if(!familyOK(r))continue;
    for(const a of [r.clue_name,r.canonical_name,r.sku].filter(Boolean)){
      const ac=compact(a); if(!ac)continue;
      let sc=0;
      if(qc===ac)sc=100000+ac.length;
      else if(qc.includes(ac))sc=50000+ac.length;
      if(sc>score){score=sc;best=r;}
    }
  }
  return best;
}
function asksCar(m){return /\b(mobil|car)\b/.test(normalize(m));}
function asksMotor(m){return /\b(motor|motorcycle|sepeda motor)\b/.test(normalize(m));}
function asksVehicleCompatibility(m){
  const q=normalize(m);
  return /\b(cocok|kompatibel|pakai|untuk|fitment)\b/.test(q)&&/\b(mobil|motor|kendaraan|car|motorcycle)\b/.test(q)
    || /\b(mobil|motor)\s+apa\b/.test(q)
    || /\bapa\s+yang\s+cocok\b/.test(q);
}

function isProductCompatibilityFollowup(m){
  const q=normalize(m);
  return /^(mobil|motor|kendaraan)\s+apa(\s+yang\s+cocok)?[?!.]*$/.test(q)
    || /^(cocok|kompatibel)\s+(untuk\s+)?(mobil|motor)\s+apa[?!.]*$/.test(q)
    || /^(buat|untuk)\s+(mobil|motor)\s+apa[?!.]*$/.test(q);
}

function classRuleFromActiveProduct(active){
  if(!active)return null;
  const rs=classificationRecords();
  const p=productPayload(active), sku=compact(p.sku||""), name=compact(p.name||"");
  return rs.find(r=>(sku&&compact(r.sku||"")===sku)||(name&&compact(r.canonical_name||"")===name))||null;
}
function vehicleExamples(rule){
  const x=rule?.known_vehicle_examples,out=[];
  const add=v=>{if(v&&!out.includes(v))out.push(v);};
  if(Array.isArray(x))x.forEach(add);
  else if(x&&typeof x==="object")Object.values(x).forEach(a=>(Array.isArray(a)?a:[]).forEach(add));
  return out;
}
function classReply(message,rule,product){
  if(!rule)return null;
  const name=rule.canonical_name||rule.clue_name||(product?productPayload(product).name:"Produk");
  const appNote=rule?.application_note?` (${rule.application_note})`:"";
  if(asksCar(message)&&rule.allow_car_recommendation===false)
    return `${name} diklasifikasikan untuk motor dan tidak direkomendasikan sebagai produk mobil. Kecocokan socket saja tidak cukup untuk mengubah klasifikasi aplikasi.`;
  if(asksMotor(message)&&rule.allow_motorcycle_recommendation===false)
    return `${name} diklasifikasikan khusus untuk mobil dan tidak direkomendasikan untuk motor.`;
  if(asksMotor(message)&&rule.allow_motorcycle_recommendation===true){
    const ex=vehicleExamples(rule);
    if(ex.length)return [`${name} masuk kelompok aplikasi motor${appNote}.`,`Contoh kendaraan yang tercatat:`,...ex.slice(0,30).map(v=>`- ${v}`),`Catatan: klasifikasi aplikasi bukan jaminan plug-and-play; tahun/generasi dan kondisi socket tetap perlu diverifikasi.`].join("\n");
  }
  return null;
}

function normalizedVehicleTokens(s){
  return normalize(s).split(/\s+/).filter(x=>x.length>1);
}
function motorcycleGroupCatalog(){
  const out=[];
  for(const [groupName,group] of Object.entries(vehicleClassDB?.groups||{})){
    if(group?.vehicle_class!=="motorcycle")continue;
    const examples=[];
    for(const r of group.records||[]){
      for(const ex of vehicleExamples(r))if(ex&&!examples.includes(ex))examples.push(ex);
    }
    out.push({groupName,group,examples});
  }
  return out;
}
function normalizedPhraseMatch(query,phrase){
  const q=` ${normalize(query)} `;
  const p=` ${normalize(phrase)} `;
  return p.trim().length>0&&q.includes(p);
}
function normalizedTokenSet(value){
  return new Set(normalize(value).split(/\s+/).filter(Boolean));
}
function detectMotorcycleGroups(message){
  const q=normalize(message);
  const year=(q.match(/\b(?:19|20)\d{2}\b/)||[])[0]||null;
  const groups=motorcycleGroupCatalog();
  const hits=[];

  for(const g of groups){
    let best=0, matched=[];
    for(const ex of g.examples){
      const ne=normalize(ex);
      if(!ne)continue;

      // If user supplies a year, prefer examples whose year/range can support it.
      const yr=ne.match(/\b((?:19|20)\d{2})(?:\s*-\s*((?:19|20)\d{2}))?\b/);
      if(year&&yr){
        const y=Number(year), a=Number(yr[1]), b=Number(yr[2]||yr[1]);
        if(!(a<=y&&y<=b))continue;
      }

      if(normalizedPhraseMatch(q,ne)){
        best=Math.max(best,5000+ne.length);matched.push(ex);continue;
      }

      // Brandless model matching for natural phrases such as "kalau motor vixion".
      const toks=normalizedVehicleTokens(ne).filter(t=>
        !["honda","yamaha","suzuki","kawasaki","vespa","benelli","fi","esp"].includes(t) &&
        !/^\d+$/.test(t)
      );
      const meaningful=toks.filter(t=>t.length>=3);
      const queryTokens=normalizedTokenSet(q);
      const matchedTokens=meaningful.filter(t=>queryTokens.has(t));
      if(matchedTokens.length){
        const sc=1000+matchedTokens.reduce((n,t)=>n+t.length,0);
        if(sc>best){best=sc;matched=[ex];}
      }
    }
    if(best>0)hits.push({groupName:g.groupName,group:g.group,score:best,matched});
  }

  hits.sort((a,b)=>b.score-a.score||a.groupName.localeCompare(b.groupName));

  // Keep only groups at the strongest semantic tier.
  if(!hits.length)return {groups:[],ambiguous:false};
  const top=hits[0].score;
  const selected=hits.filter(h=>h.score===top || (top<5000 && h.score>=1000));

  // Generic "Scoopy" legitimately spans two year-specific groups.
  // With no year/generation, do not guess one group.
  const uniq=[...new Set(selected.map(x=>x.groupName))];
  const ambiguous=!year&&uniq.length>1;

  return {groups:selected,ambiguous};
}
function motorcycleRecommendationReply(message,products){
  const detected=detectMotorcycleGroups(message);
  if(!detected.groups.length)return null;

  if(detected.ambiguous){
    const names=detected.groups.map(x=>x.matched?.[0]).filter(Boolean);
    return `Model motor terdeteksi memiliki lebih dari satu kelompok aplikasi. Sebutkan tahun/generasinya agar rekomendasi tidak salah.${names.length?` Contoh data yang tersedia: ${names.join(", ")}.`:""}`;
  }

  const allowedGroups=new Set(detected.groups.map(x=>x.groupName));
  const rules=classificationRecords().filter(r=>
    r.allow_motorcycle_recommendation===true &&
    allowedGroups.has(r.__group) &&
    lifecycleForProductId(r.product_id).recommendation_enabled===true
  );

  const out=[],seen=new Set();
  for(const r of rules){
    if(seen.has(r.product_id))continue;
    seen.add(r.product_id);out.push(r);
  }

  out.sort((a,b)=>String(a.canonical_name||"").localeCompare(String(b.canonical_name||"")));

  if(!out.length)return "Belum ada produk Nine yang terklasifikasi untuk kelompok motor tersebut.";

  const groupLabel=[...allowedGroups].join(", ");
  const lines=[`Rekomendasi produk Nine berdasarkan kelompok aplikasi motor ${groupLabel}:`];
  for(const r of out.slice(0,16)){
    const note=r.application_note?` (${r.application_note})`:"";
    lines.push(`${lines.length}. ${r.canonical_name||r.clue_name||r.product_id}${note}`);
  }
  lines.push("Catatan: rekomendasi mengikuti kelompok aplikasi yang sudah diklasifikasikan. Tahun/generasi dan kondisi socket tetap perlu diverifikasi sebelum pemasangan.");
  return lines.join("\n");
}

function humanPosition(p){
  const m={headlamp_combined:"Headlamp",headlamp_low:"Headlamp dekat",headlamp_high:"Headlamp jauh",headlamp:"Headlamp",foglamp:"Foglamp",parking_front:"Lampu senja depan",turn_signal_front:"Sein depan",turn_signal_rear:"Sein belakang",brake:"Lampu rem",reverse:"Lampu mundur",license_plate_rear:"Lampu plat belakang"};
  return m[p]||String(p||"").replace(/_/g," ");
}
function humanVehicle(runtime,id){
  const v=runtime?.vById?.[id]; if(!v)return String(id||"").replace(/-/g," ");
  const i=v.identity||{},y=i.year||{},yr=y.start&&y.end?(y.start===y.end?`${y.start}`:`${y.start}-${y.end}`):(y.raw||"");
  return [i.brand,i.model_source,yr].filter(Boolean).join(" ");
}

function productTool(){return{type:"function",name:"search_nine_products",description:"Cari produk Nine resmi berdasarkan kebutuhan, fungsi, socket, kategori, atau spesifikasi.",strict:true,parameters:{type:"object",properties:{query:{type:"string"},limit:{type:"integer",minimum:1,maximum:8}},required:["query","limit"],additionalProperties:false}};}
function extractText(d){if(typeof d?.output_text==="string"&&d.output_text.trim())return d.output_text.trim();const c=[];for(const i of d?.output||[])for(const x of i?.content||[])if(x?.text)c.push(x.text);return c.join("\n").trim();}
function sources(d){const o=[],s=new Set(),add=(u,t)=>{if(u&&!s.has(u)){s.add(u);o.push({url:u,title:t||u});}};for(const i of d?.output||[]){for(const x of i?.action?.sources||[])add(x.url,x.title);for(const c of i?.content||[])for(const a of c?.annotations||[])if(a?.type==="url_citation")add(a?.url||a?.url_citation?.url,a?.title||a?.url_citation?.title);}return o.slice(0,5);}
async function callAI({products,message,route,state,memory,image,explicitProducts}){
  if(!process.env.OPENAI_API_KEY)throw new Error("OPENAI_API_KEY belum tersedia");
  const useWeb=route.type==="fitment"||route.type==="current_web",model=useWeb?MODEL_SMART:MODEL_FAST,tools=[productTool()];if(useWeb)tools.unshift({type:"web_search"});
  const instructions=`Kamu adalah NEXAI Web. Product Knowledge Center adalah sumber utama detail produk Nine: identitas, deskripsi, fitur, spesifikasi, fungsi, aplikasi, socket, visual, dan provenance. Harga/stok/promo/WhatsApp berasal dari data live pelengkap. Nine Autoseries adalah master brand; subbrand: Nine Luximos, Nine LX-Trix, Nine Securicle, Nine Soundblax, Optimus, Cady, Nine Power. Profil Imam hanya dari BUSINESS resmi. Fitment dan fakta aktual/dinamis menggunakan web. Pertanyaan presiden, pejabat, berita, jadwal, cuaca, kurs, dan fakta "sekarang" WAJIB web search. Web tidak boleh menimpa fakta produk resmi Nine. Jangan mengarang data. Jangan sebut nama file/arsitektur internal.`;
  const hist=(Array.isArray(memory)?memory:[]).filter(x=>x&&["user","assistant"].includes(x.role)&&typeof x.content==="string").slice(-(route.type==="general"?2:5)).map(x=>({role:x.role,content:x.content.slice(0,1800)}));
  const user=[{type:"input_text",text:`USER_MESSAGE:\n${message}\nROUTE:${route.type}\nSTATE:${JSON.stringify(state||{})}\nLOCAL_PRODUCTS:${JSON.stringify((explicitProducts||[]).map(productPayload))}\nBUSINESS:${JSON.stringify(businessDB)}\nBRAND:${JSON.stringify(brandDB)}`}];if(image)user.push({type:"input_image",image_url:image});
  let input=[...hist,{role:"user",content:user}],data=null,src=[];
  for(let round=0;round<3;round++){
    const payload={model,instructions,input,tools,max_output_tokens:1600,max_tool_calls:useWeb?5:3};if(useWeb)payload.include=["web_search_call.action.sources"];
    const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify(payload)});
    const raw=await r.text();try{data=JSON.parse(raw);}catch{throw new Error("Response AI tidak valid.");}if(!r.ok)throw new Error(data?.error?.message||"OpenAI request gagal");
    src=[...src,...sources(data)].filter((x,i,a)=>a.findIndex(y=>y.url===x.url)===i).slice(0,5);
    const calls=(data.output||[]).filter(x=>x.type==="function_call");if(!calls.length)break;
    input=[...input,...(data.output||[])];
    for(const call of calls){let args={};try{args=JSON.parse(call.arguments||"{}");}catch{}const result=call.name==="search_nine_products"?{products:fuzzySearch(products,args.query||"",Math.max(1,Math.min(8,Number(args.limit)||5))).map(productPayload)}:{error:"tool_unknown"};input.push({type:"function_call_output",call_id:call.call_id,output:JSON.stringify(result)});}
  }
  let reply=extractText(data)||"Maaf, jawaban belum berhasil dibuat.";if(useWeb&&src.length)reply+="\n\nSumber web:\n"+src.map((x,i)=>`${i+1}. ${x.title} — ${x.url}`).join("\n");
  return{reply,usedWeb:useWeb&&src.length>0,sources:src};
}

async function generateImage(prompt){if(!PUBLIC_IMAGE_ENABLED||!process.env.OPENAI_API_KEY)return null;const r=await fetch("https://api.openai.com/v1/images/generations",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:IMAGE_MODEL,prompt,size:"1024x1024"})});const d=await r.json();if(!r.ok)throw new Error(d?.error?.message||"Image generation gagal.");const b=d?.data?.[0]?.b64_json;return b?`data:image/png;base64,${b}`:null;}

async function parseMultipartEvent(event){if(!event.body)throw new Error("Empty body");const b=Buffer.from(event.body,event.isBase64Encoded?"base64":"utf8"),req=new Readable();req.push(b);req.push(null);req.headers={...(event.headers||{}),"content-length":b.length};req.method=event.httpMethod;req.url="/";const form=formidable({multiples:false});return await new Promise((resolve,reject)=>form.parse(req,(e,fields,files)=>e?reject(e):resolve({fields:fields||{},files:files||{}})));}
function fieldValue(fields,key,f=""){const v=fields?.[key];return Array.isArray(v)?(v[0]??f):(v??f);}
function imageData(files){const v=files?.image;if(!v)return null;const f=Array.isArray(v)?v[0]:v;if(!f?.filepath)return null;return`data:${f.mimetype||"image/jpeg"};base64,${fs.readFileSync(f.filepath).toString("base64")}`;}
function response(statusCode,body){return{statusCode,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(body)};}

exports.handler=async event=>{
 try{
  const liveProducts=await loadProducts();
  const products=unifiedProducts(liveProducts);
  if(event.httpMethod==="GET"&&String(event.queryStringParameters?.health||"")==="1")return response(200,{status:"ok",productCount:products.length,identityCoverage:identityCoverageStats(liveProducts,products),knowledgeCenterProducts:(knowledgeDB.products||[]).length,knowledgeQuality:{catalogVerified:(knowledgeDB.products||[]).filter(x=>x.catalog?.verified).length,descriptions:(knowledgeDB.products||[]).filter(x=>x.catalog?.description).length,specs:(knowledgeDB.products||[]).filter(x=>Object.keys(x.catalog?.specifications||{}).length).length,visuals:(knowledgeDB.products||[]).filter(x=>x.visual?.main).length},masterBrand:brandDB.master_brand,subbrands:brandDB.subbrands,runtimeEngine:fs.existsSync(RUNTIME_ENGINE_FILE),checks:Object.fromEntries(["R9","R10","V9PRO","MS3-SLIM","Q6-PRO","H6-LH2"].map(code=>[code,resolveProducts(products,code,1)[0]?pSku(resolveProducts(products,code,1)[0]):null]))});
  const{fields,files}=await parseMultipartEvent(event),message=String(fieldValue(fields,"message","")).trim(),memory=safeParse(fieldValue(fields,"memory","[]"),[]),productMemory=safeParse(fieldValue(fields,"productMemory","[]"),[]),img=imageData(files);
  if(!message&&!img)return response(400,{reply:"Pesan kosong.",image:null});
  const explicit=resolveProducts(products,message,4),route=classify(message,explicit.length>0);
  if(route.type==="business_profile"){const r=businessReply(message);if(r)return response(200,{reply:r,image:null,route:"business_profile",usedAI:false,usedWeb:false});}
  if(route.type==="brand_knowledge"){const r=brandReply(message,products);if(r)return response(200,{reply:r,image:null,route:"brand_knowledge",usedAI:false,usedWeb:false});}
  if(route.type==="smalltalk")return response(200,{reply:smalltalk(message),image:null,route:"smalltalk",usedAI:false,usedWeb:false});
  if(route.type==="local_time"){const r=localTime(fieldValue(fields,"clientTime",""),fieldValue(fields,"clientTimezone",""));if(r)return response(200,{reply:r,image:null,route:"local_time",usedAI:false,usedWeb:false});}

  const state=buildState(memory,productMemory),active=activeProduct(products,state);
  const runtime=await getNexaiRuntime();
  let runtimeResult=null;
  if(runtime){
    try{runtimeResult=runtime.handle(message,{last_product_id:state?.activeProduct?.sku||null,last_vehicle_id:null,last_intent:null});}
    catch(e){console.warn("NEXAI runtime handle warning:",e.message);}
  }

  const runtimeProductId=runtimeResult?.entities?.products?.[0]||null;
  const runtimeProduct=runtimeProductFromId(products,runtimeProductId);
  const product=runtimeProduct||explicit[0]||(referential(message)?active:null);

  const productLifecycle=product?lifecycleForProduct(product):lifecycleForProductId(runtimeProductId||"");
  if(productLifecycle.status==="hidden"){
    return response(200,{reply:"Produk yang dimaksud tidak tersedia untuk ditampilkan.",image:null,route:"product_hidden",usedAI:false,usedWeb:false,runtime:true});
  }

  if(product&&productLifecycle.recommendation_enabled===false&&asksVehicleCompatibility(message)){
    const statusText=lifecycleLabel(productLifecycle)||"Produk ini tidak aktif untuk rekomendasi.";
    return response(200,{reply:statusText,image:null,route:"product_lifecycle_recommendation_block",usedAI:false,usedWeb:false,runtime:true});
  }

  const explicitClassRule=classRuleFor({productId:runtimeProductId,product,message});
  const hasCurrentVehicle=Array.isArray(runtimeResult?.entities?.vehicles)&&runtimeResult.entities.vehicles.length>0;
  const hasCurrentProduct=!!runtimeProductId||explicit.length>0;
  const activeClassRule=(!hasCurrentVehicle&&!hasCurrentProduct&&(referential(message)||isProductCompatibilityFollowup(message)))
    ?classRuleFromActiveProduct(active)
    :null;
  const classRule=explicitClassRule||activeClassRule;
  const authoritativeClassReply=classReply(message,classRule,product||active);
  if(authoritativeClassReply)return response(200,{reply:authoritativeClassReply,image:null,route:"vehicle_classification_v2_guard",usedAI:false,usedWeb:false,runtime:true});

  const currentVehicleId=runtimeResult?.entities?.vehicles?.[0]||null;
  const currentVehicleIsCar=!!(currentVehicleId&&runtime&&typeof runtime.isCarVehicle==="function"&&runtime.isCarVehicle(currentVehicleId));

  // Vehicle Resolver is authoritative for current car queries.
  // A resolved Kamar-4 car must never be reclassified by motorcycle text matching.
  const motorcycleRecommendation=currentVehicleIsCar?null:motorcycleRecommendationReply(message,products);
  if(motorcycleRecommendation){
    return response(200,{reply:motorcycleRecommendation,image:null,route:"motorcycle_group_recommendation",usedAI:false,usedWeb:false,runtime:true});
  }

  if(runtimeResult?.intents?.includes("vehicle_info")){
    const vf=runtimeResult?.facts?.vehicles?.[0];
    const vr=runtimeVehicleReply(vf);
    if(vr)return response(200,{reply:vr,image:null,route:"vehicle_info",usedAI:false,usedWeb:false,runtime:true});
  }

  // Fresh vehicle query must outrank prior active-product context.
  if(runtimeResult?.intents?.includes("fitment_vehicle_to_product")){
    const fr=runtimeFitmentReply(runtimeResult,"vehicle",runtime);
    if(fr)return response(200,{reply:fr,image:null,route:"fitment_vehicle_to_product",usedAI:false,usedWeb:false,runtime:true});
  }

  if(runtimeResult?.intents?.includes("fitment_product_to_vehicle")){
    const fr=runtimeFitmentReply(runtimeResult,"product",runtime);
    if(fr)return response(200,{reply:fr,image:null,route:"fitment_product_to_vehicle",usedAI:false,usedWeb:false,runtime:true});
  }
  if(explicit[0])state.activeProduct={name:pName(explicit[0]),sku:pSku(explicit[0])};

  if(route.type==="compare"&&explicit.length>=2)return response(200,{reply:compare(explicit),image:null,route:"compare",usedAI:false,usedWeb:false,products:explicit.map(productPayload),state:{activeProduct:state.activeProduct,vehicle:state.vehicle}});

  const directRoutes=new Set(["product_price","product_stock","product_photo","product_gallery","product_photo_spec","product_spec","product_features","product_description","product_variant","catalog_page","product_detail","product_full"]);
  if(directRoutes.has(route.type)&&product)return response(200,{reply:withLifecycleNotice(direct(route.type,product),product),image:null,route:route.type,usedAI:false,usedWeb:false,product:{...productPayload(product),lifecycle:productLifecycle},state:{activeProduct:{name:pName(product),nama:pName(product),sku:pSku(product),gambar:pImage(product)},vehicle:state.vehicle}});
  if(directRoutes.has(route.type)&&!product)return response(200,{reply:"Produk Nine yang dimaksud belum berhasil saya identifikasi. Sebutkan nama atau SKU produknya.",image:null,route:"product_not_identified",usedAI:false,usedWeb:false});

  if(route.type==="fitment"&&(runtimeProductId||runtimeResult?.entities?.vehicles?.length)){
    return response(200,{reply:"Data fitment terverifikasi belum cukup untuk rekomendasi tambahan. Sebutkan produk, kendaraan, dan tahun yang lebih spesifik.",image:null,route:"fitment_no_ai_fallback",usedAI:false,usedWeb:false,runtime:true});
  }

  if(asksVehicleCompatibility(message)&&classRule){
    return response(200,{reply:"Klasifikasi produk sudah dikenali, tetapi data kendaraan terverifikasi belum cukup untuk jawaban tambahan. Saya tidak akan menebak kecocokan dari socket saja.",image:null,route:"classified_fitment_no_ai_fallback",usedAI:false,usedWeb:false,runtime:true});
  }

  if(!currentVehicleIsCar&&/\b(beat|vario|scoopy|mio|jupiter|supra|revo|verza|vixion|r15|cb150r|cbr150|byson|klx|vespa|inazuma|zafferano|zaferrano|fino|xeon|nex|smash|satria|spacy|x-ride|xride)\b/.test(normalize(message))){
    return response(200,{reply:"Model motor dikenali, tetapi kelompok aplikasi belum dapat dipastikan dengan aman. Sebutkan model lengkap dan tahun/generasinya.",image:null,route:"motorcycle_group_clarification",usedAI:false,usedWeb:false,runtime:true});
  }

  const ai=await callAI({products,message,route,state,memory,image:img,explicitProducts:explicit});
  let generated=null;if(route.type==="creative_image"&&PUBLIC_IMAGE_ENABLED)generated=await generateImage(message);
  return response(200,{reply:ai.reply,image:generated,route:route.type,usedAI:true,usedWeb:ai.usedWeb,sources:ai.sources,state:{activeProduct:state.activeProduct,vehicle:state.vehicle}});
 }catch(e){console.error("NEXAI V13 RUNTIME ERROR:",e);return response(500,{reply:"Maaf, data NEXAI sedang tidak dapat dimuat. Silakan coba lagi sebentar.",image:null,error:e.message});}
};
