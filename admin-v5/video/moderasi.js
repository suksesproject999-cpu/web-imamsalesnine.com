/* R39.2 — Admin V5 video comments: reuse existing Netlify admin session + Firebase Auth.
   Cross-origin request carries both tokens ONLY in HTTPS headers (never URL/iframe).
   Store Function validates both independently and checks FIREBASE_ADMIN_UID. */
(()=>{
 'use strict';
 const CONFIG={apiKey:'AIzaSyBkyMCw47sYQb2BBkGMxgfsXppozWw4Cec',authDomain:'apin-web.firebaseapp.com',projectId:'apin-web',storageBucket:'apin-web.firebasestorage.app',messagingSenderId:'733140414417',appId:'1:733140414417:web:b6967fd053ac462b2ffaf0'};
 const API='/.netlify/functions/imam-video-moderation-proxy';
 const $=id=>document.getElementById(id);
 const identity=$('identity'),status=$('message'),warning=$('warning'),tools=$('tools'),list=$('list'),retry=$('retry');
 let firebaseUser=null,netlifySession='',ready=false,appCheckReady=false,mode='listPending',epoch=0,busy=false;
 const say=message=>{status.textContent=String(message||'')};
 const sessionToken=()=>localStorage.getItem('imamsales:session:admin') || (localStorage.getItem('role')==='admin'?localStorage.getItem('token'):null) || '';
 function block(message){ready=false;tools.hidden=true;list.replaceChildren();warning.textContent=message;warning.hidden=false;}
 function allow(){ready=true;warning.hidden=true;tools.hidden=false}
 function setMode(value){mode=value;$('pending').classList.toggle('primary',mode==='listPending');$('reported').classList.toggle('primary',mode==='listReported')}
 async function verifyNetlify(){
  const token=sessionToken();if(!token)throw Error('Sesi Admin V5 belum ada atau sudah keluar. Buka Admin V5 dan login kembali.');
  const response=await fetch('/.netlify/functions/verify-token',{method:'GET',cache:'no-store',headers:{Authorization:'Bearer '+token}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.success!==true||data?.user?.role!=='admin')throw Error('Sesi Admin V5 tidak valid atau sudah berakhir. Login kembali ke Admin V5.');
  return token;
 }
 async function api(action,params={}){
  if(!firebaseUser||firebaseUser.isAnonymous||!netlifySession)throw Error('Identitas Admin V5 belum terverifikasi.');
  if(!appCheckReady)throw Error('Firebase App Check belum siap. Coba buka ulang halaman.');
  const idToken=await firebaseUser.getIdToken();
  const appCheck=await firebase.appCheck().getToken(false);
  if(!appCheck?.token)throw Error('Token App Check tidak tersedia.');
  let response;
  try{response=await fetch(API,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','Authorization':'Bearer '+idToken,'X-Firebase-AppCheck':appCheck.token,'X-Imam-Admin-Session':netlifySession},body:JSON.stringify({action,...params})})}
  catch{throw Error('Tidak dapat menghubungi Function moderasi di domain Admin V5. Periksa deploy project website utama.');}
  const data=await response.json().catch(()=>({success:false,message:'Respons server tidak valid.'}));
  if(!response.ok||data?.success!==true){const error=Error(data?.message||'Akses ditolak.');error.status=response.status;throw error}
  return data;
 }
 function formatTime(value){if(!Number.isFinite(value)||!value)return '-';try{return new Date(value).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})}catch{return '-'}}
 function button(text,decision,id){
  const el=document.createElement('button');el.type='button';el.textContent=text;el.className=decision==='approve'?'primary':'danger';
  el.addEventListener('click',async()=>{
   if(busy||!ready)return;
   if(!window.confirm(text+' komentar ini?'))return;
   busy=true;el.disabled=true;say('Memproses komentar…');
   try{await api('moderate',{commentId:id,decision});say('Komentar berhasil diperbarui.');await load()}
   catch(error){say(error.message||'Moderasi gagal.');el.disabled=false}
   finally{busy=false}
  });return el;
 }
 function draw(data){
  list.replaceChildren();const rows=Array.isArray(data?.items)?data.items:[];
  if(!rows.length){say('Tidak ada komentar dalam daftar ini.');return}
  say(rows.length+' komentar ditemukan.');const fragment=document.createDocumentFragment();
  for(const row of rows){
   const article=document.createElement('article'),heading=document.createElement('h2'),content=document.createElement('p'),note=document.createElement('small'),actions=document.createElement('div');
   heading.textContent='Produk '+String(row.productId||'—')+' · '+String(row.status||'—');
   content.textContent=String(row.text||'');note.textContent='Laporan '+(Number(row.reports)||0)+' kali · '+formatTime(Number(row.createdAt));actions.className='actions';
   if(row.status!=='approved')actions.append(button('Setujui','approve',String(row.id)));
   if(row.status==='pending')actions.append(button('Tolak','reject',String(row.id)));
   if(row.status==='approved')actions.append(button('Sembunyikan','hide',String(row.id)));
   article.append(heading,content,note,actions);fragment.append(article);
  }list.append(fragment);
 }
 async function load(){
  if(!ready)return;const e=epoch;say('Mengambil daftar komentar…');
  try{const result=await api(mode);if(e===epoch)draw(result)}catch(error){if(e===epoch)say(error.message||'Gagal memuat komentar.')}
 }
 async function check(){
  const e=++epoch;ready=false;netlifySession='';tools.hidden=true;list.replaceChildren();retry.disabled=true;warning.hidden=true;
  try{
   identity.textContent='Memeriksa sesi Netlify Admin V5…';
   const verified=await verifyNetlify();if(e!==epoch)return;
   netlifySession=verified;
   const current=firebase.auth().currentUser;
   firebaseUser=current;
   if(!current||current.isAnonymous)throw Error('Firebase Admin belum login pada domain Admin V5. Buka Kelola Pesanan untuk menyinkronkan akun Firebase.');
   identity.textContent='Memeriksa Firebase UID '+(current.email||'Admin')+'…';
   const response=await api('moderatorStatus');if(e!==epoch)return;
   if(response.uid!==current.uid||response.authorized!==true)throw Error('UID Firebase tidak cocok dengan UID Admin server.');
   allow();identity.textContent='Admin terverifikasi: '+(current.email||'Firebase UID '+current.uid);
   say('Akses moderasi aktif.');await load();
  }catch(error){if(e!==epoch)return;block(error.message||'Akses moderasi belum tersedia.');identity.textContent='Akses moderator belum aktif.';say('Periksa sesi Admin V5 dan Firebase UID. Jangan membuat akun atau password baru.');}
  finally{if(e===epoch)retry.disabled=false}
 }
 $('pending').addEventListener('click',()=>{setMode('listPending');void load()});
 $('reported').addEventListener('click',()=>{setMode('listReported');void load()});
 retry.addEventListener('click',async()=>{try{const current=firebase.auth().currentUser;if(current)await current.getIdToken(true)}catch{}void check()});
 if(typeof firebase==='undefined'||typeof firebase.auth!=='function'||typeof firebase.appCheck!=='function'){
  block('Firebase SDK tidak dapat dimuat. Periksa koneksi internet.');retry.disabled=true;return;
 }
 try{
  if(!firebase.apps.length)firebase.initializeApp(CONFIG);
  firebase.appCheck().activate(new firebase.appCheck.ReCaptchaEnterpriseProvider('6LdyvOktAAAAAPcWRB-_bmuw3Z6wVSzgX1kAG11M'),true);
  appCheckReady=true;
 }catch(error){block('App Check gagal aktif pada domain Admin V5. Periksa konfigurasi reCAPTCHA/App Check.');retry.disabled=true;return}
 firebase.auth().onAuthStateChanged(user=>{firebaseUser=user;void check()},()=>{block('Gagal memeriksa sesi Firebase.');});
})();
