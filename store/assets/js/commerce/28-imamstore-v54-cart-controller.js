(()=>{'use strict';
/* Pengendali tunggal mode edit pada keranjang Stage5. Tanpa aksi geser card. */
const $=id=>document.getElementById(id),cart=$('s5Cart'),edit=$('refCartEdit'),footer=cart?.querySelector('.ref-cart-footer'),row=footer?.querySelector('.ref-cart-checkout-row');
if(!cart||!edit||!footer||!row)return;
const KEY='imamstore_cart_stage5',SEL='imamstore_cart_selection_v43';
let editing=false;
const read=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}};
const selection=()=>{try{return JSON.parse(localStorage.getItem(SEL)||'{}')||{}}catch{return {}}};
const selected=()=>read().filter(x=>selection()[String(x.key)]!==false);
const persist=lines=>{localStorage.setItem(KEY,JSON.stringify(lines));window.imamstoreV43?.sync?.();window.imamstoreReferenceV38?.refresh?.();window.imamstoreRefreshCartBadge?.();document.dispatchEvent(new Event('nine:cartchange'));};
const actions=document.createElement('div');actions.className='v100-edit-actions';
actions.innerHTML='<button type="button" class="v100-favorite">Favoritkan</button><button type="button" class="v100-delete">Hapus</button>';
row.append(actions);
function paint(){
 if(!cart.classList.contains('open'))editing=false;
 edit.textContent=editing?'Selesai':'Ubah';
 cart.classList.toggle('v100-editing',editing);
 footer.classList.toggle('v100-editing',editing);
 const disabled=!selected().length;
 actions.querySelectorAll('button').forEach(x=>x.disabled=disabled);
 // Hilangkan seluruh tombol geser/aksi lama dari card; Ubah varian tetap tersedia.
 // Kontrol aksi card tidak lagi dihapus pada setiap render sticky.
}
edit.addEventListener('click',()=>{editing=!editing;paint()});
$('s5CartBack')?.addEventListener('click',()=>{editing=false;paint()},true);
document.addEventListener('imamstore:open-cart',()=>{editing=false;queueMicrotask(paint)});
document.addEventListener('click',e=>{if(e.target.closest('#s5Cart'))return;if(editing&&cart.classList.contains('open'))return;if(editing){editing=false;paint()}},true);
actions.querySelector('.v100-favorite').onclick=async()=>{
 const ids=[...new Set(selected().map(x=>String(x.id??'')).filter(Boolean))];if(!ids.length)return;
 const button=actions.querySelector('.v100-favorite');button.disabled=true;
 try{
  const result=await window.imamstoreWishlist?.addMany(ids);
  window.imamstoreCartToast?.(!result?.ok
   ?'Sebagian favorit belum tersimpan. Periksa koneksi atau sesi akun.'
   :result.added?result.added+' produk ditambahkan ke Favorit':'Produk terpilih sudah di Favorit');
 }finally{paint()}
};
actions.querySelector('.v100-delete').onclick=async()=>{
 const lines=selected();if(!lines.length)return;
 const confirm=window.Swal?.fire?await window.Swal.fire({target:cart,title:'Hapus produk terpilih?',text:lines.length+' produk akan dihapus dari keranjang.',icon:'warning',showCancelButton:true,confirmButtonText:'Hapus',cancelButtonText:'Batal',confirmButtonColor:'#8cc63f'}):{isConfirmed:window.confirm('Hapus '+lines.length+' produk terpilih?')};
 if(!confirm?.isConfirmed)return;
 const keys=new Set(lines.map(x=>String(x.key)));persist(read().filter(x=>!keys.has(String(x.key))));
 editing=false;paint();window.imamstoreCartToast?.(lines.length+' produk dihapus dari keranjang');
};
const observer=new MutationObserver(()=>{if(!cart.classList.contains('open')){if(editing){editing=false;paint()}return;}paint()});
observer.observe(cart,{attributes:true,attributeFilter:['class']});
const items=$('s5CartItems');if(items){const listObserver=new MutationObserver(()=>queueMicrotask(paint));listObserver.observe(items,{childList:true});}
window.imamstoreV54=Object.freeze({refresh:paint,edit:v=>{editing=!!v;paint()}});
paint();
})();