
(function(){
'use strict';
function isCart(){
  const p=String(window.currentPage||'').toLowerCase();
  if(p==='cart')return true;
  const el=document.getElementById('s5Cart');
  if(!el)return false;
  const cs=getComputedStyle(el);
  return cs.display!=='none'&&cs.visibility!=='hidden'&&el.getClientRects().length>0;
}
let last=null;
function sync(){
 const cart=isCart();
 document.body.classList.toggle('nexai-v48-cart-active',cart);
 if(cart===last)return;
 last=cart;
 document.querySelectorAll('.nf-cart-footer').forEach(el=>el.style.removeProperty('pointer-events'));
}
sync();
document.addEventListener('click',()=>queueMicrotask(sync),true);
window.addEventListener('hashchange',sync);
window.addEventListener('popstate',sync);
const mo=new MutationObserver(sync);
mo.observe(document.body,{subtree:false,attributes:true,attributeFilter:['class']});
const cart=document.getElementById('s5Cart');
if(cart)mo.observe(cart,{attributes:true,attributeFilter:['class','style']});
const footObserver=new MutationObserver(sync);
footObserver.observe(document.body,{childList:true});
})();
