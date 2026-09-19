
const K=require("./knowledge");

function stripProductWords(s){
  return String(s||"").replace(/\b(harga|stok|ready|foto|gambar|spek|spec|spesifikasi|varian|warna|detail|produk|nine|berapa|dong|bro)\b/gi," ").replace(/\s+/g," ").trim();
}
function classify(message,state={}){
  const m=K.normalize(message);
  const f={
    time:/\b(jam berapa|sekarang jam|pukul berapa|waktu sekarang)\b/.test(m),
    price:/\b(harga|price|harganya)\b/.test(m),
    stock:/\b(stok|stock|ready|tersedia)\b/.test(m),
    photo:/\b(foto|gambar|lihat|tampilkan|tunjukkan)\b/.test(m),
    catalog:/\b(halaman katalog|foto katalog|full page|katalog)\b/.test(m),
    spec:/\b(spek|spec|spesifikasi|watt|daya|volt|tegangan|lumen|material|kelvin|suhu|pendingin|chip)\b/.test(m),
    variant:/\b(varian|warna|variant|color)\b/.test(m),
    compare:/\b(vs|versus|beda|perbedaan|bandingkan|bandingin)\b/.test(m),
    fitment:/\b(cocok|fitment|socket|soket|wiring|plug.?and.?play|buat .*20\d{2}|pakai apa)\b/.test(m),
    web:/\b(cari web|cari online|internet|google|browsing|terbaru|latest|hari ini|update|berita)\b/.test(m),
    creative:/\b(buat|bikin|generate|render|ciptakan)\b.*\b(foto|gambar|image|poster|banner|visual|ilustrasi)\b/.test(m)
  };
  const stripped=stripProductWords(message);
  let product=K.exactProduct(stripped||message);
  if(!product && state.activeProduct){
    product=K.byIdentity(state.activeProduct.sku||state.activeProduct.name||state.activeProduct.product_id);
  }

  let type="general";
  if(f.time) type="local_time";
  else if(f.creative) type="creative_image";
  else if(f.fitment) type="fitment";
  else if(f.compare) type="compare";
  else if(f.photo) type="product_photo";
  else if(f.catalog) type="catalog_page";
  else if(f.price) type="product_price";
  else if(f.stock) type="product_stock";
  else if(f.spec) type="product_spec";
  else if(f.variant) type="product_variant";
  else if(product) type="product_detail";
  else if(f.web) type="web_general";

  return {type,flags:f,product,stripped};
}
function sourceFor(route){
  const map={
    product_detail:"product_master",
    product_price:"commercial_live",
    product_stock:"commercial_live",
    product_variant:"product_master",
    product_spec:"official_catalog",
    product_photo:"visual_registry",
    catalog_page:"visual_registry",
    fitment:"fitment_cache_then_web",
    compare:"official_product_data_plus_ai",
    web_general:"web",
    general:"ai",
    creative_image:"image_ai"
  };
  return map[route.type]||"ai";
}
module.exports={classify,sourceFor};
