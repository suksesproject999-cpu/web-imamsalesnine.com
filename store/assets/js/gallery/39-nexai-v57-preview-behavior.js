
(function(){
'use strict';
const source=document.getElementById('imamstorePurchaseImage');
const overlay=document.getElementById('nexaiV57Preview');
if(!source||!overlay)return;
const image=document.getElementById('nexaiV57Photo');
const counter=document.getElementById('nexaiV57Count');
let photos=[],index=0,previousFocus=null,touchX=null;
function normalize(url){try{const base=/^https?:$/.test(location.protocol)?location.origin+'/':(document.querySelector('link[rel="canonical"]')?.href||document.baseURI);const u=new URL(url,base);return /^(https?:|data:)$/.test(u.protocol)?u.href:''}catch{return ''}}
function collect(){
 const state=window.imamstoreCommerceSheet?.getState?.();
 const p=state?.productId?window.imamstoreCartBridge?.getProduct?.(state.productId):window.imamstoreActiveProduct;
 const urls=window.imamstoreCommerceSheet?.photoSources?.()||[];
 // Preview selalu menggunakan daftar foto yang sama dengan thumbnail sheet aktif.
 const seen=new Set();return urls.map(normalize).filter(url=>{
  if(!url||seen.has(url)||url.startsWith('data:image/svg'))return false;
  seen.add(url);return true;
 });
}
let failedImages=new Set();
function paint(){
 if(!photos.length)return;
 image.src=photos[index];
 counter.textContent=(index+1)+' / '+photos.length;
 document.getElementById('nexaiV57Prev').hidden=photos.length<2;
 document.getElementById('nexaiV57Next').hidden=photos.length<2;
}
function close(){
 if(overlay.hidden)return;
 overlay.hidden=true;
 overlay.setAttribute('aria-hidden','true');
 image.removeAttribute('src');
 photos=[];
 if(previousFocus?.isConnected)previousFocus.focus();
 previousFocus=null;
}
function openImages(urls,initialUrl){
 failedImages=new Set();
 const seen=new Set();
 photos=(Array.isArray(urls)?urls:[]).map(normalize).filter(url=>{
  if(!url||seen.has(url)||url.startsWith('data:image/svg'))return false;
  seen.add(url);return true;
 });
 if(!photos.length)return;
 const selected=normalize(initialUrl);
 index=Math.max(0,photos.indexOf(selected));
 if(overlay.hidden)previousFocus=document.activeElement;
 overlay.hidden=false;
 overlay.setAttribute('aria-hidden','false');
 paint();
 document.getElementById('nexaiV57Close').focus();
}
function open(){
 const purchase=document.getElementById('imamstoreOriginalPurchase');
 if(!purchase||purchase.hidden||!purchase.classList.contains('open'))return;
 openImages(collect(),source.currentSrc||source.src);
}
window.imamstorePhotoPreview={openImages,close:()=>close()};
document.addEventListener('nine:cartchange',()=>{
 if(!overlay.hidden)close();
});
function move(n){
 if(!photos.length)return;
 const start=index;
 do{
  index=(index+n+photos.length)%photos.length;
 }while(failedImages.has(photos[index])&&index!==start);
 if(failedImages.has(photos[index]))return;
 paint();
}
image.addEventListener('error',()=>{
 if(overlay.hidden||!photos.length)return;
 failedImages.add(photos[index]);
 if(failedImages.size>=photos.length){
  counter.textContent='Foto tidak dapat dimuat';
  image.removeAttribute('src');
  document.getElementById('nexaiV57Prev').hidden=true;
  document.getElementById('nexaiV57Next').hidden=true;
  return;
 }
 move(1);
});
// Handler lama membuka lightbox berbeda; cegah dua modal muncul bersamaan.
source.addEventListener('click',event=>{
 event.preventDefault();
 event.stopImmediatePropagation();
 open();
},true);
source.setAttribute('tabindex','0');
source.setAttribute('role','button');
source.setAttribute('aria-label','Lihat preview foto produk');
source.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
document.getElementById('nexaiV57Close').onclick=close;
document.getElementById('nexaiV57Prev').onclick=()=>move(-1);
document.getElementById('nexaiV57Next').onclick=()=>move(1);
overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
overlay.addEventListener('touchstart',e=>{touchX=e.touches[0]?.clientX??null},{passive:true});
overlay.addEventListener('touchend',e=>{
 if(touchX===null)return;
 const dx=(e.changedTouches[0]?.clientX??touchX)-touchX;
 if(Math.abs(dx)>45)move(dx<0?1:-1);
 touchX=null;
},{passive:true});
document.addEventListener('keydown',e=>{
 if(overlay.hidden)return;
 if(e.key==='Escape'){e.stopPropagation();close()}
 if(e.key==='ArrowLeft')move(-1);
 if(e.key==='ArrowRight')move(1);
 if(e.key==='Tab'){
  const controls=[
   document.getElementById('nexaiV57Close'),
   document.getElementById('nexaiV57Prev'),
   document.getElementById('nexaiV57Next')
  ].filter(el=>el&&!el.hidden&&!el.disabled);
  if(!controls.length)return;
  const current=controls.indexOf(document.activeElement);
  if(e.shiftKey&&(current<=0)){e.preventDefault();controls[controls.length-1].focus()}
  else if(!e.shiftKey&&(current===controls.length-1||current<0)){
   e.preventDefault();controls[0].focus();
  }
 }
});
})();
