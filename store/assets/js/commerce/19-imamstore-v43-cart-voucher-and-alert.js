(()=>{'use strict';
const $=id=>document.getElementById(id),KEY='imamstore_cart_stage5',SEL='imamstore_cart_selection_v43',fmt=n=>'Rp'+Math.round(Number(n)||0).toLocaleString('id-ID');
const read=()=>{try{const x=window.imamstoreCartBridge?.getLines?.()||JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}};
const selection=()=>{try{return JSON.parse(localStorage.getItem(SEL)||'{}')||{}}catch{return {}}};
const isSelected=k=>selection()[String(k)]!==false;
const writeSelection=map=>{try{localStorage.setItem(SEL,JSON.stringify(map))}catch{};sync()};
const selected=()=>read().filter(x=>isSelected(x.key));
// One unobtrusive in-sheet notice replaces blocking browser and SweetAlert dialogs.
// Only fixed customer-facing copy is passed here; backend and SDK messages stay in logs.
function voucherUiStyle(){
 if(document.getElementById('imamVoucherUxStyle'))return;
 const style=document.createElement('style');style.id='imamVoucherUxStyle';
 style.textContent=`
 .v43-voucher-sheet #v43VoucherFeedback{margin:0 0 12px;padding:12px 14px;border-radius:12px;background:#fff6ec;border:1px solid #f3d6b9;color:#76441d;font-size:13px;line-height:1.5;outline-offset:2px}
 .v43-voucher-sheet #v43VoucherFeedback[data-kind="success"]{background:#f2f9e9;border-color:#bcdba3;color:#395e20}
 .v43-voucher-sheet #v43VoucherFeedback[hidden]{display:none}
 #imamVoucherToast{position:fixed;left:50%;bottom:calc(98px + env(safe-area-inset-bottom,0px));transform:translate(-50%,12px);width:max-content;max-width:min(92vw,460px);padding:11px 15px;border-radius:13px;background:#29352a;color:#fff;box-shadow:0 10px 28px rgba(0,0,0,.22);z-index:2147483200;font-size:13px;font-weight:600;line-height:1.45;opacity:0;pointer-events:none;transition:transform .2s ease,opacity .2s ease;text-align:center}
 #imamVoucherToast.is-visible{opacity:1;transform:translate(-50%,0)}
 #imamVoucherToast[data-kind="error"]{background:#493523}
 #imamVoucherToast::before{content:"✓";display:inline-block;margin-right:7px}
 #imamVoucherToast[data-kind="error"]::before{content:"!"}
 .v43-voucher-sheet .ref-v43-choose,.v43-voucher-sheet #v43VoucherApply,.v43-voucher-sheet #v43VoucherDone,.v43-voucher-sheet .ref-v43-terms{min-height:42px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:background-color .16s ease,transform .12s ease,box-shadow .16s ease,opacity .16s ease}
 @media(hover:hover){.v43-voucher-sheet .ref-v43-choose:not(:disabled):hover,.v43-voucher-sheet #v43VoucherApply:not(:disabled):hover,.v43-voucher-sheet #v43VoucherDone:not(:disabled):hover{filter:brightness(.96);box-shadow:0 2px 10px rgba(40,70,19,.14)}}
 .v43-voucher-sheet .ref-v43-choose:not(:disabled):active,.v43-voucher-sheet #v43VoucherApply:not(:disabled):active,.v43-voucher-sheet #v43VoucherDone:not(:disabled):active{transform:scale(.96);filter:brightness(.91)}
 .v43-voucher-sheet button:focus-visible{outline:3px solid #8cc63f;outline-offset:3px}
 .v43-voucher-sheet button:disabled{cursor:not-allowed;opacity:.65}
 .v43-voucher-sheet .v43-voucher-state{display:block;line-height:1.45;max-width:100%;overflow-wrap:anywhere}
 .v43-voucher-sheet .ref-v43-choose.is-verifying,.v43-voucher-sheet #v43VoucherApply.is-verifying{display:inline-flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap}
 .v43-voucher-sheet .is-verifying::before{content:"";display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:imamVoucherSpin .8s linear infinite}
 @keyframes imamVoucherSpin{to{transform:rotate(360deg)}}
 @media(prefers-reduced-motion:reduce){.v43-voucher-sheet button{transition:none}.v43-voucher-sheet .is-verifying::before{animation-duration:1.6s}}
 `;
 (document.head||document.documentElement).append(style);
}
let voucherToastTimer=null;
function voucherFeedback(text,kind='error'){
 const node=document.getElementById('v43VoucherFeedback');
 if(!node)return;
 node.textContent=String(text||'');node.dataset.kind=kind;node.hidden=!text;
 node.setAttribute('role',kind==='error'?'alert':'status');
 if(!text)return;
 if(kind==='error'){node.setAttribute('tabindex','-1');node.focus({preventScroll:true})}
 let toast=document.getElementById('imamVoucherToast');
 if(!toast){toast=document.createElement('div');toast.id='imamVoucherToast';toast.setAttribute('aria-hidden','true');document.body.append(toast)}
 toast.textContent=String(text);toast.dataset.kind=kind;
 if(voucherToastTimer)clearTimeout(voucherToastTimer);
 toast.classList.add('is-visible');
 voucherToastTimer=setTimeout(()=>{toast.classList.remove('is-visible');voucherToastTimer=null},3600);
}
function alertUI(text){voucherFeedback(text,'error')}
// Read-only per-account balance; checkout quote/create remain authoritative.
// No quota is stored in localStorage and no technical backend message reaches customers.
let voucherUsageSequence=0;
async function refreshVoucherUsage(root,subtotal,selectedVouchers){
 const id=++voucherUsageSequence;
 const rows=[...root.querySelectorAll('[data-voucher-code]')];
 const auth=window.firebase?.auth?.(),user=auth?.currentUser;
 const update=(row,text,enabled)=>{
  if(!root.isConnected||id!==voucherUsageSequence)return;
  const label=row.querySelector('.v43-voucher-state'),btn=row.querySelector('.ref-v43-choose');
  if(label)label.textContent=text;
  if(btn){btn.disabled=!enabled;btn.dataset.allowed=String(enabled)}
 };
 if(!user||user.isAnonymous){
  for(const row of rows)update(row,'Masuk untuk melihat jatah voucher',row.dataset.eligible==='true');
  return;
 }
 try{
  const token=await voucherDeadline(user.getIdToken());
  if(!token)throw new Error('NO_TOKEN');
  const response=await voucherDeadline(fetch(voucherApi,{method:'POST',
   headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
   body:JSON.stringify({action:'voucher_status'}),cache:'no-store',credentials:'same-origin'}));
  const body=await voucherDeadline(response.json());
  if(!response.ok||body?.success!==true||!body?.vouchers)throw new Error('STATUS_UNAVAILABLE');
  for(const row of rows){
   const v=vouchers.find(x=>x.id===row.dataset.voucherCode);if(!v)continue;
   const quota=body.vouchers[v.id];
   const selected=row.dataset.isActive==='true';
   const minOk=subtotal>=v.min;
   const timeOk=Date.now()<=Date.parse(v.expired+'T23:59:59.999+07:00');
   if(!quota||!Number.isSafeInteger(quota.remaining))throw new Error('BAD_BALANCE');
   const available=Math.max(0,quota.remaining),limit=Math.max(0,quota.limit),used=Math.max(0,quota.used),held=Math.max(0,quota.reserved);
   const actionAllowed=selected||(available>0&&minOk&&timeOk);
   let label;
   if(!timeOk||quota.status==='expired')label='Masa berlaku voucher berakhir';
   else if(available===0&&held>0)label='Jatah penuh · '+used+' sudah dipakai, '+held+' sedang digunakan pada pesanan';
   else if(available===0)label='Sudah digunakan '+used+' dari '+limit+' kali';
   else if(!minOk)label='Tambah belanja '+money(v.min-subtotal)+' · Sisa '+available+' dari '+limit;
   else if(held>0)label='Sedang digunakan pada '+held+' pesanan · Sisa '+available+' dari '+limit;
   else label='Tersedia '+available+' dari '+limit+' penggunaan';
   if(quota.saved===true)label='✓ Disimpan · '+label;
   if(selected)label='✓ Dipilih · '+label;
   update(row,label,actionAllowed);
  }
 }catch(err){
  // No invented "5 left" claim when a network/auth read fails.
  for(const row of rows){
   const active=row.dataset.isActive==='true';
   const canTry=row.dataset.eligible==='true';
   update(row,(active?'✓ Dipilih · ':'')+'Jatah belum dapat ditampilkan. Pemeriksaan dilakukan saat digunakan.',active||canTry);
  }
 }
}

const money=n=>fmt(n);
const vouchers=[
 {id:'BELANJA50',name:'Voucher Belanja',description:'Potongan Belanja Rp5.000',type:'product_fixed',discount:5000,min:500000,maxDiscount:null,expired:'2026-12-31',icon:'fa-tags',limit:'Maksimal 5 penggunaan per akun'},
 {id:'DISKON10',name:'Diskon Produk 10%',description:'Diskon produk 10%',type:'product_percent',discount:10,min:100000,maxDiscount:500,expired:'2026-12-31',icon:'fa-percent',limit:'Maksimal 5 penggunaan per akun'},
 {id:'ONGKIR5',name:'Diskon Ongkir',description:'Potongan Ongkir Rp5.000',type:'shipping_fixed',discount:5000,min:500000,maxDiscount:null,expired:'2026-12-31',icon:'fa-truck',limit:'Maksimal 5 penggunaan per akun'}
];
const slotOf=v=>v?.type==='shipping_fixed'?'shipping':'product';
const voucherState={cart:{product:null,shipping:null},checkout:{product:null,shipping:null}};
const checkoutActive=()=>!!($('s5Draft')?.classList.contains('open')&&Array.isArray(window.__nexaiCheckoutLines));
const currentScope=()=>checkoutActive()?'checkout':'cart';
const activeVouchers=()=>voucherState[currentScope()];
const resetCheckoutVouchers=()=>{voucherState.checkout={product:null,shipping:null};};

// A quote is advisory and not a payment commitment. Checkout always validates again.
const voucherApi='/.netlify/functions/checkout-security';
let voucherPending=false;
const voucherError=Object.freeze({
 VOUCHER_LEDGER_NOT_READY:'Voucher belum dapat digunakan sementara. Coba lagi nanti atau lanjut tanpa voucher.',
 VOUCHER_HISTORY_UNAVAILABLE:'Riwayat penggunaan voucher sedang tidak tersedia. Silakan coba lagi.',
 VOUCHER_HISTORY_TOO_LARGE:'Voucher pada akun ini perlu bantuan toko. Hubungi layanan pelanggan.',
 VOUCHER_ALREADY_USED:'Jatah voucher untuk akun kamu sudah habis.',
 VOUCHER_LIMIT_REACHED:'Voucher ini sudah digunakan 5 kali oleh akun kamu.',
 VOUCHER_RESERVED:'Voucher ini masih digunakan pada pesanan lain yang aktif.',
 VOUCHER_MINIMUM_NOT_MET:'Total belanja belum memenuhi minimum penggunaan voucher.',
 VOUCHER_EXPIRED:'Masa berlaku voucher sudah berakhir.',
 VOUCHER_NOT_FOUND:'Voucher tidak ditemukan. Pilih promo lain yang tersedia.',
 VOUCHER_INACTIVE:'Voucher belum tersedia saat ini.',
 STOCK_UNVERIFIED:'Ketersediaan produk belum dapat dipastikan. Coba lagi nanti.',
 STOCK_INSUFFICIENT:'Jumlah produk melebihi stok yang tersedia. Periksa kembali keranjang.',
 VARIANT_ID_REQUIRED:'Varian produk ini perlu diperbarui. Silakan hubungi toko.',
 QUOTE_CHANGED:'Harga atau potongan telah berubah. Periksa total belanja terbaru.',
 QUOTE_RATE_LIMITED:'Terlalu banyak percobaan. Coba lagi beberapa saat.',
 SESSION_INVALID:'Sesi akun kamu berakhir. Silakan masuk kembali.',
 AUTH_REQUIRED:'Masuk ke akun pelanggan untuk menggunakan voucher.'
});
function customerError(message){const error=new Error(message);error.customerSafe=true;return error}
function voucherErrorMessage(err){
 if(err?.customerSafe===true)return err.message;
 const code=String(err?.code||'').toLowerCase(),message=String(err?.message||'');
 if(code==='auth/network-request-failed'||/network-request-failed|failed to fetch|networkerror|load failed|timeout|timed out|aborterror/i.test(message)||['unavailable','deadline-exceeded'].includes(code))
  return 'Koneksi sedang terganggu. Voucher belum diterapkan. Periksa internet lalu coba lagi.';
 if(['auth/user-token-expired','auth/id-token-expired','auth/invalid-user-token','auth/requires-recent-login','auth/user-disabled'].includes(code))
  return 'Sesi akun perlu diperbarui. Silakan masuk kembali, lalu coba voucher.';
 if(['auth/too-many-requests','resource-exhausted'].includes(code))
  return 'Terlalu banyak percobaan. Silakan coba beberapa saat lagi.';
 return 'Voucher belum dapat diperiksa saat ini. Silakan coba lagi.';
}
function voucherDeadline(promise,millis=15000){
 let timer;
 return Promise.race([Promise.resolve(promise),new Promise((_,reject)=>{timer=setTimeout(()=>reject(customerError('Koneksi terlalu lama merespons. Periksa internet, lalu coba lagi.')),millis)})]).finally(()=>clearTimeout(timer));
}
function voucherRequestItems(lines){
 if(!Array.isArray(lines)||!lines.length||lines.length>10)throw customerError('Pilih 1–10 produk sebelum menggunakan voucher.');
 return lines.map(line=>{
  const p=window.imamstoreCartBridge?.getProduct?.(line.id),identity=p?window.imamstoreVariantIdentity?.forLine?.(p,line):null;
  if(!p||!identity)throw customerError('Produk atau varian sudah berubah. Perbarui keranjang, lalu coba lagi.');
  const qty=Number(line.qty);
  if(!Number.isSafeInteger(qty)||qty<1||qty>999)throw customerError('Jumlah produk perlu diperbaiki sebelum memakai voucher.');
  const item={productId:String(p.id),qty};
  if(Array.isArray(p.varian)&&p.varian.length){
   if(!/^[A-Za-z0-9_-]{1,120}$/.test(identity.variantId)||identity.variantId.startsWith('legacy-'))
    throw customerError('Varian produk belum siap untuk pembayaran. Hubungi toko.');
   item.variantId=identity.variantId;
  }
  return item;
 });
}
async function verifyVoucherChoice(v,scope){
 const lines=scope==='checkout'?checkoutLines():selected();
 const items=voucherRequestItems(lines),chosen=voucherState[scope];
 const auth=window.firebase?.auth?.(),user=auth?.currentUser;
 if(!user||user.isAnonymous)throw customerError('Masuk ke akun pelanggan untuk menggunakan voucher.');
 // Firebase may reject token refresh with network AuthError; never display its raw message.
 const token=await voucherDeadline(user.getIdToken());
 if(!token)throw customerError('Sesi akun berakhir. Silakan masuk kembali.');
 const codes={product:chosen.product?.id||'',shipping:chosen.shipping?.id||''};
 codes[slotOf(v)]=v.id;
 let response,body;
 try{
  response=await voucherDeadline(fetch(voucherApi,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
   body:JSON.stringify({action:'quote',items,voucherCodes:codes}),cache:'no-store',credentials:'same-origin'}));
 }catch(err){
  if(err?.customerSafe)throw err;
  throw customerError('Koneksi sedang terganggu. Voucher belum diterapkan. Periksa internet lalu coba lagi.');
 }
 try{body=await voucherDeadline(response.json())}
 catch(_){throw customerError('Voucher belum dapat diperiksa saat ini. Silakan coba lagi.')}
 if(!response.ok||body?.success!==true){
  // Server error text is for diagnostics only: never render body.message.
  const code=typeof body?.code==='string'?body.code:'';
  const friendly=Object.prototype.hasOwnProperty.call(voucherError,code)?voucherError[code]:
   (response.status===401?'Sesi akun berakhir. Silakan masuk kembali.':
    response.status===429?'Terlalu banyak percobaan. Silakan coba beberapa saat lagi.':
    response.status>=500?'Layanan voucher sedang terganggu. Silakan coba lagi.':
    'Voucher belum dapat digunakan. Silakan periksa pilihan kamu.');
  throw customerError(friendly);
 }
 const local=calculateQuote(lines,{...chosen,[slotOf(v)]:v});
 if(body?.totals?.subtotal!==local.subtotal||body?.totals?.productDiscount!==local.productDiscount||
    body?.totals?.totalBayar!==local.total||Number(body?.shippingPotential||0)!==local.shippingPotential)
  throw customerError('Harga atau potongan telah berubah. Periksa total belanja, lalu coba lagi.');
 return {items,scope};
}
function voucherBusy(target,pending){
 const controls=document.querySelectorAll('.v43-voucher-sheet .ref-v43-choose,.v43-voucher-sheet #v43VoucherApply,.v43-voucher-sheet #v43VoucherDone');
 for(const button of controls){
  if(pending){
   if(!button.hasAttribute('data-voucher-label'))button.dataset.voucherLabel=button.textContent;
   button.disabled=true;
   button.classList.toggle('is-verifying',button===target);
   if(button===target)button.textContent='Memeriksa…';
  }else{
   if(button.dataset.voucherLabel){button.textContent=button.dataset.voucherLabel;delete button.dataset.voucherLabel}
   button.classList.remove('is-verifying');
   if(button.classList.contains('ref-v43-choose'))button.disabled=button.dataset.allowed==='false';
   else button.disabled=false;
  }
 }
 const list=document.getElementById('v43VoucherList');if(list)list.setAttribute('aria-busy',String(pending));
}
async function chooseVoucher(v,scope,active,target){
 if(voucherPending)return;
 if(active){
  voucherState[scope][slotOf(v)]=null;sync();window.imamstoreReferenceV38?.refresh?.();
  document.dispatchEvent(new Event('imamstore:quote-refresh'));
  openVoucher();voucherFeedback('Voucher berhasil dibatalkan.','success');return;
 }
 voucherPending=true;voucherFeedback('', 'info');voucherBusy(target,true);
 try{
  const before=JSON.stringify((scope==='checkout'?checkoutLines():selected()).map(x=>[x.id,x.variantId,x.key,x.qty,x.harga]));
  await verifyVoucherChoice(v,scope);
  const after=JSON.stringify((scope==='checkout'?checkoutLines():selected()).map(x=>[x.id,x.variantId,x.key,x.qty,x.harga]));
  if(scope!==currentScope()||before!==after)throw customerError('Isi keranjang berubah. Periksa pilihan produk dan coba voucher lagi.');
  // If the user closed the sheet while checking, do not silently apply the voucher.
  if(!document.querySelector('.v43-voucher-sheet')||document.querySelector('.ref-modal')?.hidden)return;
  voucherState[scope][slotOf(v)]=v;
  sync();window.imamstoreReferenceV38?.refresh?.();document.dispatchEvent(new Event('imamstore:quote-refresh'));
  openVoucher();
  voucherFeedback(slotOf(v)==='shipping'?'Voucher ongkir dipilih. Nilai potongan menunggu biaya pengiriman.':'Voucher dipilih. Potongan tercantum pada ringkasan, jatah digunakan setelah pesanan dibuat.','success');
 }catch(err){
  console.warn('[ImamStore voucher diagnostics]',String(err?.code||'unknown'));
  voucherFeedback(voucherErrorMessage(err),'error');
 }finally{voucherPending=false;voucherBusy(target,false)}
}
const eligible=(v,sum)=>!!v&&sum>=Number(v.min||0)&&(!v.expired||Date.now()<=Date.parse(v.expired+'T23:59:59.999+07:00'));
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
 voucherUiStyle();
 const lines=checkoutActive()?checkoutLines():selected(),chosen=activeVouchers();
 const sum=lines.reduce((a,x)=>a+Number(x.harga||0)*Number(x.qty||0),0);
 modal('<div class="v43-compact-sheet v43-voucher-sheet">'+
 '<header class="v43-compact-head"><h2>Voucher & Promo</h2><p>Pilih satu voucher produk dan satu voucher ongkir.</p></header>'+
 '<div class="v43-compact-scroll"><div class="ref-v43-voucher-input"><input id="v43VoucherCode" placeholder="Masukkan kode voucher" autocomplete="off" aria-label="Kode voucher"><button type="button" id="v43VoucherApply">Gunakan</button></div><p id="v43VoucherFeedback" role="status" aria-live="polite" hidden></p>'+
 '<div id="v43VoucherList"></div><p class="v43-compact-hint">Setiap jenis voucher dapat digunakan maksimal 5 kali per akun. Pesanan aktif menahan jatah sementara. Potongan ongkir dihitung setelah biaya kirim ditentukan.</p></div>'+
 '<footer class="v43-compact-foot"><span id="v43SelectionCount" role="status"></span><button class="ref-green" type="button" id="v43VoucherDone">Selesai</button></footer></div>',root=>{
  const selectedCount=Object.values(chosen).filter(Boolean).length;
  root.querySelector('#v43SelectionCount').textContent=selectedCount?selectedCount+' voucher dipilih':'Belum ada voucher dipilih';
  root.querySelector('#v43VoucherDone').onclick=close;
  const code=root.querySelector('#v43VoucherCode');
  const applyCode=async()=>{
   const input=code.value.trim().toUpperCase(),v=vouchers.find(x=>x.id.toUpperCase()===input);
   if(!input){alertUI('Masukkan kode voucher terlebih dahulu.');return}
   if(!v){alertUI('Kode voucher tidak dikenal. Silakan pilih voucher yang tersedia.');return}
   if(!eligible(v,sum)){alertUI(Date.now()>Date.parse(v.expired+'T23:59:59.999+07:00')?'Masa berlaku voucher ini sudah berakhir.':'Tambahkan belanja '+money(Math.max(0,Number(v.min)-sum))+' lagi untuk menggunakan voucher.');return}
   await chooseVoucher(v,currentScope(),chosen[slotOf(v)]?.id===v.id,root.querySelector('#v43VoucherApply'));
  };
  root.querySelector('#v43VoucherApply').onclick=applyCode;
  code.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyCode()}});
  const list=root.querySelector('#v43VoucherList');
  vouchers.forEach(v=>{
   const slot=slotOf(v),active=chosen[slot]?.id===v.id,ok=eligible(v,sum);
   const row=document.createElement('div');row.className='ref-v43-voucher v43-voucher-item'+(active?' is-selected':'')+(!ok?' is-disabled':'');row.dataset.voucherCode=v.id;row.dataset.isActive=String(active);row.dataset.eligible=String(ok);
   row.innerHTML='<span class="ref-v43-voucher-icon"></span><div class="ref-v43-voucher-main"><b></b><small></small><span class="v43-voucher-state" aria-live="polite"></span></div><div class="ref-v43-voucher-actions"><button type="button" class="ref-v43-choose"></button><button type="button" class="ref-v43-terms">S&K</button></div>';
   row.querySelector('.ref-v43-voucher-icon').innerHTML='<i class="fa-solid '+v.icon+'" aria-hidden="true"></i>';
   const title=row.querySelector('b'); title.textContent=v.name+' · '+(v.type==='product_percent'?v.discount+'%':money(v.discount));
   const expiry=v.expired?new Date(v.expired+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}):'Tidak dibatasi';
   row.querySelector('small').textContent='Min. '+money(v.min)+' · Sampai '+expiry;
   const stateLabel=row.querySelector('.v43-voucher-state');
   stateLabel.textContent=active?'✓ Dipilih · Memeriksa sisa penggunaan…':'Memeriksa sisa penggunaan…';
   const btn=row.querySelector('.ref-v43-choose');
   btn.textContent=active?'Batalkan':ok?'Gunakan':'Belum sesuai';btn.disabled=!active;btn.dataset.allowed=String(active);
   btn.setAttribute('aria-pressed',String(active));
   btn.setAttribute('aria-label',(active?'Batalkan':'Gunakan')+' '+v.name);
   btn.onclick=()=>chooseVoucher(v,currentScope(),active,btn);
   row.querySelector('.ref-v43-terms').onclick=()=>terms(v);
   list.append(row);
  });
  refreshVoucherUsage(root,sum,chosen);
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
 const total=$('s5CartTotal');if(total)total.textContent='Total '+money(pricing.total);const totalQty=lines.reduce((n,x)=>n+Math.max(0,Number(x.qty)||0),0);const badge=$('refCartCount');if(badge)badge.textContent='('+totalQty+')';/* ImamStore badge single-writer R2: badge header/floating belongs only to module 42. */window.imamstoreRefreshCartBadge?.();const savings=$('refCartSavings');if(savings)savings.textContent=[pricing.discount?'Hemat '+money(pricing.discount):'',pricing.shippingVoucher?'Voucher ongkir dipilih':''].filter(Boolean).join(' · ');const btn=$('s5Checkout');if(btn){btn.textContent='Checkout ('+count+')';btn.disabled=count===0}publishQuote(); }
// Selection events are handled exclusively by the checkbox onchange in sync().
// Cart, checkout and detail route to this voucher sheet; original voucher policy is not yet restored.
window.nineOpenOriginalVoucher=openVoucher;window.imamstoreOpenVoucherSheet=openVoucher;
for(const id of ['refCartVoucher','refCheckoutVoucher']){const el=$(id);if(el)el.onclick=e=>{e.preventDefault();openVoucher()}}
// Voucher notices stay inside the voucher sheet; global dialogs remain unchanged.
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
    const p=window.imamstoreCartBridge?.getProduct?.(after.id);
    const canonical=p?window.imamstoreVariantIdentity?.forLine(p,after):null;
    if(!canonical)return false;
    const newKey=canonical.key;
    const duplicate=nextCart.findIndex((x,j)=>j!==oldIndex&&String(x.key)===newKey);
    // Do not silently merge selected and unselected lines, which changes checkout quantities.
    if(duplicate>=0)return false;
    nextCart[oldIndex]={...nextCart[oldIndex],variantId:canonical.variantId,varian:canonical.name,qty:after.qty,harga:after.harga,key:newKey};
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