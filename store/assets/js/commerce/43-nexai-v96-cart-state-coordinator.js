
(()=>{
'use strict';
const root=()=>document.querySelector('#product-grid-auto .cart-page');
let was=!!root();
const watch=new MutationObserver(()=>{
 const now=!!root();
 if(was&&!now){
  window.__imamstoreCartLeft=true;
  document.querySelectorAll('.nf-cart-footer').forEach(el=>el.remove());
 }
 was=now;
});
watch.observe(document.getElementById('product-grid-auto')||document.body,{childList:true,subtree:true});
const refresh=()=>{
 window.imamstoreRefreshCartBadge?.();
 window.__nineSyncVisibleTotals?.();
};
document.addEventListener('nine:cartchange',refresh);
document.addEventListener('change',e=>{
 if(e.target.matches('#product-grid-auto .cart-page .nf-item-select,#nfAll')){
  requestAnimationFrame(refresh);
 }
});
})();
