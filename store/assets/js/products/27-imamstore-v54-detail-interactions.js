(()=>{'use strict';
const $=id=>document.getElementById(id),KEY='imamstore_cart_stage5';
const read=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}};
const write=x=>{localStorage.setItem(KEY,JSON.stringify(x));window.dispatchEvent(new Event('storage'))};
const notify=msg=>window.Swal?.fire?window.Swal.fire({icon:'info',text:msg,confirmButtonColor:'#8cc63f',width:'min(90vw,410px)'}):console.warn(msg);
// Delegate voucher taps on original detail, including dynamically recreated price markup.
document.addEventListener('click',e=>{const button=e.target.closest('#imamstoreLiveOriginalDetail .nine-voucher');if(!button)return;e.preventDefault();e.stopImmediatePropagation();(window.imamstoreV43?.openVoucher||window.imamstoreOpenVoucherSheet)?.()},true);
// Replace browser-native purchase variant selector with accessible in-sheet buttons.
const purchase=$('imamstoreOriginalPurchase'),select=$('imamstorePurchaseVariant');
if(purchase&&select){const grid=document.createElement('div');grid.className='ref-v45-variant-grid';grid.setAttribute('role','group');grid.setAttribute('aria-label','Pilih varian');select.after(grid);
 function paint(){grid.replaceChildren();for(const opt of select.options){const b=document.createElement('button');b.type='button';b.textContent=opt.textContent;b.setAttribute('aria-pressed',String(opt.value===select.value));b.onclick=()=>{select.value=opt.value;select.dispatchEvent(new Event('change',{bubbles:true}));paint()};grid.append(b)}}
 new MutationObserver(paint).observe(select,{childList:true,attributes:true,attributeFilter:['value']});purchase.addEventListener('click',()=>queueMicrotask(paint),true);select.addEventListener('change',paint);paint();}
// Spec open/close use the same full-surface swipe handler as other sheets.
const spec=()=>document.querySelector('#imamstoreLiveOriginalDetail #nineSpecOverlay');

// Existing v42 global touch manager handles all sheet surfaces; make its drag override compatible with spec CSS.
// The shared sheet touch controller handles specification gestures.

})();