
const K=require("./knowledge");

function classify(message,state={}){
  const m=K.normalize(message);
  const flags={
    time:/\b(jam berapa|sekarang jam|pukul berapa|waktu sekarang)\b/.test(m),
    price:/\b(harga|price|harganya)\b/.test(m),
    stock:/\b(stok|stock|ready|tersedia|ada)\b/.test(m),
    photo:/\b(foto|gambar|lihat|tampilkan|tunjukkan)\b/.test(m),
    catalog:/\b(halaman katalog|foto katalog|full page|katalog)\b/.test(m),
    spec:/\b(spek|spec|spesifikasi|watt|daya|volt|tegangan|lumen|material|kelvin|suhu|pendingin|chip)\b/.test(m),
    variant:/\b(varian|warna|variant|color)\b/.test(m),
    compare:/\b(vs|versus|beda|perbedaan|bandingkan|bandingin)\b/.test(m),
    fitment:/\b(cocok|fitment|socket|soket|wiring|plug.?and.?play|buat .*20\d{2}|pakai apa)\b/.test(m),
    web:/\b(cari web|cari online|internet|google|browsing|terbaru|latest|hari ini|update|berita)\b/.test(m),
    creative:/\b(buat|bikin|generate|render|ciptakan)\b.*\b(foto|gambar|image|poster|banner|visual|ilustrasi)\b/.test(m),
    smalltalk:/^(bro|broo+|halo|hai|hi|hello|gas|gaskeun|pagi|siang|sore|malam|makasih|terima kasih|thanks|oke|ok|sip|siap)[.!?\s]*$/.test(m)
  };

  // Explicit entity always wins over active memory.
  const explicit = K.resolveMention(message);
  let product = explicit ? K.byIdentity(explicit.product_id) : null;

  if(!product && state.activeProduct){
    product=K.byIdentity(
      state.activeProduct.product_id ||
      state.activeProduct.sku ||
      state.activeProduct.name
    );
  }

  let type="general";
  if(flags.smalltalk) type="smalltalk";
  else if(flags.time) type="local_time";
  else if(flags.creative) type="creative_image";
  else if(flags.fitment) type="fitment";
  else if(flags.compare) type="compare";
  else if(flags.catalog) type="catalog_page";
  else if(flags.photo && flags.spec) type="product_photo_spec";
  else if(flags.photo) type="product_photo";
  else if(flags.price) type="product_price";
  else if(flags.stock) type="product_stock";
  else if(flags.spec) type="product_spec";
  else if(flags.variant) type="product_variant";
  else if(product) type="product_detail";
  else if(flags.web) type="web_general";

  return {
    type,flags,product,
    explicitProductId:explicit?.product_id||null
  };
}

function sourceFor(route){
  const map={
    product_detail:"canonical_product_registry",
    product_price:"commercial_live",
    product_stock:"commercial_live",
    product_variant:"canonical_product_registry",
    product_spec:"official_catalog",
    product_photo:"visual_registry",
    product_photo_spec:"visual_registry_plus_official_catalog",
    catalog_page:"visual_registry",
    fitment:"fitment_then_web",
    compare:"canonical_product_data_plus_ai",
    web_general:"web",
    general:"ai",
    creative_image:"image_ai",
    smalltalk:"local_smalltalk"
  };
  return map[route.type]||"ai";
}
module.exports={classify,sourceFor};
