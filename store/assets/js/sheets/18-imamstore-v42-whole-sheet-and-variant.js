
(()=>{'use strict';
/* Swipe utility stays shared; only one commerce manager owns the variant edit. */
const $=id=>document.getElementById(id),reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
let drag=null;
const panels=()=>[
 {panel:document.querySelector('#imamstoreLiveOriginalDetail #nineSpecOverlay .nine-spec-sheet'),close:()=>window.nineCloseSpecs?.()},
 {panel:document.querySelector('.ref-modal:not([hidden]) .ref-modal-panel'),close:()=>window.imamstoreReferenceV38?.closeModal?.()},
 {panel:document.querySelector('#imamstoreOriginalPurchase:not([hidden]) .imamstore-purchase-panel'),close:()=>window.imamstoreCommerceSheet?.close?.()},
 ...[...document.querySelectorAll('.v38-overlay[aria-hidden="false"] .v38-sheet')].map(panel=>({panel,close:()=>panel.querySelector('[data-v38-close]')?.click()}))
 ].filter(x=>x.panel?.isConnected&&x.panel.getClientRects().length);
function stop(){if(!drag)return;cancelAnimationFrame(drag.raf);drag.panel.style.transition='';drag.panel.style.transform='';drag=null}
document.addEventListener('touchstart',e=>{
 if(e.touches.length!==1||e.target.closest('input,textarea,select,button,[contenteditable]'))return;
 const found=panels().find(x=>x.panel.contains(e.target));if(!found)return;
 stop();const t=e.touches[0];drag={...found,startX:t.clientX,startY:t.clientY,dy:0,raf:0,dragging:false,from:performance.now()};
},{capture:true,passive:true});
document.addEventListener('touchmove',e=>{
 if(!drag||e.touches.length!==1)return;const t=e.touches[0],dy=t.clientY-drag.startY,dx=t.clientX-drag.startX;
 if(!drag.dragging){if(dy<7||Math.abs(dx)>dy*.7)return;
  let el=e.target;while(el&&el!==drag.panel){if(el.scrollHeight>el.clientHeight+3&&getComputedStyle(el).overflowY.match(/auto|scroll/)&&el.scrollTop>0){stop();return}el=el.parentElement}
  drag.dragging=true;drag.panel.style.transition='none';}
 if(dy<0)return;drag.dy=dy;drag.panel.style.transform='translate3d(0,'+Math.round(dy)+'px,0)';if(e.cancelable)e.preventDefault();
},{capture:true,passive:false});
document.addEventListener('touchend',e=>{
 if(!drag)return;const d=drag;drag=null;if(!d.dragging){d.panel.style.transform='';return}
 const dismiss=d.dy>Math.min(130,d.panel.clientHeight*.25)||d.dy>40&&d.dy/Math.max(1,performance.now()-d.from)>.6;
 d.panel.style.transition='transform '+(reduced()?'0ms':'240ms')+' ease-out';
 d.panel.style.transform=dismiss?'translate3d(0,100%,0)':'translate3d(0,0,0)';
 setTimeout(()=>{if(dismiss)d.close();d.panel.style.transition='';d.panel.style.transform=''},reduced()?0:245);
},{capture:true,passive:true});
document.addEventListener('touchcancel',stop,{capture:true,passive:true});
const read=()=>{try{const v=JSON.parse(localStorage.getItem('imamstore_cart_stage5')||'[]');return Array.isArray(v)?v:[]}catch{return []}};
function openVariant(index,source='cart'){return window.imamstoreCommerceSheet?.openEditor?.(index,source)}
function decorate(){
 const root=$('s5CartItems');if(!root)return;
 const lines=read();
 for(const row of root.querySelectorAll('.imam-cart-product')){
  const key=String(row.dataset.cartKey||'');const line=lines.find(x=>String(x.key)===key);if(!line)continue;
  const info=row.querySelector('.imam-cart-product-info');if(!info)continue;
  let btn=info.querySelector('.ref-v42-change');if(!btn){btn=document.createElement('button');btn.type='button';btn.className='ref-v42-change';info.querySelector('h3')?.after(btn)}
  btn.textContent='Varian: '+(line.varian||'Default')+'  ▾';
  btn.onclick=()=>{const idx=read().findIndex(x=>String(x.key)===key);if(idx>=0)openVariant(idx,'cart')};
 }
 $('s5DraftItems')?.querySelectorAll('.ref-v42-change').forEach(x=>x.remove());
}
const cartItems=$('s5CartItems');if(cartItems)new MutationObserver(decorate).observe(cartItems,{childList:true});
document.addEventListener('nine:cartchange',()=>queueMicrotask(decorate));decorate();
window.imamstoreV42=Object.freeze({openVariant,gesture:'whole-sheet-with-scroll-top',transactionsActive:false});
})();

