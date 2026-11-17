// ImamStore customer trust gate — Firebase Authentication, verified reviews & follow.
// Requires the existing Store Netlify helper: store/netlify/lib/firebase-admin.mjs
import {createHash} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';
import {getPresenceFirebase} from '../lib/firebase-admin.mjs';

const ORIGINS=new Set(['https://store.imamsales.com','https://store.imamsalesnine.com']);
const productOK=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(x);
const orderOK=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(x);
const legacyOK=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{12,64}$/.test(x);
function reply(status,data,origin=''){
 const h=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff','Vary':'Origin'});
 if(ORIGINS.has(origin)){
  h.set('Access-Control-Allow-Origin',origin);
  h.set('Access-Control-Allow-Methods','POST, OPTIONS');
  h.set('Access-Control-Allow-Headers','Content-Type, Authorization');
 }
 return new Response(status===204?null:JSON.stringify(data),{status,headers:h});
}
const publicFail=(code,message)=>Object.assign(new Error(message),{status:code,publicMessage:message});
const reviewId=(uid,productId)=>createHash('sha256').update('imamstore-reviewed-v2\0'+uid+'\0'+productId).digest('hex');
const itemsFor=(order,productId)=>Array.isArray(order?.items)?order.items.filter(x=>String(x?.productId||'')===productId):[];
const completed=order=>String(order?.status||'').toLowerCase()==='completed';
function realUser(decoded){return !!decoded?.uid&&decoded.firebase?.sign_in_provider!=='anonymous'}
function nameFor(decoded){return String(decoded.name||'Pengguna ImamStore').trim().slice(0,70)||'Pengguna ImamStore'}
async function ordersFor(db,uid){
 const snap=await db.collection('orders').where('uid','==',uid).limit(100).get();
 return snap.docs.filter(d=>completed(d.data())).sort((a,b)=>{
  const x=a.data().updatedAt?.toMillis?.()||a.data().createdAt?.toMillis?.()||0;
  const y=b.data().updatedAt?.toMillis?.()||b.data().createdAt?.toMillis?.()||0;
  return y-x;
 });
}
// The public review collection is a historical ledger. Previous deployments stored
// one review per order+product. V2 prevents an account from reviewing the same
// product again, including if a historical review already exists.
async function accountReviewedProducts(db,uid){
 const snap=await db.collection('ulasan_produk').where('uid','==',uid).get();
 return new Set(snap.docs.map(d=>String(d.data()?.productId||'')).filter(productOK));
}
async function reviewEntries(db,uid,{productId=''}={}){
 const [all,reviewedProducts]=await Promise.all([ordersFor(db,uid),accountReviewedProducts(db,uid)]);
 const entries=[],seenItems=new Set(),offered=new Set();
 for(const snap of all){const order=snap.data();
  for(const item of order.items||[]){
   const pid=String(item?.productId||'');if(!productOK(pid)||(productId&&pid!==productId))continue;
   const key=snap.id+'\0'+pid;if(seenItems.has(key))continue;seenItems.add(key);
   const reviewed=reviewedProducts.has(pid);
   const reviewable=!reviewed&&!offered.has(pid);offered.add(pid);
   entries.push({orderId:snap.id,productId:pid,productName:String(item?.nama||'Produk ImamStore').slice(0,160),
    variant:String(item?.varian||'').slice(0,120),reviewed,reviewable});
   if(entries.length>=100)break;
  }
  if(entries.length>=100)break;
 }
 return entries;
}
async function setFollow(db,uid,desired,legacyVisitorId){
 const account=db.collection('store_followers').doc(uid);
 const count=db.collection('interaksi_web').doc('landing');
 const legacy=legacyOK(legacyVisitorId)?db.collection('user_like').doc(legacyVisitorId):null;
 return db.runTransaction(async tx=>{
  // Read all documents before any write. Every repeat request is idempotent.
  const [accountSnap,countSnap,legacySnap]=await Promise.all([
   tx.get(account),tx.get(count),legacy?tx.get(legacy):Promise.resolve(null)]);
  const active=accountSnap.exists&&accountSnap.data()?.active===true;
  const legacyActive=!!legacySnap?.exists&&legacySnap.data()?.liked===true;
  const raw=countSnap.exists?countSnap.data()?.like:0;
  const total=raw===undefined?0:Number(raw);
  if(!Number.isSafeInteger(total)||total<0)throw publicFail(503,'Jumlah pengikut belum dapat disinkronkan.');
  const delta=(desired?1:0)-(active?1:0)-(legacyActive?1:0);
  if(total+delta<0)throw publicFail(503,'Jumlah pengikut perlu diperiksa admin.');
  if(active!==desired)tx.set(account,{uid,active:desired,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  if(legacyActive)tx.update(legacy,{liked:false}); // One-time migration of old visitor record.
  if(delta)tx.set(count,{like:total+delta},{merge:true});
  return {following:desired,followers:total+delta,migratedLegacy:legacyActive};
 });
}
async function submitReview(db,decoded,body){
 const uid=decoded.uid,orderId=body.orderId,productId=body.productId;
 const rating=body.rating,text=body.text;
 if(!orderOK(orderId)||!productOK(productId))throw publicFail(400,'Pesanan atau produk tidak valid.');
 if(!Number.isInteger(rating)||rating<1||rating>5)throw publicFail(400,'Pilih penilaian 1 sampai 5 bintang.');
 if(typeof text!=='string'||text.length>1200)throw publicFail(400,'Ulasan maksimal 1.200 karakter.');
 const orderRef=db.collection('orders').doc(orderId);
 const reviewRef=db.collection('ulasan_produk').doc(reviewId(uid,productId));
 const previousReviewQuery=db.collection('ulasan_produk').where('uid','==',uid);
 const statsRef=db.collection('statistik_produk').doc(productId);
 await db.runTransaction(async tx=>{
  // Reads come before writes. A deterministic UID/product document prevents
  // concurrent duplicate submissions, while querying UID rejects historical reviews.
  const [orderSnap,reviewSnap,oldReviews]=await Promise.all([
   tx.get(orderRef),tx.get(reviewRef),tx.get(previousReviewQuery)]);
  if(!orderSnap.exists)throw publicFail(403,'Pesanan tidak ditemukan pada akun ini.');
  const order=orderSnap.data();
  if(order.uid!==uid)throw publicFail(403,'Pesanan bukan milik akun ini.');
  if(!completed(order))throw publicFail(403,'Ulasan tersedia setelah pesanan selesai.');
  if(!itemsFor(order,productId).length)throw publicFail(403,'Produk tidak ditemukan dalam pesanan selesai ini.');
  if(reviewSnap.exists||oldReviews.docs.some(d=>String(d.data()?.productId||'')===productId))
   throw publicFail(409,'Produk ini sudah pernah diulas oleh akunmu. Terima kasih!');
  tx.create(reviewRef,{uid,orderId,productId,rating,text:text.trim(),nama:nameFor(decoded),
   verifiedPurchase:true,createdAt:FieldValue.serverTimestamp()});
  // Keep existing product card and store star aggregates synced in the same transaction.
  tx.set(statsRef,{ratingCount:FieldValue.increment(1),ratingTotal:FieldValue.increment(rating),
   updatedAt:FieldValue.serverTimestamp()},{merge:true});
 });
 return {reviewId:reviewRef.id,verifiedPurchase:true};
}
export default async function handler(request){
 const origin=request.headers.get('origin')||'';
 if(origin&&!ORIGINS.has(origin))return reply(403,{success:false,message:'Origin tidak diizinkan'},origin);
 if(request.method==='OPTIONS')return reply(204,null,origin);
 if(request.method!=='POST')return reply(405,{success:false,message:'Metode tidak diizinkan'},origin);
 const bearer=/^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization')||'');
 if(!bearer)return reply(401,{success:false,message:'Silakan masuk dengan akun pelanggan.'},origin);
 let body;try{if(Number(request.headers.get('content-length')||0)>8192)throw Error('large');
  const raw=await request.text();if(raw.length>8192)throw Error('large');body=JSON.parse(raw);
 }catch{return reply(400,{success:false,message:'Permintaan tidak valid.'},origin)}
 if(!body||typeof body!=='object'||Array.isArray(body))return reply(400,{success:false,message:'Permintaan tidak valid.'},origin);
 try{
  const {auth,db}=getPresenceFirebase();
  let decoded;try{decoded=await auth.verifyIdToken(bearer[1],true)}catch{throw publicFail(401,'Sesi pelanggan kedaluwarsa. Masuk kembali.')}
  if(!realUser(decoded))throw publicFail(403,'Masuk menggunakan akun pelanggan untuk melanjutkan.');
  const uid=decoded.uid;
  switch(body.action){
   case 'followStatus':{
    const doc=await db.collection('store_followers').doc(uid).get();
    return reply(200,{success:true,following:doc.exists&&doc.data()?.active===true},origin);
   }
   case 'setFollow':{
    if(typeof body.following!=='boolean')throw publicFail(400,'Status mengikuti tidak valid.');
    const data=await setFollow(db,uid,body.following,body.legacyVisitorId);
    return reply(200,{success:true,...data},origin);
   }
   case 'reviewEligibility':{
    if(!productOK(body.productId))throw publicFail(400,'ID produk tidak valid.');
    const entries=await reviewEntries(db,uid,{productId:body.productId});
    return reply(200,{success:true,entries},origin);
   }
   case 'reviewQueue':{
    const entries=await reviewEntries(db,uid);
    return reply(200,{success:true,entries},origin);
   }
   case 'submitReview':{
    const result=await submitReview(db,decoded,body);
    return reply(200,{success:true,...result},origin);
   }
   default:throw publicFail(400,'Aksi tidak dikenal.');
  }
 }catch(error){
  if(error?.publicMessage)return reply(error.status||400,{success:false,message:error.publicMessage},origin);
  console.error('[ImamStore customer trust]',String(error?.code||error?.message||'unknown').slice(0,160));
  return reply(503,{success:false,message:'Layanan pelanggan sedang tidak tersedia. Coba kembali.'},origin);
 }
}
