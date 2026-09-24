
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
function pcByName(name){return (_pcCatalog?.products||[]).find(p=>p.name===name)||null}
function pcProductOptions(){
  return (_pcCatalog?.products||[]).slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${pcEsc(p.name)}">${pcEsc(p.name)} · Hal. ${p.catalog_page}</option>`).join("");
}
async function openPromoCardStudio(){
  try{
    await loadPromoCardCatalog();
    const opts=pcProductOptions();
    for(let i=1;i<=4;i++){
      const el=document.getElementById("pcProduct"+i);
      if(el&&!el.options.length)el.innerHTML=opts;
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
  const defaults=["H6 LS2","H6 LH2","H6 LS5","H6 COB GLOSS LG1"];
  defaults.forEach((v,i)=>{const el=document.getElementById("pcProduct"+(i+1));if(el&&[...el.options].some(o=>o.value===v))el.value=v});
  const t=document.getElementById("pcTitle"),s=document.getElementById("pcSubtitle");
  if(t)t.value="NINE LUXIMOS — H6 SERIES";
  if(s)s.value="Deskripsi, spesifikasi, dan keunggulan dari katalog resmi Nine.";
  if(showToast)toast("Pilihan Promo Card direset.");
}
function pcCard(p){
  const specs=(p.specifications||[]).slice(0,10).map(x=>`<div class="spec"><b>${pcEsc(x.label)}</b><span>${pcEsc(x.value)}</span></div>`).join("");
  const features=(p.features||[]).slice(0,6).map(x=>`<li>${pcEsc(x)}</li>`).join("");
  return `<article class="info-card">
    <h2>${pcEsc(p.name)}</h2>
    <div class="section"><h3>DESKRIPSI</h3><p>${pcEsc(p.description||"Deskripsi katalog belum terbaca terstruktur.")}</p></div>
    <div class="section"><h3>SPESIFIKASI</h3><div class="specs">${specs||"<div class='empty'>Belum terbaca terstruktur.</div>"}</div></div>
    <div class="section"><h3>KEUNGGULAN</h3><ul>${features||"<li>Belum terbaca terstruktur.</li>"}</ul></div>
    <div class="source">Katalog resmi • Halaman ${p.catalog_page}</div>
  </article>`;
}
function buildPromoCardHtml(products,title,subtitle){
  const photos=products.map(p=>`<div class="photo"><img src="${pcEsc(p.image||p.catalog_full_page||"")}" alt="${pcEsc(p.name)}"><b>${pcEsc(p.name)}</b></div>`).join("");
  const cards=products.map(pcCard).join("");
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
:root{--lime:#8CC63F;--lime2:#B9EC6B;--muted:#c3cbbd;--line:rgba(140,198,63,.25)}
*{box-sizing:border-box;margin:0;padding:0}html,body{width:100%;height:100%;overflow:hidden}body{display:grid;place-items:center;background:#050704;font-family:Inter,Arial,sans-serif}
.poster{position:relative;width:100%;height:100%;aspect-ratio:9/16;overflow:hidden;color:white;background:radial-gradient(circle at 86% 4%,rgba(140,198,63,.28),transparent 28%),radial-gradient(circle at 5% 94%,rgba(140,198,63,.14),transparent 34%),linear-gradient(155deg,#151b11 0%,#090c08 54%,#11170e 100%)}
.poster:before{content:"";position:absolute;inset:0;opacity:.5;background-image:radial-gradient(rgba(255,255,255,.05) 1px,transparent 1px);background-size:17px 17px}
.wrap{position:relative;z-index:2;height:100%;padding:2.2%;display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto;gap:.9%}
.top{display:flex;align-items:center;justify-content:space-between}.brand{display:flex;align-items:center;gap:9px;font-weight:950;font-size:1.65vh;letter-spacing:.04em}.brand:before{content:"";width:8px;height:3.2vh;border-radius:99px;background:var(--lime);box-shadow:0 0 20px rgba(140,198,63,.55)}.pill{padding:.6vh 1.05vh;border:1px solid var(--line);border-radius:999px;background:rgba(140,198,63,.11);color:#ddffac;font-size:.82vh;font-weight:900}
.hero h1{font-size:3.05vh;line-height:1;letter-spacing:-.04em}.hero h1 span{color:var(--lime2)}.hero p{margin-top:.5vh;color:#c7cec1;font-size:.9vh;line-height:1.35}
.photos{display:grid;grid-template-columns:repeat(4,1fr);gap:.55vh}.photo{position:relative;aspect-ratio:1/1;overflow:hidden;border-radius:1vh;border:1px solid rgba(255,255,255,.09);background:#0d110c}.photo img{width:100%;height:100%;object-fit:contain}.photo b{position:absolute;left:4px;right:4px;bottom:4px;padding:.32vh 2px;border-radius:5px;text-align:center;background:rgba(5,7,4,.84);font-size:.66vh}
.columns{min-height:0;display:grid;grid-template-columns:repeat(4,1fr);gap:.55vh}.info-card{min-height:0;overflow:hidden;padding:.68vh;border:1px solid rgba(255,255,255,.08);border-radius:1.05vh;background:linear-gradient(180deg,rgba(255,255,255,.065),rgba(255,255,255,.025))}.info-card h2{color:var(--lime2);font-size:.98vh;line-height:1.1;margin-bottom:.45vh}.section{margin-bottom:.48vh}.section h3{font-size:.58vh;letter-spacing:.04em;margin-bottom:.18vh}.section p,.section li,.spec,.empty{font-size:.58vh;line-height:1.25;color:var(--muted)}.section ul{list-style:none}.section li{position:relative;padding-left:.7vh;margin-bottom:.13vh}.section li:before{content:"";position:absolute;left:0;top:.42em;width:.28vh;height:.28vh;border-radius:50%;background:var(--lime)}.specs{display:grid;gap:.12vh}.spec{display:grid;grid-template-columns:.8fr 1.2fr;gap:.25vh;padding:.19vh .25vh;border-radius:4px;background:rgba(255,255,255,.033)}.spec b{color:#fff}.source{margin-top:.4vh;padding-top:.38vh;border-top:1px solid rgba(255,255,255,.07);color:#79974f;font-size:.5vh}.footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:.8vh 1vh;border:1px solid var(--line);border-radius:1.1vh;background:linear-gradient(135deg,rgba(140,198,63,.16),rgba(140,198,63,.05))}.footer strong{display:block;font-size:.9vh}.footer small{display:block;margin-top:.18vh;color:#c6cec0;font-size:.64vh}.cta{padding:.72vh 1.1vh;border-radius:999px;background:var(--lime);color:#102000;font-size:.72vh;font-weight:950}
</style></head><body><main class="poster"><div class="wrap">
<header class="top"><div class="brand">NINE AUTOSERIES</div><div class="pill">CATALOG PROMO CARD</div></header>
<section class="hero"><h1>${pcEsc(title)}</h1><p>${pcEsc(subtitle)}</p></section>
<section class="photos">${photos}</section>
<section class="columns">${cards}</section>
<footer class="footer"><div><strong>Butuh bantuan pilih produk Nine?</strong><small>Informasi teknis mengikuti katalog resmi.</small></div><div class="cta">imamsalesnine.com</div></footer>
</div></main></body></html>`;
}
async function previewPromoCard(){
  try{
    await loadPromoCardCatalog();
    const products=[1,2,3,4].map(i=>pcByName(document.getElementById("pcProduct"+i).value)).filter(Boolean);
    if(products.length!==4){toast("Pilih 4 produk terlebih dahulu.");return}
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
