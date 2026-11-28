/* ImamStore R9 Voucher Wallet — storefront UI only.
 * A saved voucher is not a redeemed voucher. Counts come exclusively from secure API.
 * Loaded after checkout and login scripts. No localStorage entitlement or grant.
 */
(()=>{'use strict';
 const rail=document.getElementById('storeVouchers'),section=document.getElementById('voucherSection');
 if(!rail||!section||window.imamstoreVoucherWallet)return;
 const API='/.netlify/functions/checkout-security';
 const CODES=Object.freeze({'Voucher Belanja':'BELANJA50','Diskon Produk 10%':'DISKON10','Diskon Ongkir':'ONGKIR5'});
 const LIMIT=5;
 let authUid='',generation=0,busy='',loading=false,balances=null,error='',savedOnly=false,toastTimer=0;
 const getUser=()=>{const u=window.firebase?.auth?.()?.currentUser;return u&&!u.isAnonymous?u:null};
 const text=(value)=>String(value??'');
 const validBalance=(item)=>item&&Number.isSafeInteger(item.limit)&&item.limit===LIMIT&&
   ['used','reserved','remaining'].every(k=>Number.isSafeInteger(item[k])&&item[k]>=0)&&
   item.used+item.reserved+item.remaining===item.limit&&typeof item.claimed==='boolean';
 const copy={
  AUTH_REQUIRED:'Masuk ke akun ImamStore untuk menyimpan voucher.',
  SESSION_INVALID:'Sesi akun sudah berakhir. Silakan masuk kembali.',
  CUSTOMER_REQUIRED:'Gunakan akun pelanggan untuk mengklaim voucher.',
  VOUCHER_EXPIRED:'Masa berlaku voucher sudah berakhir.',
  VOUCHER_UNAVAILABLE:'Voucher ini sudah tidak tersedia.',
  QUOTE_RATE_LIMITED:'Terlalu banyak percobaan. Coba lagi sebentar.',
  WALLET_UNAVAILABLE:'Voucher belum dapat disimpan. Silakan coba lagi.',
  VOUCHER_WALLET_NOT_READY:'Klaim voucher belum tersedia. Silakan coba kembali.',
  STAGING_NOT_ISOLATED:'Pratinjau belum dapat digunakan untuk klaim voucher.'
 };
 const failCopy=code=>copy[code]||'Koneksi sedang terganggu. Periksa internet lalu coba lagi.';
 function node(tag,className,value){const e=document.createElement(tag);if(className)e.className=className;if(value!==undefined)e.textContent=text(value);return e}
 function message(s='',kind='info'){
  const elem=document.getElementById('iwcMessage');if(!elem)return;
  elem.textContent=s;elem.hidden=!s;elem.dataset.kind=kind;
 }
 function toast(s,kind='success'){
  let elem=document.getElementById('iwcToast');if(!elem){elem=node('div');elem.id='iwcToast';elem.setAttribute('aria-live','polite');document.body.append(elem)}
  elem.textContent=s;elem.dataset.kind=kind;elem.classList.add('visible');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>elem.classList.remove('visible'),3200);
 }
 function ensureHeader(){
  const head=section.querySelector('.section-head');if(!head)return;
  if(!document.getElementById('iwcMyVouchers')){
   const btn=node('button','iwc-my-vouchers','Voucher Saya');btn.type='button';btn.id='iwcMyVouchers';
   btn.setAttribute('aria-pressed','false');btn.addEventListener('click',async()=>{
    if(!getUser()){
     if(typeof window.nexaiRequireCustomerLogin==='function'){
      const ok=await window.nexaiRequireCustomerLogin();if(ok)await refresh();
     }else toast('Masuk ke akun ImamStore untuk melihat voucher tersimpan.','error');
     return;
    }
    savedOnly=!savedOnly;btn.setAttribute('aria-pressed',String(savedOnly));btn.textContent=savedOnly?'Semua Voucher':'Voucher Saya';paint();
   });head.append(btn);
  }
  if(!document.getElementById('iwcMessage')){
   const p=node('p','iwc-message');p.id='iwcMessage';p.hidden=true;p.setAttribute('role','status');p.setAttribute('aria-live','polite');head.after(p);
  }
 }
 function enhance(){
  ensureHeader();
  for(const card of rail.children){
   if(!card.matches('article.store-voucher')||card.classList.contains('iwc-card'))continue;
   const name=card.querySelector('b')?.textContent?.trim()||'';const code=CODES[name];
   if(!code)continue; // no action on unknown marketing promotions
   const old=card.querySelector('div');if(!old)continue;
   card.classList.add('iwc-card');card.dataset.walletCode=code;
   const info=node('div','iwc-info');const icon=card.querySelector('.voucher-icon');
   if(icon)info.append(icon);
   old.classList.add('iwc-copy');info.append(old);
   for(const sm of old.querySelectorAll('small')){
    if(/Gunakan saat checkout/i.test(sm.textContent))sm.remove();
   }
   if(code==='DISKON10')old.append(node('small','iwc-offer','Maksimal potongan Rp500'));
   card.prepend(info);
   const usage=node('div','iwc-usage','Memuat status voucher…');usage.setAttribute('aria-live','polite');card.append(usage);
   const action=node('button','iwc-action','Memuat…');action.type='button';action.disabled=true;
   action.dataset.state='loading';action.dataset.code=code;card.append(action);
   card.append(node('div','iwc-note','Klaim gratis · Pemakaian dihitung saat membuat pesanan'));
  }
  paint();
 }
 function setCard(card,label,kind,caption,disabled,state){
  const usage=card.querySelector('.iwc-usage'),action=card.querySelector('.iwc-action');
  if(usage){usage.textContent=label;usage.dataset.kind=kind}
  if(action){action.textContent=caption;action.disabled=disabled;action.dataset.state=state||'ready';action.setAttribute('aria-label',caption+' — '+card.querySelector('b')?.textContent)}
 }
 function paint(){
  let visible=0;
  for(const card of rail.querySelectorAll('.iwc-card')){
   const code=card.dataset.walletCode,b=balances?.[code],u=getUser();
   const claimed=!!b?.claimed;
   const isVisible=!savedOnly||claimed;card.hidden=!isVisible;
   if(!isVisible)continue;visible++;
   if(!u){setCard(card,'Masuk untuk menyimpan dan melihat jatah.','info','Klaim Voucher',false,'ready');continue}
   if(busy===code){setCard(card,'Menyimpan voucher ke akun…','info','Menyimpan…',true,'loading');continue}
   if(loading){setCard(card,'Memeriksa voucher akun…','info','Memeriksa…',true,'loading');continue}
   if(!validBalance(b)){
    setCard(card,'Jatah belum dapat ditampilkan. Coba lagi.','error','Perbarui Status',false,'retry');continue;
   }
   const left=b.remaining,used=b.used,held=b.reserved;
   if(b.status==='expired'){
    setCard(card,'Masa berlaku voucher berakhir.','used','Sudah Berakhir',true,'used');continue;
   }
   const status=left===0?(held>0?'Semua jatah sedang dipakai pada pesanan aktif.':'Sudah digunakan 5 dari 5 kali.'):
    (held>0?`Tersedia ${left} dari 5 · ${held} sedang digunakan pada pesanan`:`Tersedia ${left} dari 5 penggunaan`);
   if(left===0){setCard(card,status,'used',claimed?'Jatah Habis':'Tidak Tersedia',true,'used');continue}
   if(claimed){setCard(card,status,'info','✓ Tersimpan',true,'saved');continue}
   setCard(card,status,'info','Klaim Voucher',false,'ready');
  }
  let empty=document.getElementById('iwcEmpty');
  if(savedOnly&&visible===0&&rail.querySelector('.iwc-card')){
   if(!empty){empty=node('p','iwc-empty','Belum ada voucher tersimpan di akun ini. Pilih Semua Voucher untuk melihat promo.');empty.id='iwcEmpty';rail.after(empty)}
   empty.hidden=false;
  }else if(empty)empty.hidden=true;
 }
 async function request(action,code,user){
  const withTimeout=(promise,ms=12000)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('TIMEOUT')),ms))]);
  const token=await withTimeout(user.getIdToken());
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(code?{action,code}:{action}),cache:'no-store',credentials:'same-origin',signal:controller.signal});
   const result=await withTimeout(response.json());
   if(!response.ok||result.success!==true){const e=new Error('API');e.code=result.code||'UNKNOWN';throw e}
   return result;
  }finally{clearTimeout(timeout)}
 }
 async function refresh(){
  const user=getUser(),uid=user?.uid||'',g=++generation;
  authUid=uid;balances=null;error='';loading=!!user;paint();
  if(!user){loading=false;paint();return}
  try{
   const result=await request('voucher_status',null,user);
   if(g!==generation||getUser()?.uid!==uid)return;
   if(!result.vouchers||!Object.keys(CODES).every(name=>validBalance(result.vouchers[CODES[name]])))throw new Error('STATUS_INVALID');
   balances=result.vouchers;
   message('');
  }catch(e){if(g!==generation)return;error=e.code||'UNAVAILABLE';message('Status voucher belum dapat diperbarui. Periksa koneksi lalu coba lagi.','error')}
  finally{if(g===generation){loading=false;paint()}}
 }
 async function claim(code){
  if(busy)return;
  let user=getUser();
  if(!user){
   if(typeof window.nexaiRequireCustomerLogin!=='function'){toast('Masuk ke akun ImamStore untuk mengklaim voucher.','error');return}
   const ok=await window.nexaiRequireCustomerLogin();if(!ok)return;
   user=getUser();if(!user)return;
   await refresh();
  }
  if(busy||loading)return;
  const b=balances?.[code];
  if(!validBalance(b)){await refresh();return}
  if(b.claimed||b.remaining===0||b.status==='expired')return;
  const uid=user.uid,g=generation;busy=code;paint();
  try{
   const result=await request('voucher_claim',code,user);
   if(g!==generation||getUser()?.uid!==uid)return;
   if(result.code!==code||result.claimed!==true)throw new Error('CLAIM_UNCONFIRMED');
   balances[code]={...b,claimed:true};
   message('Voucher berhasil disimpan. Gunakan ketika checkout sesuai ketentuan.','success');
   toast(result.alreadyClaimed?'Voucher sudah tersimpan di akun.':'Voucher berhasil diklaim!');
   window.dispatchEvent(new CustomEvent('imamstore:voucher-wallet-update',{detail:{code}}));
  }catch(e){if(g!==generation)return;const msg=failCopy(e.code);message(msg,'error');toast(msg,'error')}
  finally{busy='';if(g===generation)paint()}
 }
 rail.addEventListener('click',e=>{const btn=e.target.closest('.iwc-action');if(!btn)return;
  if(btn.dataset.state==='retry'){void refresh();return}
  if(btn.disabled)return;
  const code=btn.dataset.code;if(code&&Object.values(CODES).includes(code))void claim(code);
 });
 // The original store code replaces the rail when promotions reload; enhance only new children.
 new MutationObserver(()=>enhance()).observe(rail,{childList:true});
 try{const auth=window.firebase?.auth?.();if(auth?.onAuthStateChanged)auth.onAuthStateChanged(()=>{
  savedOnly=false;const toggle=document.getElementById('iwcMyVouchers');if(toggle){toggle.setAttribute('aria-pressed','false');toggle.textContent='Voucher Saya'}
  void refresh();
 });else{enhance();paint()}}
 catch(e){enhance();paint()}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&getUser())void refresh()});
 window.addEventListener('imamstore:voucher-wallet-update',()=>{if(getUser()&&!busy)void refresh()});
 window.imamstoreVoucherWallet=Object.freeze({refresh});
 enhance();
})();
