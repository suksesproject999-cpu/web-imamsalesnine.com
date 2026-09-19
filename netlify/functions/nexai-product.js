const products = require("../../produk.json");
const visualMap = require("../../product-visual-map.json");

const norm = (s="") => String(s).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const pub = (p="") => !p ? "" : (/^https?:\/\//i.test(p) ? p : "https://imamsalesnine.com/" + String(p).replace(/^\/+/,""));

function enrich(p){
  const sku = String(p.sku||"").toUpperCase();
  const v = visualMap[sku] || {};
  const foto_utama = v.foto_utama || pub(p.gambar||"");
  const foto_tambahan = (Array.isArray(v.foto_tambahan) && v.foto_tambahan.length)
    ? v.foto_tambahan
    : (Array.isArray(p.gallery) ? p.gallery.map(pub).filter(Boolean) : []);
  return {
    id:p.id??null, brand:p.brand??"", kategori:p.kategori??"", nama:p.nama??"", sku:p.sku??"",
    harga:p.harga??null, stok:p.stok??null, varian:p.varian??[], keunggulan:p.keunggulan??[],
    aplikasi:p.aplikasi??null, spesifikasi:p.spesifikasi??null, garansi:p.garansi??null,
    isi_paket:p.isi_paket??[], deskripsi:p.deskripsi??"", tags:p.tags??[], whatsapp:p.whatsapp??"",
    visual:{
      foto_utama,
      foto_tambahan,
      full_page:v.full_page||"",
      catalog_page:v.catalog_page||"",
      foto_utama_tersedia:Boolean(foto_utama),
      galeri_tersedia:foto_tambahan.length>0,
      full_page_tersedia:Boolean(v.full_page)
    }
  };
}
function exactProduct(q){
  const nq=norm(q);
  return products.find(p=>norm(p.sku)===nq) || products.find(p=>norm(p.nama)===nq) || null;
}
function searchProducts(q,limit=10){
  const nq=norm(q);
  const scored=products.map(p=>{
    const sku=norm(p.sku), nama=norm(p.nama), brand=norm(p.brand), kat=norm(p.kategori);
    let s=0;
    if(sku===nq)s=100; else if(nama===nq)s=95;
    else if(sku.includes(nq)||nq.includes(sku))s=85;
    else if(nama.includes(nq)||nq.includes(nama))s=80;
    else if(kat.includes(nq)||brand.includes(nq))s=50;
    return {p,s};
  }).filter(x=>x.s>0).sort((a,b)=>b.s-a.s);
  return scored.slice(0,limit).map(x=>enrich(x.p));
}
function response(status,obj){return {statusCode:status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=60"},body:JSON.stringify(obj)}}

exports.handler = async (event) => {
  try {
    if(event.httpMethod!=="GET") return response(405,{error:"Method not allowed"});
    const q=event.queryStringParameters||{};
    const op=String(q.op||"").trim();
    const term=String(q.q||"").trim();
    const limit=Math.min(Math.max(parseInt(q.limit||"10")||10,1),50);

    if(op==="getProduct"){
      if(!term) return response(400,{error:"q wajib diisi"});
      const p=exactProduct(term);
      if(!p) return response(404,{match:"none",requested:term,product:null});
      return response(200,{match:"exact",requested:term,product:enrich(p)});
    }

    if(op==="getProductVisuals"){
      if(!term) return response(400,{error:"q wajib diisi"});
      const p=exactProduct(term);
      if(!p) return response(404,{match:"none",requested:term,visual:null});
      const ep=enrich(p);
      return response(200,{match:"exact",requested:term,sku:ep.sku,nama:ep.nama,visual:ep.visual});
    }

    if(op==="getCatalogPage"){
      if(!term) return response(400,{error:"q wajib diisi"});
      const p=exactProduct(term);
      if(!p) return response(404,{match:"none",requested:term,full_page:""});
      const ep=enrich(p);
      return response(200,{match:"exact",requested:term,sku:ep.sku,nama:ep.nama,full_page:ep.visual.full_page,catalog_page:ep.visual.catalog_page,available:ep.visual.full_page_tersedia});
    }

    if(op==="searchProducts"){
      if(!term) return response(400,{error:"q wajib diisi"});
      return response(200,{match:"search",requested:term,count:searchProducts(term,limit).length,products:searchProducts(term,limit)});
    }

    if(op==="getPromotions"){
      const list=products.filter(p=>p.harga && typeof p.harga==="object" && p.harga.promo && p.harga.normal && Number(p.harga.promo)<Number(p.harga.normal)).slice(0,limit).map(enrich);
      return response(200,{count:list.length,products:list});
    }

    return response(400,{error:"op tidak valid",allowed:["getProduct","getProductVisuals","getCatalogPage","searchProducts","getPromotions"]});
  } catch(err){
    return response(500,{error:"Internal server error"});
  }
};
