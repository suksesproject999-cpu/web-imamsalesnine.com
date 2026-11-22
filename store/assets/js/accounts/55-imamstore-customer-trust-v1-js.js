
/* ImamStore verified follow and review UI controller — account state never cached as guest. */
(()=>{'use strict';
 const btn=document.getElementById('storeFollow');
 const GUEST='imamstore_follow_guest_v1',LEGACY='imamstore_follow_legacy_v1',PROMPT='imamstore_review_prompt_v1_';
 const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(x);
 const safeStorage={get(k){try{return localStorage.getItem(k)}catch{return null}},set(k,v){try{localStorage.setItem(k,v);return true}catch{return false}},remove(k){try{localStorage.removeItem(k)}catch{}}};
 const follow={mode:'loading',following:false,busy:false,uid:'',error:''};
 let trustToastTimer=null;
 const toast=(message,error=false)=>{
  let el=document.getElementById('imamstoreTrustToast');
  if(!el){el=document.createElement('div');el.id='imamstoreTrustToast';el.setAttribute('role','status');
   el.setAttribute('aria-live','polite');document.body.appendChild(el)}
  clearTimeout(trustToastTimer);el.textContent=String(message||'');
  el.dataset.kind=error?'error':'success';el.classList.add('visible');
  trustToastTimer=setTimeout(()=>el.classList.remove('visible'),3000);
 };
 function paintFollow(){if(!btn)return;
  btn.disabled=follow.busy||follow.mode==='loading'||follow.mode==='error';
  const official=follow.mode==='account'&&follow.following===true;
  btn.setAttribute('aria-pressed',String(official));
  btn.innerHTML=official?'<i class="fa-solid fa-heart"></i> Mengikuti':'<i class="fa-regular fa-heart"></i> Ikuti';
  btn.title=follow.mode==='error'?'Status mengikuti belum dapat dimuat. Coba muat ulang halaman.':follow.mode==='guest'?'Masuk ke akun untuk resmi mengikuti ImamStore':'';
 }
 async function invoke(action,payload={}){
  const user=window.firebase?.auth?.()?.currentUser;
  if(!user||user.isAnonymous)throw Error('Masuk ke akun pelanggan terlebih dahulu.');
  const token=await user.getIdToken();
  const response=await fetch('/.netlify/functions/customer-trust',{
   method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
   body:JSON.stringify({action,...payload})
  });
  const result=await response.json().catch(()=>({message:'Respons server tidak tersedia.'}));
  if(!response.ok||!result.success)throw Error(result.message||'Permintaan belum berhasil.');
  if(window.firebase?.auth?.()?.currentUser?.uid!==user.uid)throw Error('Sesi akun berubah. Silakan coba kembali.');
  return result;
 }
 async function seedLegacy(){
  if(safeStorage.get(GUEST)!==null)return;
  const id=safeStorage.get('visitor_id');
  if(!id||!/^[A-Za-z0-9_-]{12,64}$/.test(id))return;
  try{
   const doc=await window.firebase.firestore().collection('user_like').doc(id).get();
   if(doc.exists&&doc.data()?.liked===true){
    safeStorage.set(GUEST,'1');safeStorage.set(LEGACY,id);
   }
  }catch(e){console.warn('[Ikuti] Data legacy belum dapat dibaca',e?.code||e?.message)}
 }
 let identity=0,stopFollowSnapshot=null,pendingGuestFollow=false;
 // Lanjutan dari tombol hati website utama. Query hanya membuka UI: tidak
 // boleh membuat akun Follow secara otomatis dari kunjungan GET.
 let entryFollowIntent=false,entryFollowShown=false;
 try{entryFollowIntent=new URL(location.href).searchParams.get('intent')==='follow'}catch{}
 function revealEntryFollowIntent(){
  if(!entryFollowIntent||entryFollowShown||!btn||!['guest','account'].includes(follow.mode))return;
  entryFollowShown=true;
  try{const url=new URL(location.href);url.searchParams.delete('intent');
   history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  }catch{}
  requestAnimationFrame(()=>{
   btn.scrollIntoView({behavior:'smooth',block:'center'});
   try{btn.focus({preventScroll:true})}catch{}
   toast(follow.mode==='guest'?'Masuk lalu tekan Ikuti untuk mengikuti ImamStore.':
    follow.following?'Akunmu sudah mengikuti ImamStore.':'Tekan Ikuti untuk mengikuti ImamStore.');
  });
 }
 async function bind(user){
  if(stopFollowSnapshot){stopFollowSnapshot();stopFollowSnapshot=null}
  const ticket=++identity;
  follow.busy=false;follow.uid=user?.uid||'';follow.error='';follow.mode='loading';follow.following=false;paintFollow();
  if(!user||user.isAnonymous){
   await seedLegacy();if(ticket!==identity)return;
   follow.mode='guest';follow.following=false;paintFollow();revealEntryFollowIntent();return;
  }
  try{
   await seedLegacy();if(ticket!==identity)return;
   const r=await invoke('followStatus');if(ticket!==identity)return;
   follow.mode='account';follow.following=r.following===true;
   // A guest's explicit preference is migrated exactly once, after server acknowledgement.
   const local=safeStorage.get(GUEST),oldId=safeStorage.get(LEGACY);
   if(local==='1'){
    const saved=await invoke('setFollow',{following:true,legacyVisitorId:oldId||undefined});
    if(ticket!==identity)return;
    follow.following=saved.following===true;
    safeStorage.remove(GUEST);safeStorage.remove(LEGACY);
   }else if(local==='0'){
    // An old guest "unfollow" preference must never unfollow an account.
    safeStorage.remove(GUEST);safeStorage.remove(LEGACY);
   }
   if(pendingGuestFollow){pendingGuestFollow=false;toast(follow.following?'Berhasil mengikuti ImamStore. Status akun tersinkron.':'Status mengikuti belum aktif, coba lagi.',!follow.following)}
   paintFollow();
   // Realtime cross-device status: one UID document per signed-in customer.
   stopFollowSnapshot=window.firebase.firestore().collection('store_followers').doc(user.uid).onSnapshot(doc=>{
    if(ticket!==identity||follow.mode!=='account')return;
    follow.following=doc.exists&&doc.data()?.active===true;paintFollow();
   },e=>console.warn('[Ikuti] Sinkron akun belum tersedia',e.code||e.message));
   revealEntryFollowIntent();
  }catch(e){if(ticket!==identity)return;follow.mode='error';follow.error=e.message;paintFollow();console.warn('[Ikuti]',e.message)}
 }
 if(btn)btn.onclick=async()=>{
  if(follow.busy||!['guest','account'].includes(follow.mode))return;
  const guest=follow.mode==='guest',ticket=identity;
  follow.busy=true;paintFollow();
  try{
   if(guest){
    toast('Masuk ke akun terlebih dahulu untuk mengikuti ImamStore.');
    if(typeof window.nexaiRequireCustomerLogin!=='function')throw Error('Login pelanggan belum tersedia.');
    const original=safeStorage.get(GUEST);
    // Record intent, but NEVER render a green "Mengikuti" or increment before login.
    if(!safeStorage.set(GUEST,'1'))throw Error('Penyimpanan browser belum tersedia.');
    pendingGuestFollow=true;
    const loggedIn=await window.nexaiRequireCustomerLogin();
    if(!loggedIn){pendingGuestFollow=false;
     if(original===null)safeStorage.remove(GUEST);else safeStorage.set(GUEST,original);
     toast('Belum mengikuti toko. Kamu bisa masuk kapan saja untuk mengikuti.');
    }
    // onAuthStateChanged binds the UID and completes the server transaction.
   }else{
    const response=await invoke('setFollow',{following:!follow.following});
    if(ticket!==identity)return;
    follow.following=response.following===true;
    toast(follow.following?'Berhasil mengikuti ImamStore.':'Berhasil berhenti mengikuti ImamStore.');
   }
  }catch(e){pendingGuestFollow=false;toast(e.message||'Perubahan belum tersimpan.',true)}
  finally{follow.busy=false;paintFollow()}
 };
 window.addEventListener('storage',e=>{if(follow.mode==='guest'&&e.key===GUEST)paintFollow()});
 function startFollow(){
  const auth=window.firebase?.auth?.();
  if(auth?.onAuthStateChanged)auth.onAuthStateChanged(bind,e=>{follow.mode='error';follow.error=String(e?.message||e);paintFollow()});
  else{follow.mode='error';paintFollow()}
 }
 // Verified reviews: all eligibility and submissions are decided by the authenticated server.
 let orderStream=null,queueStamp='',queueRows=[],reviewUID='',promptShown=false,promptNode=null,promptTimer=null,queueBusy=false;
 const reviewKey=(orderId,productId)=>String(orderId)+'::'+String(productId);
 const alreadyPrompted=(uid,entry)=>safeStorage.get(PROMPT+uid+'_'+entry.productId)==='1';
 function markPrompt(uid,entry){safeStorage.set(PROMPT+uid+'_'+entry.productId,'1')}
 function refreshReviewButtons(){
  const map=new Map(queueRows.map(e=>[reviewKey(e.orderId,e.productId),e]));
  document.querySelectorAll('[data-imam-review-item]').forEach(b=>{
   const e=map.get(b.dataset.imamReviewItem);
   b.disabled=!e||e.reviewed===true||e.reviewable===false;
   b.textContent=!e?'Memeriksa ulasan…':e.reviewed?'Sudah Diulas':e.reviewable===false?'Tersedia di pesanan lain':'Beri Ulasan';
  });
 }
 function closePrompt(){promptNode?.remove();promptNode=null;promptShown=false}
 async function reviewPage(id,orderId){
  if(!valid(id)||typeof orderId!=='string')return;
  const uid=window.firebase?.auth?.()?.currentUser?.uid;
  if(!uid||uid!==reviewUID){toast('Sesi pelanggan belum siap. Silakan masuk kembali.',true);return}
  try{
   // Never navigate/reload before checking the user's server-side review entitlement.
   const r=await invoke('reviewEligibility',{productId:id});
   if(window.firebase?.auth?.()?.currentUser?.uid!==uid)return;
   const allowed=(r.entries||[]).find(e=>e.productId===id&&e.orderId===orderId&&!e.reviewed&&e.reviewable!==false);
   if(!allowed){toast('Produk ini sudah diulas atau belum memenuhi syarat penilaian.');void refreshQueue();return}
   closePrompt();document.getElementById('nexaiOrdersClose')?.click();
   const url=new URL(location.href);url.searchParams.set('reviewOrder',orderId);
   history.replaceState(history.state,'',url.pathname+url.search+url.hash);
   const host=document.getElementById('imamstoreLiveOriginalDetail');
   const ready=()=>String(window.imamstoreActiveProduct?.id||'')===id&&host?.classList.contains('open')&&
     !!host.querySelector('.nine-review-composer > summary')&&!!host.querySelector('[data-detail-rating="'+id+'"]');
   if(!ready())document.dispatchEvent(new CustomEvent('imamstore:open-product',{detail:{id}}));
   const until=Date.now()+6500;
   while(!ready()&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,65));
   if(!ready()){toast('Halaman produk belum siap. Silakan buka detailnya lagi.',true);return}
   // The detail's verified eligibility handler opens the same form, without a reload.
   const summary=host.querySelector('.nine-review-composer > summary');
   if(summary?.parentElement?.dataset.reviewed==='1'){toast('Terima kasih! Produk ini sudah diulas.');return}
   if(!summary?.parentElement?.open)summary.click();
  }catch(e){toast(e.message||'Belum dapat membuka ulasan.',true)}
 }
 function showPrompt(){
  if(promptNode||promptShown||!reviewUID||document.visibilityState==='hidden')return;
  if(document.querySelector('#s5Cart.open,#s5Draft.open,#nexaiCustomerLogin:not([hidden]),#nexaiOrdersDialog:not([hidden]),.ref-modal:not([hidden])'))return;
  const next=queueRows.find(e=>!e.reviewed&&e.reviewable!==false&&!alreadyPrompted(reviewUID,e));if(!next)return;
  promptShown=true;markPrompt(reviewUID,next); // Once per order/product on this browser, never spam refreshes.
  const root=document.createElement('aside');root.className='imam-review-invite';root.dataset.productId=next.productId;root.setAttribute('role','status');
  const title=document.createElement('strong');title.textContent='Pesananmu sudah selesai! 🎉';
  const copy=document.createElement('p');copy.textContent='Terima kasih sudah belanja. Kalau berkenan, yuk bantu ulas '+next.productName+'. Pengalamanmu berarti bagi pembeli lain. 💚';
  const actions=document.createElement('div');actions.className='imam-review-invite-actions';
  const go=document.createElement('button');go.type='button';go.className='imam-review-go';go.textContent='Beri Ulasan';go.addEventListener('click',()=>reviewPage(next.productId,next.orderId));
  const later=document.createElement('button');later.type='button';later.textContent='Nanti Saja';later.addEventListener('click',closePrompt);
  actions.append(go,later);root.append(title,copy,actions);document.body.append(root);promptNode=root;
 }
 async function refreshQueue(){
  if(queueBusy||!reviewUID)return;
  const requestedUID=reviewUID;queueBusy=true;
  try{
   const {entries}=await invoke('reviewQueue');
   if(requestedUID!==reviewUID)return; // Ignore stale response after account switch.
   queueRows=Array.isArray(entries)?entries:[];refreshReviewButtons();
   if(promptNode&&!queueRows.some(e=>!e.reviewed&&e.reviewable!==false&&e.productId===promptNode.dataset.productId))closePrompt();
   if(promptTimer)clearTimeout(promptTimer);
   promptTimer=setTimeout(showPrompt,1300);
  }catch(e){console.warn('[Ulasan] Belum dapat mengecek pesanan selesai',e.message)}
  finally{queueBusy=false}
 }
 function bindReviewOrders(user){
  orderStream?.();orderStream=null;closePrompt();queueRows=[];queueStamp='';reviewUID=user&&!user.isAnonymous?user.uid:'';queueBusy=false;refreshReviewButtons();
  if(!reviewUID)return;
  try{
   orderStream=window.firebase.firestore().collection('orders').where('uid','==',reviewUID).limit(100).onSnapshot(snap=>{
    if(window.firebase?.auth?.()?.currentUser?.uid!==reviewUID)return;
    const signal=snap.docs.map(d=>{
     const x=d.data();return d.id+':'+x.status+':'+(x.updatedAt?.toMillis?.()||0)
    }).sort().join('|');
    if(signal===queueStamp)return;queueStamp=signal;
    void refreshQueue();
   },e=>console.warn('[Ulasan] Perubahan status pesanan belum terbaca',e.code||e.message));
  }catch(e){console.warn('[Ulasan] Listener riwayat tidak tersedia',e.message)}
 }
 function startReview(){const auth=window.firebase?.auth?.();
  if(auth?.onAuthStateChanged)auth.onAuthStateChanged(bindReviewOrders,()=>{orderStream?.();orderStream=null;reviewUID=''})
 }
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')showPrompt()});
 document.addEventListener('click',event=>{
  if(event.target.closest('#nexaiOrdersDialog:not([hidden])'))refreshReviewButtons();
 });
 const api=Object.freeze({invoke,refreshQueue,openFromOrder:reviewPage,
  reviewEligibility:async productId=>(await invoke('reviewEligibility',{productId})).entries,
  reviewQueue:()=>queueRows.slice(),
  onReviewSaved:(orderId,productId)=>{
   queueRows=queueRows.map(e=>e.productId===productId?{...e,reviewed:true,reviewable:false}:e);
   refreshReviewButtons();closePrompt();void refreshQueue();
  }});
 window.imamstoreCustomerTrust=api;
 startFollow();startReview();
})();
