
document.addEventListener('DOMContentLoaded',function(){
'use strict';
const dialog=document.getElementById('nexaiOrdersDialog'),message=document.getElementById('nexaiOrdersMessage'),list=document.getElementById('nexaiOrdersList');
const invoice=document.getElementById('nexaiInvoiceDialog'),invoiceBody=document.getElementById('nexaiInvoiceBody');
if(!dialog||!message||!list||!invoice||!invoiceBody)return;
let previousFocus=null,detailFocus=null,loadToken=0;
const el=(tag,cls,content)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=String(content??'');return e};
const val=v=>v===null||v===undefined||String(v).trim()===''?'Belum tersedia':String(v);
const rupiah=n=>Number.isFinite(Number(n))?'Rp'+Math.round(Number(n)).toLocaleString('id-ID'):'Belum tersedia';
const date=v=>{try{const d=v?.toDate?.()||(v?.seconds?new Date(v.seconds*1000):v?new Date(v):null);return d&&!isNaN(d.getTime())?d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}):'Belum tersedia'}catch{return 'Belum tersedia'}};
const statuses={expired:'Kedaluwarsa',checkout_created:'Menunggu konfirmasi',pending:'Menunggu konfirmasi',confirmed:'Dikonfirmasi',processing:'Diproses',packed:'Dikemas',shipped:'Dikirim',delivered:'Terkirim',completed:'Selesai',cancelled:'Dibatalkan',canceled:'Dibatalkan'};
const status=v=>statuses[String(v||'').toLowerCase()]||val(v);
const line=(parent,label,value)=>{const row=el('div','nexai-invoice-line');row.append(el('span','',label),el('strong','',val(value)));parent.append(row)};
const section=(heading)=>{const node=el('section','nexai-invoice-section');node.append(el('h3','',heading));invoiceBody.append(node);return node};
function closeInvoice(){invoice.hidden=true;invoiceBody.replaceChildren();detailFocus?.focus?.()}
function close(){loadToken++;closeInvoice();dialog.hidden=true;document.body.style.removeProperty('overflow');list.replaceChildren();historyCount=0;historyCursor=null;hasMoreOrders=false;historyUid='';dialog.removeAttribute('data-owner-uid');renderHistoryPager();previousFocus?.focus?.()}
function showInvoice(data){
 detailFocus=document.activeElement;invoiceBody.replaceChildren();
 const id=val(data.orderNumber||data.orderId),customer=data.customer||{},totals=data.totals||{},items=Array.isArray(data.items)?data.items:[];
 const heading=section('Informasi pesanan');
 line(heading,'Nomor pesanan',id);line(heading,'Dibuat',date(data.createdAt));line(heading,'Diperbarui',date(data.updatedAt));
 line(heading,'Status pesanan',status(data.status));
 if(data.paymentDueAt&&String(data.status||'')==='checkout_created')line(heading,'Selesaikan pembayaran sebelum',date(data.paymentDueAt));line(heading,'Metode pemesanan',data.channel==='whatsapp'?'Konfirmasi via WhatsApp':val(data.channel));
 const productSection=section('Produk yang dipesan');
 if(!items.length)productSection.append(el('p','nexai-invoice-footnote','Rincian produk belum tersedia.'));
 items.forEach(x=>{
  const card=el('div','nexai-invoice-product'),info=el('div','nexai-invoice-product-info');
  info.append(el('strong','',val(x.nama||x.name||x.title)),el('small','','Varian: '+val(x.varian||x.variant)+' · Jumlah: '+val(x.qty)));
  info.append(el('strong','',rupiah(Number(x.harga)*Number(x.qty))));
  // Gambar hanya dari URL HTTPS yang sudah tersimpan dalam pesanan; tidak ditebak.
  const src=String(x.image||x.gambar||'');
  if(/^https:\/\/[^ ]+$/i.test(src)){const img=el('img');img.src=src;img.alt='Foto produk';img.loading='lazy';img.referrerPolicy='no-referrer';card.append(img)}
  card.append(info);productSection.append(card);
 });
 const ship=section('Penerima & pengiriman');
 line(ship,'Nama penerima',customer.nama||customer.name);line(ship,'WhatsApp',customer.wa||customer.phone);
 line(ship,'Alamat',customer.alamat||customer.address);line(ship,'Kota',customer.kota||customer.city);
 line(ship,'Provinsi',customer.provinsi||customer.province);line(ship,'Kode pos',customer.kodepos||customer.postal);
 line(ship,'Ekspedisi',data.ekspedisi||data.shipping?.courier);
 line(ship,'Nomor resi / AWB',data.awb||data.resi||data.trackingNumber||data.shipping?.awb);
 const breakdown=section('Ringkasan pembayaran');
 line(breakdown,'Jumlah item',totals.totalItem??items.reduce((a,x)=>a+(Number(x.qty)||0),0));
 line(breakdown,'Subtotal produk',rupiah(totals.subtotal));
 line(breakdown,'Diskon produk',rupiah(totals.productDiscount||0));
 line(breakdown,'Voucher produk',totals.productVoucherName||data.vouchers?.product);
 line(breakdown,'Potongan ongkir',rupiah(totals.shippingDiscount||0));
 line(breakdown,'Voucher ongkir',totals.shippingVoucherName||data.vouchers?.shipping);
 line(breakdown,'Ongkos kirim',Number.isFinite(Number(data.shippingCost))&&data.shippingCost!==undefined?rupiah(data.shippingCost):'Dikonfirmasi penjual');
 const total=el('div','nexai-invoice-line nexai-invoice-total');total.append(el('span','','Total pesanan'),el('strong','',rupiah(totals.totalBayar)));breakdown.append(total);
 if(data.catatan){const notes=section('Catatan pelanggan');notes.append(el('p','nexai-invoice-footnote',data.catatan))}
 const foot=el('p','nexai-invoice-footnote','Ini rincian pesanan, bukan bukti pembayaran. Total dan ongkir akhir mengikuti konfirmasi penjual. Nomor pesanan bukan nomor resi.');
 invoiceBody.append(foot);
 const copy=el('button','nexai-invoice-primary','Salin nomor pesanan');copy.type='button';copy.addEventListener('click',()=>copyId(id,copy));invoiceBody.append(copy);reportAction(data,invoiceBody);
 invoice.hidden=false;invoice.querySelector('.nexai-invoice-panel').scrollTop=0;document.getElementById('nexaiInvoiceClose')?.focus();
}
async function copyId(id,button){try{await navigator.clipboard.writeText(id);button.textContent='Nomor berhasil disalin'}catch{if(window.Swal?.fire){await window.Swal.fire({title:'Nomor pesanan',text:id,confirmButtonColor:'#8cc63f'});}else{button.textContent='Salin manual: '+id;}}}
function renderOrder(data){
 const card=el('article','nexai-order-card'),top=el('div','nexai-order-top'),left=el('div');
 left.append(el('strong','',date(data.createdAt)),el('span','nexai-order-number','No. '+val(data.orderNumber||data.orderId)));
 top.append(left,el('span','nexai-status',status(data.status)));card.append(top);
 const items=Array.isArray(data.items)?data.items:[];
 const names=items.map(x=>x.nama||x.name||x.title).filter(Boolean);
 card.append(el('div','nexai-order-preview',names.length?names.slice(0,2).join(' · ')+(names.length>2?' +'+(names.length-2)+' produk lainnya':''):'Rincian produk belum tersedia'));
 const total=el('div','nexai-order-money');total.append(el('span','','Total pesanan'),el('strong','',rupiah(data.totals?.totalBayar)));card.append(total);
 const actions=el('div','nexai-order-actions');
 const detail=el('button','nexai-detail-btn','Lihat Rincian');detail.type='button';detail.addEventListener('click',()=>showInvoice(data));
 const copy=el('button','','Salin Nomor');copy.type='button';copy.addEventListener('click',()=>copyId(val(data.orderNumber||data.orderId),copy));
 const waUrl=window.imamstoreOrderWhatsAppURL?.({...data,orderId:data.orderNumber||data.orderId});
 if(waUrl){const wa=el('a','nexai-detail-btn','Kirim via WhatsApp');wa.href=waUrl;wa.target='_blank';wa.rel='noopener noreferrer';
  wa.style.cssText='display:inline-flex;align-items:center;text-decoration:none;border:1px solid #8cc63f;border-radius:8px;padding:8px 11px;color:#4b7721;font-size:13px;font-weight:700;background:#fff';actions.append(wa)}
 actions.append(detail,copy);reportAction(data,actions);
 if(String(data.status||'').toLowerCase()==='completed'){
  const unique=new Map(items.filter(x=>/^[A-Za-z0-9_-]{1,120}$/.test(String(x.productId||''))).map(x=>[String(x.productId),x]));
  for(const [pid,item] of unique){
   const review=el('button','nexai-review-item','Beri Ulasan');review.type='button';
   review.dataset.imamReviewItem=String(data.orderId)+'::'+pid;
   review.setAttribute('aria-label','Beri ulasan '+String(item.nama||'produk'));
   review.addEventListener('click',()=>window.imamstoreCustomerTrust?.openFromOrder(pid,String(data.orderId)));
   actions.append(review);
  }
 }
 card.append(actions);return card;
}
// R3: payment report is accessible from Pesanan Saya even after checkout/WhatsApp.
// It never marks the order as paid: Admin still verifies actual bank settlement.
async function reportPaid(data,button){
 if(data.status!=='checkout_created'||!data.paymentDueAt)return;
 const due=data.paymentDueAt?.toDate?.()||new Date(data.paymentDueAt);
 if(!Number.isFinite(due.getTime())||due.getTime()<=Date.now()){
  button.textContent='Batas pembayaran telah lewat';button.disabled=true;return;
 }
 if(!window.Swal?.fire){
  message.textContent='Konfirmasi pembayaran belum siap. Silakan hubungi toko melalui WhatsApp.';return;
 }
 const decision=await Swal.fire({title:'Sudah melakukan pembayaran?',
  text:'Laporan akan dikirim ke toko untuk diperiksa. Laporan ini bukan bukti pembayaran berhasil.',
  icon:'question',showCancelButton:true,confirmButtonText:'Ya, laporkan',cancelButtonText:'Batal',
  confirmButtonColor:'#8cc63f'});
 if(!decision.isConfirmed)return;
 const user=window.firebase?.auth?.()?.currentUser;
 if(!user||user.isAnonymous){await Swal.fire({icon:'warning',title:'Silakan masuk kembali'});return}
 button.disabled=true;const original=button.textContent;button.textContent='Mengirim laporan…';
 try{
  const token=await user.getIdToken();
  const response=await fetch('/.netlify/functions/checkout-security',{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
   cache:'no-store',body:JSON.stringify({action:'report_payment',orderId:data.orderId})});
  const result=await response.json();
  if(!response.ok||result?.success!==true)throw Error(result?.code||'REPORT_FAILED');
  await Swal.fire({icon:'success',title:'Laporan diterima',
   text:'Toko akan memeriksa pembayaranmu. Kamu dapat memantau pesanan di sini.',confirmButtonColor:'#8cc63f'});
  await open();
 }catch(err){button.textContent=original;button.disabled=false;
  await Swal.fire({icon:'error',title:'Laporan belum terkirim',
   text:'Coba beberapa saat lagi atau hubungi toko melalui WhatsApp.',confirmButtonColor:'#8cc63f'});
 }
}
function reportAction(data,actions){
 if(data.status!=='checkout_created'||!data.paymentDueAt||data.paymentReportedAt)return;
 const due=data.paymentDueAt?.toDate?.()||new Date(data.paymentDueAt);
 if(!Number.isFinite(due.getTime())||Date.now()>=due.getTime())return;
 const btn=el('button','nexai-detail-btn','Laporkan Pembayaran');btn.type='button';
 btn.addEventListener('click',()=>reportPaid(data,btn));actions.append(btn);
}
// R6: Firestore-side newest-first pagination; never sort a random limited set.
// Privacy remains enforced by the Firebase Auth UID and /orders security rules.
const HISTORY_PAGE_SIZE=10;
const pager=el('div','nexai-orders-pager-r6');pager.id='nexaiOrdersPagerR6';pager.hidden=true;
const pagerCount=el('p','nexai-orders-count-r6');pagerCount.setAttribute('aria-live','polite');
const moreOrders=el('button','nexai-orders-more-r6','Muat 10 Pesanan Lagi');moreOrders.type='button';
const pagerDone=el('p','nexai-orders-done-r6','Semua pesanan dari akun ini sudah ditampilkan.');
pager.append(pagerCount,moreOrders,pagerDone);list.insertAdjacentElement('afterend',pager);
if(!document.getElementById('nexaiOrdersPaginationStyleR6')){
 const css=el('style');css.id='nexaiOrdersPaginationStyleR6';css.textContent=`
  #nexaiOrdersPagerR6[hidden]{display:none}
  #nexaiOrdersPagerR6{padding:14px 12px 20px;text-align:center;border-top:1px solid #e8eddf;margin-top:10px}
  #nexaiOrdersPagerR6 .nexai-orders-count-r6{font-size:13px;line-height:1.55;color:#566154;margin:0 0 12px}
  #nexaiOrdersPagerR6 .nexai-orders-more-r6{width:100%;max-width:400px;min-height:49px;border:1px solid #8cc63f;border-radius:13px;background:#8cc63f;color:#1c2c13;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;transition:background .15s ease,transform .15s ease,opacity .15s ease}
  #nexaiOrdersPagerR6 .nexai-orders-more-r6:active{transform:scale(.975);background:#a2d85d}
  #nexaiOrdersPagerR6 .nexai-orders-more-r6:focus-visible{outline:3px solid #577f29;outline-offset:3px}
  #nexaiOrdersPagerR6 .nexai-orders-more-r6:disabled{opacity:.65;cursor:progress;transform:none}
  #nexaiOrdersPagerR6 .nexai-orders-done-r6{color:#647263;font-size:12px;line-height:1.5;margin:4px 0}
  @media(prefers-reduced-motion:reduce){#nexaiOrdersPagerR6 .nexai-orders-more-r6{transition:none}}
 `;document.head.append(css);
}
let historyCursor=null,historyCount=0,historyUid='',hasMoreOrders=false,requestInFlight=false;
function renderHistoryPager(){
 pager.hidden=historyCount===0;
 moreOrders.hidden=!hasMoreOrders;
 pagerDone.hidden=hasMoreOrders;
 pagerCount.textContent=hasMoreOrders
  ?'Sudah tampil '+historyCount+' pesanan. Pesanan yang lebih lama masih bisa dilihat.'
  :'Total '+historyCount+' pesanan dari akun ini telah ditampilkan.';
}
async function loadHistoryPage(older=false){
 if(requestInFlight||(older&&(!hasMoreOrders||!historyCursor)))return;
 const serial=loadToken,uid=historyUid;
 const current=window.firebase?.auth?.()?.currentUser;
 if(!current||current.isAnonymous||current.uid!==uid){
  message.textContent='Akun pelanggan berubah. Silakan buka kembali Pesanan Saya.';return;
 }
 requestInFlight=true;moreOrders.disabled=true;
 const oldText=moreOrders.textContent;moreOrders.textContent='Memuat pesanan…';
 message.textContent=older?'Memuat pesanan lebih lama…':'Mengambil pesanan terbaru dari akun ini…';
 try{
  // +1 look-ahead, so the button disappears precisely at the end of the history.
  let query=firebase.firestore().collection('orders')
   .where('uid','==',uid).orderBy('createdAt','desc').limit(HISTORY_PAGE_SIZE+1);
  if(older)query=query.startAfter(historyCursor);
  // Do not silently show stale cached data as if it were the latest orders.
  const snap=await query.get({source:'server'});
  if(serial!==loadToken||dialog.hidden||firebase.auth().currentUser?.uid!==uid)return;
  const page=snap.docs.slice(0,HISTORY_PAGE_SIZE);
  const fragment=document.createDocumentFragment();
  page.forEach(d=>fragment.append(renderOrder({...d.data(),orderId:d.data().orderId||d.id})));
  if(older){list.append(fragment);historyCount+=page.length;}
  else{list.replaceChildren(fragment);historyCount=page.length;}
  historyCursor=page.length?page[page.length-1]:older?historyCursor:null;
  hasMoreOrders=snap.docs.length>HISTORY_PAGE_SIZE;
  renderHistoryPager();
  message.textContent=historyCount
   ?'Menampilkan '+historyCount+' pesanan, dari yang terbaru. '+(hasMoreOrders?'Pilih Muat 10 Pesanan Lagi untuk melihat pesanan sebelumnya.':'Seluruh riwayat dari akun ini sudah ditampilkan.')
   :'Belum ada pesanan di akun ini. Jika baru memesan, pastikan akun yang digunakan sama dengan saat checkout.';
 }catch(e){
  if(serial!==loadToken)return;
  console.warn('ImamStore order history read failed',e);
  const base=historyCount?'Pesanan yang sudah tampil tetap tersimpan di layar. ':'Riwayat pesanan belum dapat ditampilkan. ';
  const problem=e?.code==='permission-denied'?'Periksa akun yang sedang digunakan lalu coba lagi.':
   e?.code==='failed-precondition'?'Layanan riwayat pesanan sedang disiapkan. Hubungi toko jika perlu bantuan.':
   'Periksa koneksi internet lalu pilih Perbarui.';
  message.textContent=base+problem;
 }finally{
  if(serial===loadToken){requestInFlight=false;moreOrders.disabled=false;moreOrders.textContent=oldText;}
 }
}
async function open(){
 const wasHidden=dialog.hidden;
 const token=++loadToken;
 if(wasHidden)previousFocus=document.activeElement;
 dialog.hidden=false;document.body.style.overflow='hidden';
 document.getElementById('nexaiOrdersClose')?.focus();
 message.textContent='Memeriksa akun pelanggan…';
 try{
  if(!window.firebase?.auth||!window.firebase?.firestore){message.textContent='Layanan akun belum siap. Silakan coba lagi.';return}
  const auth=firebase.auth();await auth.authStateReady?.();if(token!==loadToken)return;
  const user=auth.currentUser;
  if(!user||user.isAnonymous){
   list.replaceChildren();historyUid='';historyCount=0;historyCursor=null;hasMoreOrders=false;renderHistoryPager();
   message.textContent='Masuk menggunakan akun yang dipakai saat checkout agar pesanan Anda dapat ditampilkan.';
   const b=el('button','nexai-orders-open','Masuk ke akun pelanggan');b.type='button';
   b.addEventListener('click',async()=>{if(await window.nexaiRequireCustomerLogin?.()){close();open()}});list.append(b);return;
  }
  historyUid=user.uid;
  // Do not destroy the previous list before a new successful server response.
  // If the customer changes account, never expose the prior account's cards.
  if(dialog.dataset.ownerUid!==user.uid){list.replaceChildren();historyCount=0;historyCursor=null;hasMoreOrders=false;renderHistoryPager();}
  dialog.dataset.ownerUid=user.uid;
  requestInFlight=false;
  await loadHistoryPage(false);
 }catch(e){if(token!==loadToken)return;console.warn('ImamStore order history auth failed',e);message.textContent='Akun pelanggan belum siap. Silakan coba lagi.'}
}
moreOrders.addEventListener('click',()=>loadHistoryPage(true));
window.nexaiOpenOrders=open;
document.getElementById('nexaiOrdersRefresh')?.addEventListener('click',open);
document.getElementById('nexaiOrdersClose')?.addEventListener('click',close);
document.getElementById('nexaiInvoiceClose')?.addEventListener('click',closeInvoice);
dialog.addEventListener('click',e=>{if(e.target===dialog)close()});
invoice.addEventListener('click',e=>{if(e.target===invoice)closeInvoice()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!invoice.hidden)closeInvoice();else if(!dialog.hidden)close()}});
const actions=document.querySelector('.hero-actions')||document.querySelector('.store-actions');
if(actions&&!document.getElementById('nexaiOrdersLauncher')){const b=el('button','nexai-orders-open','Pesanan Saya');b.id='nexaiOrdersLauncher';b.type='button';b.addEventListener('click',open);actions.append(b)}
if(new URLSearchParams(location.search).get('orders')==='1'){open()}
});
