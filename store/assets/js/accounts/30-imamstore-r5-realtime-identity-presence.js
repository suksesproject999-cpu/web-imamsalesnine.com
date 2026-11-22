
/* R5: one authenticated visitor session per open product; server timestamps, no simulated activity. */
(()=>{'use strict';
if(window.imamstoreRealtime)return;
const VALID=/^[A-Za-z0-9_-]{1,120}$/;
const TTL=90000,HEARTBEAT=25000;
let authPromise=null,anonymousRetryAt=0,authUnsub=null;
let desired='',session=null,pending=false,generation=0,backoffUntil=0;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const app=()=>{try{return window.firebase?.apps?.length?window.firebase:null}catch{return null}};
const auth=()=>{try{return app()?.auth?.()||null}catch{return null}};
const db=()=>{try{return app()?.firestore?.()||null}catch{return null}};
const currentId=()=>{
 const host=document.getElementById('imamstoreLiveOriginalDetail');
 if(document.hidden||!host?.classList.contains('open')||!host.querySelector('.product-detail'))return '';
 const id=String(new URLSearchParams(location.search).get('product')||'');
 return VALID.test(id)?id:'';
};
async function identity(){
 if(authPromise)return authPromise;
 authPromise=(async()=>{
  let a=auth();
  for(let i=0;i<25&&!a;i++){await pause(200);a=auth()}
  if(!a)return null;
  try{
   if(typeof a.authStateReady==='function')await a.authStateReady();
   else await new Promise(resolve=>{
    let off=()=>{},done=false;
    const end=()=>{if(done)return;done=true;queueMicrotask(()=>off());resolve()};
    off=a.onAuthStateChanged(end,end);
    setTimeout(end,4500);
   });
  }catch(e){console.warn('[ImamStore R5 Auth]',e.code||e.message)}
  if(a.currentUser)return a.currentUser;
  // Never replace an in-progress customer login with anonymous auth.
  if(document.getElementById('nexaiCustomerLogin')?.hidden===false)return null;
  if(Date.now()<anonymousRetryAt)return null;
  try{return (await a.signInAnonymously()).user||a.currentUser}
  catch(e){anonymousRetryAt=Date.now()+60000;console.warn('[ImamStore R5 Anonymous]',e.code||e.message);return null}
 })().finally(()=>{authPromise=null});
 return authPromise;
}
function clearPresence(){
 ++generation;
 const previous=session;session=null;desired='';pending=false;
 if(previous){
  if(previous.off){try{previous.off()}catch{}}
  if(previous.heartbeat)clearInterval(previous.heartbeat);
  if(previous.ref){
   // Do not race an in-flight heartbeat write when leaving or changing products.
   Promise.resolve(previous.lastWrite).catch(()=>{}).then(()=>{
    if(session?.pid===previous.pid&&session?.uid===previous.uid)return;
    return previous.ref.delete();
   }).catch(e=>console.warn('[ImamStore R5 Presence cleanup]',e.code||e.message));
  }
 }
}
async function begin(pid,token){
 let ref=null,uid='';
 try{
  const u=await identity();
  if(token!==generation||currentId()!==pid)return;
  if(!u||!db()){pending=false;desired='';backoffUntil=Date.now()+10000;return}
  uid=u.uid;
  ref=db().collection('product_presence').doc(pid).collection('sessions').doc(uid);
  const state={pid,uid,ref,off:null,heartbeat:null,busy:false,lastCount:0,lastToast:0};
  session=state;
  const touch=async()=>{
   if(state!==session||document.hidden||currentId()!==pid||state.busy)return;
   state.busy=true;
   try{
    state.lastWrite=ref.set({updatedAt:window.firebase.firestore.FieldValue.serverTimestamp()});
    await state.lastWrite;
   }
   catch(e){console.warn('[ImamStore R5 Presence write]',e.code||e.message)}
   finally{state.busy=false}
  };
  await touch();
  if(state!==session||token!==generation||currentId()!==pid)return;
  // Snapshot is real server-backed sessions. A viewer needs a distinct Firebase UID.
  state.off=db().collection('product_presence').doc(pid).collection('sessions').onSnapshot(snapshot=>{
   if(state!==session||document.hidden||currentId()!==pid)return;
   const cutoff=Date.now()-TTL,unique=new Set();
   snapshot.forEach(row=>{
    const ms=row.data()?.updatedAt?.toMillis?.();
    if(Number.isFinite(ms)&&ms>=cutoff&&ms<=Date.now()+15000)unique.add(row.id);
   });
   const count=unique.size;
   if(count>=2&&(count!==state.lastCount||Date.now()-state.lastToast>=60000)){
    state.lastToast=Date.now();
    document.dispatchEvent(new CustomEvent('nine:toast-presence',{detail:{productId:pid,count}}));
   }
   state.lastCount=count;
  },e=>console.warn('[ImamStore R5 Presence listener]',e.code||e.message));
  state.heartbeat=setInterval(touch,HEARTBEAT);
  pending=false;
 }catch(e){
  if(token===generation){console.warn('[ImamStore R5 Presence]',e.code||e.message);clearPresence();backoffUntil=Date.now()+15000}
 }finally{if(token===generation)pending=false}
}
function sync(){
 const pid=currentId(),a=auth(),uid=a?.currentUser?.uid||'';
 if(!pid){if(desired||session||pending)clearPresence();return}
 if(pid===desired && (pending||(session&&session.uid===uid)))return;
 if(Date.now()<backoffUntil)return;
 clearPresence();desired=pid;pending=true;
 const token=generation;void begin(pid,token);
}
function onAuth(){sync()}
function watchAuth(){const a=auth();if(a&&!authUnsub){authUnsub=a.onAuthStateChanged(onAuth,()=>{})}}
const every=setInterval(()=>{watchAuth();sync()},1100);
document.addEventListener('imamstore:open-product',()=>setTimeout(sync,50));
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearPresence();else sync()});
window.addEventListener('popstate',()=>setTimeout(sync,50));
window.addEventListener('pagehide',clearPresence);
// API only for activity emitter and diagnostics. No separate renderer or extra cart handlers.
window.imamstoreRealtime=Object.freeze({identity,status:()=>({productId:session?.pid||'',signedIn:!!auth()?.currentUser,tracking:!!session?.off}),sync});
watchAuth();sync();
})();
