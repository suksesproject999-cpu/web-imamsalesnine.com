(()=>{'use strict';
// Satu sumber views: event nine:views-updated dari listener Firestore detail.
// Ulasan tetap dibaca terpisah, tetapi toast views TIDAK mengambil statistik lagi.
const root=document.getElementById('imamstoreLiveOriginalDetail');if(!root)return;
let active='',items=[],reviewItems=[],verifiedViews=null,cursor=0,epoch=0,lastFetch=0,pending=false,activeActivity=null;
const valid=id=>/^[A-Za-z0-9_-]{1,120}$/.test(id);
const db=()=>{try{return window.firebase?.apps?.length?firebase.firestore():null}catch(_){return null}};
const getId=()=>{if(!root.classList.contains('open'))return '';const id=new URLSearchParams(location.search).get('product')||'';return valid(id)?id:''};
const reviewText=d=>[d.text,d.review,d.comment,d.ulasan,d.komentar,d.content,d.message].find(x=>typeof x==='string'&&x.trim())?.trim()||'';
const gallery=()=>root.querySelector('.product-detail .gallery-main');
function viewsText(){return verifiedViews===null?'':verifiedViews.toLocaleString('id-ID')+' kali dilihat'}
function rebuildItems(){
 items=[...reviewItems];
 if(verifiedViews!==null&&verifiedViews>0)items.push({icon:'fa-eye',text:viewsText()});
 if(items.length)cursor%=items.length;else cursor=0;
}
function clear(){
 root.querySelectorAll('.nine-review-toast-stack').forEach(e=>e.remove());
 items=[];reviewItems=[];verifiedViews=null;cursor=0;lastFetch=0;activeActivity=null;
}
function ensureProduct(id){
 if(id!==active){active=id;epoch++;clear();pending=false;}
}
function syncVisibleViews(){
 const text=viewsText();
 for(const toast of root.querySelectorAll('.nine-review-toast-stack .nine-review-toast')){
  if(!toast.querySelector('i.fa-eye'))continue;
  const label=toast.querySelector('span');
  if(verifiedViews!==null&&verifiedViews>0){if(label)label.textContent=text;}
  else toast.remove();
 }
}
// Event dari syncProductViews; dijalankan hanya sesudah snapshot server terkonfirmasi.
document.addEventListener('nine:views-updated',event=>{
 const detail=event.detail||{},id=String(detail.productId||'');
 if(!id||id!==getId())return;
 const n=Number(detail.views);
 if(!Number.isSafeInteger(n)||n<0)return;
 ensureProduct(id);
 verifiedViews=n;
 rebuildItems();
 syncVisibleViews();
});
async function refresh(id,stamp){
 if(pending)return;
 const d=db();if(!d)return;
 pending=true;
 try{
  // HANYA ulasan: tidak ada GET kedua untuk statistik_produk.
  const reviews=await d.collection('ulasan_produk').where('productId','==',id).limit(60).get();
  if(stamp!==epoch||id!==getId())return;
  const arr=reviews.docs.map(doc=>reviewText(doc.data()||{})).filter(Boolean);
  reviewItems=arr.map(t=>({icon:'fa-comment-dots',text:arr.length+' ulasan: "'+t.slice(0,140)+'"'}));
  rebuildItems();
  lastFetch=Date.now();cursor=0;
 }catch(e){console.warn('[ImamStore review toast]',e?.message||e)}finally{pending=false}
}
function push(extra){
 const g=gallery();if(!g||(!extra&&!items.length)||document.hidden)return;
 let stack=g.querySelector('.nine-review-toast-stack');
 if(!stack){stack=document.createElement('div');stack.className='nine-review-toast-stack';stack.setAttribute('aria-live','off');g.appendChild(stack)}
 const item=extra||items[cursor++%items.length],el=document.createElement('div');el.className='nine-review-toast nine-enter';
 const icon=document.createElement('i');icon.className='fa-solid '+item.icon;icon.setAttribute('aria-hidden','true');
 const label=document.createElement('span');label.textContent=item.text;el.append(icon,label);stack.appendChild(el);
 requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.remove('nine-enter')));
 while(stack.children.length>3)stack.firstElementChild.remove();
 setTimeout(()=>{el.classList.add('nine-exit');setTimeout(()=>el.remove(),350)},11000);
}
async function tick(){
 const id=getId();ensureProduct(id);
 if(!id||!gallery())return;
 if(!lastFetch||Date.now()-lastFetch>45000){const stamp=epoch;await refresh(id,stamp)}
 if(id===getId())push();
}
document.addEventListener('nine:toast-activity',e=>{const x=e.detail||{};if(String(x.productId)===getId()&&x.text)push({icon:x.icon||'fa-bell',text:String(x.text)})});
document.addEventListener('nine:toast-presence',e=>{const x=e.detail||{},n=Number(x.count);if(String(x.productId)===getId()&&Number.isFinite(n)&&n>=2)push({icon:'fa-user',text:n+' orang sedang melihat produk ini'})});
setTimeout(tick,900);setInterval(tick,3300);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
})();
(function(){
'use strict';
const TYPES={cart:['fa-cart-shopping','Seseorang menambahkan produk ini ke keranjang'],favorite:['fa-heart','Seseorang menambahkan produk ini ke favorit'],checkout:['fa-credit-card','Seseorang memulai checkout produk ini'],order:['fa-bag-shopping','Seseorang membuat pesanan produk ini (menunggu konfirmasi)']};
const TTL=120000;
let currentId='',off=null,known=new Set(),ready=false,token=0;
function db(){try{return firebase.firestore()}catch(_){return null}}
function user(){try{return firebase.auth().currentUser}catch(_){return null}}
function activeId(){const root=document.getElementById('imamstoreLiveOriginalDetail');if(!root?.classList.contains('open'))return '';return String(new URLSearchParams(location.search).get('product')||'')}
function display(evt){
 const config=TYPES[evt.type];if(!config||document.hidden||activeId()!==String(evt.productId))return;
 document.dispatchEvent(new CustomEvent('nine:toast-activity',{detail:{productId:evt.productId,type:evt.type,icon:config[0],text:config[1]}}));
}
async function emit(type,ids){
 if(!TYPES[type]||!Array.isArray(ids))return;
 // Event is emitted only after an actual successful user action.
 // R5 shares the authenticated/anonymous Firebase session with product presence.
 const u=await (window.imamstoreRealtime?.identity?.()||Promise.resolve(user()));
 const d=db();if(!d||!u)return;
 const unique=[...new Set(ids.map(String).filter(Boolean))].slice(0,12);
 await Promise.allSettled(unique.map(async productId=>{
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(productId))return;
  const path=d.collection('product_activity').doc(productId).collection('events').doc();
  try{await path.set({uid:u.uid,type,productId,createdAt:firebase.firestore.FieldValue.serverTimestamp()})}
  catch(e){console.warn('[Nine Activity] Gagal kirim:',e.code||e.message)}
 }));
}
document.addEventListener('nine:productactivity',e=>{const x=e.detail||{};void emit(x.type,x.ids)});
document.addEventListener('nine:wishlistchange',e=>{if(e.detail?.liked===true)void emit('favorite',[String(e.detail.id)])});
function watch(){
 const pid=activeId();
 if(pid===currentId&&off)return;
 if(off){off();off=null}currentId=pid;known.clear();ready=false;++token;
 if(!pid||!/^[A-Za-z0-9_-]{1,120}$/.test(pid)||!user()||!db())return;
 const mine=token;
 off=db().collection('product_activity').doc(pid).collection('events').orderBy('createdAt','desc').limit(20).onSnapshot(snap=>{
  if(mine!==token||activeId()!==pid)return;
  const fresh=[];
  snap.forEach(doc=>{
   const x=doc.data(),t=x.createdAt?.toMillis?.();
   if(!t||Date.now()-t>TTL||Date.now()-t< -15000||x.uid===user()?.uid||!TYPES[x.type]||x.productId!==pid)return;
   if(!known.has(doc.id))fresh.push({...x,id:doc.id});
   known.add(doc.id);
  });
  if(!ready){ready=true;return}
  fresh.reverse().forEach(display);
 },e=>console.warn('[Nine Activity] Listener gagal:',e.code||e.message));
}
setInterval(watch,1300);
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(off){off();off=null}currentId=''}else watch()});
})();
