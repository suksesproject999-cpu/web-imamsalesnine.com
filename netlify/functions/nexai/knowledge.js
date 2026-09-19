
const fs = require("fs");
const path = require("path");

function safeLoad(rel, fallback){
  try{
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
  }catch(e){
    console.warn("NEXAI data load warning:", rel, e.message);
    return fallback;
  }
}

const master = safeLoad("data/product_master.json",{products:[]});
const visuals = safeLoad("data/visuals.json",{visuals:{}});
const catalog = safeLoad("data/catalog_specs.json",{pages:[]});
const brands = safeLoad("data/brands.json",{});
const business = safeLoad("data/business.json",{});
const policy = safeLoad("data/source_policy.json",{});
const fitment = safeLoad("data/fitment_cache.json",{entries:[]});
const legacy = safeLoad("produk.json",[]);

function normalize(v){
  return String(v||"").toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9\s.+/-]/g," ")
    .replace(/\s+/g," ").trim();
}
function arr(v){ return Array.isArray(v)?v:(v?[v]:[]); }
function money(v){
  if(v===null||v===undefined||v==="") return "";
  if(typeof v==="object"){
    for(const k of ["promo","harga_promo","sale","current","final","price","harga","normal","regular"]){
      if(v[k]!==undefined) return money(v[k]);
    }
    const x=Object.values(v).find(x=>typeof x==="string"||typeof x==="number");
    return x!==undefined?money(x):"";
  }
  if(typeof v==="number") return "Rp"+Math.round(v).toLocaleString("id-ID");
  const s=String(v).trim();
  if(/^rp/i.test(s)) return s;
  const n=s.replace(/[^\d]/g,"");
  return n ? "Rp"+Number(n).toLocaleString("id-ID") : s;
}
function legacyMatch(p){
  const sku=normalize(p.sku), name=normalize(p.name);
  return legacy.find(x=>{
    const xs=normalize(x.sku||x.kode), xn=normalize(x.nama||x.name);
    return (sku&&xs&&sku===xs)||(name&&xn&&name===xn);
  })||null;
}
function visualFor(p){ return visuals.visuals[p.product_id]||{}; }

function catalogFor(p){
  const byPage = p.catalog_page ? catalog.pages.find(x=>String(x.page)===String(p.catalog_page)) : null;
  if(byPage && Object.keys(byPage.specs||{}).length) return {...byPage.specs,_catalog_page:byPage.page};

  const keys=[p.name,p.sku,...arr(p.aliases)].map(normalize).filter(Boolean);
  let best=null, score=0;
  for(const page of catalog.pages||[]){
    const hay=normalize(page.search_text);
    let s=0;
    for(const k of keys){
      if(k.length>=2 && hay.includes(k)) s += k===normalize(p.sku)?1200:500;
    }
    if(s>score){score=s;best=page;}
  }
  return best && score>=500 ? {...(best.specs||{}),_catalog_page:best.page} : {};
}

function fullProduct(p){
  const live=legacyMatch(p)||{};
  const vis=visualFor(p);
  return {
    product_id:p.product_id,
    name:p.name,
    sku:p.sku||live.sku||"",
    brand:live.brand||"",
    category:live.kategori||live.category||"",
    aliases:p.aliases||[],
    variants:(live.varian&&arr(live.varian).length)?arr(live.varian):(p.variants||[]),
    description:live.deskripsi||live.description||"",
    price:money(live.harga_promo ?? live.promo_price ?? live.harga ?? live.price ?? ""),
    regular_price:money(live.harga_normal ?? live.regular_price ?? ""),
    stock:live.stok ?? live.stock ?? live.availability ?? "",
    specs:catalogFor(p),
    visual:{
      main:vis.main||live.gambar||live.image||"",
      additional:vis.additional||[],
      full_page:vis.full_page||"",
      catalog_page:vis.catalog_page||p.catalog_page||null
    }
  };
}
function score(p,q){
  const query=normalize(q), tokens=query.split(/\s+/).filter(x=>x.length>1);
  const hay=normalize([
    p.name,p.sku,...arr(p.aliases),...arr(p.variants),
    JSON.stringify(catalogFor(p))
  ].join(" "));
  let s=0;
  if(query===normalize(p.sku)||query===normalize(p.name)) s+=3000;
  if(query && hay.includes(query)) s+=700;
  for(const t of tokens) if(hay.includes(t)) s+=70;
  return s;
}
function searchProducts(q,limit=8,exclude=[]){
  const ex=exclude.map(normalize);
  return (master.products||[])
    .map(p=>({p,score:score(p,q)}))
    .filter(x=>x.score>0 && !ex.some(e=>e && normalize(`${x.p.name} ${x.p.sku}`).includes(e)))
    .sort((a,b)=>b.score-a.score)
    .slice(0,limit)
    .map(x=>fullProduct(x.p));
}
function exactProduct(q){
  const n=normalize(q);
  const p=(master.products||[]).find(p=>[p.name,p.sku,...arr(p.aliases)].map(normalize).includes(n));
  return p?fullProduct(p):null;
}
function byIdentity(identity){
  const n=normalize(identity);
  const p=(master.products||[]).find(p=>normalize(p.product_id)===n||normalize(p.sku)===n||normalize(p.name)===n);
  return p?fullProduct(p):null;
}

module.exports={
  normalize,money,searchProducts,exactProduct,byIdentity,
  brands,business,policy,fitment
};
