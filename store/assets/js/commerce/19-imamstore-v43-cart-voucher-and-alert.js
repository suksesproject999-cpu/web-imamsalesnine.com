(()=>{'use strict';
const $=id=>document.getElementById(id),KEY='imamstore_cart_stage5',SEL='imamstore_cart_selection_v43',fmt=n=>'Rp'+Math.round(Number(n)||0).toLocaleString('id-ID');
const read=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}};
const selection=()=>{try{return JSON.parse(localStorage.getItem(SEL)||'{}')||{}}catch{return {}}};
const isSelected=k=>selection()[String(k)]!==false;
const writeSelection=map=>{try{localStorage.setItem(SEL,JSON.stringify(map))}catch{};sync()};
const selected=()=>read().filter(x=>isSelected(x.key));
const alertUI=(text,icon='info')=>window.Swal?.fire?window.Swal.fire({icon,text:String(text),confirmButtonColor:'#8cc63f',confirmButtonText:'OK',width:'min(90vw,410px)',customClass:{popup:'imamstore-swal-popup'}}):console.warn(text);
const money=n=>fmt(n);
const vouchers=[
 {id:'BELANJA50',name:'Voucher Belanja',description:'Potongan Belanja Rp5.000',type:'product_fixed',discount:5000,min:500000,maxDiscount:null,expired:'2026-12-31',icon:'fa-tags',limit:'1 Voucher / Akun'},
 {id:'DISKON10',name:'Diskon Produk 10%',description:'Diskon produk 10%',type:'product_percent',discount:10,min:100000,maxDiscount:500,expired:'2026-12-31',icon:'fa-percent',limit:'1 Voucher / Akun'},
 {id:'ONGKIR5',name:'Diskon Ongkir',description:'Potongan Ongkir Rp5.000',type:'shipping_fixed',discount:5000,min:500000,maxDiscount:null,expired:'2026-12-31',icon:'fa-truck',limit:'1 Voucher / Akun'}
];
const slotOf=v=>v?.type==='shipping_fixed'?'shipping':'product';
const voucherState={cart:{product:null,shipping:null},checkout:{product:null,shipping:null}};
const checkoutActive=()=>!!($('s5Draft')?.classList.contains('open')&&Array.isArray(window.__nexaiCheckoutLines));
const currentScope=()=>checkoutActive()?'checkout':'cart';
const activeVouchers=()=>voucherState[currentScope()];
const resetCheckoutVouchers=()=>{voucherState.checkout={product:null,shipping:null};};

const eligible=(v,sum)=>!!v&&sum>=Number(v.min||0)&&(!v.expired||Date.now()<=new Date(v.expired+'T23:59:59').getTime());
const voucherValue=(v,sum)=>{if(!eligible(v,sum))return 0;let d=v.type==='product_percent'?Math.floor(sum*Number(v.discount||0)/100):Number(v.discount||0);if(v.maxDiscount!=null)d=Math.min(d,Number(v.maxDiscount));return Math.max(0,Math.min(sum,Math.floor(d)))};
// Pricing Engine 5K: satu quote immutable untuk setiap permukaan transaksi.
const checkoutLines=()=>checkoutActive()?window.__nexaiCheckoutLines:null;
const validLines=lines=>(Array.isArray(lines)?lines:[]).map(x=>({
 ...x,qty:Math.max(1,Math.floor(Number(x.qty)||1)),
 harga:Math.max(0,Math.round(Number(x.harga)||0))
}));
const calculateQuote=(lines,voucherSelection)=>{
 const items=validLines(lines),count=items.reduce((n,x)=>n+x.qty,0);
 const subtotal=items.reduce((n,x)=>n+x.harga*x.qty,0);
 const pv=eligible(voucherSelection?.product,subtotal)?voucherSelection.product:null;
 const sv=eligible(voucherSelection?.shipping,subtotal)?voucherSelection.shipping:null;
 const productDiscount=Math.min(subtotal,voucherValue(pv,subtotal));
 // Ongkir belum diketahui: voucher ongkir bukan pengurang subtotal produk.
 const shippingDiscount=0;
 const shippingPotential=sv?voucherValue(sv,subtotal):0;
 return Object.freeze({count,subtotal,discount:productDiscount,productDiscount,
 shippingDiscount,shippingPotential,total:Math.max(0,subtotal-productDiscount),totalBayar:Math.max(0,subtotal-productDiscount),
 voucher:pv||sv,productVoucher:pv,shippingVoucher:sv,
 shippingPending:true});
};
const scopedQuote=(lines,scope)=>calculateQuote(lines,voucherState[scope]);
const reconcileVoucher=(scope,lines)=>{
 const state=voucherState[scope],quote=calculateQuote(lines,state);
 const removed=[];
 for(const slot of ['product','shipping']){
  if(state[slot]&&!quote[slot+'Voucher']){removed.push(state[slot].name||state[slot].id);state[slot]=null}
 }
 if(removed.length&&scope==='checkout'){
  const note=document.getElementById('nineVoucherReconcileNotice');
  if(note){note.textContent='Voucher tidak berlaku setelah perubahan pesanan: '+removed.join(', ');note.hidden=false}
 }
 return removed;
};
const cartTotals=()=>scopedQuote(selected(),'cart');
const checkoutTotals=()=>scopedQuote(checkoutLines()||[],'checkout');
const totals=(linesOverride)=>Array.isArray(linesOverride)?
 calculateQuote(linesOverride,checkoutActive()?voucherState.checkout:voucherState.cart):cartTotals();
function publishQuote(){
 const quote=checkoutActive()?checkoutTotals():cartTotals();
 window.__nineLatestQuote=quote;
 const n=Number(!!quote.productVoucher)+Number(!!quote.shippingVoucher);
 const label=n===2?'2 voucher dipilih ›':quote.shippingVoucher?'Voucher ongkir dipilih ›':quote.productVoucher?'Voucher produk dipilih ›':'Pilih voucher ›';
 const trigger=checkoutActive()?$('refCheckoutVoucherValue'):$('refVoucherSaved');
 if(trigger)trigger.textContent=label;
 window.dispatchEvent(new CustomEvent('imamstore:quote-updated',{detail:{scope:currentScope(),quote}}));
 return quote;
}
function modal(html,init){const m=document.querySelector('.ref-modal'),body=$('refModalContent');if(!m||!body)return;body.innerHTML=html;m.hidden=false;document.body.style.overflow='hidden';init?.(body)}
function close(){window.imamstoreReferenceV38?.closeModal?.()}
function terms(v){
 const amount=v.type==='product_percent'?v.discount+'%':money(v.discount);
 const shipping=slotOf(v)==='shipping';
 const validUntil=v.expired?new Date(v.expired+'T00:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}):'Tidak dibatasi';
 modal('<div class="v43-compact-sheet v43-terms-sheet">'+
 '<header class="v43-compact-head"><h2>Syarat & Ketentuan Voucher</h2><p>Rincian penggunaan voucher</p></header>'+
 '<div class="v43-compact-scroll"><div class="v43-terms-identity"><span class="v43-terms-icon"><i class="fa-solid '+v.icon+'" aria-hidden="true"></i></span><div><b id="v43TermsTitle"></b><small id="v43TermsDesc"></small></div></div>'+
 '<div class="v43-terms-grid"><div><small>Minimal belanja</small><strong id="v43TermsMinimum"></strong></div><div><small>Berlaku sampai</small><strong id="v43TermsExpiry"></strong></div><div><small>Potongan</small><strong id="v43TermsValue"></strong></div><div><small>Batas potongan</small><strong id="v43TermsMaximum"></strong></div></div>'+
 '<section class="v43-terms-notes"><h3>Ketentuan penggunaan</h3><p id="v43TermsLimit"></p><p>Maksimal satu voucher produk dan satu voucher ongkir dalam satu pesanan. Minimal belanja dihitung dari produk yang dipilih.</p><p id="v43TermsShipping"></p></section></div>'+
 '<footer class="v43-compact-foot"><button class="ref-green" id="v43TermsOk" type="button">Kembali ke Voucher</button></footer></div>',root=>{
  root.querySelector('#v43TermsTitle').textContent=v.name;
  root.querySelector('#v43TermsDesc').textContent=v.description;
  root.querySelector('#v43TermsMinimum').textContent=money(v.min);
  root.querySelector('#v43TermsExpiry').textContent=validUntil;
  root.querySelector('#v43TermsValue').textContent=amount;
  root.querySelector('#v43TermsMaximum').textContent=v.maxDiscount==null?'Tidak dicantumkan':money(v.maxDiscount);
  root.querySelector('#v43TermsLimit').textContent=v.limit||'Batas penggunaan tidak dicantumkan.';
  root.querySelector('#v43TermsShipping').textContent=shipping?'Voucher ongkir baru dihitung setelah admin menetapkan ongkos kirim. Potongan maksimal sebesar ongkir sebenarnya.':'Voucher produk mengurangi total produk yang memenuhi syarat.';
  root.querySelector('#v43TermsOk').onclick=openVoucher;
 });
}
function openVoucher(){
 const lines=checkoutActive()?checkoutLines():selected(),chosen=activeVouchers();
 const sum=lines.reduce((a,x)=>a+Number(x.harga||0)*Number(x.qty||0),0);
 modal('<div class="v43-compact-sheet v43-voucher-sheet">'+
 '<header class="v43-compact-head"><h2>Voucher & Promo</h2><p>Pilih satu voucher produk dan satu voucher ongkir.</p></header>'+
 '<div class="v43-compact-scroll"><div class="ref-v43-voucher-input"><input id="v43VoucherCode" placeholder="Masukkan kode voucher" autocomplete="off" aria-label="Kode voucher"><button type="button" id="v43VoucherApply">Pakai</button></div>'+
 '<div id="v43VoucherList"></div><p class="v43-compact-hint">Voucher ongkir yang dipilih menunggu perhitungan biaya kirim oleh admin. Total produk belum dikurangi ongkir.</p></div>'+
 '<footer class="v43-compact-foot"><span id="v43SelectionCount" role="status"></span><button class="ref-green" type="button" id="v43VoucherDone">Selesai</button></footer></div>',root=>{
  const selectedCount=Object.values(chosen).filter(Boolean).length;
  root.querySelector('#v43SelectionCount').textContent=selectedCount?selectedCount+' voucher dipilih':'Belum ada voucher dipilih';
  root.querySelector('#v43VoucherDone').onclick=close;
  const code=root.querySelector('#v43VoucherCode');
  const applyCode=()=>{
   const input=code.value.trim().toUpperCase(),v=vouchers.find(x=>x.id.toUpperCase()===input);
   if(!input){alertUI('Masukkan kode voucher terlebih dahulu.');return}
   if(!v){alertUI('Kode voucher tidak dikenal. Silakan pilih voucher yang tersedia.');return}
   if(!eligible(v,sum)){alertUI('Voucher belum memenuhi minimal belanja '+money(v.min)+' atau masa berlakunya telah habis.');return}
   chosen[slotOf(v)]=v;
   sync();window.imamstoreReferenceV38?.refresh?.();document.dispatchEvent(new Event('imamstore:quote-refresh'));openVoucher();
  };
  root.querySelector('#v43VoucherApply').onclick=applyCode;
  code.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyCode()}});
  const list=root.querySelector('#v43VoucherList');
  vouchers.forEach(v=>{
   const slot=slotOf(v),active=chosen[slot]?.id===v.id,ok=eligible(v,sum);
   const row=document.createElement('div');row.className='ref-v43-voucher v43-voucher-item'+(active?' is-selected':'')+(!ok?' is-disabled':'');
   row.innerHTML='<span class="ref-v43-voucher-icon"></span><div class="ref-v43-voucher-main"><b></b><small></small><span class="v43-voucher-state" aria-live="polite"></span></div><div class="ref-v43-voucher-actions"><button type="button" class="ref-v43-choose"></button><button type="button" class="ref-v43-terms">S&K</button></div>';
   row.querySelector('.ref-v43-voucher-icon').innerHTML='<i class="fa-solid '+v.icon+'" aria-hidden="true"></i>';
   const title=row.querySelector('b'); title.textContent=v.name+' · '+(v.type==='product_percent'?v.discount+'%':money(v.discount));
   const expiry=v.expired?new Date(v.expired+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}):'Tidak dibatasi';
   row.querySelector('small').textContent='Min. '+money(v.min)+' · Sampai '+expiry;
   const stateLabel=row.querySelector('.v43-voucher-state');
   stateLabel.textContent=active?(slot==='shipping'?'✓ Dipilih · Menunggu ongkir':'✓ Voucher produk aktif'):(!ok?(sum<Number(v.min||0)?'Belanja kurang '+money(Number(v.min||0)-sum):'Tidak berlaku'):'Tersedia untuk dipilih');
   const btn=row.querySelector('.ref-v43-choose');
   btn.textContent=active?'Batalkan':ok?'Gunakan':'Belum sesuai';btn.disabled=!ok&&!active;
   btn.setAttribute('aria-pressed',String(active));
   btn.setAttribute('aria-label',(active?'Batalkan':'Gunakan')+' '+v.name);
   btn.onclick=()=>{chosen[slot]=active?null:v;sync();window.imamstoreReferenceV38?.refresh?.();document.dispatchEvent(new Event('imamstore:quote-refresh'));openVoucher()};
   row.querySelector('.ref-v43-terms').onclick=()=>terms(v);
   list.append(row);
  });
 });
}
function openProduct(line){const id=String(line.id);const cart=$('s5Cart');cart?.classList.remove('open');document.body.classList.remove('stage4-detail-open');document.dispatchEvent(new CustomEvent('imamstore:open-product',{detail:{id}}));}
function sync(){const lines=read(),sel=selected(),all=lines.length>0&&sel.length===lines.length,count=sel.reduce((n,x)=>n+(Number(x.qty)||0),0);reconcileVoucher('cart',sel);const pricing=cartTotals();
 const wrap=$('s5CartItems');if(wrap){const rows=[...wrap.querySelectorAll('.imam-cart-product')];rows.forEach((row,i)=>{const c=row.querySelector('.ref-v42-select');const rowKey=c?.dataset.cartKey||row.dataset.cartKey;const x=(rowKey?lines.find(item=>String(item.key)===String(rowKey)):null)||lines[i];if(!x)return;if(c){c.checked=isSelected(x.key);c.dataset.cartKey=String(x.key);
 c.onchange=event=>{
  event.stopPropagation();
  const map=selection();
  map[String(x.key)]=c.checked;
  writeSelection(map);
 };
 c.onclick=event=>event.stopPropagation();}row.classList.toggle('ref-v43-unchecked',!isSelected(x.key));const image=row.querySelector(':scope > img'),name=row.querySelector('h3');for(const target of [image,name])if(target){target.tabIndex=0;target.setAttribute('role','link');target.onclick=()=>openProduct(x);target.onkeydown=e=>{if(e.key==='Enter')openProduct(x)}}})}
 const allBox=$('refCartSelectAll');if(allBox){allBox.checked=all;allBox.indeterminate=sel.length>0&&!all;allBox.onchange=()=>{const m=selection();lines.forEach(x=>m[String(x.key)]=allBox.checked);writeSelection(m)}};
 const total=$('s5CartTotal');if(total)total.textContent='Total '+money(pricing.total);const totalQty=lines.reduce((n,x)=>n+Math.max(0,Number(x.qty)||0),0);const badge=$('refCartCount');if(badge)badge.textContent='('+totalQty+')';for(const id of ['nineHeaderCartCount','s4CartCount']){const detailBadge=$(id);if(detailBadge){detailBadge.textContent=String(totalQty);detailBadge.hidden=totalQty===0;}}const savings=$('refCartSavings');if(savings)savings.textContent=[pricing.discount?'Hemat '+money(pricing.discount):'',pricing.shippingVoucher?'Voucher ongkir dipilih':''].filter(Boolean).join(' · ');const btn=$('s5Checkout');if(btn){btn.textContent='Checkout ('+count+')';btn.disabled=count===0}publishQuote(); }
// Selection events are handled exclusively by the checkbox onchange in sync().
// Cart, checkout and detail route to this voucher sheet; original voucher policy is not yet restored.
window.nineOpenOriginalVoucher=openVoucher;window.imamstoreOpenVoucherSheet=openVoucher;
for(const id of ['refCartVoucher','refCheckoutVoucher']){const el=$(id);if(el)el.onclick=e=>{e.preventDefault();openVoucher()}}
// Convert browser alerts from older handlers to SweetAlert2 where available.
// Browser alert is not monkey-patched globally.
const cart=$('s5CartItems');if(cart){new MutationObserver(()=>queueMicrotask(sync)).observe(cart,{childList:true});}
window.addEventListener('storage',sync);document.addEventListener('imamstore:open-product',()=>queueMicrotask(sync));document.addEventListener('imamstore:cart-changed',sync);
window.imamstoreV43=Object.freeze({
 isSelected,selected,openVoucher,sync,cartVoucherSelection:()=>({...voucherState.cart}),
 getVoucher:()=>checkoutActive()?checkoutTotals().voucher:cartTotals().voucher,
 getVouchers:()=>{const q=checkoutActive()?checkoutTotals():cartTotals();return {product:q.productVoucher,shipping:q.shippingVoucher}},
 totals:cartTotals,cartTotals,checkoutTotals,calculateQuote,
 resetCheckoutVouchers,beginCheckout:(mode)=>{resetCheckoutVouchers();
 if(mode==='cart'){
  const quote=cartTotals();
  voucherState.checkout={product:quote.productVoucher,shipping:quote.shippingVoucher};
 }
 reconcileVoucher('checkout',window.__nexaiCheckoutLines||[]);
 return calculateQuote(window.__nexaiCheckoutLines||[],voucherState.checkout);
},
 commitCheckoutItems:(lines)=>{
  if(!checkoutActive()||!Array.isArray(lines)||!lines.length)return false;
  // Jangan commit sebagian bila ada harga/qty tidak sah.
  if(lines.some(x=>!Number.isSafeInteger(Number(x.qty))||Number(x.qty)<1||Number(x.qty)>999||
    !Number.isSafeInteger(Number(x.harga))||Number(x.harga)<=0||
    !String(x.id||'').trim()||!String(x.varian||'').trim()))return false;
  const snapshot=lines.map(x=>({...x,qty:Number(x.qty),harga:Number(x.harga)}));
  // Cart-origin checkout must update the same cart line, not leave an obsolete variant behind.
  // Direct Buy Now checkout must never insert its item into the cart.
  if(window.__nexaiCheckoutMode==='cart'){
   const cartBefore=read();
   const selectedBefore=checkoutLines()||[];
   const nextCart=cartBefore.map(x=>({...x}));
   const selectionMap=selection();
   for(let i=0;i<snapshot.length;i++){
    const before=selectedBefore[i],after=snapshot[i];
    if(!before||String(before.id)!==String(after.id))return false;
    const oldIndex=nextCart.findIndex(x=>String(x.key)===String(before.key));
    if(oldIndex<0)return false;
    const newKey=String(after.id)+'|'+String(after.varian);
    const duplicate=nextCart.findIndex((x,j)=>j!==oldIndex&&String(x.key)===newKey);
    // Do not silently merge selected and unselected lines, which changes checkout quantities.
    if(duplicate>=0)return false;
    nextCart[oldIndex]={...nextCart[oldIndex],varian:after.varian,qty:after.qty,harga:after.harga,key:newKey};
    if(String(before.key)!==newKey){
     selectionMap[newKey]=selectionMap[String(before.key)]!==false;
     delete selectionMap[String(before.key)];
    }
   }
   try{
    localStorage.setItem(KEY,JSON.stringify(nextCart));
    localStorage.setItem(SEL,JSON.stringify(selectionMap));
    window.__nexaiCoreRenderCart?.();
    window.imamstoreV43?.sync?.();
    document.dispatchEvent(new CustomEvent('nine:cartchange',{detail:{source:'checkout-variant-sync'}}));
   }catch(err){console.error('Checkout/cart sync failed',err);return false}
  }
  window.__nexaiCheckoutLines=snapshot;
  reconcileVoucher('checkout',snapshot);
  document.dispatchEvent(new CustomEvent('imamstore:checkout-variant-updated',{detail:{items:snapshot}}));
  window.dispatchEvent(new CustomEvent('imamstore:checkout-variant-updated',{detail:{items:snapshot}}));
  return true;
 },
 endCheckout:()=>{resetCheckoutVouchers();publishQuote()},
 publishQuote,transactionsActive:true
});sync();
})();