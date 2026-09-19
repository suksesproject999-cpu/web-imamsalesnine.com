const products=require("../../produk.json");
const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const pub=p=>!p?"":(/^https?:\/\//i.test(p)?p:"https://imamsalesnine.com/"+String(p).replace(/^\/+/, ""));
exports.handler=async(event)=>{
 if(event.httpMethod!=="GET") return {statusCode:405,body:JSON.stringify({error:"Method not allowed"})};
 const q=String(event.queryStringParameters?.q||"").trim();
 if(!q) return {statusCode:400,headers:{"content-type":"application/json"},body:JSON.stringify({error:"Parameter q wajib diisi"})};
 const nq=norm(q);
 let m=products.filter(p=>[p.nama,p.sku,p.brand,p.kategori,...(Array.isArray(p.tags)?p.tags:[])].filter(Boolean).map(norm).some(v=>v===nq));
 if(!m.length) m=products.filter(p=>[p.nama,p.sku,p.brand,p.kategori,...(Array.isArray(p.tags)?p.tags:[])].filter(Boolean).map(norm).some(v=>v.includes(nq)||nq.includes(v)));
 const productsOut=m.slice(0,10).map(p=>({
  id:p.id??null,brand:p.brand??"",kategori:p.kategori??"",nama:p.nama??"",sku:p.sku??"",
  harga:p.harga??null,stok:p.stok??null,varian:p.varian??[],keunggulan:p.keunggulan??[],
  aplikasi:p.aplikasi??null,spesifikasi:p.spesifikasi??null,garansi:p.garansi??null,
  isi_paket:p.isi_paket??[],deskripsi:p.deskripsi??"",foto_utama:pub(p.gambar),
  foto_tambahan:Array.isArray(p.gallery)?p.gallery.map(pub).filter(Boolean):[],whatsapp:p.whatsapp??""
 }));
 return {statusCode:200,headers:{"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=60"},body:JSON.stringify({query:q,count:productsOut.length,products:productsOut})};
};
