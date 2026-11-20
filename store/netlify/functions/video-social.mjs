/**
 * ImamStore R39 — video social, server-owned Firestore state.
 * Place only in the existing Store Netlify Functions directory.
 * All mutations require verified Firebase Auth and App Check tokens.
 * Social data never writes to wishlist, product stats, orders or reviews.
 */
import {createHash} from 'node:crypto';
import {getApps,initializeApp,cert} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getAppCheck} from 'firebase-admin/app-check';
import {getFirestore,FieldValue,Timestamp} from 'firebase-admin/firestore';

const PRODUCT='cms_products',VIDEOS='video_social',LIMITS='video_social_limits',QUEUE='video_comment_moderation';
const okId=id=>/^[A-Za-z0-9_-]{1,120}$/.test(String(id??''));
const baseURL='https://store.imamsales.com';
const ADMIN_V5_ORIGIN='https://imamsalesnine.com';
const ALLOWED_ORIGINS=new Set([baseURL,ADMIN_V5_ORIGIN]);
const MODERATOR_ACTIONS=new Set(['moderatorStatus','listPending','listReported','moderate']);
const adminUid=()=>String(process.env.FIREBASE_ADMIN_UID||'').trim();
async function verifyAdminSession(event,token){
 const requiredUid=adminUid();
 if(!requiredUid)throw Object.assign(new Error('FIREBASE_ADMIN_UID belum dikonfigurasi pada project Netlify Store.'),{status:503});
 if(!token?.uid||token.firebase?.sign_in_provider==='anonymous'||token.uid!==requiredUid)
  throw Object.assign(new Error('Firebase UID ini bukan UID admin pengelola pesanan ImamStore.'),{status:403});
 const session=String(event.headers?.['x-imam-admin-session']||event.headers?.['X-Imam-Admin-Session']||'').trim();
 if(!session||session.length>8192)throw Object.assign(new Error('Sesi Admin V5 tidak tersedia. Login kembali melalui Admin V5.'),{status:401});
 // Reuse Admin V5's existing server-side verify-token role check, not a second password flow.
 // The endpoint can be configured if the admin domain changes; no client-provided URL.
 const verifier=String(process.env.ADMIN_V5_VERIFY_URL||'https://imamsalesnine.com/.netlify/functions/verify-token');
 let result;
 try{result=await fetch(verifier,{method:'GET',headers:{Authorization:'Bearer '+session,Accept:'application/json'},redirect:'error',cache:'no-store'});}
 catch{throw Object.assign(new Error('Tidak dapat menghubungi verifikasi Admin V5.'),{status:503});}
 let data;
 try{data=await result.json()}catch{data=null}
 if(!result.ok||data?.success!==true||data?.user?.role!=='admin')
  throw Object.assign(new Error('Sesi Admin V5 tidak valid atau tidak memiliki role admin.'),{status:403});
}

const mediaPath=v=>{if(typeof v!=='string'||v.length>1800)return '';try{const u=new URL(v,baseURL);if(u.protocol!=='https:'||!/^\.(?:mp4|webm)$/i.test('.'+u.pathname.split('.').pop()))return '';return u.origin+u.pathname}catch{return ''}};
const cleanText=(v,n)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
const json=(status,obj,headers={})=>({statusCode:status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...headers},body:JSON.stringify(obj)});
const fail=(status,message)=>json(status,{success:false,message});
const serviceAccount=()=>{const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;if(raw){const data=JSON.parse(raw);if(data.private_key)data.private_key=data.private_key.replace(/\\n/g,'\n');return data}const project_id=process.env.FIREBASE_PROJECT_ID,client_email=process.env.FIREBASE_CLIENT_EMAIL,private_key=process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,'\n');if(!project_id||!client_email||!private_key)throw new Error('Firebase Admin environment incomplete');return {project_id,client_email,private_key}};
let firebaseApp;
function getServices(){if(!firebaseApp){const creds=serviceAccount();if(creds.project_id!=='apin-web')throw Error('Unexpected Firebase project');firebaseApp=getApps().find(a=>a.name==='imamstore-video-social')||initializeApp({credential:cert(creds)},'imamstore-video-social')}return {db:getFirestore(firebaseApp),auth:getAuth(firebaseApp),appCheck:getAppCheck(firebaseApp)}}
const tokenFrom=event=>String(event.headers?.authorization||event.headers?.Authorization||'').replace(/^Bearer\s+/i,'').trim();
async function authenticated(services,event,required){const token=tokenFrom(event);if(!token){if(required)throw Object.assign(new Error('Sesi Firebase belum tersedia.'),{status:401});return null}try{return await services.auth.verifyIdToken(token,true)}catch{if(required)throw Object.assign(new Error('Sesi Firebase tidak valid. Muat ulang halaman.'),{status:401});return null}}
async function checkApp(services,event){const token=event.headers?.['x-firebase-appcheck']||event.headers?.['X-Firebase-AppCheck'];if(!token)throw Object.assign(new Error('Proteksi App Check belum siap. Muat ulang halaman.'),{status:403});try{await services.appCheck.verifyToken(token)}catch{throw Object.assign(new Error('Verifikasi App Check gagal.'),{status:403})}}
function videoEntries(product){const raw=Array.isArray(product?.videoProduk)?product.videoProduk:product?.videoProduk?[product.videoProduk]:Array.isArray(product?.videos)?product.videos:[];return raw.map(v=>mediaPath(typeof v==='string'?v:v?.url||v?.src)).filter(Boolean)}
async function validateVideo(db,productId,videoUrl){if(!okId(productId))throw Object.assign(new Error('ID produk tidak valid.'),{status:400});const canonical=mediaPath(videoUrl);if(!canonical)throw Object.assign(new Error('URL video tidak valid.'),{status:400});const snap=await db.collection(PRODUCT).doc(productId).get();if(!snap.exists||!videoEntries(snap.data()).includes(canonical))throw Object.assign(new Error('Video belum terdaftar pada produk CMS tersebut.'),{status:404});const key=createHash('sha256').update(productId+'\n'+canonical).digest('hex');return {key,canonical,videoRef:db.collection(VIDEOS).doc(key)}}
const clamp=n=>Math.max(0,Math.floor(Number(n)||0));
const now=()=>Date.now();
const dateKey=millis=>new Date(millis).toISOString().slice(0,10);
async function state({db,videoRef},uid){const snap=await videoRef.get(),data=snap.data()||{};const comments=await videoRef.collection('comments').where('status','==','approved').limit(25).get();const list=comments.docs.map(d=>({id:d.id,text:cleanText(d.data().text,500),name:'Pengunjung',createdAt:d.data().createdAt?.toMillis?.()||0})).sort((a,b)=>b.createdAt-a.createdAt);const liked=uid?((await videoRef.collection('likes').doc(uid).get()).exists):false;return {likes:clamp(data.likes),comments:clamp(data.comments),liked,list};}
async function like(db,videoRef,uid){const marker=videoRef.collection('likes').doc(uid),rate= db.collection(LIMITS).doc(uid);let outcome={};await db.runTransaction(async tx=>{const [v,l,r]=await tx.getAll(videoRef,marker,rate);const existing=r.data()||{},t=now();if(t-(existing.lastLikeAt?.toMillis?.()||0)<1500)throw Object.assign(new Error('Terlalu cepat. Coba sebentar lagi.'),{status:429});const was=l.exists,count=clamp(v.data()?.likes),next=was?Math.max(0,count-1):count+1;tx.set(videoRef,{likes:next,updatedAt:Timestamp.fromMillis(t)},{merge:true});if(was)tx.delete(marker);else tx.set(marker,{createdAt:Timestamp.fromMillis(t)});tx.set(rate,{lastLikeAt:Timestamp.fromMillis(t)},{merge:true});outcome={liked:!was,likes:next}});return outcome;}
async function comment(db,videoRef,uid,text,productId,videoUrl){const raw=String(text??'');if(raw.length>500)throw Object.assign(new Error('Komentar maksimal 500 karakter.'),{status:400});const content=cleanText(raw,500);if(content.length<2||content.length>500)throw Object.assign(new Error('Komentar harus berisi 2–500 karakter.'),{status:400});if(/https?:\/\/|www\.|\b(?:wa\.me|t\.me)\b/i.test(content))throw Object.assign(new Error('Tautan tidak diperbolehkan dalam komentar.'),{status:400});const limit=db.collection(LIMITS).doc(uid),entry=videoRef.collection('comments').doc(),moderation=db.collection(QUEUE).doc(entry.id);const t=now();await db.runTransaction(async tx=>{const snap=await tx.get(limit),data=snap.data()||{},day=dateKey(t);if(t-(data.lastCommentAt?.toMillis?.()||0)<60000)throw Object.assign(new Error('Tunggu 60 detik sebelum komentar berikutnya.'),{status:429});const count=data.commentDay===day?clamp(data.commentDayCount):0;if(count>=8)throw Object.assign(new Error('Batas 8 komentar per hari tercapai.'),{status:429});tx.set(limit,{lastCommentAt:Timestamp.fromMillis(t),commentDay:day,commentDayCount:count+1},{merge:true});tx.create(entry,{uid,text:content,status:'pending',createdAt:Timestamp.fromMillis(t)});tx.create(moderation,{videoKey:videoRef.id,commentId:entry.id,productId,videoUrl,text:content,status:'pending',reports:0,createdAt:Timestamp.fromMillis(t)});});return {pending:true,message:'Komentar diterima dan menunggu moderasi.'};}

async function reportComment(db,videoRef,uid,commentId){if(!okId(commentId))throw Object.assign(new Error('ID komentar tidak valid.'),{status:400});
 const target=videoRef.collection('comments').doc(commentId),marker=target.collection('reports').doc(uid),queue=db.collection(QUEUE).doc(commentId);
 await db.runTransaction(async tx=>{const [c,m,q]=await tx.getAll(target,marker,queue);if(!c.exists||c.data().status!=='approved')throw Object.assign(new Error('Komentar tidak ditemukan.'),{status:404});if(m.exists)return;tx.create(marker,{createdAt:Timestamp.fromMillis(now())});tx.update(target,{reportCount:FieldValue.increment(1)});if(q.exists)tx.update(queue,{reports:clamp(q.data().reports)+1})});return {message:'Laporan diterima untuk ditinjau.'};}
async function moderate(db,body){const action=body.decision,commentId=String(body.commentId||'');if(!['approve','reject','hide'].includes(action)||!okId(commentId))throw Object.assign(new Error('Parameter moderasi salah.'),{status:400});const q=db.collection(QUEUE).doc(commentId);let result={};await db.runTransaction(async tx=>{const queued=await tx.get(q);if(!queued.exists)throw Object.assign(new Error('Komentar tidak ditemukan.'),{status:404});const {videoKey}=queued.data();const videoRef=db.collection(VIDEOS).doc(videoKey),commentRef=videoRef.collection('comments').doc(commentId);const [c,v]=await tx.getAll(commentRef,videoRef);if(!c.exists)throw Object.assign(new Error('Komentar tidak ditemukan.'),{status:404});const previous=c.data().status,next=action==='approve'?'approved':action==='hide'?'hidden':'rejected';if(previous!==next){tx.update(commentRef,{status:next,moderatedAt:Timestamp.fromMillis(now())});tx.update(q,{status:next,moderatedAt:Timestamp.fromMillis(now())});if(previous==='approved'||next==='approved'){const change=(next==='approved'?1:0)-(previous==='approved'?1:0);tx.set(videoRef,{comments:Math.max(0,clamp(v.data()?.comments)+change)},{merge:true})}}result={status:next};});return result;}
async function runHandler(event){try{const method=event.httpMethod||'GET';if(!['GET','POST'].includes(method))return fail(405,'Metode tidak didukung.');if(method==='POST'){const origin=event.headers?.origin||event.headers?.Origin;if(origin&&!ALLOWED_ORIGINS.has(origin))return fail(403,'Origin tidak diizinkan.');if((event.body||'').length>12000)return fail(413,'Permintaan terlalu besar.')}const services=getServices(),{db}=services;let body={};if(method==='POST'){try{body=JSON.parse(event.body||'{}')}catch{return fail(400,'JSON tidak valid.')}}const action=method==='GET'?'state':String(body.action||'');const origin=event.headers?.origin||event.headers?.Origin;if(method==='POST'&&origin===ADMIN_V5_ORIGIN&&!MODERATOR_ACTIONS.has(action))return fail(403,'Origin Admin V5 khusus moderasi.');const uidToken=await authenticated(services,event,action!=='state');if(MODERATOR_ACTIONS.has(action)){await checkApp(services,event);await verifyAdminSession(event,uidToken);if(action==='moderatorStatus')return json(200,{success:true,uid:uidToken.uid,authorized:true});if(action==='listPending'||action==='listReported'){const snap=action==='listPending'?await db.collection(QUEUE).where('status','==','pending').limit(50).get():await db.collection(QUEUE).where('reports','>=',1).limit(50).get();return json(200,{success:true,items:snap.docs.map(d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toMillis?.()||0})).map(x=>({...x,createdAt:typeof x.createdAt==='number'?x.createdAt:0}))})}return json(200,{success:true,...await moderate(db,body)})}
 const productId=String(method==='GET'?event.queryStringParameters?.productId||'':body.productId||'');const videoUrl=String(method==='GET'?event.queryStringParameters?.videoUrl||'':body.videoUrl||'');const v=await validateVideo(db,productId,videoUrl);if(action==='state')return json(200,{success:true,...await state({db,videoRef:v.videoRef},uidToken?.uid)});await checkApp(services,event);if(action==='toggleLike')return json(200,{success:true,...await like(db,v.videoRef,uidToken.uid)});if(action==='comment')return json(200,{success:true,...await comment(db,v.videoRef,uidToken.uid,body.text,productId,v.canonical)});if(action==='report')return json(200,{success:true,...await reportComment(db,v.videoRef,uidToken.uid,String(body.commentId||''))});return fail(400,'Aksi tidak dikenal.');
 }catch(e){if(!e.status)console.error('[R39 social]',e?.code||e?.message||'unknown');return fail(e.status||503,e.status?e.message:'Layanan interaksi video belum tersedia. Coba lagi.')}
}

export async function handler(event){
 const origin=String(event.headers?.origin||event.headers?.Origin||'');
 const isAllowed=ALLOWED_ORIGINS.has(origin);
 const cors=isAllowed?{
  'Access-Control-Allow-Origin':origin,
  'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type, Authorization, X-Firebase-AppCheck, X-Imam-Admin-Session',
  'Vary':'Origin'
 }:{};
 if(event.httpMethod==='OPTIONS'){
  if(!isAllowed)return fail(403,'Origin tidak diizinkan.');
  return {statusCode:204,headers:{...cors,'Cache-Control':'no-store'},body:''};
 }
 const response=await runHandler(event);
 return {...response,headers:{...response.headers,...cors}};
}
