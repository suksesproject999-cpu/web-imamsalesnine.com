
(function(){
 'use strict';
 const root=document.getElementById('nexaiCustomerLogin'),form=document.getElementById('nclForm'),msg=document.getElementById('nclMessage');
 const $=id=>document.getElementById(id);
 const email=$('nclEmail'),password=$('nclPassword'),confirm=$('nclConfirmPassword');
 const auth=()=>window.firebase?.auth?.();
 let mode='login',busy=false,previousFocus=null,previousOverflow='',resolvers=[];
 function eligible(){const u=auth()?.currentUser;return !!(u&&!u.isAnonymous)}
 function notify(message='',success=false){msg.textContent=message;msg.dataset.status=success?'success':'error'}
 function errorMessage(e){const map={
  'auth/popup-blocked':'Popup Google diblokir browser. Izinkan popup lalu coba lagi.',
  'auth/popup-closed-by-user':'Login Google dibatalkan.',
  'auth/operation-not-allowed':'Metode masuk belum tersedia. Hubungi tim ImamStore.',
  'auth/unauthorized-domain':'Domain toko belum diizinkan untuk login Firebase.',
  'auth/invalid-credential':'Email atau kata sandi tidak sesuai.',
  'auth/invalid-login-credentials':'Email atau kata sandi tidak sesuai.',
  'auth/wrong-password':'Email atau kata sandi tidak sesuai.',
  'auth/user-not-found':'Akun tidak ditemukan. Periksa email atau daftar akun.',
  'auth/email-already-in-use':'Email sudah terdaftar. Silakan masuk.',
  'auth/weak-password':'Kata sandi terlalu lemah. Gunakan minimal enam karakter.',
  'auth/invalid-email':'Format alamat email belum benar.',
  'auth/too-many-requests':'Terlalu banyak percobaan. Silakan coba lagi nanti.',
  'auth/network-request-failed':'Koneksi terputus. Periksa internet lalu coba lagi.',
  'auth/account-exists-with-different-credential':'Akun ini sudah menggunakan metode login lain.'
 };return map[e?.code]||'Proses belum berhasil. Periksa data dan koneksi, lalu coba lagi.'}
 function setMode(next){
  if(busy)return;
  mode=next;
  const reset=next==='reset',register=next==='register';
  $('nclTitle').textContent=reset?'Pulihkan Kata Sandi':register?'Buat Akun ImamStore':'Selamat Datang Kembali';
  $('nclDescription').textContent=reset?'Masukkan email terdaftar untuk menerima tautan pemulihan.':register?'Daftar untuk menyimpan riwayat pesanan dan mengelola akun.':'Masuk untuk melanjutkan pesanan dan mengelola akun ImamStore.';
  $('nclPasswordGroup').classList.toggle('ncl-hidden',reset);
  $('nclConfirmGroup').classList.toggle('ncl-hidden',!register);
  $('nclGoogle').classList.toggle('ncl-hidden',reset);
  $('nclOr').classList.toggle('ncl-hidden',reset);
  $('nclForgot').classList.toggle('ncl-hidden',register);
  password.required=!reset;
  password.autocomplete=register?'new-password':'current-password';
  confirm.required=register;
  $('nclEmailLogin').textContent=reset?'Kirim Tautan Pemulihan':register?'Daftar Akun':'Masuk';
  $('nclFootText').textContent=reset?'Sudah ingat kata sandi?':register?'Sudah punya akun?':'Belum punya akun?';
  $('nclRegister').textContent=reset||register?'Masuk di sini':'Daftar sekarang';
  if(!register)confirm.value='';
  if(reset)password.value='';
  notify();
 }
 function lock(v){busy=v;root.querySelectorAll('button,input').forEach(el=>el.disabled=v)}
 function finish(ok){
  if(root.hidden)return;
  root.hidden=true;document.body.style.overflow=previousOverflow;
  password.value='';confirm.value='';setMode('login');
  const all=resolvers.splice(0);all.forEach(resolve=>resolve(!!ok));
  try{previousFocus?.focus?.({preventScroll:true})}catch{}
  previousFocus=null;
  if(ok)window.dispatchEvent(new Event('imamstore:customer-auth'));
 }
 async function run(action,progress){
  if(busy)return false;
  lock(true);notify(progress);
  try{
   await action();
   if(!eligible())throw new Error('customer-session-required');
   lock(false);finish(true);return true;
  }catch(e){console.warn('[ImamStore Auth]',String(e?.code||e?.message||'unknown'));notify(errorMessage(e));return false}
  finally{lock(false)}
 }
 window.nexaiRequireCustomerLogin=async function(){
  const a=auth();if(!a){console.warn('[ImamStore Auth] Firebase belum siap');return false}
  try{await a.authStateReady?.()}catch{}
  if(eligible())return true;
  return new Promise(resolve=>{
   resolvers.push(resolve);
   if(!root.hidden)return;
   previousFocus=document.activeElement;previousOverflow=document.body.style.overflow;
   setMode('login');root.hidden=false;document.body.style.overflow='hidden';
   requestAnimationFrame(()=>email.focus({preventScroll:true}));
  });
 };
 window.imamstoreOpenCustomerLogin=window.nexaiRequireCustomerLogin;
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!form.reportValidity())return;
  const e=email.value.trim(),p=password.value;
  if(mode==='reset'){
   lock(true);notify('Mengirim tautan pemulihan…');
   try{await auth().sendPasswordResetEmail(e);notify('Jika alamat email terdaftar, tautan pemulihan akan dikirim. Silakan periksa kotak masuk atau spam.',true)}
   catch(err){console.warn('[ImamStore Auth Reset]',String(err?.code||'unknown'));notify(errorMessage(err))}
   finally{lock(false)}return;
  }
  if(mode==='register'){
   if(p!==confirm.value){notify('Konfirmasi kata sandi belum sama.');confirm.focus();return}
   await run(()=>auth().createUserWithEmailAndPassword(e,p),'Mendaftarkan akun…');return;
  }
  await run(()=>auth().signInWithEmailAndPassword(e,p),'Memverifikasi akun…');
 });
 $('nclGoogle').addEventListener('click',()=>run(()=>auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()),'Menghubungkan akun Google…'));
 $('nclRegister').addEventListener('click',()=>{setMode(mode==='login'?'register':'login');email.focus()});
 $('nclForgot').addEventListener('click',()=>{setMode('reset');email.focus()});
 for(const [btn,id] of [['nclShowPassword','nclPassword'],['nclShowConfirm','nclConfirmPassword']]){
  $(btn).addEventListener('click',()=>{const field=$(id),visible=field.type==='password';field.type=visible?'text':'password';$(btn).setAttribute('aria-label',visible?'Sembunyikan kata sandi':'Tampilkan kata sandi');$(btn).querySelector('i').className='fa-regular '+(visible?'fa-eye-slash':'fa-eye')});
 }
 $('nclClose').addEventListener('click',()=>{if(!busy)finish(false)});
 root.addEventListener('click',e=>{if(e.target===root&&!busy)finish(false)});
 document.addEventListener('keydown',e=>{
  if(root.hidden)return;
  if(e.key==='Escape'&&!busy){e.preventDefault();e.stopPropagation();finish(false);return}
  if(e.key==='Tab'){
   const focusables=[...root.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(el=>el.getClientRects().length && !el.closest('.ncl-hidden'));
   const first=focusables[0],last=focusables.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  }
 },true);
})();
