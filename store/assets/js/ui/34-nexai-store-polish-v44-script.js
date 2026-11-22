
(function(){
'use strict';
const cart=document.getElementById('s5Cart');
const checkout=document.getElementById('s5Draft');
if(!cart||!checkout)return;
const cartKey='imamstore_cart_stage5';
function lines(){try{const v=JSON.parse(localStorage.getItem(cartKey)||'[]');return Array.isArray(v)?v:[]}catch{return []}}
function closeStaleNotifications(){
 document.querySelectorAll('.swal2-container').forEach(el=>{
  if(el.querySelector('.swal2-toast'))el.remove();
 });
 const t=document.getElementById('nexaiScopedToast');
 if(t)t.style.opacity='0';
}
let last=cart.classList.contains('open')?'cart':checkout.classList.contains('open')?'checkout':'other';
function syncView(){
 const now=checkout.classList.contains('open')?'checkout':cart.classList.contains('open')?'cart':'other';
 if(now!==last){closeStaleNotifications();last=now}
}
const watcher=new MutationObserver(syncView);
watcher.observe(cart,{attributes:true,attributeFilter:['class']});
watcher.observe(checkout,{attributes:true,attributeFilter:['class']});
window.addEventListener('popstate',syncView);
window.addEventListener('hashchange',syncView);
/* Both cart and checkout delegate to the same existing variant editor.
   Map by product key/id rather than assuming the visible row index matches storage. */
function indexFor(row){
 const all=lines();
 const key=row?.dataset?.cartKey||row?.querySelector('[data-cart-key]')?.dataset.cartKey;
 if(key){const n=all.findIndex(x=>String(x.key)===String(key));if(n>=0)return n}
 const id=row?.dataset?.productId||row?.dataset?.id;
 if(id){const n=all.findIndex(x=>String(x.id)===String(id));if(n>=0)return n}
 const rows=[...document.querySelectorAll('#s5DraftItems .s5-item,#s5DraftItems .summary-item')];
 const i=rows.indexOf(row);
 return i>=0&&i<all.length?i:-1;
}
checkout.addEventListener('click',function(e){
 const btn=e.target.closest('.ref-v42-change');
 if(!btn)return;
 const row=btn.closest('.s5-item,.summary-item');
 if(!row)return;
 const i=indexFor(row);
 if(i<0){e.preventDefault();e.stopImmediatePropagation();window.imamstoreToast?.('Produk tidak ditemukan di keranjang.','error');return}
 /* Existing checkout change handler already opens the shared modal.
    Avoid layering a second modal handler. */
},true);
})();
