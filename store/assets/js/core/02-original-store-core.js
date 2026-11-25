
'use strict';
const config={apiKey:"AIzaSyBkyMCw47sYQb2BBkGMxgfsXppozWw4Cec",authDomain:"apin-web.firebaseapp.com",projectId:"apin-web",storageBucket:"apin-web.firebasestorage.app",messagingSenderId:"733140414417",appId:"1:733140414417:web:b6967fd053ac462b2ffaf0"};
/* R8: App Check siap terlebih dahulu sebelum layanan lain menggunakan Firebase.
 * Tanpa menunggu fetch /produk.json, dan aktivasi hanya sekali. */
const imamstoreR8Security={appReady:false,appCheckReady:false,bootstrapError:null,appCheckToken:'not-checked'};
function imamstoreBootstrapFirebaseR8(){
 if(!window.firebase){imamstoreR8Security.bootstrapError='sdk-unavailable';return false;}
 try{
  if(!firebase.apps.length)firebase.initializeApp(config);
  imamstoreR8Security.appReady=true;
  if(!imamstoreR8Security.appCheckReady){
   if(firebase.appCheck&&firebase.appCheck.ReCaptchaEnterpriseProvider){
    firebase.appCheck().activate(new firebase.appCheck.ReCaptchaEnterpriseProvider('6LdyvOktAAAAAPcWRB-_bmuw3Z6wVSzgX1kAG11M'),true);
    imamstoreR8Security.appCheckReady=true;
   }else{
    imamstoreR8Security.bootstrapError='app-check-sdk-unavailable';
    console.warn('[ImamStore R8 developer] App Check provider is not available');
   }
  }
  return true;
 }catch(err){
  imamstoreR8Security.bootstrapError=String(err?.code||err?.message||'bootstrap-failed').slice(0,180);
  console.warn('[ImamStore R8 developer] Bootstrap security check failed',err);
  return false;
 }
}
window.imamstoreR8Security=Object.freeze({status:()=>({...imamstoreR8Security})});
imamstoreBootstrapFirebaseR8();
/* FAVORIT HYBRID — guest stays in browser, signed-in non-anonymous users sync per Firebase UID.
 * Single owner for detail, favorites tab, both cart entry points; no account wishlist in localStorage.
 */
const imamstoreWishlist=(()=>{'use strict';
 const KEY='imamstore_wishlist_v32',VALID=/^[A-Za-z0-9_-]{1,120}$/,LIMIT=500;
 const state={mode:'initializing',uid:'',ready:false,migrating:false,error:''};
 let cloudIds=new Set(),visibleIds=new Set(),docs=null,off=null,generation=0,authOff=null;
 let migrationTask=null;
 const busy=new Set();
 const valid=x=>VALID.test(String(x??''));
 const idsFrom=x=>[...new Set((Array.isArray(x)?x:[]).map(v=>String(v&&typeof v==='object'?v.id:v)).filter(valid))].slice(0,LIMIT);
 function readGuest(){try{return idsFrom(JSON.parse(localStorage.getItem(KEY)||'[]'))}catch{return []}}
 function writeGuest(next){try{const ids=idsFrom(next);if(ids.length)localStorage.setItem(KEY,JSON.stringify(ids));else localStorage.removeItem(KEY);return true}catch(e){console.warn('[Favorit] Penyimpanan tamu tidak tersedia',e?.name||'storage');return false}}
 function recalc(){
  visibleIds=state.mode==='account'?new Set([...cloudIds,...readGuest()]):
    state.mode==='guest'?new Set(readGuest()):new Set();
  document.dispatchEvent(new CustomEvent('nine:wishliststate',{detail:{mode:state.mode,ready:state.ready,migrating:state.migrating,error:state.error}}));
 }
 function stopListener(){if(off){off();off=null}docs=null;cloudIds=new Set();migrationTask=null;busy.clear()}
 function guestMode(message=''){
  ++generation;stopListener();state.mode='guest';state.uid='';state.ready=true;state.migrating=false;state.error=message;recalc();
 }
 function removeGuestIds(removed){
  if(!removed.length)return true;
  const cut=new Set(removed);return writeGuest(readGuest().filter(id=>!cut.has(id)));
 }
 async function mergeGuest(token,uid){
  if(migrationTask)return migrationTask;
  const pending=readGuest();if(!pending.length)return;
  state.migrating=true;state.error='';recalc();
  migrationTask=(async()=>{
   // Each write is idempotent. Guest entries are removed ONLY after acknowledged writes.
   const settled=await Promise.allSettled(pending.map(id=>docs.doc(id).set({productId:id,addedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true})));
   if(token!==generation||state.uid!==uid)return;
   const succeeded=pending.filter((id,i)=>settled[i].status==='fulfilled');
   const failed=settled.length-succeeded.length;
   if(succeeded.length){
    succeeded.forEach(id=>cloudIds.add(id));
    if(!removeGuestIds(succeeded))state.error='Favorit berhasil dikirim, tetapi data tamu belum dapat dibersihkan.';
   }
   if(failed)state.error='Sebagian favorit belum tersinkron. Periksa koneksi dan login ulang untuk mencoba lagi.';
   state.migrating=false;recalc();
  })().finally(()=>{if(token===generation)migrationTask=null});
  return migrationTask;
 }
 function bindAccount(user){
  ++generation;const token=generation;stopListener();
  state.mode='account';state.uid=user.uid;state.ready=false;state.migrating=false;state.error='';recalc();
  try{
   docs=firebase.firestore().collection('users').doc(user.uid).collection('wishlist');
   let initial=true;
   off=docs.onSnapshot(snapshot=>{
    if(token!==generation)return;
    cloudIds=new Set(snapshot.docs.map(doc=>String(doc.id)).filter(valid));
    state.ready=true;if(!readGuest().length)state.error='';
    recalc();
    if(initial){initial=false;if(readGuest().length)void mergeGuest(token,user.uid)}
   },error=>{
    if(token!==generation)return;
    state.ready=false;
    state.error='Gagal membaca favorit akun. Periksa koneksi atau akses Firestore.';
    console.warn('[Favorit] Listener akun gagal',error?.code||error?.message);
    recalc();
   });
  }catch(error){
   state.ready=false;state.error='Firestore belum dapat diakses untuk favorit akun.';
   console.warn('[Favorit] Inisialisasi akun gagal',error?.code||error?.message);recalc();
  }
 }
 async function setFavorite(id,value){
  id=String(id??'');if(!valid(id))return {ok:false,reason:'invalid'};
  if(!state.ready||state.mode==='initializing'||state.migrating)return {ok:false,reason:'loading'};
  if(busy.has(id))return {ok:false,reason:'busy'};
  const liked=visibleIds.has(id),desired=typeof value==='boolean'?value:!liked;
  if(desired===liked)return {ok:true,liked,unchanged:true};
  const session=generation,uid=state.uid;
  busy.add(id);
  try{
   if(state.mode==='guest'){
    const existing=readGuest();const next=desired?[...existing,id]:existing.filter(x=>x!==id);
    if(!writeGuest(next))return {ok:false,reason:'storage'};
   }else if(state.mode==='account'&&docs){
    const documentRef=docs.doc(id);
    if(desired)await documentRef.set({productId:id,addedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    else await documentRef.delete();
    if(generation!==session||state.uid!==uid)return {ok:false,reason:'session_changed'};
    if(desired)cloudIds.add(id);else cloudIds.delete(id);
    // If this ID was brought in by the guest queue, do not let it reappear after a delete.
    if(readGuest().includes(id)&&!removeGuestIds([id]))return {ok:false,reason:'storage'};
   }else return {ok:false,reason:'loading'};
   recalc();
   document.dispatchEvent(new CustomEvent('nine:wishlistchange',{detail:{id,liked:desired}}));
   return {ok:true,liked:desired};
  }catch(error){
   console.warn('[Favorit] Perubahan belum tersimpan',error?.code||error?.message);
   return {ok:false,reason:'firebase'};
  }finally{busy.delete(id)}
 }
 async function addMany(values){
  const unique=idsFrom(values);let added=0,skipped=0,failed=0;
  if(!state.ready||state.migrating)return {ok:false,added,skipped,failed:unique.length,reason:'loading'};
  const results=await Promise.all(unique.map(id=>setFavorite(id,true)));
  results.forEach(r=>{if(!r.ok)failed++;else if(r.unchanged)skipped++;else added++});
  return {ok:failed===0,added,skipped,failed};
 }
 // Auth can be anonymous for browsing product activity. Anonymous sessions remain guests.
 try{
  const auth=window.firebase?.auth?.();
  if(auth?.onAuthStateChanged)authOff=auth.onAuthStateChanged(user=>{
   if(user&&!user.isAnonymous)bindAccount(user);else guestMode();
  },error=>guestMode('Firebase Authentication belum dapat dibaca. Favorit disimpan di browser ini.'));
  else guestMode('Firebase Authentication belum tersedia. Favorit sementara disimpan di browser ini.');
 }catch(error){guestMode('Koneksi akun belum tersedia. Favorit sementara disimpan di browser ini.')}
 window.addEventListener('storage',event=>{
  if(event.key!==KEY)return;
  recalc();
  if(state.mode==='account'&&state.ready&&!state.migrating&&readGuest().length)void mergeGuest(generation,state.uid);
 });
 return Object.freeze({ids:()=>[...visibleIds],has:id=>visibleIds.has(String(id)),status:()=>({...state}),toggle:id=>setFavorite(id),add:id=>setFavorite(id,true),remove:id=>setFavorite(id,false),addMany});
})();
window.imamstoreWishlist=imamstoreWishlist;


const $=id=>document.getElementById(id);
const money=n=>'Rp '+Number(n||0).toLocaleString('id-ID');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let products=[],sort='populer',query='',tab='toko';
window.imamstoreV29=Object.freeze({products:()=>products});
let storeCategories=[],activeStoreCategory='',activeBrand='';
$('year').textContent=new Date().getFullYear();
// HEADER GLOBAL: satu status untuk Toko, Produk, Kategori.
// scrollTop masing-masing panel dan mesin swipe horizontal tetap native/asli.
(function(){
 const root=$('storeContent'),hero=document.querySelector('.hero'),top=document.querySelector('.top');
 const panels={toko:$('panel-toko'),produk:$('panel-produk'),kategori:$('panel-kategori'),favorit:$('panel-favorit')};
 let headerOffset=0,raf=0,gesture=null,searchMode=false;
 const headerMax=()=>hero.offsetHeight;
 function fit(){
  const vp=window.visualViewport;
  const bottom=vp?vp.offsetTop+vp.height:window.innerHeight;
  root.style.height=Math.max(160,Math.floor(bottom-root.getBoundingClientRect().top-8))+'px';
 }
 function paint(){
  raf=0;
  headerOffset=Math.max(0,Math.min(headerMax(),headerOffset));
  hero.style.setProperty('--store-hero-offset',headerOffset+'px');
  document.documentElement.style.setProperty('--store-header-progress',String(headerMax()?headerOffset/headerMax():0));
  document.body.classList.toggle('store-header-condensed',headerOffset>=headerMax()-1);
  document.body.classList.toggle('store-search-mode',searchMode);
  document.documentElement.style.setProperty('--store-top-height',top.offsetHeight+'px');
  fit();
 }
 function schedule(){if(!raf)raf=requestAnimationFrame(paint)}
 function shift(delta){
  const old=headerOffset;
  headerOffset=Math.max(0,Math.min(headerMax(),old+delta));
  if(Math.abs(headerOffset-old)>.01)schedule();
  return headerOffset-old;
 }
 // Tangkap hanya gestur VERTIKAL untuk transisi header.
 // Gestur horizontal diteruskan tanpa perubahan ke swipe engine yang sudah ada.
 const excluded='input,textarea,select,[contenteditable="true"],.store-vouchers,.chips,.sortbar,[data-horizontal-scroll]';
 root.addEventListener('touchstart',e=>{
  if(e.touches.length!==1||e.target.closest(excluded)){gesture=null;return}
  const t=e.touches[0];
  gesture={x:t.clientX,y:t.clientY,axis:null,headerGesture:false};
 },{passive:true,capture:true});
 root.addEventListener('touchmove',e=>{
  const g=gesture;if(!g||e.touches.length!==1)return;
  const t=e.touches[0],dx=t.clientX-g.x,dy=t.clientY-g.y;
  if(!g.axis){
   if(Math.hypot(dx,dy)<8)return;
   g.axis=Math.abs(dy)>Math.abs(dx)*1.12?'y':'x';
  }
  if(g.axis!=='y')return;
  const panel=panels[tab],delta=-dy;
  // Header hanya bereaksi ketika panel aktif benar-benar di posisi awal.
  // Saat daftar masih bergulir, gerakan ke atas/bawah sepenuhnya native.
  const atTop=panel.scrollTop<=2;
  const canClose=delta>0&&headerOffset<headerMax()-1&&atTop;
  const canOpen=delta<0&&headerOffset>0&&atTop;
  if(g.headerGesture||canClose||canOpen){
   if(e.cancelable)e.preventDefault();
   shift(delta);
   g.headerGesture=true;
  }
  // Perbarui titik sentuh meski konten yang bergulir, agar tak terjadi loncatan.
  g.x=t.clientX;g.y=t.clientY;
 },{passive:false,capture:true});
 root.addEventListener('touchend',()=>{gesture=null},{passive:true,capture:true});
 root.addEventListener('touchcancel',()=>{gesture=null},{passive:true,capture:true});
 root.addEventListener('wheel',e=>{
  const delta=e.deltaY;
  const panel=panels[tab];
  const atTop=panel.scrollTop<=2;
  if(atTop&&((delta>0&&headerOffset<headerMax()-1)||(delta<0&&headerOffset>0))){
   if(e.cancelable)e.preventDefault();
   shift(delta);
  }
 },{passive:false});
 // Pergantian tab TIDAK menyentuh headerOffset maupun scrollTop.
 window.storeSyncVerticalHeader=()=>{gesture=null;schedule()};
 window.storeResetVerticalHeader=()=>{
  gesture=null;
  headerOffset=0;
  paint();
 };
 window.addEventListener('resize',schedule,{passive:true});
 window.addEventListener('orientationchange',schedule,{passive:true});
 if(window.visualViewport)window.visualViewport.addEventListener('resize',schedule,{passive:true});
 $('compactSearch').addEventListener('click',()=>{searchMode=true;schedule();$('search').focus()});
 $('search').addEventListener('blur',()=>{
  if(!searchMode)return;
  setTimeout(()=>{if(document.activeElement!==$('search')){searchMode=false;schedule()}},100);
 });
 schedule();
})();
loadStoreVouchers();
setInterval(()=>{render()},300000);
const num=x=>Number(x)||0;
const regularPrice=p=>{
 const normal=num(p.harga?.normal), promo=num(p.harga?.promo);
 return promo>0?promo:normal;
};
const flashIsActive=(p,now=Date.now())=>{
 const f=p?.flashSale;
 if(!f||f.enabled!==true)return false;
 const start=Date.parse(f.startAt||""),end=Date.parse(f.endAt||"");
 const special=Number(f.price);
 return Number.isFinite(start)&&Number.isFinite(end)&&start<=now&&now<end&&Number.isFinite(special)&&special>0&&special<num(p.harga?.normal);
};
const price=p=>flashIsActive(p)?Number(p.flashSale.price):regularPrice(p);
const normal=p=>num(p.harga?.normal);
const sold=p=>num(stats.get(String(p.id))?.terjual ?? p.terjual);
// Samakan resolusi foto dengan index utama yang berada di root domain.
function productImageUrl(value){
 const raw=String(value||'').trim();
 if(!raw)return '/images/no-image.png';
 if(/^(https?:)?\/\//i.test(raw))return raw.startsWith('//')?'https:'+raw:raw;
 if(/^data:image\/(?:png|jpeg|jpg|webp|gif|avif);base64,/i.test(raw))return raw;
 if(/^(?:javascript|data|blob|file):/i.test(raw))return '/images/no-image.png';
 try{return new URL(raw,location.origin+'/').href}
 catch{return '/images/no-image.png'}
}

const active=p=>p&&p.active!==false&&p.deleted!==true;
const normalize=p=>({...p,harga:p.harga||{},varian:Array.isArray(p.varian)?p.varian:[]});
// Katalog dari CMS adalah sumber live; produk baru CMS harus terlihat di depan,
// sementara urutan seluruh produk dasar yang sudah ada tetap dipertahankan.
function cmsProductTime(p){
 const date=p?.createdAt??p?.updatedAt??null;
 if(date&&typeof date.toMillis==='function')return date.toMillis();
 if(date&&typeof date.seconds==='number')return date.seconds*1000;
 if(typeof date==='string'||typeof date==='number'){
  const ms=typeof date==='number'?date:Date.parse(date);
  if(Number.isFinite(ms)&&ms>0)return ms;
 }
 const match=String(p?.id??'').match(/^(?:NEW|COPY|P)-(\d{13})(?:-|$)/i);
 return match?Number(match[1]):0;
}
function merge(seed,docs){
 const map=new Map(seed.map(p=>[String(p.id),normalize(p)])),newCms=[];
 docs.forEach((value,id)=>{
  if(!value||typeof value!=='object')return;
  const key=String(value.id??id).trim();
  if(!key)return;
  const normalized=normalize({...map.get(key),...value,id:key});
  if(map.has(key))map.set(key,normalized);
  else newCms.push(normalized);
 });
 newCms.sort((a,b)=>cmsProductTime(b)-cmsProductTime(a));
 return [...newCms,...map.values()].filter(active);
}
const catalogHealth={seed:0,cms:0,cmsNew:0,visible:0,seedError:'',cmsError:'',updatedAt:''};
window.imamstoreCatalogHealth=()=>({...catalogHealth});
const stats=new Map();
function formatStoreCompact(value){
 const n=Number(value);
 if(!Number.isFinite(n)||n<0)return '—';
 if(n<1000)return Math.floor(n).toLocaleString('id-ID');
 const units=n>=1e9?['M',1e9]:n>=1e6?['JT',1e6]:['RB',1000];
 const scaled=n/units[1];
 const rounded=scaled>=10?Math.floor(scaled):Math.floor(scaled*10)/10;
 return rounded.toLocaleString('id-ID',{maximumFractionDigits:1})+units[0]+(scaled>rounded?'+':'');
}
function refreshStoreSold(){
 const total=products.reduce((sum,p)=>{
  const st=stats.get(String(p.id))||{};
  const value=Number(st.terjual??p.terjual);
  return sum+(Number.isFinite(value)&&value>0?value:0);
 },0);
 $('storeSoldTotal').textContent=formatStoreCompact(total);
}

// Format jumlah produk terjual: 999, 1rb, 1,1rb, ... 9,9rb, 10rb+.
// Tidak membulatkan ke atas: 1.099 tetap 1rb, 1.199 menjadi 1,1rb.
function formatProductSales(value){
 const n=Math.floor(Number(value));
 if(!Number.isFinite(n)||n<0)return '—';
 if(n<1000)return n.toLocaleString('id-ID');
 if(n>=10000)return '10rb+';
 const thousands=Math.floor(n/1000);
 const tenths=Math.floor((n%1000)/100);
 return String(thousands)+(tenths?','+tenths:'')+'rb';
}
window.imamstoreFormatSold=formatProductSales;
function fmt(n){const x=Number(n);if(!Number.isFinite(x)||x<0)return '—';return x>=1000000?(x/1000000).toLocaleString('id-ID',{maximumFractionDigits:1})+'jt':x>=10000?(x/1000).toLocaleString('id-ID',{maximumFractionDigits:1})+'rb':x.toLocaleString('id-ID')}
function featureCandidates(p){
 const src=p.specifications??p.spesifikasi??p.fitur??p.features, result=[];
 const add=(k,v)=>{
  if(Array.isArray(v))v=v.filter(x=>typeof x==='string'||typeof x==='number').join(', ');
  if(typeof v!=='string'&&typeof v!=='number')return;
  const value=String(v).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  const label=(k?String(k).replace(/[_-]/g,' ')+': ':'')+value;
  if(value&&label.length>=3&&label.length<=85&&!/^(nama|sku|kode|harga|brand|model|id|_)/i.test(label))result.push(label);
 };
 if(Array.isArray(src))src.forEach(x=>{
  if(typeof x==='string'||typeof x==='number')add('',x);
  else if(x&&typeof x==='object'){
   const k=x.label??x.nama??x.name??x.key, v=x.value??x.nilai??x.isi??x.text;
   if(k!=null&&v!=null)add(k,v);
   else Object.entries(x).forEach(([key,value])=>add(key,value));
  }
 });
 else if(src&&typeof src==='object')Object.entries(src).forEach(([k,v])=>add(k,v));
 else if(typeof src==='string')src.split(/[;\n]/).forEach(v=>add('',v));
 return [...new Set(result)];
}
function feature(p){
 const parts=featureCandidates(p);if(!parts.length)return '';
 let hash=0;for(const c of String(p.id))hash=(hash*31+c.charCodeAt(0))>>>0;
 return parts[(Math.floor(Date.now()/300000)+hash)%parts.length];
}
const STORE_VOUCHER_SNAPSHOT=[{"id":"BELANJA50","name":"Voucher Belanja","description":"Potongan Belanja Rp5.000","type":"product_fixed","discount":5000,"min":500000,"maxDiscount":null,"expired":"2026-12-31","icon":"fa-tags","badge":"HOT","limit":"1 Voucher / Akun"},{"id":"DISKON10","name":"Diskon Produk 10%","description":"Diskon produk 10%","type":"product_percent","discount":10,"min":100000,"maxDiscount":500,"expired":"2026-12-31","icon":"fa-percent","badge":"PROMO","limit":"1 Voucher / Akun"},{"id":"ONGKIR5","name":"Diskon Ongkir","description":"Potongan Ongkir Rp5.000","type":"shipping_fixed","discount":5000,"min":500000,"maxDiscount":null,"expired":"2026-12-31","icon":"fa-truck","badge":"HEMAT","limit":"1 Voucher / Akun"}];
let activeVouchers=[];
function validVoucher(v){
 if(!v||!v.id||!v.name)return false;
 if(v.expired&&new Date(v.expired+'T23:59:59').getTime()<Date.now())return false;
 return true;
}
async function loadStoreVouchers(){
 try{
  let data;
  try {
    const response=await fetch('/store/vouchers.json',{cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status);
    data=await response.json();
  } catch(e) {
    console.warn('Voucher JSON tidak tersedia, memakai salinan voucher dari paket:',e);
    data=STORE_VOUCHER_SNAPSHOT;
  }
  activeVouchers=Array.isArray(data)?data.filter(validVoucher):[];
  const section=$('voucherSection'),rail=$('storeVouchers');
  section.classList.toggle('hidden',!activeVouchers.length);
  rail.innerHTML=activeVouchers.map(v=>`<article class="store-voucher"><i class="fa-solid fa-ticket voucher-icon"></i><div><b>${esc(v.name)}</b><small>${esc(v.description||'')} · Min. ${money(v.min||0)}</small><small>Berlaku sampai ${esc(v.expired||'sesuai ketentuan')}</small><small>Gunakan saat checkout jika memenuhi syarat</small></div></article>`).join('');
  render();
 }catch(e){console.warn('Voucher Store:',e);$('voucherSection').classList.add('hidden')}
}

function activeFlashProducts(){
 const now=Date.now();
 return products.filter(p=>{
  const f=p.flashSale;
  if(!f||f.enabled!==true)return false;
  const start=Date.parse(f.startAt||""),end=Date.parse(f.endAt||"");
  return Number.isFinite(start)&&Number.isFinite(end)&&start<=now&&now<end&&flashIsActive(p,now);
 }).sort((a,b)=>Date.parse(a.flashSale.endAt)-Date.parse(b.flashSale.endAt));
}
function flashDuration(ms){
 const secs=Math.max(0,Math.floor(ms/1000));
 const h=Math.floor(secs/3600),m=Math.floor(secs%3600/60),s=secs%60;
 return [h,m,s].map(n=>String(n).padStart(2,"0")).join(":");
}
function flashClockHTML(ms){
 return flashDuration(ms).split(":").map((n,i)=>`${i?'<span>:</span>':''}<b>${n}</b>`).join("");
}
let flashRenderSignature="";
function renderFlashSale(force=false){
 const items=activeFlashProducts();
 const section=$('flashSaleSection'),rail=$('flashSaleRail'),full=$('flashSaleFull');
 // Deep link dari website utama: buka daftar Flash Sale setelah data CMS tersedia.
 if(location.hash==='#flash-sale' && items.length && !full.classList.contains('open')){
  full.classList.add('open');
  full.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
 }

 section.classList.toggle('hidden',!items.length);
 const signature=JSON.stringify(items.map(p=>[p.id,p.nama,p.gambar,p.harga,p.flashSale,p.terjual]));
 if(force||signature!==flashRenderSignature){
  flashRenderSignature=signature;
  rail.innerHTML=items.slice(0,10).map(p=>card(p)).join('');
  $('flashSaleFullGrid').innerHTML=items.map(p=>card(p)).join('');
 }
 const soonest=items.length?Math.min(...items.map(p=>Date.parse(p.flashSale.endAt))):0;
 const html=items.length?flashClockHTML(soonest-Date.now()):'—';
 $('flashSaleClock').innerHTML=html;
 $('flashSaleFullClock').innerHTML=html;
 document.querySelectorAll('[data-flash-end]').forEach(el=>{
  const left=Date.parse(el.dataset.flashEnd)-Date.now();
  el.textContent=left>0?'Berakhir '+flashDuration(left):'Flash Sale berakhir';
 });
 if(full.classList.contains('open')&&!items.length)closeFlashSale();
}
function closeFlashSale(){
 if(location.hash==='#flash-sale')history.replaceState(null,'',location.pathname+location.search);
 $('flashSaleFull').classList.remove('open');
 $('flashSaleFull').setAttribute('aria-hidden','true');
 document.body.style.overflow='';
}
document.addEventListener('click',e=>{
 if(e.target.closest('#flashSaleMore')){
  renderFlashSale(true);
  $('flashSaleFull').classList.add('open');
  $('flashSaleFull').setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
 }
 if(e.target.closest('#flashSaleBack'))closeFlashSale();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('flashSaleFull').classList.contains('open'))closeFlashSale()});
let flashActiveKeys="";
setInterval(()=>{
 const keys=activeFlashProducts().map(p=>p.id).sort().join("|");
 if(keys!==flashActiveKeys){flashActiveKeys=keys;render();return;}
 renderFlashSale();
},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});

window.imamstoreOriginalCardRenderer=card;
function card(p){
 const h=price(p),n=normal(p),disc=n>h&&h>0?Math.round((1-h/n)*100):0;
 const st=stats.get(String(p.id))||{};
 const count=Number(st.ratingCount??p.ratingCount??0);
 const total=Number(st.ratingTotal??p.ratingTotal??0);
 const rating=count>0&&Number.isFinite(total)?(total/count).toFixed(1):'—';
 const sales=st.terjual??p.terjual??0;
 const views=st.views??p.views??p.viewCount;
 const benefit=feature(p);
 const hasVoucher=activeVouchers.some(v=>v.type&&v.type.startsWith("product_"));
 const isFlash=flashIsActive(p);
 return `<article class="product-card marketplace-card" data-product-id="${esc(p.id)}" tabindex="0" role="link" aria-label="Lihat ${esc(p.nama)}">
 ${disc?`<span class="marketplace-discount-badge">-${disc}%</span>`:''}
 ${isFlash?`<span class="nine-flash-label"><i class="fa-solid fa-bolt"></i> FLASH SALE</span>`:'' }
 <div class="marketplace-image-wrap"><img src="${esc(productImageUrl(p.gambar||''))}" alt="${esc(p.nama)}" loading="lazy"></div>
 <div class="product-card-body">
 ${isFlash?`<div class="flash-card-timer" data-flash-end="${esc(p.flashSale.endAt)}"></div>`:''}<h3 class="marketplace-product-name">${esc(p.nama)}</h3>
 <div class="marketplace-price">${money(h)}${disc?`<span class="marketplace-price-old">${money(n)}</span>`:''}</div>
 <div class="product-labels">${hasVoucher?'<span class="product-voucher-label"><i class="fa-solid fa-ticket"></i> Voucher</span>':''}${benefit?`<span class="product-feature">${esc(benefit)}</span>`:''}</div>
 <div class="product-meta"><span class="product-rating">⭐ ${rating}</span><span class="meta-sep">|</span><span class="meta-number">${formatProductSales(sales)} terjual</span><span class="meta-sep">|</span><span class="meta-number"><i class="fa-regular fa-eye"></i> ${views==null?'—':fmt(views)}</span></div>
 </div></article>`;
}
function rank(list,mode){
 let a=[...list];
 if(mode==='terbaru'){
  // Produk CMS terbaru lebih dulu; untuk produk dasar tanpa tanggal,
  // pertahankan perilaku 'terbaru' lama (urutan kebalikan katalog dasar).
  const index=new Map(products.map((p,i)=>[String(p.id),i]));
  a.sort((x,y)=>{
   const tx=cmsProductTime(x),ty=cmsProductTime(y);
   if(tx!==ty)return ty-tx;
   return (index.get(String(y.id))??0)-(index.get(String(x.id))??0);
  });
 }
 if(mode==='terlaris')a.sort((x,y)=>sold(y)-sold(x));
 if(mode==='promo')a.sort((x,y)=>((normal(y)-price(y))/Math.max(1,normal(y)))-((normal(x)-price(x))/Math.max(1,normal(x))));
 if(mode==='murah')a.sort((x,y)=>price(x)-price(y));
 if(mode==='mahal')a.sort((x,y)=>price(y)-price(x));
 return a;
}
function paint(id,items){$(id).innerHTML=items.length?items.map(card).join(''):'<p class="empty">Belum ada produk.</p>'}
function favoriteIds(){return window.imamstoreWishlist?.ids()||[];}
function renderFavorites(){
 const ids=favoriteIds(),index=new Map(products.map(p=>[String(p.id),p]));
 const items=ids.map(id=>index.get(id)).filter(Boolean);
 const grid=$('favoriteGrid');if(!grid)return;
 const signature=JSON.stringify(items.map(p=>[p.id,p.nama,p.gambar,p.harga,p.flashSale,p.terjual,p.views,stats.get(String(p.id))]));
 if(grid.dataset.signature!==signature){
  grid.dataset.signature=signature;
  grid.innerHTML=items.map(p=>`<div class="favorite-item">${card(p)}<button type="button" class="favorite-remove" data-favorite-toggle="${esc(p.id)}" aria-label="Hapus ${esc(p.nama)} dari favorit" title="Hapus dari favorit"><i class="fa-solid fa-heart" aria-hidden="true"></i></button></div>`).join('');
 }
 const state=window.imamstoreWishlist?.status()||{mode:'initializing',ready:false,migrating:false,error:''};
 const note=document.querySelector('#panel-favorit .favorite-note');
 if(note)note.textContent=state.mode==='account'
  ? (state.migrating?'Menggabungkan favorit dari browser ke akun Firebase…':state.error||'Favorit tersimpan otomatis pada akun anda .')
  :state.mode==='guest'?'Favorit sementara tersimpan di browser ini. Login agar tersinkron ke akun.':'Menyiapkan daftar favorit…';
 $('favoriteCount').textContent=!state.ready?'Memuat…':items.length+' produk';
 $('favoriteEmpty').textContent=state.mode==='account'&&!state.ready
  ?'Favorit akun sedang dimuat…'
  :'Belum ada produk favorit. Buka detail produk dan tekan ikon hati untuk menyimpannya.';
 $('favoriteEmpty').classList.toggle('hidden',items.length!==0);
}
document.addEventListener('nine:wishliststate',renderFavorites);
// Pencarian semantik ringan berbasis kategori Store realtime; ID hanya relasi internal.
const searchNormalize=value=>String(value??'').toLocaleLowerCase('id-ID').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
function categorySearchTerms(c){
 const raw=[c.name,c.description,c.deskripsi,c.keywords,c.aliases,c.searchKeywords,c.kataKunci];
 return raw.flatMap(v=>Array.isArray(v)?v:[v]).filter(v=>typeof v==='string').flatMap(v=>v.split(/[,;\n]+/)).map(searchNormalize).filter(Boolean);
}
// Pencarian kode produk mengabaikan pemisah (ETZ 6V = ETZ6V, T10-4014 = T10 4014).
// Gunakan hanya sebagai tambahan; pencarian nama, brand, kategori dan banyak kata tetap sama.
const searchCompact=value=>searchNormalize(value).replace(/\s+/g,'');
function searchMatches(p,needle){
 if(!needle)return true;
 const categories=(Array.isArray(p.storeCategories)?p.storeCategories:[])
  .map(id=>storeCategories.find(c=>c.id===id&&c.active!==false)).filter(Boolean);
 const fields=[p.nama,p.brand,p.kategori,p.deskripsi,p.sku,p.kode,p.fungsi,p.aplikasi,p.tags,...categories.flatMap(categorySearchTerms)];
 const normalized=fields.map(searchNormalize).filter(Boolean);
 if(normalized.some(v=>v.includes(needle)))return true;
 const compact=searchCompact(needle);
 if(compact.length>=3&&[p.sku,p.kode,p.nama].some(value=>searchCompact(value).includes(compact)))return true;
 // Semua kata boleh tersebar di nama, deskripsi, dan kategori, tetapi wajib semuanya cocok.
 const words=needle.split(' ').filter(Boolean);
 return words.length>1&&words.every(word=>normalized.some(v=>v.split(' ').some(token=>token.startsWith(word))));
}
// Urutkan hasil hanya ketika mode sort adalah populer. Sort murah/mahal/terbaru tetap asli.
function searchRelevance(p,needle){
 if(!needle)return 0;
 const compact=searchCompact(needle);
 const codes=[p.sku,p.kode].map(searchNormalize).filter(Boolean);
 if(codes.some(v=>v===needle||searchCompact(v)===compact))return 1000;
 if(codes.some(v=>v.startsWith(needle)||searchCompact(v).startsWith(compact)))return 850;
 if(codes.some(v=>v.includes(needle)||searchCompact(v).includes(compact)))return 700;
 const name=searchNormalize(p.nama);
 if(name===needle)return 650;
 if(name.startsWith(needle))return 550;
 if(name.includes(needle))return 450;
 if(compact.length>=3&&searchCompact(name).includes(compact))return 350;
 return 100;
}
// Smart Search Pro 2B: satu API pencarian dari katalog aktif (seed + CMS),
// memakai pencocokan/ranking, foto, dan harga yang sama dengan kartu ImamStore.
window.imamstoreSmartSearchData=Object.freeze({
 find(text,limit=8){
  const needle=searchNormalize(text);
  if(needle.length<2)return [];
  const max=Math.max(1,Math.min(12,Number(limit)||8));
  return products.filter(p=>searchMatches(p,needle))
   .sort((a,b)=>searchRelevance(b,needle)-searchRelevance(a,needle))
   .slice(0,max)
   .map(p=>({
    id:String(p.id),
    name:String(p.nama||''),
    sku:String(p.sku||p.kode||''),
    image:productImageUrl(p.gambar),
    price:Number(price(p))
   }));
 }
});
function openStoreFilter(type,value){
 activeStoreCategory=type==='category'?value:'';
 activeBrand=type==='brand'?value:'';
 query='';
 $('search').value=type==='category'?(storeCategories.find(c=>c.id===value)?.name||''):value;
 sort='populer';
 document.querySelectorAll('.sort').forEach(x=>x.classList.toggle('active',x.dataset.sort===sort));
 render();
 changeTab('produk');
 $('panel-produk').scrollTop=0;
}
// Logo brand di root utama /assets/brands/.
// Jika nama file berbeda dari nama brand, dapat dipetakan tanpa menyentuh filter:
// window.IMAMSTORE_BRAND_LOGOS = {'NINE LUXIMOS': 'luximos-logo.webp'};
const brandLogoResolved=new Map();
function brandLogoCandidates(brand){
 const name=String(brand||'').trim();
 const slug=name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 const bare=slug.replace(/^nine-/,'');
 const external=window.IMAMSTORE_BRAND_LOGOS||{};
 const mapped=external[name]||external[name.toUpperCase()]||external[slug];
 const filenames=[];
 if(typeof mapped==='string'&&mapped.trim())filenames.push(mapped.trim());
 // Nama lazim di folder brand. Tiap alternatif hanya dicoba bila file sebelumnya gagal.
 for(const base of [...new Set([slug,slug.replace(/-/g,'_'),bare,name])]){
  if(!base)continue;
  for(const ext of ['png','webp','svg'])filenames.push(base+'.'+ext);
 }
 const seen=new Set();
 return filenames.map(file=>{
  const cleaned=file.replace(/^\/?assets\/brands\//i,'').replace(/^\/+/, '');
  return '/assets/brands/'+cleaned.split('/').map(encodeURIComponent).join('/');
 }).filter(url=>{if(seen.has(url))return false;seen.add(url);return true});
}
(function installBrandLogoFallback(){
 const host=$('categoryChips');
 if(!host||host.dataset.logoFallbackInstalled)return;
 host.dataset.logoFallbackInstalled='true';
 host.addEventListener('load',event=>{
  const img=event.target;
  if(!img?.matches?.('.store-brand-logo'))return;
  brandLogoResolved.set(img.dataset.brandName,img.getAttribute('src'));
  img.hidden=false;
  const fallback=img.parentElement?.querySelector('.store-brand-logo-fallback');
  if(fallback)fallback.hidden=true;
 },true);
 host.addEventListener('error',event=>{
  const img=event.target;
  if(!img?.matches?.('.store-brand-logo'))return;
  const name=img.dataset.brandName,paths=brandLogoCandidates(name);
  const next=Number(img.dataset.brandAttempt||0)+1;
  if(next<paths.length){img.dataset.brandAttempt=String(next);img.src=paths[next];return;}
  img.hidden=true;
  const fallback=img.parentElement?.querySelector('.store-brand-logo-fallback');
  if(fallback)fallback.hidden=false;
  brandLogoResolved.set(name,'');
 },true);
})();
// Hanya daftar produk yang perlu dihitung ulang ketika kata pencarian berubah.
// Render area promo, kategori, beranda dan favorit tetap pada jalur render penuh.
function renderProductResults(){
 const needle=searchNormalize(query);
 const filtered=products.filter(p=>{
  if(activeStoreCategory&&!(Array.isArray(p.storeCategories)&&p.storeCategories.includes(activeStoreCategory)))return false;
  if(activeBrand&&String(p.brand||'').toLowerCase()!==activeBrand.toLowerCase())return false;
  return searchMatches(p,needle);
 });
 const ordered=rank(filtered,sort);
 if(needle&&sort==='populer'){
  ordered.sort((a,b)=>searchRelevance(b,needle)-searchRelevance(a,needle));
 }
 $('allGrid').innerHTML=ordered.length?ordered.map(card).join(''):'';
 $('productCount').textContent=filtered.length+' produk';
 $('storeProductCount').textContent=products.length;
 $('empty').classList.toggle('hidden',filtered.length!==0);
}
function render(){
 const discounted=rank(products.filter(p=>normal(p)>price(p)&&price(p)>0),'promo');
 renderFlashSale();
 paint('promoGrid',discounted.slice(0,4));paint('topGrid',rank(products,'terlaris').slice(0,4));paint('homeGrid',products.slice(0,8));
 renderProductResults();
 renderFavorites();
 refreshStoreSold();
 const enabled=storeCategories.filter(c=>c.active!==false);
 $('categoryList').innerHTML=enabled.map(c=>{
  const count=products.filter(p=>Array.isArray(p.storeCategories)&&p.storeCategories.includes(c.id)).length;
  return `<button class="category" data-store-category="${esc(c.id)}"><span class="cat-icon"><i class="fa-solid fa-tags"></i></span><span class="cat-name">${esc(c.name)}</span><span class="count">${count}</span><i class="fa-solid fa-chevron-right" style="color:#aaa"></i></button>`;
 }).join('')||'<p class="empty">Kategori Store belum tersedia.</p>';
 const brands=new Map();
 products.forEach(p=>{const v=String(p.brand||'').trim();if(v)brands.set(v,(brands.get(v)||0)+1)});
 const brandRows=[...brands].sort((a,b)=>b[1]-a[1]).slice(0,20);
 const brandHost=$('categoryChips');
 const brandSignature=JSON.stringify(brandRows);
 // Hindari membuat ulang gambar/scroll saat render dipicu timer atau statistik produk.
 if(brandHost.dataset.brandSignature!==brandSignature){
  brandHost.dataset.brandSignature=brandSignature;
  brandHost.classList.add('store-brand-logos');
  brandHost.innerHTML=brandRows.map(([k,n])=>{
   const candidates=brandLogoCandidates(k);
   const src=brandLogoResolved.get(k)||candidates[0];
   const index=Math.max(0,candidates.indexOf(src));
   const savedAsMissing=brandLogoResolved.get(k)==='';
   return `<button type="button" class="chip store-brand-logo-card" data-store-brand="${esc(k)}" aria-label="Lihat ${esc(n)} produk ${esc(k)}" title="${esc(k)}">`
    +`<span class="store-brand-logo-wrap"><img class="store-brand-logo" data-brand-name="${esc(k)}" data-brand-attempt="${index}" src="${esc(src)}" alt="Logo ${esc(k)}" loading="lazy" decoding="async" ${savedAsMissing?'hidden':''}>`
    +`<span class="store-brand-logo-fallback" ${savedAsMissing?'':'hidden'}>${esc(k)}</span></span>`
    +`<span class="store-brand-product-count">${n} Produk</span></button>`;
  }).join('');
 }
 const shelves=$('storeCategoryShelves');
 // Jangan rebuild rail saat scroll/sentuh berlangsung: render dipanggil oleh statistik dan timer.
 const signature=JSON.stringify(enabled.map(c=>[c.id,c.name,products.filter(p=>Array.isArray(p.storeCategories)&&p.storeCategories.includes(c.id)).map(p=>[p.id,p.nama,p.gambar,p.harga,p.terjual,p.active])]));
 if(shelves.dataset.signature!==signature){
  shelves.dataset.signature=signature;
  shelves.innerHTML=enabled.map(c=>{
   const items=products.filter(p=>Array.isArray(p.storeCategories)&&p.storeCategories.includes(c.id));
   if(!items.length)return '';
   return `<div class="section"><div class="section-head"><h2>${esc(c.name)}</h2><button class="more" data-store-category="${esc(c.id)}">Lihat Semua ›</button></div><div class="store-category-rail" data-horizontal-scroll>${items.map(card).join('')}<button class="store-category-more" data-store-category="${esc(c.id)}"><i class="fa-solid fa-arrow-right"></i><span>Lihat Semua</span></button></div></div>`;
  }).join('');
 }
}

function changeTab(t){
 if(!['toko','produk','kategori','favorit'].includes(t)||t===tab)return;
 const previous=$('panel-'+tab),next=$('panel-'+t);
 // Setiap panel mempertahankan scrollTop sendiri secara native.
 previous.classList.remove('active');
 next.classList.add('active');
 tab=t;
 $('storeFilterDock').hidden=t!=='produk';
 document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===t));
 if(window.storeSyncVerticalHeader)window.storeSyncVerticalHeader();
 window.imamstoreRefreshScrollTop?.();
}

function showEveryStoreProduct(){
 window.nineVisitStore?.(); // menutup detail serta membersihkan parameter ?product
 activeStoreCategory='';
 activeBrand='';
 query='';
 $('search').value='';
 sort='populer';
 document.querySelectorAll('.sort').forEach(el=>el.classList.toggle('active',el.dataset.sort===sort));
 render();
 changeTab('produk');
 window.storeResetVerticalHeader?.();
 const panel=$('panel-produk');
 if(panel)panel.scrollTo({top:0,behavior:'instant'});
 window.imamstoreRefreshScrollTop?.();
}
window.imamstoreShowAllStoreProducts=showEveryStoreProduct;
document.addEventListener('click',e=>{
 const fav=e.target.closest('[data-favorite-toggle]');if(fav){e.preventDefault();e.stopPropagation();window.toggleWishlist?.(fav.dataset.favoriteToggle);return}
 const cardEl=e.target.closest('[data-product-id]');if(cardEl){document.dispatchEvent(new CustomEvent('imamstore:open-product',{detail:{id:String(cardEl.dataset.productId)}}));return}
 const t=e.target.closest('[data-tab]');if(t){changeTab(t.dataset.tab);return}
 const go=e.target.closest('[data-go]');if(go){if(go.dataset.sort){sort=go.dataset.sort;document.querySelectorAll('.sort').forEach(x=>x.classList.toggle('active',x.dataset.sort===sort));render()}changeTab(go.dataset.go);return}
 const so=e.target.closest('[data-sort]');if(so){sort=so.dataset.sort;document.querySelectorAll('.sort').forEach(x=>x.classList.toggle('active',x===so));render();return}
 const storeCat=e.target.closest('[data-store-category]');
 if(storeCat){openStoreFilter('category',storeCat.dataset.storeCategory);return}
 const brand=e.target.closest('[data-store-brand]');
 if(brand){openStoreFilter('brand',brand.dataset.storeBrand);return}
});
// SATU swipe engine: panel punya scroll mandiri, tanpa window.scrollTo atau tinggi sementara.
(function(){
 const root=$('storeContent'),order=['toko','produk','kategori','favorit'];
 const excluded='input,textarea,select,[contenteditable="true"],.store-vouchers,.chips,.sortbar,[data-horizontal-scroll]';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let gesture=null,settling=false,ignoreClickUntil=0;
 const panel=t=>$('panel-'+t);
 const translate=(p,x)=>{p.style.transform=`translate3d(${x}px,0,0)`};
 function clear(g){
  if(g?.from){g.from.style.transition='';g.from.style.transform='';g.from.style.willChange=''}
  if(g?.to){g.to.classList.remove('swipe-peer');g.to.style.transition='';g.to.style.transform='';g.to.style.willChange=''}
  root.classList.remove('swiping');
  settling=false;
 }
 function begin(g){
  g.from=panel(order[g.index]);g.to=panel(order[g.next]);
  g.width=root.clientWidth;
  if(!g.width||!g.from||!g.to)return false;
  root.classList.add('swiping');
  g.to.classList.add('swipe-peer');
  g.from.style.willChange='transform';g.to.style.willChange='transform';
  translate(g.to,(g.next>g.index?1:-1)*g.width);
  return true;
 }
 function drag(g,dx){
  const x=Math.max(-g.width,Math.min(g.width,dx)),dir=g.next>g.index?1:-1;
  translate(g.from,x);translate(g.to,x+dir*g.width);
 }
 function finish(commit){
  const g=gesture;gesture=null;
  if(!g?.from)return;
  settling=true;
  const dir=g.next>g.index?1:-1,duration=reduced?0:commit?230:160;
  const end=commit?-dir*g.width:0;
  const offset=commit?0:dir*g.width;
  const ease='cubic-bezier(.2,.75,.25,1)';
  const complete=()=>{
   if(commit){
    // Tujuan sudah berada di x=0 sebelum indikator berubah.
    g.from.classList.remove('active');
    g.to.classList.add('active');
    tab=order[g.next];
    $('storeFilterDock').hidden=tab!=='produk';
    document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
    if(window.storeSyncVerticalHeader)window.storeSyncVerticalHeader();
   }
   clear(g);
  };
  if(!duration){translate(g.from,end);translate(g.to,offset);complete();return}
  g.from.style.transition=`transform ${duration}ms ${ease}`;
  g.to.style.transition=`transform ${duration}ms ${ease}`;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   translate(g.from,end);translate(g.to,offset);
  }));
  setTimeout(complete,duration+35);
 }
 root.addEventListener('touchstart',e=>{
  if(settling||e.touches.length!==1||e.target.closest(excluded)){gesture=null;return}
  const t=e.touches[0],now=performance.now();
  gesture={x:t.clientX,y:t.clientY,lastX:t.clientX,lastTime:now,start:now,
   axis:null,index:order.indexOf(tab),next:-1,dx:0,velocity:0};
 },{passive:true});
 root.addEventListener('touchmove',e=>{
  const g=gesture;if(!g||e.touches.length!==1)return;
  const t=e.touches[0],dx=t.clientX-g.x,dy=t.clientY-g.y;
  if(!g.axis){
   if(Math.hypot(dx,dy)<7)return;
   if(Math.abs(dx)<=Math.abs(dy)*1.12){gesture=null;return}
   g.axis='x';g.next=g.index+(dx<0?1:-1);
   if(g.next<0||g.next>=order.length||!begin(g)){gesture=null;return}
  }
  if(e.cancelable)e.preventDefault();
  const now=performance.now(),dt=now-g.lastTime;
  if(dt>0&&dt<120)g.velocity=(t.clientX-g.lastX)/dt;
  g.lastX=t.clientX;g.lastTime=now;g.dx=dx;
  drag(g,dx);
 },{passive:false});
 root.addEventListener('touchend',e=>{
  const g=gesture;if(!g)return;
  if(g.axis!=='x'){gesture=null;return}
  const t=e.changedTouches[0],dx=t.clientX-g.x,dy=t.clientY-g.y;
  const toward=g.next>g.index?-1:1;
  const distance=dx*toward,elapsed=Math.max(1,performance.now()-g.start);
  const speed=Math.max(g.velocity*toward,distance/elapsed);
  const commit=Math.abs(dx)>Math.abs(dy)*1.12&&(distance>g.width*.22||(distance>12&&speed>.22));
  ignoreClickUntil=performance.now()+450;finish(commit);
 },{passive:true});
 root.addEventListener('touchcancel',()=>{if(gesture?.from)finish(false);else gesture=null},{passive:true});
 root.addEventListener('click',e=>{
  if(performance.now()<ignoreClickUntil){e.preventDefault();e.stopImmediatePropagation()}
 },true);
})();
// Cegah menu tekan-lama Chrome pada foto produk Store.
document.addEventListener('contextmenu',e=>{
 if(e.target.closest('.marketplace-image-wrap img,.product-card img')){
  e.preventDefault();
 }
},true);
document.addEventListener('dragstart',e=>{if(e.target.closest('img'))e.preventDefault()});
document.addEventListener('keydown',e=>{const c=e.target.closest('[data-product-id]');if(c&&(e.key==='Enter'||e.key===' ')){e.preventDefault();c.click()}});
// Input harus responsif: jangan bangun ulang seluruh beranda per huruf.
// Render hasil produk dijadwalkan setelah pengguna berhenti mengetik sebentar.
let searchGridTimer=0;
$('search').addEventListener('input',e=>{
 activeStoreCategory='';activeBrand='';
 query=e.target.value.trim().toLowerCase();
 if(query)changeTab('produk');
 clearTimeout(searchGridTimer);
 searchGridTimer=setTimeout(()=>{searchGridTimer=0;renderProductResults()},120);
});
$('clearSearch').onclick=()=>{
 clearTimeout(searchGridTimer);searchGridTimer=0;
 query='';activeStoreCategory='';activeBrand='';
 $('search').value='';renderProductResults();$('search').focus();
};
(async()=>{
 const seed=[];
 try{
  // Jangan biarkan kegagalan katalog JSON menghentikan CMS Firestore.
  try{
   const r=await fetch('/produk.json',{cache:'no-store'});
   if(!r.ok)throw Error('HTTP '+r.status);
   const data=await r.json();
   if(!Array.isArray(data))throw Error('Format katalog bukan array');
   seed.push(...data.filter(Boolean).map(normalize));
  }catch(error){
   catalogHealth.seedError=String(error?.message||error).slice(0,120);
   console.warn('[ImamStore katalog] Katalog dasar gagal dimuat, CMS tetap dicoba:',error);
  }
  catalogHealth.seed=seed.length;
  products=seed.filter(active);
  catalogHealth.visible=products.length;
  render();
  window.imamstoreDeepLinkCatalogState={phase:'seed',ids:products.map(p=>String(p.id))};
  document.dispatchEvent(new Event('imamstore:catalog-updated'));
  if(!window.firebase){catalogHealth.cmsError='Firebase SDK belum siap';window.imamstoreDeepLinkCatalogState={phase:'cms-error',ids:products.map(p=>String(p.id))};document.dispatchEvent(new Event('imamstore:catalog-updated'));return;}
  if(!imamstoreBootstrapFirebaseR8())console.warn('[ImamStore R8 developer] Bootstrap was not completed');
  const db=firebase.firestore();
  // Statistik sama dengan website utama: statistik_produk.
  db.collection('statistik_produk').onSnapshot(snap=>{
   stats.clear();let ratingTotal=0,ratingCount=0;
   snap.forEach(doc=>{const x=doc.data()||{};stats.set(String(doc.id),x);
    const c=Number(x.ratingCount),t=Number(x.ratingTotal);
    if(Number.isFinite(c)&&Number.isFinite(t)&&c>0&&t>=c&&t<=5*c){ratingCount+=c;ratingTotal+=t}
   });
   $('storeRating').textContent=ratingCount?(ratingTotal/ratingCount).toFixed(1):'—';
   render();
  },e=>console.warn('Statistik produk belum dapat dimuat:',e));
  // Total pengikut historis tetap dari satu counter lama yang juga dipakai website utama.
  // Pengunjung baru hanya mengubah counter melalui customer-trust.mjs sesudah autentikasi.
  // Status tombol diatur satu pemilik: imamstoreCustomerTrust, bukan user_like listener lama.
  const likeRef=db.collection('interaksi_web').doc('landing');
  likeRef.onSnapshot(doc=>{
    const x=doc.data()||{},n=Number(x.like);
    $('storeFollowers').textContent=Number.isFinite(n)&&n>=0?n.toLocaleString('id-ID'):'—';
  },e=>console.warn('[Ikuti] Counter belum dapat dimuat',e.code||e.message));

  db.collection('store_categories').onSnapshot(snapshot=>{
   storeCategories=snapshot.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0)||String(a.name).localeCompare(String(b.name)));
   if(activeStoreCategory&&!storeCategories.some(c=>c.id===activeStoreCategory&&c.active!==false)){
    activeStoreCategory='';$('search').value='';
   }
   render();
  },error=>console.warn('Kategori Store belum dapat dibaca:',error));
  db.collection('cms_products').onSnapshot(snapshot=>{
   const docs=new Map();
   snapshot.forEach(doc=>docs.set(doc.id,doc.data()));
   const seedIds=new Set(seed.map(p=>String(p.id)));
   catalogHealth.cms=docs.size;
   catalogHealth.cmsNew=[...docs].filter(([id,v])=>v&&active(v)&&!seedIds.has(String(v.id??id))).length;
   catalogHealth.cmsError='';
   catalogHealth.updatedAt=new Date().toISOString();
   products=merge(seed,docs);
   catalogHealth.visible=products.length;
   render();
   window.imamstoreDeepLinkCatalogState={phase:'cms',ids:products.map(p=>String(p.id)),fromCache:!!snapshot.metadata?.fromCache};
   document.dispatchEvent(new Event('imamstore:catalog-updated'));
   console.info('[ImamStore katalog] Sinkron CMS:',catalogHealth.cms,'dokumen,',catalogHealth.cmsNew,'produk baru,',products.length,'produk tampil.');
  },error=>{
   catalogHealth.cmsError=String(error?.code||error?.message||error).slice(0,120);
   window.imamstoreDeepLinkCatalogState={phase:'cms-error',ids:products.map(p=>String(p.id))};
   document.dispatchEvent(new Event('imamstore:catalog-updated'));
   console.warn('[ImamStore katalog] CMS belum bisa dibaca; katalog dasar tetap ditampilkan:',error);
  });
  // Status admin dikelola oleh satu listener Firestore terpisah.
  
// Admin presence now initializes independently of catalog and Firebase bootstrap.
  // See the single admin presence controller after this script.


 }catch(e){
  console.error('Katalog gagal menyelesaikan inisialisasi:',e);
  // Jangan kosongkan katalog yang sudah berhasil diperoleh dari JSON / CMS.
  catalogHealth.cmsError=String(e?.code||e?.message||e).slice(0,120);
  if(!products.length)render();
  window.imamstoreDeepLinkCatalogState={phase:'cms-error',ids:products.map(p=>String(p.id))};
  document.dispatchEvent(new Event('imamstore:catalog-updated'));
 }
})();
