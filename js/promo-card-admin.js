
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
  return "";
}

function pcSearchProducts(query=""){
  const q=String(query||"").trim().toLowerCase();
  return (_pcCatalog?.products||[])
    .filter(p=>!q || [p.name,p.sku,p.alias].some(v=>String(v||"").toLowerCase().includes(q)))
    .sort((a,b)=>a.name.localeCompare(b.name))
    .slice(0,100);
}

function renderPromoProductDropdown(index,query=""){
  const box=document.getElementById("pcDropdown"+index);
  if(!box)return;
  const rows=pcSearchProducts(query);
  box.innerHTML=rows.length
    ? rows.map((p,n)=>`<button type="button" class="pc-option" data-pc-index="${n}">
        <span><b>${pcEsc(p.name)}</b><small>${pcEsc([p.sku,p.alias].filter(Boolean).join(" • "))}</small></span>
        <span class="pc-page">Hal. ${p.catalog_page}</span>
      </button>`).join("")
    : `<div class="pc-option-empty">Produk tidak ditemukan.</div>`;

  [...box.querySelectorAll(".pc-option")].forEach((btn,n)=>{
    btn.addEventListener("click",()=>{
      const hit=rows[n];
      const input=document.getElementById("pcProduct"+index);
      if(input&&hit)input.value=hit.name;
      box.classList.remove("show");
    });
  });
}

function openPromoProductDropdown(index){
  [1,2].forEach(i=>document.getElementById("pcDropdown"+i)?.classList.toggle("show",i===index));
  const input=document.getElementById("pcProduct"+index);
  renderPromoProductDropdown(index,input?.value||"");
}

function togglePromoProductDropdown(index,event){
  event?.stopPropagation();
  const box=document.getElementById("pcDropdown"+index);
  if(box?.classList.contains("show"))box.classList.remove("show");
  else openPromoProductDropdown(index);
}

function bindPromoProductSearch(){
  [1,2].forEach(index=>{
    const input=document.getElementById("pcProduct"+index);
    if(!input||input.dataset.bound)return;
    input.dataset.bound="1";
    input.addEventListener("focus",()=>openPromoProductDropdown(index));
    input.addEventListener("input",()=>{
      renderPromoProductDropdown(index,input.value);
      document.getElementById("pcDropdown"+index)?.classList.add("show");
    });
  });
  if(!document.body.dataset.pcOutsideBound){
    document.body.dataset.pcOutsideBound="1";
    document.addEventListener("click",e=>{
      if(!e.target.closest(".pc-combo")){
        document.getElementById("pcDropdown1")?.classList.remove("show");
        document.getElementById("pcDropdown2")?.classList.remove("show");
      }
    });
  }
}
async function openPromoCardStudio(){
  try{
    await loadPromoCardCatalog();
    bindPromoProductSearch();
    resetPromoCardDefaults(false);
    renderPromoProductDropdown(1,"");
    renderPromoProductDropdown(2,"");
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
  const specs=(p.specifications||[]).slice(0,12).map(x=>`<div class="spec"><b>${pcEsc(x.label)}</b><span>${pcEsc(x.value)}</span></div>`).join("");
  const features=(p.features||[]).slice(0,7).map(x=>`<li>${pcEsc(x)}</li>`).join("");
  const description=String(p.description||"").trim();
  const score=(description.length/90)+((p.specifications||[]).length*.72)+((p.features||[]).length*.58);
  const density=score>10.5?" density-high":score>7.5?" density-medium":"";
  return `<article class="info-card${density}">
    <h2>${pcEsc(p.name)}</h2>
    ${description?`<div class="section description"><h3>DESKRIPSI</h3><p>${pcEsc(description)}</p></div>`:""}
    <div class="section"><h3>SPESIFIKASI</h3><div class="specs">${specs||"<div class='empty'>Spesifikasi terstruktur belum tersedia.</div>"}</div></div>
    <div class="section"><h3>KEUNGGULAN</h3><ul>${features||"<li>Keunggulan terstruktur belum tersedia.</li>"}</ul></div>
    <div class="watermark">Imamsalesnine.com</div>
  </article>`;
}
function buildPromoCardHtml(products,title,subtitle){
  const photos=products.map(p=>`<div class="photo"><img src="${pcEsc(p.image||p.catalog_full_page||"")}" alt="${pcEsc(p.name)}"></div>`).join("");
  const cards=products.map(pcCard).join("");

  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
:root{--lime:#8CC63F;--lime2:#B9EC6B;--muted:#d2d8ce;--line:rgba(140,198,63,.25)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden}
body{background:#050704;font-family:Inter,Arial,sans-serif}
.poster{position:relative;width:100%;height:100%;overflow:hidden;color:#fff;background:radial-gradient(circle at 88% 4%,rgba(140,198,63,.24),transparent 28%),linear-gradient(155deg,#151b11 0%,#090c08 56%,#11170e 100%)}
.poster:before{content:"";position:absolute;inset:0;opacity:.4;background-image:radial-gradient(rgba(255,255,255,.045) 1px,transparent 1px);background-size:18px 18px}
.wrap{position:relative;z-index:2;height:100%;padding:2.5%;display:grid;grid-template-rows:auto auto 28% minmax(0,1fr);gap:1.08%}
.top{display:flex;align-items:center}
.brand{display:flex;align-items:center;gap:9px;font-weight:950;font-size:1.92vh;letter-spacing:.035em}
.brand:before{content:"";width:8px;height:3.5vh;border-radius:99px;background:var(--lime);box-shadow:0 0 20px rgba(140,198,63,.5)}
.hero h1{font-size:3.25vh;line-height:1;letter-spacing:-.045em}
.hero p{margin-top:.5vh;color:#c7cec1;font-size:1.03vh;line-height:1.35}
.photos{min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:1.2vh}
.photo{min-height:0;overflow:hidden;border-radius:1.45vh;border:1px solid rgba(255,255,255,.09);background:#0d110c}
.photo img{width:100%;height:100%;object-fit:contain;display:block}
.columns{min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:1.2vh}
.info-card{position:relative;min-height:0;overflow:hidden;padding:1.18vh 1.08vh 3.15vh;border:1px solid rgba(255,255,255,.08);border-radius:1.35vh;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.026))}
.info-card h2{color:var(--lime2);font-size:1.55vh;line-height:1.1;margin-bottom:.8vh}
.section{margin-bottom:.85vh}
.section h3{font-size:.8vh;letter-spacing:.05em;margin-bottom:.34vh}
.section p,.section li,.spec,.empty{font-size:.84vh;line-height:1.38;color:var(--muted)}
.description p{font-size:.88vh;line-height:1.34;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.section ul{list-style:none}
.section li{position:relative;padding-left:.98vh;margin-bottom:.23vh}
.section li:before{content:"";position:absolute;left:0;top:.46em;width:.36vh;height:.36vh;border-radius:50%;background:var(--lime)}
.specs{display:grid;gap:.22vh}
.spec{display:grid;grid-template-columns:.78fr 1.22fr;gap:.4vh;padding:.35vh .43vh;border-radius:.5vh;background:rgba(255,255,255,.035)}
.spec b{color:#fff}
.watermark{position:absolute;left:1.08vh;right:1.08vh;bottom:.85vh;padding-top:.7vh;border-top:1px solid rgba(140,198,63,.18);color:rgba(185,236,107,.52);font-size:.74vh;font-weight:850;letter-spacing:.035em;text-align:right}
.info-card.density-medium .section p,.info-card.density-medium .section li,.info-card.density-medium .spec{font-size:.80vh;line-height:1.27}.info-card.density-high .section{margin-bottom:.48vh}.info-card.density-high .section p,.info-card.density-high .section li,.info-card.density-high .spec{font-size:.74vh;line-height:1.20}.info-card.density-high .description p{-webkit-line-clamp:3}.info-card.density-high .spec{padding:.24vh .36vh}.info-card.density-high .section li{margin-bottom:.1vh}</style></head><body>
<main class="poster"><div class="wrap">
<header class="top"><div class="brand">NINE AUTOSERIES</div></header>
<section class="hero"><h1>${pcEsc(title)}</h1><p>${pcEsc(subtitle)}</p></section>
<section class="photos">${photos}</section>
<section class="columns">${cards}</section>
</div></main>
</body></html>`;
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
