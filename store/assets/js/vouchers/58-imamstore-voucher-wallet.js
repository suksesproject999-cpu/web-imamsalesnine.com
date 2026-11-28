/* ImamStore R10 — Store voucher saving UI (clean replacement of R9).
 * Save/unsave is optional. Checkout redemption and 5-use quota are separate.
 * No duplicate DOM handlers, no localStorage claims, no raw backend errors.
 */
(()=>{'use strict';
 const section=document.getElementById('voucherSection');
 const rail=document.getElementById('storeVouchers');
 if(!section||!rail||window.imamstoreVoucherWallet)return;
 const API='/.netlify/functions/checkout-security';
 const CODES=Object.freeze({'Voucher Belanja':'BELANJA50','Diskon Produk 10%':'DISKON10','Diskon Ongkir':'ONGKIR5'});
 const LIMIT=5;
 let balance=null,version=0,pending='',loading=false,savedOnly=false,timer=0;
 const user=()=>{const u=window.firebase?.auth?.()?.currentUser;return u&&!u.isAnonymous?u:null};
 const create=(tag,cls,value)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=String(value);return el};
 const isValid=v=>v&&v.limit===LIMIT&&['used','reserved','remaining'].every(k=>Number.isSafeInteger(v[k])&&v[k]>=0)
  &&v.used+v.reserved+v.remaining===LIMIT&&typeof v.saved==='boolean';
 const errors={AUTH_REQUIRED:'Masuk ke akun ImamStore untuk menyimpan voucher.',SESSION_INVALID:'Sesi akun berakhir. Silakan masuk lagi.',
  CUSTOMER_REQUIRED:'Gunakan akun pelanggan untuk menyimpan voucher.',VOUCHER_EXPIRED:'Masa berlaku voucher telah berakhir.',
  VOUCHER_UNAVAILABLE:'Voucher ini sudah tidak tersedia.',QUOTE_RATE_LIMITED:'Terlalu banyak percobaan. Coba sebentar lagi.',
  VOUCHER_WALLET_NOT_READY:'Fitur simpan voucher belum tersedia. Silakan coba lagi.',WALLET_UNAVAILABLE:'Daftar voucher tersimpan belum bisa diperbarui.',
  STAGING_NOT_ISOLATED:'Penyimpanan voucher belum tersedia di pratinjau.',
  TIMEOUT:'Koneksi terlalu lama. Silakan coba lagi.'};
 const readable=e=>errors[e?.code]||'Koneksi sedang terganggu. Periksa internet dan coba lagi.';
 function notice(message='',kind='info'){
  const p=document.getElementById('iwcMessage');if(!p)return;
  p.textContent=message;p.hidden=!message;p.dataset.kind=kind;
 }
 function toast(message,kind='success'){
  let el=document.getElementById('iwcToast');
  if(!el){el=create('div');el.id='iwcToast';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.append(el)}
  el.textContent=message;el.dataset.kind=kind;el.classList.add('visible');
  clearTimeout(timer);timer=setTimeout(()=>el.classList.remove('visible'),2900);
 }
 function header(){
  const head=section.querySelector('.section-head');if(!head)return;
  if(!document.getElementById('iwcMyVouchers')){
   const btn=create('button','iwc-my-vouchers','Voucher Saya');btn.type='button';btn.id='iwcMyVouchers';
   btn.setAttribute('aria-pressed','false');head.append(btn);
   btn.addEventListener('click',async()=>{
    if(!user()){
     if(typeof window.nexaiRequireCustomerLogin==='function'){
      const ok=await window.nexaiRequireCustomerLogin();
      if(ok){savedOnly=true;btn.setAttribute('aria-pressed','true');btn.textContent='Semua Voucher';await refresh();}
     }else toast('Masuk untuk melihat voucher tersimpan.','error');
     return;
    }
    savedOnly=!savedOnly;btn.setAttribute('aria-pressed',String(savedOnly));
    btn.textContent=savedOnly?'Semua Voucher':'Voucher Saya';render();
   });
  }
  if(!document.getElementById('iwcMessage')){
   const p=create('p','iwc-message');p.id='iwcMessage';p.hidden=true;p.setAttribute('role','status');p.setAttribute('aria-live','polite');head.after(p);
  }
 }
 function setupCards(){
  header();
  for(const card of [...rail.children]){
   if(!card.matches('article.store-voucher')||card.classList.contains('iwc-card'))continue;
   const title=card.querySelector('b')?.textContent?.trim()||'';
   const code=CODES[title];if(!code)continue;
   const copy=card.querySelector('div');if(!copy)continue;
   card.classList.add('iwc-card');card.dataset.walletCode=code;
   const info=create('div','iwc-info');const icon=card.querySelector('.voucher-icon');if(icon)info.append(icon);
   copy.classList.add('iwc-copy');info.append(copy);
   for(const small of copy.querySelectorAll('small'))if(/Gunakan saat checkout/i.test(small.textContent))small.remove();
   if(code==='DISKON10'&&!copy.querySelector('.iwc-offer'))copy.append(create('small','iwc-offer','Maks. potongan Rp500'));
   card.prepend(info);
   const state=create('div','iwc-usage','Memuat status…');state.setAttribute('aria-live','polite');card.append(state);
   const action=create('button','iwc-action','Memuat…');action.type='button';action.dataset.code=code;action.disabled=true;card.append(action);
  }
  render();
 }
 function updateCard(card,status,action,mode,disabled=false,kind='info'){
  const state=card.querySelector('.iwc-usage'),button=card.querySelector('.iwc-action');
  if(state){state.textContent=status;state.dataset.kind=kind}
  if(button){button.textContent=action;button.dataset.state=mode;button.disabled=disabled;
   const name=card.querySelector('b')?.textContent||'voucher';
   button.setAttribute('aria-label',mode==='unsave'?`Hapus ${name} dari Voucher Saya`:mode==='save'?`Simpan ${name} untuk nanti`:action+' '+name);
   button.setAttribute('aria-pressed',String(mode==='unsave'));
  }
 }
 function render(){
  let visible=0;
  for(const card of rail.querySelectorAll('.iwc-card')){
   const b=balance?.[card.dataset.walletCode],logged=user();
   const isSaved=b?.saved===true;
   card.hidden=savedOnly&&!isSaved;if(card.hidden)continue;visible++;
   if(!logged){updateCard(card,'Simpan untuk nanti · gunakan langsung di checkout.','Simpan','save');continue}
   if(pending===card.dataset.walletCode){updateCard(card,'Memperbarui daftar voucher…','Menyimpan…','loading',true);continue}
   if(loading){updateCard(card,'Memeriksa status voucher…','Memuat…','loading',true);continue}
   if(!isValid(b)){updateCard(card,'Jatah belum dapat diperiksa.','Coba Lagi','retry',false,'error');continue}
   const held=b.reserved,remaining=b.remaining;
   let status=b.status==='expired'?'Masa berlaku berakhir':remaining===0?
    (held>0?`Jatah masih dipakai pada ${held} pesanan`:'Jatah 5 kali telah habis'):
    `Sisa ${remaining}/5${held>0?` · ${held} dalam pesanan aktif`:''}`;
   if(isSaved)status='Tersimpan · '+status;
   if(isSaved){updateCard(card,status,'Hapus','unsave');continue}
   if(b.status==='expired'||remaining===0){updateCard(card,status,'Tidak tersedia','disabled',true,'used');continue}
   updateCard(card,status,'Simpan','save');
  }
  let empty=document.getElementById('iwcEmpty');
  if(savedOnly&&visible===0){
   if(!empty){empty=create('p','iwc-empty','Belum ada voucher yang disimpan. Pilih Semua Voucher untuk melihat promo.');empty.id='iwcEmpty';rail.after(empty)}
   empty.hidden=false;
  }else if(empty)empty.hidden=true;
 }
 async function api(action,code,account){
  const timeout=12000;
  let tokenTimer;
  const token=await Promise.race([account.getIdToken(),new Promise((_,reject)=>{tokenTimer=setTimeout(()=>{const e=new Error('TIMEOUT');e.code='TIMEOUT';reject(e)},timeout)})]).finally(()=>clearTimeout(tokenTimer));
  const controller=new AbortController();const id=setTimeout(()=>controller.abort(),timeout);
  try{
   const response=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify(code?{action,code}:{action}),credentials:'same-origin',cache:'no-store',signal:controller.signal});
   const data=await response.json();
   if(!response.ok||data.success!==true){const err=new Error('API_ERROR');err.code=data.code||'UNKNOWN';throw err}
   return data;
  }finally{clearTimeout(id)}
 }
 async function refresh(){
  const account=user(),current=account?.uid||'',myVersion=++version;
  balance=null;loading=!!account;notice('');render();
  if(!account){loading=false;render();return}
  try{
   const res=await api('voucher_status',null,account);
   if(myVersion!==version||user()?.uid!==current)return;
   if(!res.vouchers||!Object.values(CODES).every(code=>isValid(res.vouchers[code])))throw new Error('INVALID_STATUS');
   balance=res.vouchers;
  }catch(e){if(myVersion===version)notice('Status voucher belum dapat dimuat. Coba lagi sebentar.','error')}
  finally{if(myVersion===version){loading=false;render()}}
 }
 async function changeSaved(code,wantSaved){
  if(pending||loading)return;
  let account=user();
  if(!account){
   if(typeof window.nexaiRequireCustomerLogin!=='function'){toast('Masuk untuk menyimpan voucher.','error');return}
   const ok=await window.nexaiRequireCustomerLogin();if(!ok)return;
   await refresh();account=user();if(!account)return;
  }
  let old=balance?.[code];if(!isValid(old)){await refresh();return}
  if(old.saved===wantSaved)return;
  if(wantSaved&&(old.remaining===0||old.status==='expired'))return;
  const current=account.uid,myVersion=version;
  pending=code;render();
  try{
   const result=await api(wantSaved?'voucher_save':'voucher_unsave',code,account);
   if(myVersion!==version||user()?.uid!==current)return;
   if(result.code!==code||result.saved!==wantSaved)throw new Error('RESULT_INVALID');
   balance[code]={...old,saved:wantSaved};
   const msg=wantSaved?'Voucher disimpan untuk nanti.':'Voucher dihapus dari Voucher Saya. Tetap bisa digunakan saat checkout.';
   notice(msg,'success');toast(wantSaved?'Voucher berhasil disimpan.':'Voucher dihapus dari simpanan.');
   window.dispatchEvent(new CustomEvent('imamstore:voucher-wallet-update',{detail:{code}}));
  }catch(e){if(myVersion===version){const msg=readable(e);notice(msg,'error');toast(msg,'error')}}
  finally{pending='';if(myVersion===version)render()}
 }
 rail.addEventListener('click',event=>{
  const button=event.target.closest('.iwc-action');if(!button||button.disabled)return;
  const mode=button.dataset.state,code=button.dataset.code;
  if(!Object.values(CODES).includes(code))return;
  if(mode==='retry')void refresh();
  if(mode==='save'||mode==='unsave')void changeSaved(code,mode==='save');
 });
 // Only direct card replacements, not mutations to card internals.
 new MutationObserver(()=>setupCards()).observe(rail,{childList:true});
 try{
  const auth=window.firebase?.auth?.();
  if(auth?.onAuthStateChanged)auth.onAuthStateChanged(()=>{
   savedOnly=false;const btn=document.getElementById('iwcMyVouchers');
   if(btn){btn.setAttribute('aria-pressed','false');btn.textContent='Voucher Saya'}
   void refresh();
  });
 }catch(_){/* Login and refresh buttons remain accessible. */}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user())void refresh()});
 window.addEventListener('imamstore:voucher-wallet-update',()=>{if(user()&&!pending)void refresh()});
 window.imamstoreVoucherWallet=Object.freeze({refresh});
 setupCards();void refresh();
})();
