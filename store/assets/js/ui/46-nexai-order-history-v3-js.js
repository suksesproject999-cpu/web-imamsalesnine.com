
document.addEventListener('DOMContentLoaded',function(){
'use strict';
const dialog=document.getElementById('nexaiOrdersDialog'),message=document.getElementById('nexaiOrdersMessage'),list=document.getElementById('nexaiOrdersList');
const invoice=document.getElementById('nexaiInvoiceDialog'),invoiceBody=document.getElementById('nexaiInvoiceBody');
if(!dialog||!message||!list||!invoice||!invoiceBody)return;
let previousFocus=null,detailFocus=null,loading=false,loadToken=0;
const el=(tag,cls,content)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=String(content??'');return e};
const val=v=>v===null||v===undefined||String(v).trim()===''?'Belum tersedia':String(v);
const rupiah=n=>Number.isFinite(Number(n))?'Rp'+Math.round(Number(n)).toLocaleString('id-ID'):'Belum tersedia';
const date=v=>{try{const d=v?.toDate?.()||(v?.seconds?new Date(v.seconds*1000):v?new Date(v):null);return d&&!isNaN(d.getTime())?d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}):'Belum tersedia'}catch{return 'Belum tersedia'}};
const statuses={checkout_created:'Menunggu konfirmasi',pending:'Menunggu konfirmasi',confirmed:'Dikonfirmasi',processing:'Diproses',packed:'Dikemas',shipped:'Dikirim',delivered:'Terkirim',completed:'Selesai',cancelled:'Dibatalkan',canceled:'Dibatalkan'};
const status=v=>statuses[String(v||'').toLowerCase()]||val(v);
const line=(parent,label,value)=>{const row=el('div','nexai-invoice-line');row.append(el('span','',label),el('strong','',val(value)));parent.append(row)};
const section=(heading)=>{const node=el('section','nexai-invoice-section');node.append(el('h3','',heading));invoiceBody.append(node);return node};
function closeInvoice(){invoice.hidden=true;invoiceBody.replaceChildren();detailFocus?.focus?.()}
function close(){loadToken++;closeInvoice();dialog.hidden=true;document.body.style.removeProperty('overflow');previousFocus?.focus?.()}
function showInvoice(data){
 detailFocus=document.activeElement;invoiceBody.replaceChildren();
 const id=val(data.orderId),customer=data.customer||{},totals=data.totals||{},items=Array.isArray(data.items)?data.items:[];
 const heading=section('Informasi pesanan');
 line(heading,'Nomor pesanan',id);line(heading,'Dibuat',date(data.createdAt));line(heading,'Diperbarui',date(data.updatedAt));
 line(heading,'Status pesanan',status(data.status));line(heading,'Metode pemesanan',data.channel==='whatsapp'?'Konfirmasi via WhatsApp':val(data.channel));
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
 const copy=el('button','nexai-invoice-primary','Salin nomor pesanan');copy.type='button';copy.addEventListener('click',()=>copyId(id,copy));invoiceBody.append(copy);
 invoice.hidden=false;invoice.querySelector('.nexai-invoice-panel').scrollTop=0;document.getElementById('nexaiInvoiceClose')?.focus();
}
async function copyId(id,button){try{await navigator.clipboard.writeText(id);button.textContent='Nomor berhasil disalin'}catch{window.prompt('Salin nomor pesanan:',id)}}
function renderOrder(data){
 const card=el('article','nexai-order-card'),top=el('div','nexai-order-top'),left=el('div');
 left.append(el('strong','',date(data.createdAt)),el('span','nexai-order-number','No. '+val(data.orderId)));
 top.append(left,el('span','nexai-status',status(data.status)));card.append(top);
 const items=Array.isArray(data.items)?data.items:[];
 const names=items.map(x=>x.nama||x.name||x.title).filter(Boolean);
 card.append(el('div','nexai-order-preview',names.length?names.slice(0,2).join(' · ')+(names.length>2?' +'+(names.length-2)+' produk lainnya':''):'Rincian produk belum tersedia'));
 const total=el('div','nexai-order-money');total.append(el('span','','Total pesanan'),el('strong','',rupiah(data.totals?.totalBayar)));card.append(total);
 const actions=el('div','nexai-order-actions');
 const detail=el('button','nexai-detail-btn','Lihat Rincian');detail.type='button';detail.addEventListener('click',()=>showInvoice(data));
 const copy=el('button','','Salin Nomor');copy.type='button';copy.addEventListener('click',()=>copyId(val(data.orderId),copy));
 const waUrl=window.imamstoreOrderWhatsAppURL?.(data);
 if(waUrl){const wa=el('a','nexai-detail-btn','Kirim via WhatsApp');wa.href=waUrl;wa.target='_blank';wa.rel='noopener noreferrer';
  wa.style.cssText='display:inline-flex;align-items:center;text-decoration:none;border:1px solid #8cc63f;border-radius:8px;padding:8px 11px;color:#4b7721;font-size:13px;font-weight:700;background:#fff';actions.append(wa)}
 actions.append(detail,copy);
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
async function open(){
 const token=++loadToken;previousFocus=document.activeElement;dialog.hidden=false;document.body.style.overflow='hidden';document.getElementById('nexaiOrdersClose')?.focus();list.replaceChildren();message.textContent='Memeriksa akun pelanggan…';
 try{
  if(!window.firebase?.auth||!window.firebase?.firestore){message.textContent='Layanan akun belum siap. Silakan coba lagi.';return}
  const auth=firebase.auth();await auth.authStateReady?.();if(token!==loadToken)return;
  const user=auth.currentUser;
  if(!user||user.isAnonymous){message.textContent='Masuk menggunakan Google atau email untuk melihat pesanan akun Anda.';const b=el('button','nexai-orders-open','Masuk ke akun pelanggan');b.type='button';b.addEventListener('click',async()=>{if(await window.nexaiRequireCustomerLogin?.()){close();open()}});list.append(b);return}
  message.textContent='Memuat riwayat pesanan…';
  const snap=await firebase.firestore().collection('orders').where('uid','==',user.uid).limit(40).get();
  if(token!==loadToken)return;
  const docs=snap.docs.map(d=>({...d.data(),orderId:d.data().orderId||d.id})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,10);
  if(!docs.length){message.textContent='Belum ada pesanan yang terhubung ke akun ini.';return}
  message.textContent='Menampilkan '+docs.length+' pesanan terbaru dari akun ini.';
  docs.forEach(d=>list.append(renderOrder(d)));
 }catch(e){if(token!==loadToken)return;console.warn('Order history read failed',e);message.textContent=e?.code==='permission-denied'?'Riwayat pesanan belum dapat ditampilkan. Silakan masuk kembali atau hubungi layanan pelanggan.':'Riwayat pesanan belum dapat dimuat. Periksa koneksi dan coba lagi.'}
}
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
