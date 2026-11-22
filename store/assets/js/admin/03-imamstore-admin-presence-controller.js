
/* Single Firebase Firestore listener for Store header + product detail.
   No Netlify proxy, no legacy polling, no second Firebase app. */
(()=>{
  'use strict';
  const status=document.getElementById('storeStatus');
  if(!status)return;
  const COLLECTION='store_public',DOCUMENT='imamstore_status',ONLINE_MS=90000;
  let lastTimestamp=0,serverSynced=false,lastError='';
  let lastCheckedAt=0;
  function timestampMs(value){
    if(value?.toMillis)return value.toMillis();
    if(typeof value?.seconds==='number')return value.seconds*1000;
    if(typeof value==='number')return value<1e11?value*1000:value;
    if(typeof value==='string')return Date.parse(value)||0;
    return 0;
  }
  function paint(){
    const now=Date.now(),valid=Number.isFinite(lastTimestamp)&&lastTimestamp>0&&lastTimestamp<=now+120000;
    const age=valid?Math.max(0,now-lastTimestamp):Infinity;
    const online=valid&&age<ONLINE_MS&&serverSynced&&navigator.onLine!==false;
    let message;
    if(online) message='● Online';
    else if(valid&&age>=ONLINE_MS){
      const minutes=Math.max(1,Math.floor(age/60000));
      message=minutes<60?`Aktif ${minutes} menit lalu`:
        minutes<1440?`Aktif ${Math.floor(minutes/60)} jam lalu`:
        `Aktif ${Math.floor(minutes/1440)} hari lalu`;
    } else if(!serverSynced){message='Status aktivitas belum tersedia';}
    else {message='Belum ada aktivitas admin';}
    const state=online?'online':(valid&&age>=ONLINE_MS?'offline':'unknown');
    const title=lastError?'Status admin tidak dapat diperbarui: '+lastError:
      serverSynced?'Status aktivitas tersinkron dari Firebase Firestore':'Menunggu status Firebase Firestore';
    for(const el of [status,...document.querySelectorAll('[data-nine-store-presence],[data-imamstore-store-status]')]){
      if(el.textContent!==message)el.textContent=message;
      if(el.getAttribute('data-admin-presence')!==state)el.setAttribute('data-admin-presence',state);
      if(el.title!==title)el.title=title;
    }
  }
  window.imamstorePresenceSync=paint; // existing detail renderer relies on this API
  window.imamstorePresenceDiagnostic=()=>Object.freeze({
    source:'firestore',path:COLLECTION+'/'+DOCUMENT,
    lastActiveAt:lastTimestamp?new Date(lastTimestamp).toISOString():null,
    lastCheckedAt:lastCheckedAt?new Date(lastCheckedAt).toISOString():null,
    serverSynced,error:lastError||null,status:status.textContent
  });
  paint();
  setInterval(paint,5000); // local elapsed-time paint only; NOT a server poll
  window.addEventListener('online',paint);
  window.addEventListener('offline',()=>{serverSynced=false;paint()});
  window.addEventListener('pageshow',paint);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)paint()});
  try{
    if(!window.firebase?.apps?.length||typeof firebase.firestore!=='function')
      throw new Error('Firebase Web SDK belum siap');
    const ref=firebase.firestore().collection(COLLECTION).doc(DOCUMENT);
    ref.onSnapshot({includeMetadataChanges:true},snapshot=>{
      const candidate=snapshot.exists?timestampMs(snapshot.data()?.lastActiveAt):0;
      if(Number.isFinite(candidate)&&candidate>0&&candidate<Date.now()+120000)
        lastTimestamp=Math.floor(candidate);
      else lastTimestamp=0;
      serverSynced=!snapshot.metadata.fromCache&&navigator.onLine!==false;
      lastCheckedAt=Date.now();
      lastError='';paint();
    },error=>{
      serverSynced=false;
      lastError=String(error?.code||error?.message||'listener-error').slice(0,120);
      console.warn('[ImamStore Firebase Presence] Listener error:',lastError);
      paint();
    });
  }catch(error){
    serverSynced=false;
    lastError=String(error?.message||error).slice(0,120);
    console.warn('[ImamStore Firebase Presence] Tidak dapat memulai:',lastError);
    paint();
  }
})();
