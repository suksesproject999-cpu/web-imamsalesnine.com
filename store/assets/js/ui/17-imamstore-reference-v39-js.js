
(()=>{'use strict';
const $=id=>document.getElementById(id),money=n=>'Rp'+Math.round(Number(n)||0).toLocaleString('id-ID');
const KEY='imamstore_cart_stage5',ADDR='imamstore_ref_addresses_v38';
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')||[]}catch{return []}};
const products=()=>{try{return typeof window.imamstoreV29?.products==='function'?window.imamstoreV29.products():[]}catch{return []}};
let selectedAddress=null,cartEdit=false,modalReturnFocus=null;
const modal=document.createElement('div');modal.className='ref-modal';modal.hidden=true;modal.innerHTML='<div class="ref-modal-panel" role="dialog" aria-modal="true"><div class="ref-drag-handle" aria-hidden="true"></div><button class="ref-modal-close" aria-label="Tutup">×</button><div id="refModalContent"></div></div>';document.body.append(modal);
function closeModal(){modal.hidden=true;modal.classList.remove('ref-fullpage');modal.querySelector('.ref-modal-panel').style.transform='';document.body.style.removeProperty('overflow');if(modalReturnFocus?.isConnected)modalReturnFocus.focus()}
function showModal(html,init){modalReturnFocus=document.activeElement;$('refModalContent').innerHTML=html;modal.hidden=false;document.body.style.overflow='hidden';if(init)init($('refModalContent'))}
modal.querySelector('.ref-modal-close').onclick=closeModal;modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)closeModal()});
function swipeSheet(panel,close){
 const handle=panel.querySelector('.ref-drag-handle')||panel;
 let start=null,dy=0,active=false;
 handle.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0];start={y:t.clientY,x:t.clientX,time:performance.now()};dy=0;active=false;panel.style.transition='none'},{passive:true});
 handle.addEventListener('touchmove',e=>{if(!start||e.touches.length!==1)return;const t=e.touches[0],dx=t.clientX-start.x;dy=t.clientY-start.y;if(dy>0&&Math.abs(dy)>Math.abs(dx)*1.25){active=true;panel.style.transform='translate3d(0,'+Math.min(dy,window.innerHeight)+'px,0)'}},{passive:true});
 function finish(){if(!start)return;const elapsed=Math.max(1,performance.now()-start.time),dismiss=active&&(dy>110||(dy>55&&dy/elapsed>.55));panel.style.transition='transform .24s cubic-bezier(.2,.8,.2,1)';if(dismiss){panel.style.transform='translate3d(0,100%,0)';setTimeout(()=>{close();panel.style.transform=''},240)}else panel.style.transform='';start=null;dy=0;active=false}
 handle.addEventListener('touchend',finish,{passive:true});handle.addEventListener('touchcancel',finish,{passive:true});
}
swipeSheet(modal.querySelector('.ref-modal-panel'),closeModal);
// Swipe panel pembelian dikelola sekali oleh v42 whole-sheet controller.
// Tidak lagi dipasang handler swipe pembelian kedua di sini.
function currentSum(){
 const lines=read().filter(x=>window.imamstoreV43?.isSelected?.(x.key)!==false);
 return {count:lines.reduce((n,x)=>n+Math.max(0,Number(x.qty)||0),0),sum:lines.reduce((n,x)=>n+Math.max(0,Number(x.qty)||0)*Math.max(0,Number(x.harga)||0),0)};
}
function orderTotals(){
 const t=window.imamstoreV43?.totals?.();
 if(t)return {count:t.count,sum:t.subtotal,discount:t.discount,total:t.total,voucher:t.voucher};
 const {count,sum}=currentSum();return {count,sum,discount:0,total:sum,voucher:null};
}
function voucherSummaryLabel(q){
 const n=Number(!!q?.productVoucher)+Number(!!q?.shippingVoucher);
 if(!n)return 'Pilih voucher ›';
 return n===2?'2 voucher dipilih ›':q.shippingVoucher?'Voucher ongkir dipilih ›':'Voucher produk dipilih ›';
}
function refreshCart(){
 const q=window.imamstoreV43?.cartTotals?.();
 const {count,discount,total}=q?{count:q.count,discount:q.productDiscount,total:q.total}:orderTotals();
 $('refVoucherSaved').textContent=q?voucherSummaryLabel(q):(discount?'Hemat '+money(discount)+' ›':'Pilih voucher ›');
 $('refCartCount').textContent='('+count+')';
 $('s5CartTotal').textContent='Total '+money(total);
 $('s5Checkout').textContent='Checkout ('+count+')';
 $('refCartSavings').textContent=[discount?'Hemat '+money(discount):'',q?.shippingVoucher?'Voucher ongkir dipilih':''].filter(Boolean).join(' · ');
 window.imamstoreUnifiedCards?.refresh?.();
}
function checkoutVoucherBreakdown(q){
 const breakdown=document.querySelector('#s5Draft .ref-order-breakdown');if(!breakdown)return;
 const shippingRow=[...breakdown.children].find(el=>el.textContent.includes('Ongkos Kirim'));
 if(!shippingRow)return;
 const ensure=(id,label)=>{let row=breakdown.querySelector('#'+id);if(!row){row=document.createElement('div');row.id=id;const l=document.createElement('span'),r=document.createElement('b');l.textContent=label;row.append(l,r);breakdown.insertBefore(row,shippingRow)}return row.querySelector('b')};
 ensure('refCheckoutVoucherProductLabel','Voucher produk').textContent=q.productVoucher?.name||'Tidak dipilih';
 ensure('refCheckoutVoucherShippingLabel','Voucher ongkir').textContent=q.shippingVoucher?.name||'Tidak dipilih';
 ensure('refCheckoutShippingPotential','Potensi potongan ongkir').textContent=q.shippingVoucher?'Hingga '+money(q.shippingPotential||0):money(0);
 let note=breakdown.querySelector('#refCheckoutShippingDisclaimer');
 if(!note){note=document.createElement('p');note.id='refCheckoutShippingDisclaimer';note.className='v43-checkout-shipping-note';breakdown.insertBefore(note,breakdown.querySelector('.ref-total'))}
 note.textContent=q.shippingVoucher?'Voucher ongkir dipilih. Potongan aktual dihitung setelah admin menetapkan biaya kirim, maksimal sebesar ongkir.':'Ongkos kirim dihitung admin dan belum termasuk total belanja.';
}
function refreshCheckout(){
 const quote=window.imamstoreV43?.checkoutTotals?.();if(!quote)return;
 const {count,subtotal:sum,productDiscount:discount,total}=quote;
 $('refCheckoutCount').textContent=count;
 $('refCheckoutSubtotal').textContent=money(sum);
 $('refCheckoutDiscount').textContent=discount?'- '+money(discount):money(0);
 $('s5DraftTotal').textContent=money(total);
 $('refCheckoutFooterTotal').textContent=money(total);
 $('refCheckoutVoucherValue').textContent=voucherSummaryLabel(quote);
 checkoutVoucherBreakdown(quote);
 $('refAddressTitle').textContent=selectedAddress?selectedAddress.name:' + Tambahkan Alamat';
 $('refAddressSummary').textContent=selectedAddress?selectedAddress.full:'Tambahkan alamat pengiriman sebelum membuat pesanan.';
}
document.addEventListener('imamstore:quote-refresh',()=>{if($('s5Draft')?.classList.contains('open'))refreshCheckout();else refreshCart()});
window.addEventListener('imamstore:checkout-variant-updated',()=>{refreshCheckout()});
const cartObserver=new MutationObserver(()=>{if($('s5Cart').classList.contains('open'))refreshCart()});cartObserver.observe($('s5CartItems'),{childList:true});
const draftObserver=new MutationObserver(()=>{if($('s5Draft').classList.contains('open'))refreshCheckout()});draftObserver.observe($('s5DraftItems'),{childList:true});
/* Cart edit controlled by unified cart controller v54. */
$('refCartChat').onclick=()=>{const message='Halo Imam Sales Nine, saya ingin bertanya tentang produk di keranjang.';window.open('https://wa.me/?text='+encodeURIComponent(message),'_blank','noopener,noreferrer')};
// Select-all behavior is owned by the selection controller.
// Voucher sheet and rules are owned by the selection/pricing controller.
// Voucher buttons are owned by the v43 voucher controller only.
function getAddresses(){try{return JSON.parse(localStorage.getItem(ADDR)||'[]')}catch{return []}}
function saveAddresses(a){try{localStorage.setItem(ADDR,JSON.stringify(a))}catch{}}
function addressForm(editIndex=-1){
 const old=editIndex>=0?getAddresses()[editIndex]||{}:{};
 showModal('<h2>'+(editIndex>=0?'Ubah Alamat':'Alamat Baru')+'</h2><form id="refAddressForm"><label>Nama lengkap<input name="name" required maxlength="160" autocomplete="name"></label><label>Nomor WhatsApp<input name="phone" type="tel" required inputmode="tel" maxlength="30" placeholder="08xxxxxxxxxx" autocomplete="tel"></label><label>Provinsi<input name="province" required maxlength="150"></label><label>Kota / Kabupaten<input name="city" required maxlength="150"></label><label>Kecamatan<input name="district" required maxlength="150"></label><label>Kode Pos<input name="postal" inputmode="numeric" required minlength="5" maxlength="5" pattern="[0-9]{5}"></label><label>Jalan / Nomor Rumah<textarea name="street" required maxlength="1400"></textarea></label><label>Detail / Patokan (opsional)<textarea name="landmark" maxlength="200"></textarea></label><label>Label Alamat<select name="label"><option>Rumah</option><option>Kantor</option><option>Lainnya</option></select></label><label><input type="checkbox" name="primary" style="width:auto"> Jadikan alamat utama</label><div id="refAddressFormError" role="alert" aria-live="polite" style="font-size:13px;color:#ae293d;line-height:1.5" hidden></div><button class="ref-green" type="submit">Simpan Alamat</button></form>',root=>{
  const form=root.querySelector('#refAddressForm');
  Object.entries(old).forEach(([key,val])=>{if(form.elements.namedItem(key)&&key!=='primary')form.elements.namedItem(key).value=val??''});
  if(editIndex>=0)form.elements.namedItem('primary').checked=!!(selectedAddress&&(selectedAddress.full===old.full));
  form.onsubmit=e=>{
   e.preventDefault();
   const d=Object.fromEntries(new FormData(form));
   const issues=window.imamstoreCustomerCheckoutR7?.validateDraftAddress(d)||[];
   if(issues.length){
    const box=root.querySelector('#refAddressFormError');
    if(box){box.hidden=false;box.textContent=issues.join(' ')}
    const fieldOrder=['name','phone','province','city','district','postal','street'];
    const target=fieldOrder.map(k=>form.elements.namedItem(k)).find(el=>el&&(!String(el.value||'').trim()||!el.checkValidity()));
    (target||box)?.focus?.();
    return;
   }
   const a={...d,full:[d.street,d.district,d.city,d.province,d.postal].map(v=>String(v||'').trim()).filter(Boolean).join(', ')};
   const all=getAddresses();
   if(editIndex>=0&&editIndex<all.length)all[editIndex]=a;else all.push(a);
   saveAddresses(all);selectedAddress=a;closeModal();refreshCheckout();
   const warn=$('refCheckoutWarning');if(warn)warn.textContent='Alamat pengiriman tersimpan. Periksa rincian pesanan sebelum melanjutkan.';
   window.imamstoreToast?.('Alamat berhasil disimpan.','success');
  };
 });
 modal.classList.add('ref-fullpage');
}
function addressList(){const all=getAddresses();showModal('<h2>Alamat Saya</h2><div id="refAddressList"></div><button class="ref-green" id="refAddressAdd">+ Tambah Alamat</button>',root=>{
 const list=root.querySelector('#refAddressList');
 all.forEach((a,index)=>{
  const wrap=document.createElement('div');wrap.style.cssText='display:flex;align-items:stretch;gap:7px;margin-bottom:10px';
  const b=document.createElement('button');b.type='button';b.style.cssText='flex:1;min-width:0;background:#f6f9f2;border:1px solid #e0e8d7;padding:13px;border-radius:12px;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere';
  b.textContent=(a.name||a.nama||'Penerima')+' · '+(a.phone||a.wa||'')+'\n'+(a.full||'');
  b.onclick=()=>{selectedAddress=a;closeModal();refreshCheckout()};
  const edit=document.createElement('button');edit.type='button';edit.textContent='Ubah';edit.style.cssText='color:#65942d;background:#fff;border:1px solid #d7e8c8;border-radius:10px;padding:0 12px;font-weight:700';edit.setAttribute('aria-label','Ubah alamat penerima');edit.onclick=()=>addressForm(index);
  wrap.append(b,edit);list.append(wrap);
 });
 root.querySelector('#refAddressAdd').onclick=()=>addressForm(-1);
});modal.classList.add('ref-fullpage')}
window.imamstoreOpenAddressEditorR7=()=>{
 const all=getAddresses();
 const summary=$('refAddressSummary')?.textContent?.trim()||'';
 const index=all.findIndex(a=>a&&a.full&&(a.full===summary||summary.includes(a.full)));
 addressForm(index);
};
$('refAddressOpen').onclick=addressList;
function breakdown(){
 const cartOpen=document.getElementById('s5Cart')?.classList.contains('open');const quote=cartOpen?window.imamstoreV43?.cartTotals?.():window.imamstoreV43?.checkoutTotals?.();
 const {count,sum,discount,total,voucher}=quote?{count:quote.count,sum:quote.subtotal,discount:quote.productDiscount,total:quote.total,voucher:quote.productVoucher}:orderTotals();
 showModal('<h2>Rincian Pesanan</h2><div id="refBreakdownLines"></div><p style="color:#777;font-size:13px">Total sementara belum termasuk ongkos kirim. Ongkir dikonfirmasi admin.</p>',root=>{
  for(const [a,b] of [['Subtotal '+count+' produk',money(sum)],['Voucher produk',quote?.productVoucher?.name||voucher?.name||'Tidak dipilih'],['Diskon produk',discount?'- '+money(discount):money(0)],['Voucher ongkir',quote?.shippingVoucher?.name||'Tidak dipilih'],['Potensi potongan ongkir',quote?.shippingVoucher?'Hingga '+money(quote.shippingPotential||0)+' (menunggu admin)':money(0)],['Ongkos kirim','Dihitung Admin'],['Total sementara (belum ongkir)',money(total)]]){
   const line=document.createElement('div');line.style.cssText='display:flex;justify-content:space-between;gap:8px;padding:15px 0;border-bottom:1px solid #eee';
   const left=document.createElement('span'),right=document.createElement('b');left.textContent=a;right.textContent=b;line.append(left,right);root.querySelector('#refBreakdownLines').append(line);
  }
 });
}
$('refOrderBreakdown').onclick=breakdown;const cartBreakdown=$('refCartBreakdown');if(cartBreakdown)cartBreakdown.onclick=breakdown;
$('refTermsOpen').onclick=()=>showModal('<h2>Syarat &amp; Ketentuan</h2>'+document.querySelector('#s5Draft .ref-original-terms').outerHTML+'<button class="ref-green" id="refTermsDone">OK</button>',root=>root.querySelector('#refTermsDone').onclick=closeModal);
$('refTermsBody').onchange=e=>{$('refTermsFooter').checked=e.target.checked};$('refTermsFooter').onchange=e=>{$('refTermsBody').checked=e.target.checked};

const originalOpen=window.imamstoreCartBridge?.openCart;
const activate=()=>{refreshCart();refreshCheckout()};
const cart=$('s5Cart'),draft=$('s5Draft');new MutationObserver(activate).observe(cart,{attributes:true,attributeFilter:['class']});new MutationObserver(activate).observe(draft,{attributes:true,attributeFilter:['class']});
activate();window.imamstoreReferenceV38=Object.freeze({refresh:activate,closeModal});
})();
