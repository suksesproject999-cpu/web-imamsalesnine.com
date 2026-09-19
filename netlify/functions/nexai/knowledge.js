
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

const registry = safeLoad("data/product_registry.json",{products:{}});
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

const products = Object.values(registry.products||{});

function aliasList(p){
  return [...new Set([p.product_id,p.sku,p.name,...arr(p.aliases)].filter(Boolean).map(normalize))];
}

// Canonical entity resolver:
// 1. explicit alias/SKU anywhere in message (longest match wins)
// 2. exact whole-query alias
// 3. active product only when NO explicit product mention
function resolveMention(message){
  const q = ` ${normalize(message)} `;
  const candidates=[];

  for(const p of products){
    for(const alias of aliasList(p)){
      if(!alias) continue;

      const forms = [...new Set([
        alias,
        alias.replace(/[-/.+]+/g," ").replace(/\s+/g," ").trim()
      ])].filter(Boolean);

      for(const form of forms){
        const escaped=form.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
        const re=new RegExp(`(^|\\s)${escaped}(?=\\s|$|[,.!?/+-])`,"i");
        if(re.test(q.trim())){
          candidates.push({
            p,
            alias:form,
            weight:form.length + (alias===normalize(p.sku)?10000:0)
          });
        }
      }
    }  }
  candidates.sort((a,b)=>b.weight-a.weight);
  return candidates[0]?.p || null;
}

function legacyMatch(p){
  const sku=normalize(p.sku), name=normalize(p.name);
  return legacy.find(x=>{
    const xs=normalize(x.sku||x.kode), xn=normalize(x.nama||x.name);
    return (sku&&xs&&sku===xs)||(name&&xn&&name===xn);
  })||null;
}

function catalogFor(p){
  const byPage = p.catalog_page
    ? (catalog.pages||[]).find(x=>String(x.page)===String(p.catalog_page))
    : null;
  if(byPage && Object.keys(byPage.specs||{}).length){
    return {...byPage.specs,_catalog_page:byPage.page};
  }

  // Fallback only if no canonical page exists.
  const keys=[p.name,p.sku,...arr(p.aliases)].map(normalize).filter(Boolean);
  let best=null,score=0;
  for(const page of catalog.pages||[]){
    const hay=normalize(page.search_text);
    let s=0;
    for(const k of keys){
      if(!k || k.length<2) continue;
      if(hay===k) s+=2000;
      else if(hay.includes(k)) s += k===normalize(p.sku)?1200:400;
    }
    if(s>score){score=s;best=page;}
  }
  return best&&score>=1000?{...(best.specs||{}),_catalog_page:best.page}:{};
}

function fullProduct(p){
  if(!p) return null;
  const live=legacyMatch(p)||{};
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
      main:p.visual?.main||live.gambar||live.image||"",
      additional:p.visual?.additional||[],
      full_page:p.visual?.full_page||"",
      catalog_page:p.visual?.catalog_page||p.catalog_page||null
    }
  };
}

function byIdentity(identity){
  const n=normalize(identity);
  const p=products.find(p=>aliasList(p).includes(n));
  return fullProduct(p);
}

function exactProduct(message){
  return fullProduct(resolveMention(message));
}

function score(p,q){
  const query=normalize(q);
  const tokens=query.split(/\s+/).filter(x=>x.length>1);
  const specs=JSON.stringify(catalogFor(p));
  const hay=normalize([p.name,p.sku,...arr(p.aliases),...arr(p.variants),specs].join(" "));
  let s=0;
  if(aliasList(p).includes(query)) s+=5000;
  for(const token of tokens){
    if(normalize(p.sku)===token) s+=1800;
    if(hay.includes(token)) s+=80;
  }
  return s;
}

function searchProducts(q,limit=8,exclude=[]){
  const ex=exclude.map(normalize);
  return products
    .map(p=>({p,score:score(p,q)}))
    .filter(x=>x.score>0 && !ex.some(e=>e&&normalize(`${x.p.name} ${x.p.sku}`).includes(e)))
    .sort((a,b)=>b.score-a.score)
    .slice(0,limit)
    .map(x=>fullProduct(x.p));
}

function productPayload(p){
  if(!p) return null;
  return {
    product_id:p.product_id,
    name:p.name,
    sku:p.sku,
    brand:p.brand,
    category:p.category,
    price:p.price,
    regular_price:p.regular_price,
    stock:p.stock,
    variants:p.variants,
    description:p.description,
    specs:p.specs,
    visual:p.visual
  };
}

module.exports={
  normalize,money,resolveMention,exactProduct,byIdentity,searchProducts,productPayload,
  brands,business,policy,fitment
};
