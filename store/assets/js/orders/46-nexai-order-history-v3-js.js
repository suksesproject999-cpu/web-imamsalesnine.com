
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
// Premium Order Center R7: actions and messages are based only on recorded fields.
function paymentState(d){
 const st=String(d.status||'').toLowerCase();
 if(st==='checkout_created'&&d.paymentReportedAt)return 'Laporan pembayaran diterima. Penjual sedang memeriksa pembayaran; belum dinyatakan lunas.';
 if(st==='checkout_created'){
  const due=d.paymentDueAt?.toDate?.()|| (d.paymentDueAt?new Date(d.paymentDueAt):null);
  if(due&&Number.isFinite(due.getTime())&&due.getTime()<=Date.now())return 'Batas pembayaran telah lewat. Buka rincian atau hubungi toko untuk bantuan.';
  return 'Pesanan berhasil dibuat. Jika sudah membayar, laporkan melalui rincian pesanan agar penjual dapat memeriksanya.';
 }
 if(st==='expired')return 'Batas pembayaran telah berakhir. Pesanan ini tidak dapat diproses kembali tanpa konfirmasi penjual.';
 if(st==='cancelled'||st==='canceled')return 'Pesanan dibatalkan. Hubungi toko jika memerlukan penjelasan lebih lanjut.';
 if(st==='confirmed')return 'Pesanan sudah dikonfirmasi. Pantau perkembangan penyiapan dan pengirimannya di sini.';
 if(st==='processing'||st==='packed')return 'Pesanan sedang disiapkan untuk pengiriman.';
 if(st==='shipped')return 'Pesanan sedang dalam pengiriman. Nomor resi tersedia bila sudah dicatat penjual.';
 if(st==='delivered')return 'Pesanan tercatat telah diterima. Periksa barang dan rincian pesanan.';
 if(st==='completed')return 'Pesanan telah selesai. Terima kasih sudah berbelanja di ImamStore.';
 return 'Buka rincian untuk melihat informasi terbaru yang tercatat pada pesanan.';
}
function orderGroup(d){
 const st=String(d.status||'').toLowerCase();
 if(st==='checkout_created'||st==='pending')return d.paymentReportedAt?'action':'payment';
 if(st==='confirmed'||st==='processing'||st==='packed')return 'process';
 if(st==='shipped'||st==='delivered')return 'shipping';
 if(st==='completed')return 'done';
 return 'other';
}
function addTimeline(d){
 const box=el('section','nexai-premium-timeline');
 box.append(el('h3','', 'Perjalanan pesanan'));
 const note=el('p','nexai-premium-timeline-intro',paymentState(d));box.append(note);
 const steps=[['Pesanan dibuat', d.createdAt, true]];
 const st=String(d.status||'').toLowerCase();
 if(st==='checkout_created'||st==='pending'){
  if(d.paymentReportedAt)steps.push(['Pembayaran dilaporkan', d.paymentReportedAt, true]);
  steps.push([d.paymentReportedAt?'Menunggu verifikasi pembayaran':'Menunggu pembayaran atau konfirmasi',null,false]);
 }else if(st==='expired'||st==='cancelled'||st==='canceled'){
  steps.push([st==='expired'?'Batas pembayaran berakhir':'Pesanan dibatalkan',null,true]);
 }else{
  const chain=[['confirmed','Pesanan dikonfirmasi','confirmedAt'],['processing','Sedang diproses','processingAt'],['packed','Sedang dikemas','packedAt'],['shipped','Dikirim','shippedAt'],['delivered','Terkirim','deliveredAt'],['completed','Selesai','completedAt']];
  const i=chain.findIndex(x=>x[0]===st);
  chain.forEach((x,k)=>{if(k<=i)steps.push([x[1], d[x[2]]||null,true]);});
 }
 const timeline=el('ol','nexai-premium-steps');
 for(const [label,at,done] of steps){
  const li=el('li',done?'is-done':'is-current');li.append(el('strong','',label));
  if(at)li.append(el('span','',date(at)));
  else if(label===steps[steps.length-1][0])li.append(el('span','','Status terakhir yang tercatat'));
  timeline.append(li);
 }
 box.append(timeline);box.append(el('p','nexai-premium-timeline-footnote','Waktu setiap perubahan status hanya ditampilkan jika tersedia di catatan pesanan.'));return box;
}
const line=(parent,label,value)=>{const row=el('div','nexai-invoice-line');row.append(el('span','',label),el('strong','',val(value)));parent.append(row)};
const section=(heading)=>{const node=el('section','nexai-invoice-section');node.append(el('h3','',heading));invoiceBody.append(node);return node};
function closeInvoice(){invoice.hidden=true;invoiceBody.replaceChildren();detailFocus?.focus?.()}
function close(){loadToken++;closeInvoice();dialog.hidden=true;document.body.style.removeProperty('overflow');list.replaceChildren();historyCount=0;historyCursor=null;hasMoreOrders=false;historyUid='';dialog.removeAttribute('data-owner-uid');renderHistoryPager();searchInput.value='';activeFilter='all';chips.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.filter==='all')));applyPremiumFilter();previousFocus?.focus?.()}
function showInvoice(data){
 detailFocus=document.activeElement;invoiceBody.replaceChildren();
 const id=val(data.orderNumber||data.orderId),customer=data.customer||{},totals=data.totals||{},items=Array.isArray(data.items)?data.items:[];
 invoiceBody.append(addTimeline(data));
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
 const card=el('article','nexai-order-card nexai-premium-order-card');
 const id=val(data.orderNumber||data.orderId),group=orderGroup(data);
 card.dataset.premiumGroup=group;
 card.dataset.premiumSearch=[id,...(Array.isArray(data.items)?data.items:[]).map(x=>x.nama||x.name||x.title||'')].join(' ').toLocaleLowerCase('id-ID');
 const top=el('div','nexai-order-top');const left=el('div','nexai-premium-order-id');
 left.append(el('strong','',id),el('span','nexai-premium-order-date',date(data.createdAt)));
 const badge=el('span','nexai-status nexai-premium-status is-'+group, data.paymentReportedAt&&data.status==='checkout_created'?'Menunggu verifikasi':status(data.status));
 top.append(left,badge);card.append(top);
 const items=Array.isArray(data.items)?data.items:[];
 const names=items.map(x=>x.nama||x.name||x.title).filter(Boolean);
 const product=el('div','nexai-premium-product');
 product.append(el('strong','',names.length?names.slice(0,2).join(' · ')+(names.length>2?' +'+(names.length-2)+' produk':''):'Rincian produk belum tersedia'));
 const qty=items.reduce((n,x)=>n+(Number(x.qty)||0),0);
 product.append(el('small','',qty+' item'+(items.length>1?' · '+items.length+' jenis produk':'')));
 card.append(product);
 const total=el('div','nexai-order-money');total.append(el('span','','Total pesanan'),el('strong','',rupiah(data.totals?.totalBayar)));card.append(total);
 const context=el('p','nexai-premium-next-step',paymentState(data));card.append(context);
 const actions=el('div','nexai-order-actions nexai-premium-actions');
 const waUrl=window.imamstoreOrderWhatsAppURL?.({...data,orderId:data.orderNumber||data.orderId});
 const detail=el('button','nexai-premium-primary','Lihat Rincian');detail.type='button';detail.addEventListener('click',()=>showInvoice(data));
 const reported=data.status==='checkout_created'&&Boolean(data.paymentReportedAt);
 const due=data.paymentDueAt?.toDate?.()||(data.paymentDueAt?new Date(data.paymentDueAt):null);
 const canReport=data.status==='checkout_created'&&!reported&&due&&Number.isFinite(due.getTime())&&due.getTime()>Date.now();
 if(reported)detail.textContent='Pantau Verifikasi';
 else if(data.status==='shipped')detail.textContent='Lihat Pengiriman';
 else if(['confirmed','processing','packed','delivered'].includes(data.status))detail.textContent='Lihat Perkembangan';
 else if(data.status==='completed')detail.textContent='Lihat Pesanan Selesai';
 if(canReport){
  detail.textContent='Laporkan Pembayaran';
  const report=el('button','nexai-premium-primary','Laporkan Pembayaran');report.type='button';report.addEventListener('click',()=>reportPaid(data,report));actions.append(report);
 }else actions.append(detail);
 const secondary=el('details','nexai-premium-more');
 const summary=el('summary','', 'Opsi lainnya');secondary.append(summary);
 const menu=el('div','nexai-premium-menu');
 if(canReport){const moreDetail=el('button','','Lihat rincian pesanan');moreDetail.type='button';moreDetail.addEventListener('click',()=>showInvoice(data));menu.append(moreDetail)}
 const copy=el('button','','Salin nomor pesanan');copy.type='button';copy.addEventListener('click',()=>copyId(id,copy));menu.append(copy);
 if(waUrl){const wa=el('a','', 'Hubungi toko via WhatsApp');wa.href=waUrl;wa.target='_blank';wa.rel='noopener noreferrer';menu.append(wa)}
 if(data.status==='completed'){
  const unique=new Map(items.filter(x=>/^[A-Za-z0-9_-]{1,120}$/.test(String(x.productId||''))).map(x=>[String(x.productId),x]));
  for(const [pid,item] of unique){
   const review=el('button','','Beri ulasan '+String(item.nama||'produk'));review.type='button';
   review.addEventListener('click',()=>window.imamstoreCustomerTrust?.openFromOrder(pid,String(data.orderId)));menu.append(review);
  }
 }
 secondary.append(menu);actions.append(secondary);card.append(actions);
 return card;
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
// R7: premium search & filters apply ONLY to already loaded pages; no false global search claims.
const premiumTools=el('section','nexai-premium-toolbar');premiumTools.setAttribute('aria-label','Cari dan saring pesanan yang dimuat');
const searchLabel=el('label','nexai-premium-search-label','Cari nomor atau produk');
const searchInput=el('input','nexai-premium-search');searchInput.type='search';searchInput.placeholder='Contoh: IS- atau nama produk';searchInput.autocomplete='off';
searchLabel.append(searchInput);premiumTools.append(searchLabel);
const chips=el('div','nexai-premium-filters');chips.setAttribute('aria-label','Filter status pesanan');
const filterDefs=[['all','Semua'],['payment','Menunggu'],['action','Verifikasi'],['process','Diproses'],['shipping','Dikirim'],['done','Selesai'],['other','Lainnya']];
let activeFilter='all';
filterDefs.forEach(([key,title])=>{
 const b=el('button','nexai-premium-chip',title);b.type='button';b.dataset.filter=key;
 b.setAttribute('aria-pressed',String(key===activeFilter));
 b.addEventListener('click',()=>{activeFilter=key;chips.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));applyPremiumFilter();});chips.append(b);
});premiumTools.append(chips);
const filterInfo=el('p','nexai-premium-filter-info');filterInfo.setAttribute('aria-live','polite');premiumTools.append(filterInfo);
list.insertAdjacentElement('beforebegin',premiumTools);
function applyPremiumFilter(){
 const term=searchInput.value.trim().toLocaleLowerCase('id-ID');let visible=0;
 list.querySelectorAll('.nexai-premium-order-card').forEach(card=>{
  const matches=(activeFilter==='all'||card.dataset.premiumGroup===activeFilter) && (!term||card.dataset.premiumSearch.includes(term));
  card.hidden=!matches;if(matches)visible++;
 });
 filterInfo.textContent='Menampilkan '+visible+' dari '+historyCount+' pesanan yang sudah dimuat. '+(hasMoreOrders?'Muat halaman berikutnya untuk melihat pesanan lebih lama.':'');
}
searchInput.addEventListener('input',applyPremiumFilter);
const premiumCss=el('style');premiumCss.id='imamstorePremiumOrdersR7Css';premiumCss.textContent=`
#nexaiOrdersDialog .nexai-orders-panel{box-sizing:border-box;width:min(100%,740px);max-width:100%;max-height:min(94dvh,940px);overflow-y:auto;overscroll-behavior:contain;padding:22px clamp(15px,4vw,28px);background:#f9fbf7}
#nexaiOrdersDialog .nexai-orders-head{position:sticky;top:-22px;z-index:3;background:#f9fbf7;padding:12px 0;border-bottom:1px solid #e4ebdd}
#nexaiOrdersDialog #nexaiOrdersTitle{font-size:clamp(23px,5vw,30px);letter-spacing:-.03em}
#nexaiOrdersDialog #nexaiOrdersMessage{font-size:13px;line-height:1.55;color:#677263;margin:12px 0}
#nexaiOrdersDialog .nexai-premium-toolbar{margin:10px 0 18px;display:grid;gap:11px}
#nexaiOrdersDialog .nexai-premium-search-label{font-size:12px;font-weight:700;color:#4a603c;display:grid;gap:6px}
#nexaiOrdersDialog .nexai-premium-search{width:100%;min-height:48px;padding:11px 14px;border:1px solid #d8e5d0;border-radius:13px;background:#fff;color:#243123;font:inherit;font-size:15px;box-sizing:border-box}
#nexaiOrdersDialog .nexai-premium-search:focus-visible{outline:3px solid #a9d67c;outline-offset:1px}
#nexaiOrdersDialog .nexai-premium-filters{display:flex;gap:8px;overflow-x:auto;padding:2px 0 6px;scrollbar-width:thin}
#nexaiOrdersDialog .nexai-premium-chip{border:1px solid #d4e3c8;background:#fff;border-radius:999px;padding:9px 15px;white-space:nowrap;min-height:40px;color:#4c6140;font-size:13px;font-weight:700;flex:none}
#nexaiOrdersDialog .nexai-premium-chip[aria-pressed=true]{background:#e8f6d5;border-color:#8cc63f;color:#31550f}
#nexaiOrdersDialog .nexai-premium-chip:active{transform:scale(.975)}
#nexaiOrdersDialog .nexai-premium-filter-info{margin:0;color:#6a7565;font-size:12px;line-height:1.45}
#nexaiOrdersDialog .nexai-premium-order-card{padding:17px;border-radius:20px;border:1px solid #e2e9dc;background:#fff;box-shadow:0 5px 22px #1c2b1108;display:grid;gap:13px;margin-bottom:13px}
#nexaiOrdersDialog .nexai-premium-order-card[hidden]{display:none}
#nexaiOrdersDialog .nexai-premium-order-card .nexai-order-top{display:flex;align-items:start;justify-content:space-between;gap:12px;border:0;padding:0;margin:0}
#nexaiOrdersDialog .nexai-premium-order-id{display:grid;gap:5px;min-width:0;overflow-wrap:anywhere}
#nexaiOrdersDialog .nexai-premium-order-id strong{font-size:15px;color:#202d1b}
#nexaiOrdersDialog .nexai-premium-order-date{font-size:12px;color:#768070}
#nexaiOrdersDialog .nexai-premium-status{border-radius:999px;padding:7px 10px;font-size:11px;font-weight:800;white-space:normal;text-align:center;max-width:43%;flex:none}
#nexaiOrdersDialog .nexai-premium-status.is-payment{background:#fff2d6;color:#85570c}
#nexaiOrdersDialog .nexai-premium-status.is-action{background:#e9f2ff;color:#275e91}
#nexaiOrdersDialog .nexai-premium-status.is-process{background:#f2ecff;color:#5d448a}
#nexaiOrdersDialog .nexai-premium-status.is-shipping{background:#e8f3ff;color:#225d87}
#nexaiOrdersDialog .nexai-premium-status.is-done{background:#e8f7e8;color:#246b3a}
#nexaiOrdersDialog .nexai-premium-status.is-other{background:#f4eee9;color:#805449}
#nexaiOrdersDialog .nexai-premium-product{display:grid;gap:5px;padding:0 0 12px;border-bottom:1px solid #edf1e9;color:#263125}
#nexaiOrdersDialog .nexai-premium-product strong{font-size:15px;line-height:1.45}
#nexaiOrdersDialog .nexai-premium-product small{font-size:12px;color:#7c8576}
#nexaiOrdersDialog .nexai-premium-order-card .nexai-order-money{display:flex;justify-content:space-between;align-items:center;padding:0;margin:0;border:0;gap:10px}
#nexaiOrdersDialog .nexai-premium-order-card .nexai-order-money strong{font-size:20px;color:#d65439}
#nexaiOrdersDialog .nexai-premium-next-step{margin:0;background:#f5f9ef;border-radius:12px;padding:11px 13px;line-height:1.5;font-size:12px;color:#4f5e48}
#nexaiOrdersDialog .nexai-premium-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:9px;margin:0;padding:0}
#nexaiOrdersDialog .nexai-premium-primary{min-height:46px;background:#8cc63f;color:#203010;border:1px solid #84be36;border-radius:12px;font-size:14px;font-weight:800;padding:10px 14px;line-height:1.35}
#nexaiOrdersDialog .nexai-premium-primary:active{background:#a6d967;transform:scale(.98)}
#nexaiOrdersDialog .nexai-premium-more{position:relative;min-width:105px}
#nexaiOrdersDialog .nexai-premium-more summary{list-style:none;min-height:46px;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:10px;border:1px solid #cbdcbd;border-radius:12px;color:#43652e;font-size:13px;font-weight:700;box-sizing:border-box}
#nexaiOrdersDialog .nexai-premium-more summary::-webkit-details-marker{display:none}
#nexaiOrdersDialog .nexai-premium-more summary:after{content:'⌄';margin-left:7px}
#nexaiOrdersDialog .nexai-premium-menu{position:absolute;right:0;top:calc(100% + 5px);width:min(270px,79vw);display:grid;padding:6px;background:#fff;border:1px solid #e1ebda;border-radius:12px;box-shadow:0 12px 32px #1525112b;z-index:2}
#nexaiOrdersDialog .nexai-premium-menu button,#nexaiOrdersDialog .nexai-premium-menu a{display:block;min-height:43px;background:transparent;border:0;padding:10px;text-align:left;color:#31502d;text-decoration:none;font:inherit;font-size:13px;border-radius:8px;cursor:pointer}
#nexaiOrdersDialog .nexai-premium-menu button:hover,#nexaiOrdersDialog .nexai-premium-menu a:hover{background:#edf7e4}
#nexaiInvoiceDialog .nexai-premium-timeline{border:1px solid #dcebd4;border-radius:16px;background:#f8fcf4;padding:16px;margin:14px 0 18px}
#nexaiInvoiceDialog .nexai-premium-timeline h3{margin:0 0 7px;font-size:17px;color:#243820}
#nexaiInvoiceDialog .nexai-premium-timeline-intro{margin:0 0 14px;font-size:13px;line-height:1.55;color:#51684a}
#nexaiInvoiceDialog .nexai-premium-steps{margin:0 0 0 7px;padding:0 0 0 20px;border-left:2px solid #cddfc2;list-style:none}
#nexaiInvoiceDialog .nexai-premium-steps li{position:relative;padding:0 0 17px;display:grid;gap:3px}
#nexaiInvoiceDialog .nexai-premium-steps li:last-child{padding-bottom:0}
#nexaiInvoiceDialog .nexai-premium-steps li:before{content:'';position:absolute;left:-27px;top:3px;width:12px;height:12px;background:#8cc63f;border:3px solid #f8fcf4;border-radius:50%;box-shadow:0 0 0 1px #c9d8c0}
#nexaiInvoiceDialog .nexai-premium-steps li.is-current:before{background:#f3a844}
#nexaiInvoiceDialog .nexai-premium-steps strong{font-size:13px;color:#26372a}
#nexaiInvoiceDialog .nexai-premium-steps span{font-size:12px;color:#687b62}
#nexaiInvoiceDialog .nexai-premium-timeline-footnote{font-size:11px;line-height:1.5;color:#778370;margin:12px 0 0}
#nexaiOrdersDialog button:focus-visible,#nexaiOrdersDialog summary:focus-visible{outline:3px solid #77ad31;outline-offset:2px}
@media (max-width:440px){#nexaiOrdersDialog .nexai-premium-order-card{padding:14px}#nexaiOrdersDialog .nexai-premium-status{font-size:11px}#nexaiOrdersDialog .nexai-premium-actions{grid-template-columns:minmax(0,1fr)}#nexaiOrdersDialog .nexai-premium-more{width:100%}#nexaiOrdersDialog .nexai-premium-more summary{width:100%}}
@media(prefers-reduced-motion:reduce){#nexaiOrdersDialog button{transition:none}}
`;
document.head.append(premiumCss);
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
  renderHistoryPager();applyPremiumFilter();
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
  historyUid=user.uid;watchHistoryAuth();
  // Do not destroy the previous list before a new successful server response.
  // If the customer changes account, never expose the prior account's cards.
  if(dialog.dataset.ownerUid!==user.uid){list.replaceChildren();historyCount=0;historyCursor=null;hasMoreOrders=false;renderHistoryPager();}
  dialog.dataset.ownerUid=user.uid;
  requestInFlight=false;
  await loadHistoryPage(false);
 }catch(e){if(token!==loadToken)return;console.warn('ImamStore order history auth failed',e);message.textContent='Akun pelanggan belum siap. Silakan coba lagi.'}
}
moreOrders.addEventListener('click',()=>loadHistoryPage(true));
// If auth changes while the modal is open, never keep another customer's cards on screen.
let historyAuthListenerReady=false;
function watchHistoryAuth(){
 if(historyAuthListenerReady||!window.firebase?.auth?.()?.onAuthStateChanged)return;
 historyAuthListenerReady=true;
 firebase.auth().onAuthStateChanged(user=>{
  if(dialog.hidden||!historyUid)return;
  if(!user||user.isAnonymous||user.uid!==historyUid){
   loadToken++;historyUid='';historyCount=0;historyCursor=null;hasMoreOrders=false;requestInFlight=false;
   list.replaceChildren();renderHistoryPager();applyPremiumFilter();dialog.removeAttribute('data-owner-uid');
   if(!invoice.hidden)closeInvoice();
   message.textContent='Akun berubah. Tutup dan buka kembali Pesanan Saya untuk menampilkan riwayat akun yang benar.';
  }
 });
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
