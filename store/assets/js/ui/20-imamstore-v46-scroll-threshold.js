(()=>{'use strict';
// Satu controller untuk tombol kembali ke atas: tab Toko/Produk/Kategori/Favorit + detail.
const storeRoot=document.getElementById('storeContent');
const detail=document.getElementById('imamstoreLiveOriginalDetail');
const storeArrow=document.getElementById('imamstoreBackToTop');
const cartLauncher=document.getElementById('s8CartLauncher');
if(!storeRoot||!detail||!storeArrow)return;
const SHOW_AFTER=400;
let raf=0;
let lastCartPanel=null,lastCartScroll=0,cartScrollHidden=false;
const detailShell=()=>detail.querySelector('.nine-detail-shell');
const activePanel=()=>storeRoot.querySelector(':scope > .panel.active');
function visible(button,on){
 if(!button)return;
 button.classList.toggle('is-visible',on);
 button.setAttribute('aria-hidden',String(!on));
 button.tabIndex=on?0:-1;
}
function update(){
 raf=0;
 const detailOpen=detail.classList.contains('open');
 const modalOpen=!!document.querySelector('#s5Cart.open,#s5Draft.open,#imamstoreOriginalPurchase.open,.ref-modal:not([hidden]),#flashSaleFull.open');
 const cartPanel=activePanel();
 // Follow the actual scrolling surface; the store can scroll a panel or the document.
 const distance=Math.max(cartPanel?.scrollTop||0,storeRoot.scrollTop||0,window.scrollY||0);
 if(cartPanel!==lastCartPanel){
  lastCartPanel=cartPanel;lastCartScroll=distance;cartScrollHidden=false;
 }else if(distance<150){
  cartScrollHidden=false;lastCartScroll=distance;
 }else{
  const delta=distance-lastCartScroll;
  if(delta>8){if(distance>240)cartScrollHidden=true;lastCartScroll=distance}
  else if(delta< -8){cartScrollHidden=false;lastCartScroll=distance}
 }
 if(cartLauncher){
  const eligible=!detailOpen&&!modalOpen&&!document.body.classList.contains('stage4-detail-open');
  if(!eligible)cartScrollHidden=false;
  const concealed=eligible&&cartScrollHidden;
  cartLauncher.classList.toggle('is-scroll-hidden',concealed);
  cartLauncher.tabIndex=concealed?-1:0;
  cartLauncher.setAttribute('aria-hidden',String(concealed));
 }
 visible(storeArrow,!detailOpen&&!modalOpen&&distance>SHOW_AFTER);
 const detailArrow=detail.querySelector('#nineAllBackTop');
 const detailDistance=Math.max(detail.scrollTop||0,detailShell()?.scrollTop||0);
 visible(detailArrow,detailOpen&&!modalOpen&&detailDistance>SHOW_AFTER);
}
function schedule(){if(!raf)raf=requestAnimationFrame(update)}
function jump(element){
 if(!element)return;
 // instant: jangan gunakan smooth dan jangan melakukan rangkaian scroll.
 element.scrollTo({top:0,behavior:'instant'});
}
document.addEventListener('click',e=>{
 const button=e.target.closest('#imamstoreBackToTop,#nineAllBackTop');
 if(!button)return;
 e.preventDefault();
 e.stopImmediatePropagation();
 if(button.id==='nineAllBackTop'){
  jump(detailShell());jump(detail);
 }else{
  jump(activePanel());
  window.storeResetVerticalHeader?.();
  jump(storeRoot);
  jump(window);
 }
 schedule();
},true);
storeRoot.addEventListener('scroll',schedule,{capture:true,passive:true});
detail.addEventListener('scroll',schedule,{capture:true,passive:true});
new MutationObserver(schedule).observe(detail,{attributes:true,attributeFilter:['class'],childList:true,subtree:false});
// Pembukaan ulang detail merender button baru, observer ini menghubungkan ulang tampilan tanpa listener ganda.
window.imamstoreRefreshScrollTop=schedule;
window.addEventListener('resize',schedule,{passive:true});
window.addEventListener('scroll',schedule,{passive:true});
// Existing tab navigation changes the active scroll panel.
document.addEventListener('click',e=>{if(e.target.closest('[data-tab]'))schedule()},true);
window.addEventListener('pageshow',schedule);
window.addEventListener('focus',schedule);
schedule();
})();