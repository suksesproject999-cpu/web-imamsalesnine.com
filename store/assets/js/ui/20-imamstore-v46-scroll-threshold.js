(()=>{'use strict';
// Satu controller untuk tombol kembali ke atas: tab Toko/Produk/Kategori/Favorit + detail.
const storeRoot=document.getElementById('storeContent');
const detail=document.getElementById('imamstoreLiveOriginalDetail');
const storeArrow=document.getElementById('imamstoreBackToTop');
if(!storeRoot||!detail||!storeArrow)return;
const SHOW_AFTER=400;
let raf=0;
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
 const distance=activePanel()?.scrollTop||0;
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
window.addEventListener('pageshow',schedule);
window.addEventListener('focus',schedule);
schedule();
})();