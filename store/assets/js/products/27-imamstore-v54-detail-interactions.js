(()=>{'use strict';
const $=id=>document.getElementById(id),KEY='imamstore_cart_stage5';
const read=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}};
const write=x=>{localStorage.setItem(KEY,JSON.stringify(x));window.dispatchEvent(new Event('storage'))};
const notify=msg=>window.Swal?.fire?window.Swal.fire({icon:'info',text:msg,confirmButtonColor:'#8cc63f',width:'min(90vw,410px)'}):console.warn(msg);
// Delegate voucher taps on original detail, including dynamically recreated price markup.
document.addEventListener('click',e=>{const button=e.target.closest('#imamstoreLiveOriginalDetail .nine-voucher');if(!button)return;e.preventDefault();e.stopImmediatePropagation();(window.imamstoreV43?.openVoucher||window.imamstoreOpenVoucherSheet)?.()},true);
// Replace browser-native purchase variant selector with accessible in-sheet buttons.
const purchase=$('imamstoreOriginalPurchase'),select=$('imamstorePurchaseVariant');
if(purchase&&select){
 const grid=document.createElement('div');grid.className='ref-v45-variant-grid';grid.setAttribute('role','group');grid.setAttribute('aria-label','Pilih varian');select.after(grid);
 // GRID-STABLE-20261126: node tombol dipertahankan; pilihan saja yang diperbarui.
 function paint(){
  const options=[...select.options],old=[...grid.querySelectorAll('button')];
  const stable=old.length===options.length&&old.every((button,i)=>button.dataset.variantValue===options[i].value&&button.textContent===options[i].textContent);
  if(!stable){
   const reusable=new Map(old.map(button=>[button.dataset.variantValue,button]));
   const frag=document.createDocumentFragment();
   for(const opt of options){
    const button=reusable.get(opt.value)||document.createElement('button');
    button.type='button';button.dataset.variantValue=opt.value;
    if(button.textContent!==opt.textContent)button.textContent=opt.textContent;
    button.setAttribute('aria-pressed',String(opt.value===select.value));
    frag.append(button);
   }
   grid.replaceChildren(frag);
  }else{
   for(const button of old)button.setAttribute('aria-pressed',String(button.dataset.variantValue===select.value));
  }
 }
 grid.addEventListener('click',e=>{
  const button=e.target.closest('button[data-variant-value]');
  if(!button||!grid.contains(button)||button.disabled)return;
  const next=button.dataset.variantValue;
  if(select.value===next)return;
  select.value=next;
  select.dispatchEvent(new Event('change',{bubbles:true}));
 });
 new MutationObserver(paint).observe(select,{childList:true,attributes:true,subtree:true,characterData:true});
 select.addEventListener('change',paint);
 paint();
}
// Spec open/close use the same full-surface swipe handler as other sheets.
const spec=()=>document.querySelector('#imamstoreLiveOriginalDetail #nineSpecOverlay');

// Existing v42 global touch manager handles all sheet surfaces; make its drag override compatible with spec CSS.
// The shared sheet touch controller handles specification gestures.

})();