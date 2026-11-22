
(()=>{'use strict';
const $=id=>document.getElementById(id),host=$('imamstoreLiveOriginalDetail'),cart=$('s5Cart');
if(!host||!cart)return;
const money=n=>'Rp'+Math.round(Number(n)||0).toLocaleString('id-ID');
const db=()=>{try{return window.firebase?.apps?.length?window.firebase.firestore():null}catch{return null}};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getProduct=()=>window.imamstoreActiveProduct||null;
let activeId='',unsub=null,reviewToken=0;
function gallery(){
 const thumbs=[...host.querySelectorAll('.gallery-thumb img')].filter(x=>x.getAttribute('src')&&x.style.display!=='none');
 const main=host.querySelector('#mainProductImage');if(!main||!thumbs.length)return;
 let i=thumbs.findIndex(x=>x.classList.contains('active'));if(i<0)i=0;
 const change=step=>{i=(i+step+thumbs.length)%thumbs.length;const im=thumbs[i];if(typeof window.changeGallery==='function')window.changeGallery(im);else{main.src=im.src;thumbs.forEach(x=>x.classList.toggle('active',x===im))}
 const count=host.querySelector('.nine-gallery-count');if(count)count.textContent=(i+1)+' / '+thumbs.length;};
 for(const [selector,step] of [['.nine-gallery-prev',-1],['.nine-gallery-next',1]]){
  const btn=host.querySelector(selector);if(btn){btn.onclick=e=>{e.preventDefault();e.stopPropagation();change(step)};btn.disabled=thumbs.length<2;}
 }
}
function updateStats(pid,data){
 if(pid!==activeId)return;
 // Statistik Firestore dapat belum mempunyai field terjual (produk baru).
 // Pakai angka awal katalog atau 0, jangan menampilkan "data belum tersedia".
 const product=getProduct();
 const fallback=Number(product?.terjual??product?.sold??product?.totalTerjual??0);
 const sold=Number(data?.terjual??data?.sold??data?.totalTerjual??(Number.isFinite(fallback)&&fallback>=0?fallback:0));
 const soldNode=host.querySelector('[data-detail-sold]');
 if(soldNode)soldNode.textContent=window.imamstoreFormatSold(Number.isFinite(sold)&&sold>=0?sold:0)+' terjual';

}
let loadedReviews=[],reviewStream=null;
const locallyConfirmedReviews=new Set();
function syncReviewComposer(){
 const wrapper=host.querySelector('.nine-review-composer'),summary=wrapper?.querySelector(':scope > summary');
 if(!summary)return;
 const uid=window.firebase?.auth?.()?.currentUser?.uid||'';
 const pid=String(getProduct()?.id||'');
 const reviewed=!!uid&&!!pid&&(loadedReviews.some(r=>r.uid===uid)||locallyConfirmedReviews.has(uid+'::'+pid));
 wrapper.dataset.reviewed=reviewed?'1':'0';
 summary.setAttribute('aria-disabled',String(reviewed));
 summary.innerHTML=reviewed?'✓ Sudah Diulas <i class="fa-solid fa-check-circle" aria-hidden="true"></i>':'Beri Ulasan Pembeli <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
 if(reviewed)wrapper.open=false;
}
try{window.firebase?.auth?.()?.onAuthStateChanged(()=>syncReviewComposer())}catch(_){}

const reviewScore=x=>Math.max(0,Math.min(5,Math.round(Number(x.rating??x.bintang??x.stars??0)||0)));
const reviewBody=x=>String(x.text??x.review??x.comment??x.ulasan??x.komentar??x.content??x.message??'');
function reviewMedia(x){return Array.isArray(x.media)?x.media:Array.isArray(x.photos)?x.photos:[]}
function paintReviews(){
 const preview=host.querySelector('#nineReviewPreview'),full=host.querySelector('#nineReviewFullList');
 if(!preview)return;
 const filter=host.querySelector('.nine-review-filter button.active')?.textContent?.trim()||'Semua';
 let rows=loadedReviews;
 if(filter.includes('Foto/Video'))rows=rows.filter(x=>reviewMedia(x).length);
 else if(/^[1-5] Bintang$/.test(filter))rows=rows.filter(x=>reviewScore(x)===Number(filter[0]));
 const render=x=>{
  const el=document.createElement('div');el.className='nex-review';
  const date=x.createdAt?.toDate?.()|| (x.createdAt?.seconds?new Date(x.createdAt.seconds*1000):null);
  const dateText=date instanceof Date&&!isNaN(date)?date.toLocaleDateString('id-ID'):'';
  const stars=reviewScore(x);
  const verified=x.verifiedPurchase===true?'<span class="nine-review-verified"><i class="fa-solid fa-badge-check"></i> Pembelian terverifikasi</span>':'';
  el.innerHTML='<strong>'+esc(x.displayName||x.nama||x.name||x.userName||x.username||'Pengguna')+'</strong>'+verified+'<div class="nex-stars" aria-label="'+stars+' bintang">'+('★'.repeat(stars)+'☆'.repeat(5-stars))+'</div>'+(dateText?'<small>'+esc(dateText)+'</small>':'')+'<p>'+esc(reviewBody(x))+'</p>';
  const media=reviewMedia(x);if(media.length){const gallery=document.createElement('div');gallery.className='nex-review-media';for(const m of media){const url=typeof m==='string'?m:m.thumbUrl||m.posterUrl||m.url||'';if(!/^https:\/\//i.test(url))continue;const img=document.createElement('img');img.src=url;img.alt='Foto ulasan';img.loading='lazy';img.style.cssText='width:76px;height:76px;object-fit:cover;border-radius:9px;margin:5px';gallery.append(img)}el.append(gallery)}
  return el;
 };
 preview.replaceChildren(...loadedReviews.slice(0,3).map(render));
 if(full)full.replaceChildren(...rows.map(render));
 if(!loadedReviews.length)preview.textContent='Belum ada ulasan untuk produk ini.';
 if(full&&!rows.length)full.textContent=loadedReviews.length?'Tidak ada ulasan sesuai filter.':'Belum ada ulasan untuk produk ini.';
 // Satu snapshot ulasan = satu sumber untuk badge bintang, nilai, dan jumlah penilaian.
 // Jangan membaca statistik_produk untuk rating detail: dokumen itu tidak ditulis saat ulasan dikirim.
 const scored=loadedReviews.map(reviewScore).filter(v=>v>=1&&v<=5);
 const average=scored.length?scored.reduce((sum,v)=>sum+v,0)/scored.length:null;
 const formatted=average==null?'—':average.toLocaleString('id-ID',{minimumFractionDigits:1,maximumFractionDigits:1});
 const rating=host.querySelector('[data-detail-rating]');
 const badge=host.querySelector('[data-detail-rating-badge] small');
 const count=host.querySelector('#nineReviewCount');
 if(rating)rating.textContent='★ '+formatted;
 if(badge)badge.textContent='★ '+formatted;
 if(count)count.textContent=scored.length?'('+scored.length+' penilaian)':'(Belum ada penilaian)';
}
function reviews(pid){
 const token=++reviewToken,preview=host.querySelector('#nineReviewPreview');
 if(reviewStream){reviewStream();reviewStream=null}
 loadedReviews=[];
 if(!preview)return;
 // Jangan biarkan rating, jumlah, atau ulasan produk sebelumnya tertinggal.
 const full=host.querySelector('#nineReviewFullList');
 preview.textContent='Memuat ulasan...';
 if(full)full.textContent='Memuat ulasan...';
 const count=host.querySelector('#nineReviewCount');
 if(count)count.textContent='(— ulasan)';
 const rating=host.querySelector('[data-detail-rating]');
 if(rating)rating.textContent='Memuat rating...';
 const badge=host.querySelector('[data-detail-rating-badge] small');
 if(badge)badge.textContent='Memuat rating...';
 const store=db();
 if(!store){
  preview.textContent='Koneksi ulasan belum tersedia.';
  if(full)full.textContent='Koneksi ulasan belum tersedia.';
  if(rating)rating.textContent='Rating tidak tersedia';
  if(badge)badge.textContent='Rating tidak tersedia';
  return;
 }
 reviewStream=store.collection('ulasan_produk').where('productId','==',String(pid)).onSnapshot(snap=>{
  if(token!==reviewToken||activeId!==pid)return;
  loadedReviews=snap.docs.map(doc=>({id:doc.id,...doc.data()})).sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
  paintReviews();syncReviewComposer();
 },err=>{
  if(token!==reviewToken)return;
  console.warn('Gagal memuat ulasan',err);
  const message='Ulasan belum dapat ditampilkan. Silakan coba lagi nanti.';
  preview.textContent=message;
  if(full)full.textContent=message;
  if(count)count.textContent='(— ulasan)';
  if(rating)rating.textContent='Rating tidak tersedia';
  if(badge)badge.textContent='Rating tidak tersedia';
 });
}
window.nineFilterReview=button=>{
 const group=host.querySelector('.nine-review-filter');if(!group||!button)return;
 group.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===button));
 paintReviews();
};

function hydrate(){
 if(!host.classList.contains('open')&&!host.classList.contains('is-open')&&getComputedStyle(host).display==='none')return;
 const p=getProduct(),pid=String(p?.id||host.querySelector('[data-detail-sold]')?.getAttribute('data-detail-sold')||'');
 gallery();
 if(!pid)return;
 if(pid===activeId){
  const summary=host.querySelector('[data-detail-rating]');
  if(summary&&/^(—|Memuat)/.test(summary.textContent.trim()))paintReviews();
  return;
 }
 activeId=pid;if(unsub){unsub();unsub=null}if(reviewStream){reviewStream();reviewStream=null}
 const store=db();if(store){unsub=store.collection('statistik_produk').doc(pid).onSnapshot(s=>updateStats(pid,s.exists?s.data():null),e=>console.warn('Statistik produk',e))}
 else updateStats(pid,p||{});
 reviews(pid);
}
const observer=new MutationObserver(()=>{queueMicrotask(hydrate)});
observer.observe(host,{childList:true,subtree:false,attributes:true,attributeFilter:['class','style']});
document.addEventListener('imamstore:open-product',()=>setTimeout(hydrate,30));
// Halaman semua ulasan: satu pengendali; daftar selalu diisi listener Firestore yang sama.
let reviewsReturnFocus=null;
window.nineOpenReviews=()=>{
 hydrate();
 const page=host.querySelector('#nineReviewPage');
 if(!page)return;
 reviewsReturnFocus=document.activeElement;
 page.setAttribute('aria-hidden','false');
 page.classList.add('is-open');
 const list=page.querySelector('#nineReviewFullList');
 paintReviews();
 if(list)list.scrollTop=0;
 page.querySelector('.nine-reviews-back-v29')?.focus({preventScroll:true});
};
window.nineCloseReviews=()=>{
 const page=host.querySelector('#nineReviewPage');
 if(!page)return;
 page.setAttribute('aria-hidden','true');
 page.classList.remove('is-open');
 if(reviewsReturnFocus?.isConnected)reviewsReturnFocus.focus({preventScroll:true});
 reviewsReturnFocus=null;
};
window.nineOpenOriginalVoucher=()=>{if(typeof window.imamstoreOpenVoucherSheet==='function')window.imamstoreOpenVoucherSheet();else if(typeof window.imamstoreV43?.openVoucher==='function')window.imamstoreV43.openVoucher()};
// Ulasan publik hanya dari akun pelanggan sungguhan, bukan sesi Firebase anonim.
// Gunakan modal login ImamStore yang sama dengan checkout, tanpa mesin auth kedua.
let reviewAuthOpening=false,reviewSaving=false;
// Toast ringkas untuk pelanggan. Detail layanan tidak boleh tampil di UI.
function reviewNotice(message,type='info'){
 if(typeof window.imamstoreToast==='function'){
  window.imamstoreToast(message,type);return;
 }
 if(window.Swal?.fire){
  window.Swal.fire({toast:true,position:'top',icon:type==='error'?'error':type==='success'?'success':'info',
   title:message,showConfirmButton:false,timer:2500,timerProgressBar:false});
 }
}
function signedInReviewer(){
 try{const u=window.firebase?.auth?.()?.currentUser;return u&&!u.isAnonymous?u:null}
 catch{return null}
}
async function requireReviewUser(){
 const auth=window.firebase?.auth?.();
 try{
  if(typeof auth?.authStateReady==='function')await auth.authStateReady();
  else if(typeof auth?.onAuthStateChanged==='function')await new Promise(resolve=>{
   let settled=false,off=()=>{};
   off=auth.onAuthStateChanged(()=>{if(settled)return;settled=true;off();resolve()},()=>{if(settled)return;settled=true;off();resolve()});
  });
 }catch{}
 const existing=signedInReviewer();if(existing)return existing;
 if(typeof window.nexaiRequireCustomerLogin!=='function'){
  reviewNotice('Silakan muat ulang halaman dan coba masuk kembali.','error');return null;
 }
 try{
  const ok=await window.nexaiRequireCustomerLogin();
  return ok?signedInReviewer():null;
 }catch(error){
  console.warn('[ImamStore review login]',error?.code||error?.message||error);
  reviewNotice('Belum berhasil masuk. Silakan coba lagi.','error');return null;
 }
}
// Pembukaan ulasan hanya setelah Function memverifikasi order UID + completed + produk.
let selectedReviewOrder='',selectedReviewProduct='',reviewVerifiedOptions=[];
function reviewChoicePaint(){
 const form=host.querySelector('.nine-review-form');if(!form)return;
 form.querySelector('.nine-review-order-note')?.remove();
 form.querySelector('.nine-review-order-choices')?.remove();
 const note=document.createElement('div');note.className='nine-review-order-note';
 note.textContent='Pembelian terverifikasi. Rating 1–5 bintang diperlukan; komentar boleh dikosongkan. Ulasan tidak wajib.';
 form.prepend(note);
 if(reviewVerifiedOptions.length>1){
  const choices=document.createElement('div');choices.className='nine-review-order-choices';
  for(const row of reviewVerifiedOptions){
   const item=document.createElement('button');item.type='button';
   item.textContent='Pesanan '+String(row.orderId).slice(0,13)+'…';
   item.setAttribute('aria-pressed',String(row.orderId===selectedReviewOrder));
   item.addEventListener('click',()=>{selectedReviewOrder=row.orderId;reviewChoicePaint()});
   choices.append(item);
  }
  note.after(choices);
 }
}
host.addEventListener('click',async event=>{
 const summary=event.target.closest?.('.nine-review-composer > summary');
 if(!summary||!host.contains(summary))return;
 event.preventDefault();event.stopPropagation();
 if(reviewAuthOpening)return;
 const wrapper=summary.parentElement;
 if(wrapper.dataset.reviewed==='1'){reviewNotice('Terima kasih! Produk ini sudah diulas.');return}
 if(wrapper.open){wrapper.open=false;return}
 reviewAuthOpening=true;
 const productId=String(getProduct()?.id||'');
 try{
  const user=await requireReviewUser();if(!user||!productId)return;
  const gate=window.imamstoreCustomerTrust;
  if(!gate?.reviewEligibility){reviewNotice('Sistem verifikasi pesanan belum tersedia.','error');return}
  const all=await gate.reviewEligibility(productId);
  if(productId!==String(getProduct()?.id||''))return;
  const pending=all.filter(x=>!x.reviewed&&x.reviewable!==false);
  if(!pending.length){
   reviewNotice(all.length?'Produk dari pesanan ini sudah diulas.':'Ulasan tersedia setelah pesanan produk ini dinyatakan selesai.');return;
  }
  const preference=new URLSearchParams(location.search).get('reviewOrder');
  reviewVerifiedOptions=pending;selectedReviewProduct=productId;
  selectedReviewOrder=pending.find(x=>x.orderId===preference)?.orderId||pending[0].orderId;
  wrapper.open=true;reviewChoicePaint();wrapper.querySelector('textarea')?.focus({preventScroll:true});
 }catch(e){reviewNotice(e.message||'Belum dapat memverifikasi pesanan.','error')}
 finally{reviewAuthOpening=false}
},true);
let rating=0;
window.nineSetReviewStars=n=>{rating=Math.min(5,Math.max(1,Number(n)||1));host.querySelectorAll('#nineReviewStars button').forEach((b,i)=>{b.setAttribute('aria-pressed',String(i<rating));b.style.color=i<rating?'#e9aa2d':'#bbb'})};
window.nineSubmitDetailReview=async button=>{
 if(reviewSaving)return;
 const product=getProduct(),field=host.querySelector('.nine-review-form textarea');
 const content=String(field?.value||'').trim(),score=rating;
 if(!product){reviewNotice('Produk belum dapat ditemukan.','error');return}
 if(!score){reviewNotice('Pilih penilaian 1 sampai 5 bintang.');return}
 if(content.length>1200){reviewNotice('Komentar maksimal 1.200 karakter.');return}
 if(!selectedReviewOrder||selectedReviewProduct!==String(product.id)){
  reviewNotice('Verifikasi pesanan diperlukan. Buka kembali formulir ulasan.','error');return;
 }
 reviewSaving=true;button.disabled=true;
 const pid=String(product.id),orderId=selectedReviewOrder;
 try{
  const user=await requireReviewUser();if(!user)return;
  if(pid!==String(getProduct()?.id||''))return;
  const gate=window.imamstoreCustomerTrust;
  if(!gate?.invoke)throw Error('Layanan verifikasi belum tersedia.');
  await gate.invoke('submitReview',{orderId,productId:pid,rating:score,text:content});
  locallyConfirmedReviews.add(user.uid+'::'+pid);syncReviewComposer();
  if(field)field.value='';rating=0;selectedReviewOrder='';reviewVerifiedOptions=[];
  host.querySelectorAll('#nineReviewStars button').forEach(b=>{b.setAttribute('aria-pressed','false');b.style.color='#bbb'});
  host.querySelector('.nine-review-composer')?.removeAttribute('open');
  gate.onReviewSaved?.(orderId,pid);
  const reviewUrl=new URL(location.href);reviewUrl.searchParams.delete('reviewOrder');
  history.replaceState(history.state,'',reviewUrl.pathname+reviewUrl.search+reviewUrl.hash);
  reviewNotice('Terima kasih! Ulasan pembelian terverifikasi berhasil dikirim.','success');
 }catch(e){reviewNotice(e.message||'Ulasan belum berhasil dikirim. Silakan coba lagi.','error')}
 finally{reviewSaving=false;button.disabled=false}
};
// Deeplink dari Pesanan Saya: buka formulir setelah detail produk dipasang pada DOM.
const desiredReviewFromLink=new URLSearchParams(location.search);
if(desiredReviewFromLink.has('reviewOrder')&&desiredReviewFromLink.has('product')){
 let deepOpening=false;
 const autoReview=()=>{
  if(deepOpening)return;
  const p=getProduct(),pid=desiredReviewFromLink.get('product');
  if(String(p?.id||'')!==pid)return;
  const summary=host.querySelector('.nine-review-composer > summary');
  if(!summary)return;
  deepOpening=true;setTimeout(()=>summary.click(),250);
 };
 const autoObserver=new MutationObserver(autoReview);autoObserver.observe(host,{childList:true,subtree:true});
 document.addEventListener('imamstore:open-product',autoReview);setTimeout(autoReview,400);
}
// Statistik toko detail mengikuti satu sumber yang sama dengan profil/beranda.
let storeRatingSourceObserver=null;
function fixStoreRating(){
 const target=host.querySelector('[data-nine-store-rating]');
 const source=document.getElementById('storeRating');
 if(!target||!source)return;
 const sync=()=>{
  const rating=(source.textContent||'').trim();
  const display=rating&&rating!=='—'?rating:'—';
  if(target.textContent.trim()!==display)target.textContent=display;
 };
 if(target.dataset.nexBound!=='shared'){
  target.dataset.nexBound='shared';
  if(storeRatingSourceObserver)storeRatingSourceObserver.disconnect();
  storeRatingSourceObserver=new MutationObserver(sync);
  storeRatingSourceObserver.observe(source,{childList:true,characterData:true,subtree:true});
 }
 sync();
}
const storeObserver=new MutationObserver(()=>queueMicrotask(fixStoreRating));
storeObserver.observe(host,{childList:true,subtree:false});
function fixSticky(){
 const sticky=host.querySelector('.sticky-actions');if(!sticky)return;
 const buy=sticky.querySelector('#stickyBuyBtn,[onclick*="Buy"],[onclick*="Purchase"]');
 if(buy)buy.setAttribute('data-nex-buy','');
}
function cartState(){
 try{return JSON.parse(localStorage.getItem('imamstore_cart_stage5')||'[]')}catch{return []}
}
const breakdownBtn=$('refCartBreakdown');
if(breakdownBtn)breakdownBtn.setAttribute('data-shared-breakdown','refOrderBreakdown');
document.addEventListener('click',e=>{
 if(e.target.closest('#s5Cart')&&cart.classList.contains('open')){host.querySelector('.sticky-checkout')?.classList.remove('open')}
 if(e.target.closest('.nine-gallery-prev,.nine-gallery-next')){e.stopPropagation()}
},true);
document.addEventListener('imamstore:open-cart',()=>{host.querySelector('.sticky-checkout')?.classList.remove('open')});
hydrate();fixStoreRating();fixSticky();
})();
