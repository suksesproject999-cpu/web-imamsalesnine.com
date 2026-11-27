
(()=>{'use strict';
/* Checkout menyimpan orders sekali. Statistik terjual dihitung setelah admin memverifikasi pesanan (R14), bukan dari klaim pembeli. */
const $=id=>document.getElementById(id),button=$('refPlaceOrder'),note=$('refCheckoutWarning');if(!button)return;
const KEY='imamstore_cart_stage5',ADMIN='6282210109369';let busy=false,committed=false,pendingOrderId=null,lastAttemptMeta=null,pendingSecureCreate=null;
const money=n=>'Rp '+Math.round(Number(n)||0).toLocaleString('id-ID');
const read=(key,def)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??def}catch{return def}};
const popup=(icon,title,text)=>window.Swal?.fire?window.Swal.fire({icon,title,text,confirmButtonColor:'#8cc63f',width:'min(90vw,410px)'}):Promise.resolve((note.textContent=title+' — '+text));
const selected=()=>{
 const draft=$('s5Draft');
 if(draft?.classList.contains('open')){
  const lines=window.__nexaiCheckoutLines;
  return Array.isArray(lines)?lines.filter(x=>x&&Number(x.qty)>0):[];
 }
 const cart=window.imamstoreCartBridge?.getLines?.()||read(KEY,[]);
 return (Array.isArray(cart)?cart:[]).filter(x=>x&&Number(x.qty)>0&&window.imamstoreV43?.isSelected?.(x.key)!==false);
};
const ready=()=>!busy&&!committed&&selected().length>0;
function refresh(){button.disabled=!ready();button.setAttribute('aria-disabled',String(button.disabled))}
function address(){const a=read('imamstore_ref_addresses_v38',[]),summary=$('refAddressSummary')?.textContent?.trim()||'';return (Array.isArray(a)?a:[]).find(x=>x.full===summary)||(Array.isArray(a)?a:[]).find(x=>summary.includes(x.full))||null}
function db(){try{return firebase.firestore()}catch{return null}}
function name(x){return String(x.nama||x.name||x.title||'Produk')}
function price(x){return Number(x.harga??x.price??x.unitPrice??0)||0}
function orderId(){if(pendingOrderId)return pendingOrderId;try{pendingOrderId=crypto.randomUUID()}catch{pendingOrderId='ORD-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,8)}return pendingOrderId}
/* Stage 1.4: one existing checkout handler, selectable transport for a controlled cutover.
 * Default legacy until the server write gate AND Firestore Rules are migrated in 1.5.
 * This DOM flag is NOT a security boundary; backend and Rules must enforce the cutover. */
const secureTransport=()=>document.documentElement?.getAttribute('data-imamstore-checkout-transport')==='server';
const SECURE_API='/.netlify/functions/checkout-security';
const secureTexts={
 ORDER_WRITE_NOT_ACTIVATED:'Checkout server belum diaktifkan. Pesanan belum dibuat.',
 QUOTE_CHANGED:'Harga, varian, atau voucher telah berubah. Perbarui keranjang dan periksa total kembali.',
 QUOTE_HASH_REQUIRED:'Konfirmasi harga resmi belum tersedia. Buka kembali checkout.',
 VOUCHER_USAGE_UNVERIFIED:'Hak voucher belum dapat diverifikasi. Buka kembali pilihan voucher.',
 VOUCHER_LEDGER_NOT_READY:'Riwayat voucher belum siap. Batalkan voucher dan coba checkout kembali.',
 VOUCHER_HISTORY_UNAVAILABLE:'Riwayat voucher sedang tidak tersedia. Coba kembali.',
 VOUCHER_HISTORY_TOO_LARGE:'Riwayat voucher perlu diperiksa admin. Lanjutkan tanpa voucher.',
 VOUCHER_ALREADY_USED:'Voucher sudah pernah digunakan akun ini. Pilih voucher lain.',
 VOUCHER_RESERVED:'Voucher sedang dipakai pada pesanan akun ini. Pilih voucher lain.',
 STOCK_UNVERIFIED:'Stok belum dapat dipastikan. Hubungi admin toko.',
 STOCK_INSUFFICIENT:'Stok tidak cukup. Kurangi jumlah dan coba kembali.',
 VARIANT_NOT_FOUND:'Varian berubah. Pilih varian lagi.',
 VARIANT_ID_REQUIRED:'Varian belum diterbitkan dengan Variant ID tetap. Hubungi admin.',
 SESSION_INVALID:'Sesi login berakhir. Silakan masuk kembali.',
 AUTH_REQUIRED:'Silakan login ulang sebelum membuat pesanan.',
 ORDER_RATE_LIMITED:'Terlalu banyak pesanan. Silakan coba lagi nanti.',
 ORDER_ALREADY_CLOSED:'Pesanan sebelumnya sudah dibatalkan atau kedaluwarsa. Buka keranjang lalu buat pesanan baru.',
 QUOTE_RATE_LIMITED:'Terlalu banyak permintaan. Silakan coba lagi nanti.',
 CHECKOUT_UNAVAILABLE:'Server checkout sedang tidak tersedia. Periksa kembali status pesanan sebelum mencoba lagi.'
};
function secureError(code,status=0){
 const c=String(code||'CHECKOUT_UNAVAILABLE').slice(0,80);
 const e=new Error(c);e.code='checkout/'+c.toLowerCase();e.apiCode=c;e.status=status;
 e.publicMessage=secureTexts[c]||'Checkout belum dapat diproses. Silakan coba kembali.';
 return e;
}
async function secureCall(user,body){
 const token=await user.getIdToken();
 if(!token)throw secureError('SESSION_INVALID',401);
 let response;
 try{response=await fetch(SECURE_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
  body:JSON.stringify(body),credentials:'same-origin',cache:'no-store'})}
 catch(_){throw secureError('CHECKOUT_UNAVAILABLE')}
 let data;
 try{data=await response.json()}catch(_){throw secureError('CHECKOUT_UNAVAILABLE',response.status)}
 if(!response.ok||data?.success!==true)throw secureError(data?.code||'CHECKOUT_UNAVAILABLE',response.status);
 return data;
}
function validQuote(q,requested,localItems,localTotals,localVouchers){
 if(!q||typeof q.quoteHash!=='string'||!/^[a-f0-9]{64}$/.test(q.quoteHash)||
  !Array.isArray(q.items)||q.items.length!==localItems.length)return false;
 const keys=['totalItem','subtotal','productDiscount','shippingDiscount','totalBayar',
  'productVoucherName','shippingVoucherName'];
 if(!keys.every(k=>q.totals?.[k]===localTotals[k]))return false;
 for(let i=0;i<requested.length;i++){
  const r=requested[i],x=q.items[i],y=localItems[i];
  if(x.productId!==r.productId||x.variantId!==(r.variantId||'default')||
   x.qty!==r.qty||x.qty!==y.qty||x.harga!==y.harga||x.nama!==y.nama||
   (r.variantId?x.varian!==y.varian:x.varian!==''))return false;
 }
 // Compare the voucher snapshot, including potential shipping discount.
 return q.vouchers?.product===(localVouchers.product||null)&&
  stableJson(q.vouchers?.shipping||null)===stableJson(localVouchers.shipping||null);
}

/* R6 — sesuaikan validasi permintaan pesanan dengan Firestore Rules R4.
   Ini pemeriksaan lokal untuk mendeteksi mismatch; bukan pengganti Rules/validasi backend. */
function auditOrderAgainstR4(o,authUser){
 const issues=[];
 const fail=(pass,detail)=>{if(!pass)issues.push(detail)};
 const str=(v,min,max)=>typeof v==='string'&&v.length>=min&&v.length<=max;
 const keys=(o,required)=>o&&typeof o==='object'&&!Array.isArray(o)
  &&Object.keys(o).length===required.length&&required.every(k=>Object.prototype.hasOwnProperty.call(o,k));
 const isNum=n=>typeof n==='number'&&Number.isFinite(n);
 const safeInt=n=>Number.isSafeInteger(n);
 const idValid=x=>str(x,1,120)&&/^[A-Za-z0-9_-]{1,120}$/.test(x);
 const rootKeys=['orderId','uid','customer','ekspedisi','catatan','items','totals','vouchers','status','channel','createdAt','updatedAt'];
 fail(keys(o,rootKeys),'Struktur field pesanan tidak sama dengan R4');
 fail(!!authUser&&!authUser.isAnonymous,'Akun bukan login pelanggan permanen (Google/email)');
 fail(o?.uid===authUser?.uid,'UID pesanan berbeda dari sesi login');
 fail(str(o?.orderId,1,100),'Nomor pesanan tidak valid');
 fail(o?.status==='checkout_created','Status awal bukan checkout_created');
 fail(o?.channel==='whatsapp','Channel harus whatsapp');
 fail(str(o?.ekspedisi,1,100),'Metode ekspedisi tidak valid (maksimal 100 karakter)');
 fail(str(o?.catatan,0,500),'Catatan melebihi 500 karakter');
 const c=o?.customer,cKeys=['nama','wa','email','provinsi','kota','kodepos','alamat'];
 fail(keys(c,cKeys),'Struktur alamat tidak cocok dengan R4');
 if(c){
  fail(str(c.nama,1,160),'Nama penerima harus 1–160 karakter');
  fail(str(c.wa,8,30),'Nomor WhatsApp harus 8–30 karakter');
  fail(str(c.email,0,160),'Email maksimal 160 karakter');
  fail(str(c.provinsi,1,150),'Nama provinsi harus 1–150 karakter');
  fail(str(c.kota,1,150),'Nama kota harus 1–150 karakter');
  fail(typeof c.kodepos==='string'&&/^[0-9]{5}$/.test(c.kodepos),'Kode pos harus 5 digit');
  fail(str(c.alamat,1,1600),'Alamat lengkap harus 1–1600 karakter');
 }
 const lines=o?.items;
 fail(Array.isArray(lines)&&lines.length>=1&&lines.length<=30,'Jumlah jenis produk harus 1–30 baris');
 if(Array.isArray(lines))for(const [i,x] of lines.entries()){
  const p=`Produk baris ${i+1}: `;
  fail(keys(x,['productId','nama','varian','qty','harga']),p+'struktur item tidak sesuai');
  fail(idValid(x?.productId),p+'ID produk hanya boleh huruf, angka, _ atau - (maksimal 120)');
  fail(str(x?.nama,1,200),p+'nama produk harus 1–200 karakter');
  fail(str(x?.varian,0,150),p+'nama varian maksimal 150 karakter');
  fail(safeInt(x?.qty)&&x.qty>=1&&x.qty<=999,p+'jumlah harus bilangan bulat 1–999');
  fail(isNum(x?.harga)&&x.harga>0&&x.harga<=1000000000,p+'harga tidak valid');
 }
 const t=o?.totals;
 fail(keys(t,['totalItem','subtotal','productDiscount','shippingDiscount','totalBayar','productVoucherName','shippingVoucherName']),'Struktur total pesanan tidak sesuai R4');
 if(t&&Array.isArray(lines)){
  const qty=lines.reduce((v,x)=>v+(isNum(x?.qty)?x.qty:0),0);
  const sub=lines.reduce((v,x)=>v+(isNum(x?.qty)&&isNum(x?.harga)?x.qty*x.harga:0),0);
  fail(safeInt(t.totalItem)&&t.totalItem===qty,'Total jumlah item tidak sesuai rincian');
  fail(isNum(t.subtotal)&&t.subtotal>0&&t.subtotal===sub,'Subtotal tidak sama dengan penjumlahan harga × jumlah');
  fail(isNum(t.productDiscount)&&t.productDiscount>=0&&t.productDiscount<=sub,'Diskon produk tidak valid');
  fail(t.shippingDiscount===0,'Diskon ongkir harus 0 sebelum admin menghitung ongkir');
  fail(isNum(t.totalBayar)&&t.totalBayar===t.subtotal-t.productDiscount,'Total bayar tidak sesuai subtotal dikurangi diskon');
  fail(t.productVoucherName==null||str(t.productVoucherName,1,180),'Nama voucher produk lebih dari 180 karakter');
  fail(t.shippingVoucherName==null||str(t.shippingVoucherName,1,180),'Nama voucher ongkir lebih dari 180 karakter');
 }
 const v=o?.vouchers;
 fail(keys(v,['product','shipping']),'Struktur voucher tidak cocok R4');
 if(v&&t){
  fail(v.product===t.productVoucherName,'Nama voucher produk berbeda dari ringkasan');
  // R19: snapshot voucher ongkir pada nilai existing vouchers.shipping.
  // Firestore Rules R15 membatasi keys vouchers, bukan tipe nilai shipping.
  const shippingName=(v.shipping && typeof v.shipping==='object')?v.shipping.name:v.shipping;
  fail(shippingName===t.shippingVoucherName,'Nama voucher ongkir berbeda dari ringkasan');
  if(v.shipping && typeof v.shipping==='object'){
   fail(Object.keys(v.shipping).length===3 &&
    ['name','code','potentialDiscount'].every(k=>Object.prototype.hasOwnProperty.call(v.shipping,k)),
    'Struktur snapshot voucher ongkir tidak valid');
   fail(typeof v.shipping.name==='string' && v.shipping.name.length<=180,'Nama voucher ongkir tidak valid');
   fail(typeof v.shipping.code==='string' && v.shipping.code.length<=80,'Kode voucher ongkir tidak valid');
   fail(Number.isSafeInteger(v.shipping.potentialDiscount) && v.shipping.potentialDiscount>=0 &&
    v.shipping.potentialDiscount<=100000000,'Potensi potongan ongkir tidak valid');
  }
 }
 return [...new Set(issues)];
}
window.imamstoreCheckoutR4Audit=Object.freeze({version:'R6',check:auditOrderAgainstR4});
/* R10 — reconcile a possibly committed order after a lost acknowledgement.
   A customer cannot re-create/update an existing order under R4. Do not claim
   success unless the server returns an identical order owned by this session. */
function stableJson(v){
 if(Array.isArray(v))return '['+v.map(stableJson).join(',')+']';
 if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stableJson(v[k])).join(',')+'}';
 return JSON.stringify(v);
}
async function findIdenticalCommittedOrder(ref,requestOrder){
 try{
  const snapshot=await ref.get({source:'server'});
  if(!snapshot?.exists)return false;
  const previous=snapshot.data();
  return previous?.uid===requestOrder.uid
   && previous?.orderId===requestOrder.orderId
   && previous?.channel===requestOrder.channel
   && previous?.ekspedisi===requestOrder.ekspedisi
   && previous?.catatan===requestOrder.catatan
   && stableJson(previous?.customer)===stableJson(requestOrder.customer)
   && stableJson(previous?.items)===stableJson(requestOrder.items)
   && stableJson(previous?.totals)===stableJson(requestOrder.totals)
   && stableJson(previous?.vouchers)===stableJson(requestOrder.vouchers)
   && typeof previous?.status==='string';
 }catch(e){
  // R4 intentionally denies get() on a missing or non-owned order.
  return false;
 }
}
/* Safe developer report: never includes address, phone, email, UID or auth token. */
window.imamstoreCheckoutSafeReport=()=>{
 const err=window.imamstoreCheckoutLastError||{};
 const attempt=window.imamstoreCheckoutLastAttempt||{};
 return Object.freeze({
  version:'R10',project:String(err.project||attempt.project||'unknown'),
  stage:String(err.stage||attempt.stage||'unknown'),
  errorCode:String(err.code||'unknown'),
  provider:String(err.provider||attempt.provider||'unknown'),
  preflight:String(err.preflight||attempt.preflight||'unknown'),
  numberOfLines:Number(err.items??attempt.items??0),
  isAuthenticated:typeof err.authenticated==='boolean'?err.authenticated:!!firebase?.auth?.()?.currentUser,
  isAnonymous:typeof err.isAnonymous==='boolean'?err.isAnonymous:!!firebase?.auth?.()?.currentUser?.isAnonymous,
  existingOrderVerified:!!attempt.existingOrderVerified,
  tokenRefreshAttempted:!!attempt.tokenRefreshAttempted,
  time:new Date().toISOString()
 });
};


/* R13 — satu formatter untuk WhatsApp checkout dan riwayat pesanan.
   Tanggal toko memakai WIB; total dan item berasal dari transaksi tersimpan. */
function orderTimeWIB(value){
 let date=value;
 if(value&&typeof value.toDate==='function')date=value.toDate();
 else if(value&&typeof value.seconds==='number')date=new Date(value.seconds*1000);
 else if(value&&typeof value.toMillis==='function')date=new Date(value.toMillis());
 else if(!(value instanceof Date))date=new Date(value||Date.now());
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))date=new Date();
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone:'Asia/Jakarta',day:'2-digit',month:'2-digit',year:'numeric',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
 }).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return `${parts.day}/${parts.month}/${parts.year}, ${parts.hour}.${parts.minute}.${parts.second}`;
}
function message(d,items,s,storedVouchers){
 const safe=v=>v==null||String(v).trim()===''?'-':String(v).trim();
 const qty=items.reduce((n,x)=>n+(Number(x.qty)||0),0);
 const sum=items.reduce((n,x)=>n+(Number(x.harga)||0)*(Number(x.qty)||0),0);
 const subtotal=Number.isFinite(Number(s.subtotal))?Number(s.subtotal):sum;
 const pDiscount=Number(s.productDiscount)||0;
 const sDiscount=Number(s.shippingDiscount)||0;
 const shippingMeta=storedVouchers?.shipping;
 const shippingSelected=!!String(s.shippingVoucherName||'').trim();
 const shippingPotential=shippingMeta && typeof shippingMeta==='object' &&
   Number.isSafeInteger(Number(shippingMeta.potentialDiscount)) && Number(shippingMeta.potentialDiscount)>=0
   ? Number(shippingMeta.potentialDiscount):null;
 const shippingPotentialLine=!shippingSelected?null:shippingPotential===null?
   'Potensi Ongkir      : Menunggu verifikasi admin':
   'Potensi Diskon Ongkir: Hingga '+money(shippingPotential)+' (menunggu ongkir admin)';
 const paid=Number.isFinite(Number(s.totalBayar))?Number(s.totalBayar):subtotal-pDiscount;
 const goods=items.map((x,i)=>[
  `${i+1}. ${safe(x.nama)}`,
  '',
  `    Varian  : ${safe(x.varian)}`,
  `    Qty     : ${Number(x.qty)||0}`,
  `    Harga   : ${money(x.harga)}`,
  `    Subtotal: ${money((Number(x.qty)||0)*(Number(x.harga)||0))}`
 ].join('\n')).join('\n\n');
 return [
  'Halo store.imamsales.com 👋',
  '',
  '━━━━━━━━━━━━━━━━━━━━━━━━━━',
  '',
  '◆ FORM PEMESANAN',
  '',
  `Tanggal Order : ${orderTimeWIB(d.createdAt)}`,
  `Order ID      : ${safe(d.orderId)}`,
  '',
  '──────────────────────────',
  '',
  '◉ DATA PEMBELI',
  '',
  `Nama      : ${safe(d.nama)}`,
  `No. WA    : ${safe(d.wa)}`,
  `Email     : ${safe(d.email)}`,
  '',
  '⌖ ALAMAT PENGIRIMAN',
  '',
  `Provinsi  : ${safe(d.provinsi)}`,
  `Kota      : ${safe(d.kota)}`,
  `Kode Pos  : ${safe(d.kodepos)}`,
  '',
  'Alamat :',
  safe(d.alamat),
  '',
  '⇢ PENGIRIMAN',
  '',
  `Ekspedisi : ${safe(d.ekspedisi)}`,
  '',
  '──────────────────────────',
  '',
  '▣ DETAIL PESANAN',
  '',
  goods,
  '',
  '──────────────────────────',
  '',
  '⌁ RINGKASAN PEMBAYARAN',
  '',
  `Total Jenis Produk : ${items.length}`,
  `Total Item         : ${Number.isFinite(Number(s.totalItem))?Number(s.totalItem):qty}`,
  '',
  `Subtotal Produk    : ${money(subtotal)}`,
  '',
  `Voucher Produk     : ${safe(s.productVoucherName)}`,
  `Diskon Produk      : - ${money(pDiscount)}`,
  '',
  `Voucher Ongkir     : ${safe(s.shippingVoucherName)}`,
  `Diskon Ongkir      : ${shippingSelected?'Belum dihitung ('+money(sDiscount)+')':'- '+money(sDiscount)}`,
  ...(shippingPotentialLine?[shippingPotentialLine]:[]),
  '',
  `Total Belanja      : ${money(paid)}`,
  '',
  'Ongkos Kirim       : Dihitung Admin',
  '',
  '━━━━━━━━━━━━━━━━━━━━━━━━━━',
  '',
  '📜 PERSETUJUAN',
  '',
  '✓ Saya telah membaca dan menyetujui seluruh syarat & ketentuan pemesanan.',
  '',
  '━━━━━━━━━━━━━━━━━━━━━━━━━━',
  '',
  '✎ CATATAN',
  '',
  safe(d.catatan),
  '',
  '──────────────────────────',
  '',
  '✓ Total Harga',
  '✓ Ongkos Kirim',
  '✓ Metode Pembayaran',
  '',
  'Terima kasih.'
 ].join('\n');
}
window.imamstoreOrderWhatsAppURL=function(order){
 const c=order?.customer||{}, lines=Array.isArray(order?.items)?order.items:[];
 if(!order?.orderId||!lines.length)return '';
 const d={orderId:String(order.orderId),createdAt:order.createdAt,nama:String(c.nama||''),
  wa:String(c.wa||''),email:String(c.email||''),provinsi:String(c.provinsi||''),
  kota:String(c.kota||''),kodepos:String(c.kodepos||''),alamat:String(c.alamat||''),
  ekspedisi:String(order.ekspedisi||''),catatan:String(order.catatan||'')};
 return 'https://wa.me/'+ADMIN+'?text='+encodeURIComponent(message(d,lines,order.totals||{},order.vouchers||{}));
};
/* Untuk tes regresi format, tidak untuk dipakai sebagai klaim pesan sudah terkirim. */
window.imamstoreWhatsAppFormatR13=message;
/* Dialog WA wajib: tidak ditutup lewat luar, Escape, atau Back saat checkout masih terbuka.
   Tombol hanya MEMBUKA chat; pengiriman pesan tetap perlu ditekan di WhatsApp. */
function lockWaDialog(orderId){
 let enabled=true;
 try{history.pushState({imamstoreWAConfirmation:orderId},'',location.href)}catch(_){ }
 const onBack=()=>{
  if(!enabled)return;
  try{history.pushState({imamstoreWAConfirmation:orderId},'',location.href)}catch(_){ }
 };
 window.addEventListener('popstate',onBack);
 return ()=>{
  enabled=false;window.removeEventListener('popstate',onBack);
  try{if(history.state?.imamstoreWAConfirmation===orderId)
   history.replaceState({...history.state,imamstoreWAConfirmation:null},'',location.href)}catch(_){ }
 };
}
function openWhatsAppFromClick(url){
 try{
  const tab=window.open(url,'_blank');
  if(tab){try{tab.opener=null}catch(_){ }return true}
 }catch(_){ }
 // Android/webview dapat memblokir pop-up. Navigasi langsung berasal dari klik.
 window.location.assign(url);
 return true;
}
async function confirmWhatsAppRequired(id,url,paymentDueAt=null,checkoutAccount=null,orderNumber=null){
 // Scoped styles for new secondary action; no old rule overrides or !important.
 if(!document.getElementById('imamR3OrderUxStyle')){
  const style=document.createElement('style');style.id='imamR3OrderUxStyle';
  style.textContent='.imam-r3-order-link,.imam-r13-wa-popup .swal2-cancel{background:#fff;border:1px solid #aecf88;color:#426f20;border-radius:12px;padding:13px 18px;font:inherit;font-weight:700;min-height:48px;cursor:pointer}.imam-r3-order-link:focus-visible,.imam-r13-wa-popup .swal2-cancel:focus-visible{outline:3px solid #8cc63f;outline-offset:2px}.imam-r3-due{padding:12px 14px;border-radius:12px;background:#f5f9ee;color:#4b5c3c;text-align:left;line-height:1.5}';
  document.head.append(style);
 }

 const clean=str=>String(str).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dueMs=Date.parse(paymentDueAt||'');
 const hasDue=Number.isFinite(dueMs)&&secureTransport();
 const dueText=hasDue?new Date(dueMs).toLocaleString('id-ID',{
  timeZone:'Asia/Jakarta',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
 const dueInfo=hasDue?`<div class="imam-r13-footnote imam-r3-due">Selesaikan pembayaran sebelum <b>${clean(dueText)} WIB</b>.<br>
  Pesanan yang belum dikonfirmasi hingga batas waktu dapat dibatalkan otomatis.</div>`:'';
 const html=`<div class="imam-r13-success-content">
  <div class="imam-r13-check-mark" aria-hidden="true"><svg viewBox="0 0 72 72" width="72" height="72"><circle cx="36" cy="36" r="32" fill="#eff8e5" stroke="#a4d56b" stroke-width="2"/><path d="m21 37 10 10 21-23" fill="none" stroke="#6cab2e" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  <h2 id="imamR13ModalTitle">Pesanan berhasil dibuat</h2>
  <p class="imam-r13-lead">Pesananmu sudah tercatat. Lanjutkan ke WhatsApp untuk mendapatkan petunjuk pembayaran.</p>
  <div class="imam-r13-receipt"><span>Nomor pesanan</span><strong>${clean(orderNumber||id)}</strong><small>Simpan nomor ini untuk memeriksa pesananmu.</small></div>
  ${dueInfo}
  <p class="imam-r13-footnote">Setelah membayar, buka <b>Pesanan Saya</b> untuk melaporkan pembayaran dan memantau statusnya.</p>
 </div>`;
 const openOrders=()=>{if(typeof window.nexaiOpenOrders==='function'){window.nexaiOpenOrders();return true;}return false;};
 const release=lockWaDialog(id);
 try{
  if(window.Swal?.fire){
   const result=await Swal.fire({
    html,icon:undefined,showConfirmButton:true,showDenyButton:false,showCancelButton:true,
    showCloseButton:false,allowOutsideClick:false,allowEscapeKey:false,
    returnFocus:false,focusConfirm:true,buttonsStyling:false,
    confirmButtonText:'<i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Lanjutkan via WhatsApp',
    cancelButtonText:'Lihat Pesanan Saya',
    customClass:{popup:'imam-r13-wa-popup',confirmButton:'imam-r13-wa-confirm',cancelButton:'imam-r3-order-link',actions:'imam-r13-wa-actions'},
    width:'min(94vw,470px)',padding:0,
    preConfirm:()=>{openWhatsAppFromClick(url);return true}
   });
   if(result?.isConfirmed)return true;
   if(result?.dismiss===window.Swal.DismissReason.cancel){if(openOrders())return true;}
   return await confirmWhatsAppFallback(html,url,openOrders);
  }
  return await confirmWhatsAppFallback(html,url,openOrders);
 }finally{release()}
}
function confirmWhatsAppFallback(html,url,openOrders){
 return new Promise(resolve=>{
  const shade=document.createElement('div');shade.className='imam-r13-fallback-shade';
  shade.setAttribute('role','presentation');
  shade.innerHTML='<section class="imam-r13-wa-popup imam-r13-fallback" role="dialog" aria-modal="true" aria-labelledby="imamR13ModalTitle">'+html
   +'<div class="imam-r13-wa-actions"><button type="button" class="imam-r13-wa-confirm"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Lanjutkan via WhatsApp</button><button type="button" class="imam-r3-order-link">Lihat Pesanan Saya</button></div></section>';
  const btn=shade.querySelector('.imam-r13-wa-confirm'),orders=shade.querySelector('.imam-r3-order-link');
  const stop=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation()}};
  document.addEventListener('keydown',stop,true);document.body.appendChild(shade);
  function done(){document.removeEventListener('keydown',stop,true);shade.remove();resolve(true)}
  btn.focus();btn.addEventListener('click',()=>{openWhatsAppFromClick(url);done()},{once:true});
  orders.addEventListener('click',()=>{done();openOrders()},{once:true});
 });
}
async function ranking(ids){try{if(typeof window.updateTopSellingRanking==='function')return void window.updateTopSellingRanking(ids);const store=db();if(!store)return;const snaps=await Promise.all(ids.map(async id=>{const s=await store.collection('statistik_produk').doc(id).get();return {id,sold:Number(s.data()?.terjual)||0}}));snaps.sort((a,b)=>b.sold-a.sold);await store.collection('marketplace_config').doc('top_selling').set({productIds:snaps.slice(0,15).map(x=>Number.isNaN(Number(x.id))?x.id:Number(x.id)),limit:15,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true})}catch(e){console.warn('Ranking best effort',e)}}
async function submit(){if(busy||committed)return;if(typeof window.nexaiRequireCustomerLogin!=='function'){await popup('warning','Layanan login belum siap','Muat ulang halaman dan coba lagi.');return;}if(!await window.nexaiRequireCustomerLogin())return;const lines=selected();if(!lines.length){await popup('warning','Keranjang kosong','Pilih setidaknya satu produk untuk melanjutkan.');return}if(lines.length>10){await popup('warning','Terlalu banyak jenis produk','Maksimal 10 jenis produk per pesanan. Kurangi pilihan produk terlebih dahulu.');return}const a=address();const addressIssues=window.imamstoreCustomerCheckoutR7?.validateSavedAddress(a)||[];if(addressIssues.length){await window.imamstoreCustomerCheckoutR7.promptAddress(addressIssues);return}if(!$('refTermsBody')?.checked||!$('refTermsFooter')?.checked){await popup('warning','Syarat & Ketentuan belum disetujui','Centang persetujuan Syarat & Ketentuan sebelum membuat pesanan.');return}const store=db();if(!store){await popup('error','Layanan pemesanan belum tersedia','Kami belum dapat memproses pesanan saat ini. Silakan coba lagi beberapa saat.');return}
// Sinkronisasi final: snapshot checkout wajib cocok dengan katalog aktif.
 const catalog=window.imamstoreV29?.products?.();
 if(!Array.isArray(catalog)||!catalog.length){await popup('warning','Katalog belum siap','Muat ulang data produk sebelum mengirim pesanan.');return}
 const items=[];const serverLines=[];const problems=[];
 for(const x of lines){
  const p=catalog.find(p=>String(p.id)===String(x.id));
  const qty=Number(x.qty),variant=String(x.varian||'');
  if(!p||p.active===false||p.aktif===false||p.deleted===true||p.status==='nonaktif'){problems.push(name(x)+': produk tidak tersedia');continue}
  if(!Number.isSafeInteger(qty)||qty<1||qty>999){problems.push(name(x)+': jumlah tidak valid');continue}
  const variants=Array.isArray(p.varian)?p.varian:[];
  const identity=window.imamstoreVariantIdentity?.forLine(p,x);
  const match=identity?.record;
  if(variants.length&&!match){problems.push(name(x)+': varian berubah');continue}
  const rawStock=(match&&typeof match==='object'?(match.stok??match.stock):null)??p.stok??p.stock;
  const parsedStock=typeof rawStock==='object'&&rawStock!==null?(rawStock.jumlah??rawStock.qty??rawStock.stock??rawStock.quantity):rawStock;const stock=parsedStock==null?NaN:Number(parsedStock);
  if(Number.isFinite(stock)&&stock>=0&&qty>stock){problems.push(name(x)+': stok tidak cukup');continue}
  const officialName=identity?.name||variant;
  const q=window.imamstoreUnifiedPrice?.variantQuote?.(p,officialName);
  const current=Number(q?.price);
  if(!q?.verified||!Number.isFinite(current)||current<=0||Math.abs(current-price(x))>0.001){
   problems.push(name(x)+': harga berubah, periksa kembali keranjang');continue
  }
  const serverLine={productId:String(p.id),qty};
  if(variants.length){
   const vid=String(identity?.variantId||'');
   if(!/^[A-Za-z0-9_-]{1,120}$/.test(vid)||vid.startsWith('legacy-')){problems.push(name(x)+': Variant ID resmi belum tersedia');continue}
   serverLine.variantId=vid;
  }
  serverLines.push(serverLine);
  items.push({productId:String(p.id),nama:String(p.nama||p.name||p.title||name(x)),varian:officialName,qty,harga:current});
 }
 if(problems.length){await popup('warning','Data checkout berubah',problems.join('; ').slice(0,900));return}
if(!items.length||items.some(x=>!x.productId||x.qty<1||x.qty>9999||x.harga<=0)){await popup('warning','Data keranjang belum valid','Periksa produk, varian, harga, dan jumlah.');return}
const subtotal=items.reduce((n,x)=>n+x.harga*x.qty,0),pricing=window.imamstoreV43?.checkoutTotals?.(),vouchers=window.imamstoreV43?.getVouchers?.()||{},productDiscount=pricing?.productDiscount||0,shippingDiscount=pricing?.shippingDiscount||0;
const directBuy=window.__nexaiCheckoutMode==='detail'&&$('s5Draft')?.classList.contains('open');
const quotedSubtotal=Number(pricing?.subtotal);
 if(!pricing||!Number.isFinite(quotedSubtotal)||Math.abs(quotedSubtotal-subtotal)>0.01){
  await popup('warning','Ringkasan belum sinkron','Subtotal checkout berubah. Kembali ke keranjang dan ulangi checkout.');return
 }
 const rawDiscount=Number(productDiscount);
 if(!Number.isFinite(rawDiscount)||rawDiscount<0||rawDiscount>subtotal){
  await popup('warning','Voucher tidak valid','Periksa kembali voucher dan total pembayaran.');return
 }
 const appliedProductDiscount=rawDiscount;
// Ongkir belum diketahui: voucher ongkir dicatat sebagai potensi, bukan mengurangi total barang.
const appliedShippingDiscount=0;
const summary={totalItem:items.reduce((n,x)=>n+x.qty,0),subtotal,productDiscount:appliedProductDiscount,shippingDiscount:appliedShippingDiscount,totalBayar:subtotal-appliedProductDiscount,productVoucherName:vouchers.product?.name||null,shippingVoucherName:vouchers.shipping?.name||null};
// R19: snapshot lengkap voucher terpilih di field vouchers.shipping yang sudah diizinkan R15.
// Total pesanan tetap tidak dipotong ongkir, karena ongkir aktual ditetapkan admin.
const shippingCandidate=pricing?.shippingVoucher && vouchers.shipping?.id===pricing.shippingVoucher?.id
 ? pricing.shippingVoucher : null;
const shippingPotential=Number(pricing?.shippingPotential);
if(vouchers.shipping && (!shippingCandidate || !Number.isSafeInteger(shippingPotential) ||
  shippingPotential<0 || shippingPotential>100000000)){
 await popup('warning','Periksa voucher ongkir','Pilihan voucher berubah. Buka kembali Voucher & Promo sebelum membuat pesanan.');return;
}
const shippingSnapshot=shippingCandidate?{
 name:String(shippingCandidate.name||''),
 code:String(shippingCandidate.id||''),
 potentialDiscount:shippingPotential
}:null;
const checkoutUser=firebase.auth().currentUser;if(!checkoutUser||checkoutUser.isAnonymous){await popup('warning','Sesi login diperlukan','Silakan masuk kembali dengan Google atau email.');return}const uid=checkoutUser.uid;
// R19: alamat buku tidak memiliki field email; gunakan email akun login bila kosong.
const d={orderId:orderId(),nama:String(a.name||a.nama||''),wa:String(a.phone||a.wa||''),
 email:String(a.email||checkoutUser.email||''),
 provinsi:String(a.province||a.provinsi||''),kota:String(a.city||a.kota||''),
 kodepos:String(a.postal||a.kodepos||''),alamat:String(a.full||''),
 ekspedisi:String($('refShipping')?.value||''),catatan:String($('refOrderNote')?.value||'').slice(0,500)};
if(!d.ekspedisi){await popup('warning','Pengiriman belum dipilih','Pilih metode pengiriman sebelum melanjutkan.');return}const finalAddressIssues=window.imamstoreCustomerCheckoutR7?.validateSavedAddress({name:d.nama,phone:d.wa,province:d.provinsi,city:d.kota,postal:d.kodepos,full:d.alamat,email:d.email})||[];if(finalAddressIssues.length){await window.imamstoreCustomerCheckoutR7.promptAddress(finalAddressIssues);return}
busy=true;refresh();button.textContent='Memproses…';if(note)note.textContent='Memproses pesanan Anda…';
try{const FV=firebase.firestore.FieldValue,grouped=new Map();items.forEach(x=>grouped.set(x.productId,(grouped.get(x.productId)||0)+x.qty));
const order={orderId:d.orderId,uid,customer:{nama:d.nama,wa:d.wa,email:d.email,provinsi:d.provinsi,kota:d.kota,kodepos:d.kodepos,alamat:d.alamat},ekspedisi:d.ekspedisi,catatan:d.catatan,items,totals:summary,vouchers:{product:summary.productVoucherName,shipping:shippingSnapshot},status:'checkout_created',channel:'whatsapp',createdAt:FV.serverTimestamp(),updatedAt:FV.serverTimestamp()};
/* R6: jangan kirim payload yang sudah pasti ditolak oleh skema Rules R4. */
const mismatches=auditOrderAgainstR4(order,checkoutUser);
if(mismatches.length){
 console.warn('[ImamStore R6] Validasi lokal tidak cocok dengan Rules R4:',mismatches);
 const friendly=window.imamstoreCustomerCheckoutR7.describeOrderIssues(mismatches);
 if(mismatches.some(x=>/nama penerima|nomor WhatsApp|email|provinsi|kota|kode pos|alamat lengkap|Struktur alamat/i.test(x))){await window.imamstoreCustomerCheckoutR7.promptAddress(friendly);return;}
 await popup('warning','Periksa kembali pesanan',friendly.slice(0,4).join(' ').slice(0,950));
 return;
}
/* R9: App Check SDK tidak boleh menjadi gerbang buatan ketika enforcement
   dinonaktifkan. SDK akan mengirim token secara otomatis bila tersedia.
   Izin sebenarnya tetap dievaluasi server melalui Auth + Firestore Rules. */
let token, provider='unknown';
try{
 token=await checkoutUser.getIdTokenResult(); // tanpa force-refresh setiap order
 provider=token?.signInProvider||token?.claims?.firebase?.sign_in_provider||'unknown';
}catch(authError){
 console.warn('[ImamStore R9 developer] Sesi login tidak siap',{code:String(authError?.code||'unknown')});
 throw authError;
}
if(provider==='anonymous'||checkoutUser.isAnonymous){
 await popup('warning','Silakan masuk kembali','Untuk melanjutkan pesanan, masuk kembali menggunakan akun Google atau email.');
 return;
}
/* Tidak ada await appCheck().getToken() dalam submit.
   Token App Check tetap dikelola Firebase SDK jika provider terpasang. */
const securityStatus=imamstoreR8Security.appCheckReady?'managed-by-sdk':'not-initialized';
lastAttemptMeta={stage:'orders-create',orderId:d.orderId,project:firebase?.app?.()?.options?.projectId||'unavailable',provider:provider||'unknown',appCheck:securityStatus,items:items.length,preflight:'passed',timestamp:new Date().toISOString()};
window.imamstoreCheckoutLastAttempt=Object.freeze({...lastAttemptMeta});

/* Tahap 5C.2: pesanan saja. Statistik penjualan dan ranking tidak boleh dinaikkan
   dari checkout browser yang belum diverifikasi admin. */
let serverReceipt=null;
if(secureTransport()){
 /* Quote-read and create-write share the SAME server catalogue/price engine.
  * No fallback to browser writes on network/auth/error. */
 const voucherCodes={product:String(vouchers.product?.id||''),shipping:String(vouchers.shipping?.id||'')};
 const localSnapshot={items,serverLines,summary,voucherCodes,customer:order.customer,ekspedisi:d.ekspedisi,catatan:d.catatan};
 let secureBody=pendingSecureCreate?.body;
 if(pendingSecureCreate&&pendingSecureCreate.snapshot!==stableJson(localSnapshot)){
  await popup('warning','Pesanan sebelumnya belum dipastikan','Ada permintaan sebelumnya yang mungkin sudah tercatat. Periksa riwayat pesanan sebelum mengubah isi checkout.');return;
 }
 if(!secureBody){
  lastAttemptMeta.stage='server-quote';
  const quote=await secureCall(checkoutUser,{action:'quote',items:serverLines,voucherCodes});
  if(!validQuote(quote,serverLines,items,summary,order.vouchers)){
   await popup('warning','Harga atau voucher berubah','Total resmi berbeda dari yang ditampilkan. Muat ulang keranjang dan periksa kembali sebelum memesan.');return;
  }
  secureBody={action:'create',requestId:d.orderId,items:serverLines,voucherCodes,
   customer:order.customer,ekspedisi:d.ekspedisi,catatan:d.catatan,quoteHash:quote.quoteHash};
  pendingSecureCreate={body:secureBody,snapshot:stableJson(localSnapshot)};
 }
 lastAttemptMeta.stage='server-create';
 window.imamstoreCheckoutLastAttempt=Object.freeze({...lastAttemptMeta});
 serverReceipt=await secureCall(checkoutUser,secureBody);
 if(typeof serverReceipt.orderId!=='string'||!/^ORD-[A-Za-z0-9_-]{16,100}$/.test(serverReceipt.orderId)||
  !Array.isArray(serverReceipt.items)||serverReceipt.items.length!==items.length||
  !serverReceipt.totals||!serverReceipt.vouchers||
  !Number.isSafeInteger(serverReceipt.totals.totalBayar)||
  serverReceipt.totals.totalBayar!==summary.totalBayar){
  throw secureError('RECEIPT_INVALID');
 }
 d.orderId=serverReceipt.orderId;
}else{
const orderRef=store.collection('orders').doc(d.orderId);
try{
 await orderRef.set(order);
}catch(firstError){
 /* A lost response may conceal a successful commit. Check only this customer's
    exact document, compare full order contents and keep the same order number. */
 const alreadySaved=await findIdenticalCommittedOrder(orderRef,order);
 if(alreadySaved){
  lastAttemptMeta.existingOrderVerified=true;
  window.imamstoreCheckoutLastAttempt=Object.freeze({...lastAttemptMeta});
 }else{
  /* A stale identity token sometimes needs renewal. Retry only once after
     a verifiably refreshed token; never change an order's ID on retry. */
  let retried=false;
  if(String(firstError?.code||'')==='permission-denied' && firebase?.auth?.()?.currentUser?.uid===uid){
   try{
    lastAttemptMeta.tokenRefreshAttempted=true;
    const fresh=await checkoutUser.getIdTokenResult(true);
    const freshProvider=fresh?.claims?.firebase?.sign_in_provider||fresh?.signInProvider||'unknown';
    if(freshProvider!=='anonymous' && !checkoutUser.isAnonymous && fresh?.token && fresh.token!==token?.token){
     await orderRef.set(order);retried=true;
    }
   }catch(retryError){
    if(await findIdenticalCommittedOrder(orderRef,order))retried=true;
    else console.warn('[ImamStore R10 developer] Token refreshed but order still rejected',String(retryError?.code||'unknown'));
   }
  }
  window.imamstoreCheckoutLastAttempt=Object.freeze({...lastAttemptMeta});
  if(!retried)throw firstError;
 }
}
}
committed=true; window.imamstoreCheckoutLastError=null; /* Firestore mengonfirmasi commit: jangan izinkan submit ulang dari checkout yang sama. */
/* R5: order activity denotes a RECORDED REQUEST, not payment/verified purchase. */
try{document.dispatchEvent(new CustomEvent('nine:productactivity',{detail:{type:'order',ids:[...grouped.keys()]}}))}catch{};
if(note)note.textContent='Pesanan '+(serverReceipt?.orderNumber||d.orderId)+' berhasil tercatat.';/* Konfirmasi sukses ditampilkan melalui modal checkout, tanpa toast lintas halaman. */
button.textContent='Pesanan tercatat';
/* R13: proses aman = commit orders -> bersihkan item terpesan ->
   tampilkan dialog WA wajib -> buka chat hanya dari klik, tidak submit ulang. */
const waItems=serverReceipt?.items||items,waTotals=serverReceipt?.totals||summary,waVouchers=serverReceipt?.vouchers||order.vouchers;
const waUrl='https://wa.me/'+ADMIN+'?text='+encodeURIComponent(message({...d,orderId:serverReceipt?.orderNumber||d.orderId,createdAt:new Date()},waItems,waTotals,waVouchers));
/* Keranjang dikonsolidasikan segera setelah server mengonfirmasi commit.
   Menutup tab saat dialog WA aktif tidak mengembalikan item yang sudah dipesan. */
try{
 const cart=read(KEY,[]),counts=new Map();
 if(!directBuy)lines.forEach(x=>counts.set(String(x.key),(counts.get(String(x.key))||0)+Number(x.qty)));
 const remaining=cart.map(x=>{const n=counts.get(String(x.key))||0;
  return n?{...x,qty:Math.max(0,Number(x.qty)-n)}:x}).filter(x=>Number(x.qty)>0);
 localStorage.setItem(KEY,JSON.stringify(remaining));
 window.dispatchEvent(new Event('storage'));
 window.imamstoreV43?.sync?.();window.imamstoreReferenceV38?.refresh?.();
}catch(e){console.warn('[ImamStore developer] Sinkronisasi keranjang pasca-order',e)}
await confirmWhatsAppRequired(d.orderId,waUrl,serverReceipt?.paymentDueAt,checkoutUser,serverReceipt?.orderNumber);
/* Setelah dialog sukses selesai, tutup checkout dan hapus hanya state transaksi sementara. */
window.__nexaiCheckoutLines=null;window.__nexaiCheckoutMode=null;window.imamstoreV43?.endCheckout?.();
const draft=$('s5Draft');
if(draft){
 draft.classList.remove('open');
 const rows=$('s5DraftItems');if(rows)rows.replaceChildren();
}
document.body.classList.remove('stage4-detail-open');
for(const id of ['refCheckoutCount','refCheckoutSubtotal','refCheckoutDiscount','s5DraftTotal','refCheckoutFooterTotal']){
 const el=$(id);if(el)el.textContent=id==='refCheckoutCount'?'0':money(0);
}
for(const id of ['refTermsBody','refTermsFooter']){const el=$(id);if(el)el.checked=false}
if($('refOrderNote'))$('refOrderNote').value='';
if(note)note.textContent='';
try{window.imamstoreReferenceV38?.refresh?.();window.imamstoreV43?.sync?.()}catch(e){console.warn('Refresh setelah checkout',e)}
/* Pembukaan WhatsApp sudah dilakukan langsung dari klik tombol modal. */

}catch(err){console.error('[ImamStore R9 developer] Checkout request failed',err);if(committed){console.warn('[ImamStore R9 developer] Order committed; only post-checkout failed',err);return;}
const customerMessage=err?.apiCode?{title:'Checkout belum diproses',text:err.publicMessage}:window.imamstoreCustomerCheckoutR7.serviceError(err);
if(note)note.textContent=customerMessage.title+'. Pesanan belum dinyatakan berhasil.';
const technicalCode=String(err?.code||'unknown');
const failureStage=lastAttemptMeta?.stage||(technicalCode.startsWith('auth/')?'auth-session':'prewrite');
const diagnostic=Object.freeze({stage:failureStage,code:technicalCode,project:firebase?.app?.()?.options?.projectId||'unavailable',provider:lastAttemptMeta?.provider||'unknown',preflight:lastAttemptMeta?.preflight||'not-completed',items:lastAttemptMeta?.items??0,authenticated:!!firebase?.auth?.()?.currentUser,isAnonymous:!!firebase?.auth?.()?.currentUser?.isAnonymous});
window.imamstoreCheckoutLastError=diagnostic;
console.warn('[ImamStore R9 developer] Checkout diagnostic (tanpa alamat/nomor telepon):',diagnostic);
if(technicalCode==='permission-denied'&&diagnostic.preflight==='passed') console.warn('[ImamStore R9 developer] Lokal valid, permintaan ditolak server. Periksa Firestore Rules /orders/{orderId}, provider Auth, dan rules yang benar-benar terbit. App Check enforcement yang OFF tidak mematikan Security Rules.');
const assistanceCode=technicalCode==='permission-denied'?'IS-C02':technicalCode==='failed-precondition'?'IS-C03':technicalCode.startsWith('auth/')?'IS-C04':technicalCode.includes('network')||technicalCode==='unavailable'?'IS-C05':'IS-C01';
await popup('error',customerMessage.title,customerMessage.text+' Kode bantuan: '+assistanceCode+'.')}finally{busy=false;button.textContent=committed?'Pesanan tercatat':'Buat Pesanan';refresh()}}
/* Reset guard hanya setelah checkout benar-benar ditutup dan sesi baru dibuka. */
const checkoutPanel=$('s5Draft');let lastOpen=!!checkoutPanel?.classList.contains('open');
if(checkoutPanel)new MutationObserver(()=>{
 const now=checkoutPanel.classList.contains('open');
 if(now&&!lastOpen){committed=false;pendingOrderId=null;lastAttemptMeta=null;pendingSecureCreate=null;window.imamstoreCheckoutLastError=null;window.imamstoreCheckoutLastAttempt=null;button.textContent='Buat Pesanan';if(note)note.textContent='';refresh()}
 lastOpen=now;
}).observe(checkoutPanel,{attributes:true,attributeFilter:['class']});
/* Penangkap awal mencegah handler lain mengirim ulang ketika transaksi sudah commit. */
checkoutPanel?.addEventListener('click',e=>{
 if(!committed||!e.target.closest('#refPlaceOrder'))return;
 e.preventDefault();e.stopImmediatePropagation();
},true);
button.onclick=submit;for(const id of ['refTermsBody','refTermsFooter'])$(id)?.addEventListener('change',refresh);for(const id of ['s5CartItems','s5DraftItems']){const el=$(id);if(el)new MutationObserver(refresh).observe(el,{childList:true,subtree:true})}window.addEventListener('storage',refresh);setInterval(refresh,1800);if(note)note.textContent='Pesanan akan tercatat dan menunggu konfirmasi admin.';refresh();
window.imamstoreOriginalCheckout=Object.freeze({ready,submit,version:'v51-r14-secure-transport-ready'});
})();
