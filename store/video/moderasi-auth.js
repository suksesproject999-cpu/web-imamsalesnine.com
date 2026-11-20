/* ImamStore R39.1 — Sign-in for the EXISTING Firebase moderator identity.
   Uses Firebase Auth SDK; never assigns custom claims in the browser. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const auth=()=>window.firebase?.auth?.();
  const panel=$('modLogin'), actions=$('modActions'), info=$('modLoginInfo'), status=$('modLoginStatus');
  let authEpoch=0;
  const say=(message)=>{status.textContent=message};
  const loading=(value)=>{
    $('modEmailLogin').disabled=value;$('modGoogleLogin').disabled=value;
    $('modSwitchAccount').disabled=value;$('modRetryClaim').disabled=value;
  };
  async function onUser(user){
    const epoch=++authEpoch;
    if(!user || user.isAnonymous){
      panel.hidden=false;actions.hidden=true;
      $('modLoginForm').hidden=false;$('modGoogleLogin').hidden=false;
      $('modSwitchAccount').hidden=true;$('modRetryClaim').hidden=true;
      info.textContent='Masuk memakai akun Firebase Admin. Login Admin V5 pada domain imamsalesnine.com tidak otomatis membuat sesi di store.imamsales.com.';
      say('Belum login Firebase Admin pada domain Store.');
      return;
    }
    try{
      const result=await user.getIdTokenResult(true);
      if(epoch!==authEpoch)return;
      const permitted=result?.claims?.admin===true;
      panel.hidden=permitted;actions.hidden=!permitted;
      $('modLoginForm').hidden=true;$('modGoogleLogin').hidden=true;
      $('modSwitchAccount').hidden=false;$('modRetryClaim').hidden=false;
      if(!permitted){
        info.textContent='Akun '+(user.email||'UID '+user.uid)+' sudah login, tetapi belum punya Firebase custom claim admin:true. Hak ini hanya dapat diberikan dari Firebase Admin SDK server yang aman.';
        say('Akses moderasi belum aktif. Pilih Ganti akun jika ada akun Firebase Admin lain.');
      }
      else say('Admin terverifikasi. Daftar komentar tersedia.');
    }catch(e){if(epoch!==authEpoch)return;panel.hidden=false;actions.hidden=true;say('Gagal memeriksa izin: '+(e?.code||'network-error'))}
  }
  async function loginEmail(event){
    event.preventDefault();const email=$('modEmail').value.trim(), password=$('modPassword').value;
    if(!email||!password){say('Isi email dan password.');return}
    loading(true);say('Memeriksa akun Firebase...');
    try{await auth().signInWithEmailAndPassword(email,password);$('modPassword').value='';}
    catch(e){say(e?.code==='auth/invalid-credential'||e?.code==='auth/wrong-password'?'Email atau password Firebase tidak cocok.':'Gagal login: '+String(e?.code||e?.message||'error'))}
    finally{loading(false)}
  }
  async function loginGoogle(){
    loading(true);say('Membuka login Google...');
    try{await auth().signInWithPopup(new firebase.auth.GoogleAuthProvider())}
    catch(e){say('Login Google gagal ('+String(e?.code||'error')+'). Gunakan email/password Firebase jika popup diblokir.')}
    finally{loading(false)}
  }
  $('modLoginForm').addEventListener('submit',loginEmail);
  $('modGoogleLogin').addEventListener('click',loginGoogle);
  $('modSwitchAccount').addEventListener('click',async()=>{loading(true);try{await auth().signOut();say('Akun Firebase Store sudah keluar.')}catch(e){say('Gagal keluar: '+String(e?.code||e?.message||'error'))}finally{loading(false)}});
  $('modRetryClaim').addEventListener('click',async()=>{const user=auth()?.currentUser;if(user){say('Memeriksa ulang claim...');await onUser(user)}});
  const a=auth();if(a)a.onAuthStateChanged(onUser,()=>say('Sesi Firebase gagal diperiksa.'));
  else say('Firebase Auth SDK tidak berhasil dimuat. Periksa jaringan.');
})();
