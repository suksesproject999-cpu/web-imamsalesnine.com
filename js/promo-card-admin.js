
let _pcCatalog=null;
let _pcLastHtml="";

async function loadPromoCardCatalog(){
  if(_pcCatalog)return _pcCatalog;
  const r=await fetch("/data/catalog_promo_data.json",{cache:"no-store"});
  if(!r.ok)throw new Error("Data katalog promo tidak dapat dimuat.");
  _pcCatalog=await r.json();
  return _pcCatalog;
}
function pcEsc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function pcByName(value){
  const q=String(value||"").trim().toLowerCase();
  if(!q)return null;
  const rows=_pcCatalog?.products||[];
  return rows.find(p=>String(p.name||"").toLowerCase()===q)
      || rows.find(p=>String(p.sku||"").toLowerCase()===q)
      || rows.find(p=>String(p.alias||"").toLowerCase()===q)
      || null;
}
function pcProductOptions(){
  return (_pcCatalog?.products||[])
    .slice()
    .sort((a,b)=>a.name.localeCompare(b.name))
    .map(p=>{
      const meta=[p.sku,p.alias,`Hal. ${p.catalog_page}`].filter(Boolean).join(" • ");
      return `<option value="${pcEsc(p.name)}" label="${pcEsc(meta)}"></option>`;
    }).join("");
}
async function openPromoCardStudio(){
  try{
    await loadPromoCardCatalog();
    const list=document.getElementById("pcCatalogList");
    if(list&&!list.dataset.ready){
      list.innerHTML=pcProductOptions();
      list.dataset.ready="1";
    }
    resetPromoCardDefaults(false);
    document.getElementById("promoCardModal").classList.add("show");
    document.body.style.overflow="hidden";
  }catch(e){toast("Promo Card gagal dibuka: "+e.message)}
}
function closePromoCardStudio(){
  document.getElementById("promoCardModal")?.classList.remove("show");
  document.body.style.overflow="";
}
function resetPromoCardDefaults(showToast=true){
  if(!_pcCatalog)return;
  const defaults=["H6 LS2","H6 LH2"];
  defaults.forEach((v,i)=>{
    const el=document.getElementById("pcProduct"+(i+1));
    if(el)el.value=v;
  });
  const t=document.getElementById("pcTitle"),s=document.getElementById("pcSubtitle");
  if(t)t.value="NINE LUXIMOS — H6 SERIES";
  if(s)s.value="Deskripsi, spesifikasi, dan keunggulan dari katalog resmi Nine.";
  if(showToast)toast("Pilihan Promo Card direset.");
}
function pcCard(p){
  const specs=(p.specifications||[]).slice(0,12)
    .map(x=>`<div class="spec"><b>${pcEsc(x.label)}</b><span>${pcEsc(x.value)}</span></div>`).join("");
  const features=(p.features||[]).slice(0,7)
    .map(x=>`<li>${pcEsc(x)}</li>`).join("");
  return `<article class="info-card">
    <div class="card-topline"><span>CATALOG VERIFIED</span><small>Hal. ${p.catalog_page}</small></div>
    <h2>${pcEsc(p.name)}</h2>
    <div class="section description"><h3>DESKRIPSI</h3><p>${pcEsc(p.description||"Deskripsi katalog belum terbaca terstruktur.")}</p></div>
    <div class="section"><h3>SPESIFIKASI</h3><div class="specs">${specs||"<div class='empty'>Belum terbaca terstruktur.</div>"}</div></div>
    <div class="section"><h3>KEUNGGULAN</h3><ul>${features||"<li>Belum terbaca terstruktur.</li>"}</ul></div>
  </article>`;
}
function buildPromoCardHtml(products,title,subtitle){
  const photos=products.map(p=>`<div class="photo"><img src="${pcEsc(p.image||p.catalog_full_page||"")}" alt="${pcEsc(p.name)}"><div class="photo-name">${pcEsc(p.name)}</div></div>`).join("");
  const cards=products.map(pcCard).join("");
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
:root{--lime:#8CC63F;--lime2:#B9EC6B;--muted:#c7cec1;--line:rgba(140,198,63,.28)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden}
body{background:#050704;font-family:Inter,Arial,sans-serif}
.poster{position:relative;width:100%;height:100%;overflow:hidden;color:#fff;background:radial-gradient(circle at 88% 4%,rgba(140,198,63,.28),transparent 28%),radial-gradient(circle at 5% 94%,rgba(140,198,63,.14),transparent 34%),linear-gradient(155deg,#151b11 0%,#090c08 54%,#11170e 100%)}
.poster:before{content:"";position:absolute;inset:0;opacity:.46;background-image:radial-gradient(rgba(255,255,255,.05) 1px,transparent 1px);background-size:18px 18px}
.wrap{position:relative;z-index:2;height:100%;padding:2.4%;display:grid;grid-template-rows:auto auto 25% minmax(0,1fr) auto;gap:1.05%}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:flex;align-items:center;gap:9px;font-weight:950;font-size:1.85vh;letter-spacing:.04em}
.brand:before{content:"";width:8px;height:3.4vh;border-radius:99px;background:var(--lime);box-shadow:0 0 20px rgba(140,198,63,.55)}
.pill{padding:.65vh 1.05vh;border:1px solid var(--line);border-radius:999px;background:rgba(140,198,63,.11);color:#ddffac;font-size:.9vh;font-weight:900}
.hero h1{font-size:3.35vh;line-height:1;letter-spacing:-.045em}
.hero p{margin-top:.55vh;color:#c7cec1;font-size:1.02vh;line-height:1.35}
.photos{min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:1.15vh}
.photo{position:relative;min-height:0;overflow:hidden;border-radius:1.4vh;border:1px solid rgba(255,255,255,.1);background:linear-gradient(145deg,#0d110c,#171d14)}
.photo img{width:100%;height:100%;object-fit:contain;display:block}
.photo-name{position:absolute;left:.65vh;right:.65vh;bottom:.65vh;padding:.58vh .5vh;border-radius:.7vh;background:rgba(5,7,4,.86);backdrop-filter:blur(4px);text-align:center;font-size:1.05vh;font-weight:950}
.columns{min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:1.15vh}
.info-card{min-height:0;overflow:hidden;padding:1.05vh;border:1px solid rgba(255,255,255,.09);border-radius:1.35vh;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.027))}
.card-topline{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:.48vh}
.card-topline span{color:#dfffad;font-size:.66vh;font-weight:900;letter-spacing:.06em}
.card-topline small{color:#7f9f56;font-size:.65vh}
.info-card h2{color:var(--lime2);font-size:1.45vh;line-height:1.1;margin-bottom:.72vh}
.section{margin-bottom:.75vh}
.section h3{font-size:.72vh;letter-spacing:.055em;margin-bottom:.3vh}
.section p,.section li,.spec,.empty{font-size:.75vh;line-height:1.32;color:var(--muted)}
.description p{font-size:.78vh;line-height:1.36}
.section ul{list-style:none}
.section li{position:relative;padding-left:.92vh;margin-bottom:.2vh}
.section li:before{content:"";position:absolute;left:0;top:.43em;width:.34vh;height:.34vh;border-radius:50%;background:var(--lime)}
.specs{display:grid;gap:.2vh}
.spec{display:grid;grid-template-columns:.78fr 1.22fr;gap:.38vh;padding:.32vh .4vh;border-radius:.5vh;background:rgba(255,255,255,.035)}
.spec b{color:#fff}
.footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:.9vh 1.05vh;border:1px solid var(--line);border-radius:1.2vh;background:linear-gradient(135deg,rgba(140,198,63,.16),rgba(140,198,63,.05))}
.footer strong{display:block;font-size:1.02vh}
.footer small{display:block;margin-top:.18vh;color:#c6cec0;font-size:.72vh}
.cta{padding:.78vh 1.2vh;border-radius:999px;background:var(--lime);color:#102000;font-size:.8vh;font-weight:950}
</style></head><body><main class="poster"><div class="wrap">
<header class="top"><div class="brand">NINE AUTOSERIES</div><div class="pill">CATALOG PROMO CARD</div></header>
<section class="hero"><h1>${pcEsc(title)}</h1><p>${pcEsc(subtitle)}</p></section>
<section class="photos">${photos}</section>
<section class="columns">${cards}</section>
<footer class="footer"><div><strong>Produk Nine • Informasi katalog resmi</strong><small>Tanpa harga • fokus spesifikasi dan keunggulan.</small></div><div class="cta">imamsalesnine.com</div></footer>
</div></main></body></html>`;
}
async function previewPromoCard(){
  try{
    await loadPromoCardCatalog();
    const raw=[1,2].map(i=>document.getElementById("pcProduct"+i)?.value||"");
    const products=raw.map(pcByName);
    if(products.some(x=>!x)){
      toast("Produk belum valid. Ketik nama/SKU lalu pilih hasil pencarian.");
      return;
    }
    if(products[0].name===products[1].name){
      toast("Pilih dua produk yang berbeda.");
      return;
    }
    _pcLastHtml=buildPromoCardHtml(products,document.getElementById("pcTitle").value,document.getElementById("pcSubtitle").value);
    const frame=document.getElementById("promoPreviewFrame");
    frame.srcdoc=_pcLastHtml;
    document.getElementById("promoPreviewModal").classList.add("show");
    document.body.style.overflow="hidden";
  }catch(e){toast("Preview gagal: "+e.message)}
}
function closePromoPreview(){
  document.getElementById("promoPreviewModal")?.classList.remove("show");
  if(!document.getElementById("promoCardModal")?.classList.contains("show"))document.body.style.overflow="";
}
function openPromoPreviewWindow(){
  if(!_pcLastHtml){toast("Buat Preview terlebih dahulu.");return}
  const blob=new Blob([_pcLastHtml],{type:"text/html"});
  const url=URL.createObjectURL(blob);
  const w=window.open(url,"_blank","noopener");
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
