
(()=>{
'use strict';
function start(){
const cart=document.getElementById('s5Cart'),list=document.getElementById('s5CartItems');
if(!cart||!list)return;
const KEY='imamstore_cart_stage5',SEL='imamstore_cart_selection_v43';
const read=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[]}catch{return []}};
const selection=()=>{try{return JSON.parse(localStorage.getItem(SEL)||'{}')||{}}catch{return {}}};
const selected=()=>read().filter(x=>selection()[String(x.key)]!==false);
const render=()=>{
 // Render from persisted canonical cart, never from stale cached DOM.
 if(typeof window.__nexaiCoreRenderCart==='function')window.__nexaiCoreRenderCart();
 else window.renderCart?.();
 window.imamstoreV43?.sync?.();
 window.imamstoreReferenceV38?.refresh?.();
 window.imamstoreRefreshCartBadge?.();
 document.dispatchEvent(new CustomEvent('nine:cartchange',{detail:{source:'cart-v8'}}));
};
function ask(n){return new Promise(resolve=>{
const shade=document.createElement('div');shade.className='n8-overlay';
shade.innerHTML='<div class="n8-dialog" role="alertdialog" aria-modal="true"><h2>Hapus produk terpilih?</h2><p></p><button type="button" data-yes>Hapus</button><button type="button" data-no>Batal</button></div>';
shade.querySelector('p').textContent=n+' produk akan dihapus dari keranjang.';
const finish=x=>{shade.remove();resolve(x)};
shade.querySelector('[data-yes]').onclick=()=>finish(true);
shade.querySelector('[data-no]').onclick=()=>finish(false);
cart.append(shade);
})}
async function erase(keys){
keys=[...new Set(keys.map(String))];if(!keys.length)return;
if(!await ask(keys.length))return;
const ids=new Set(keys),next=read().filter(x=>!ids.has(String(x.key)));
try{localStorage.setItem(KEY,JSON.stringify(next))}catch(e){console.error('Gagal menyimpan penghapusan',e);return}
const m=selection();keys.forEach(k=>delete m[k]);localStorage.setItem(SEL,JSON.stringify(m));
render();
}
function decorate(){
for(const row of list.querySelectorAll('.imam-cart-product')){
 if(row.querySelector('.n8-edit'))continue;
 const edit=document.createElement('button');edit.type='button';edit.className='n8-edit';edit.textContent='Ubah';
 const actions=document.createElement('div');actions.className='n8-actions';
 actions.innerHTML='<button type="button" class="n8-similar">Serupa</button><button type="button" class="n8-remove">Hapus</button>';
 row.append(edit,actions);
}
}
let busy=false;
new MutationObserver(()=>{if(busy)return;busy=true;queueMicrotask(()=>{decorate();busy=false})}).observe(list,{childList:true});
list.addEventListener('click',e=>{
const b=e.target.closest('.n8-edit,.n8-remove,.n8-similar');if(!b)return;
e.preventDefault();e.stopImmediatePropagation();
const row=b.closest('.imam-cart-product');if(!row)return;
if(b.matches('.n8-edit')){
 const open=!row.classList.contains('n8-open');
 list.querySelectorAll('.n8-open').forEach(x=>{x.classList.remove('n8-open');x.querySelector('.n8-edit').textContent='Ubah'});
 if(open){row.classList.add('n8-open');b.textContent='Selesai'}
}else if(b.matches('.n8-remove'))erase([row.dataset.cartKey]);
else{
 row.classList.remove('n8-open');row.querySelector('.n8-edit').textContent='Ubah';
 const line=read().find(x=>String(x.key)===row.dataset.cartKey);
 if(line){cart.classList.remove('open');document.dispatchEvent(new CustomEvent('imamstore:cart-similar',{detail:{id:line.id,nama:line.nama}}))}
}
},true);
const sticky=cart.querySelector('.v100-delete');
if(sticky)sticky.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();erase(selected().map(x=>x.key))},true);
decorate();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
