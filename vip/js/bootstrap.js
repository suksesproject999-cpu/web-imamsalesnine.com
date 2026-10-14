/* Staging: deny app execution until server JWT and Firebase custom token are verified. */
(async function () {
  'use strict';
  const gate = document.getElementById('vip-gate');
  function fail(message) { gate.textContent = 'Akses VIP ditolak: ' + message + '. Silakan login ulang.'; }
  try {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Token login tidak ada');
    if (!window.firebase || !firebase.auth) throw new Error('Firebase Auth SDK tidak tersedia');
    const res = await fetch('/.netlify/functions/firebase-token', {method:'POST',headers:{Authorization:'Bearer '+token},cache:'no-store'});
    const body = await res.json();
    if (!res.ok || !body.success || !body.customToken || !body.vipId || !body.nama) throw new Error(body.message || 'Verifikasi server gagal');
    // Named Firebase app isolates VIP Auth from marketplace customer Auth.
    const vipConfig = {
      apiKey:'AIzaSyBkyMCw47sYQb2BBkGMxgfsXppozWw4Cec',authDomain:'apin-web.firebaseapp.com',projectId:'apin-web',
      storageBucket:'apin-web.firebasestorage.app',messagingSenderId:'733140414417',
      appId:'1:733140414417:web:b6967fd053ac462b2ffaf0',measurementId:'G-6ZN6TQ1YVE'
    };
    const vipApp = firebase.apps.find(a => a.name === 'vip-isolated') || firebase.initializeApp(vipConfig, 'vip-isolated');
    window.__VIP_FIREBASE_APP = vipApp;
    const vipAuth = vipApp.auth();
    await vipAuth.setPersistence(firebase.auth.Auth.Persistence.NONE);
    const signed = await vipAuth.signInWithCustomToken(body.customToken);
    const verified = await signed.user.getIdTokenResult(true);
    if (verified.claims.role !== 'vip' || verified.claims.vipId !== body.vipId || signed.user.uid !== 'vip_'+body.vipId)
      throw new Error('Firebase claims tidak cocok');
    window.__VIP_CONTEXT = Object.freeze({vipId:body.vipId,nama:body.nama,uid:signed.user.uid});
    window.VIPStorage = Object.freeze({key: key => 'vip:'+body.vipId+':'+key});
    // All application JS is loaded only after Firebase Auth succeeds.
    const page = /\/history\.html(?:\?|$)/.test(location.pathname+location.search) ? 'history' : 'index';
    const mr = await fetch('/vip/js/'+page+'-manifest.json',{cache:'no-store'});
    if (!mr.ok) throw new Error('Manifest tidak tersedia');
    const manifest = await mr.json();
    for (const src of manifest.scripts) {
      await new Promise((resolve,reject)=>{
        const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('Gagal memuat '+src));
        document.body.appendChild(s);
      });
    }
    gate.remove();
    // Original pages registered load handlers before load. Deferred scripts need this event.
    window.dispatchEvent(new Event('load'));
  } catch(err) {
    console.error('[VIP gate]',err);
    try { if (window.__VIP_FIREBASE_APP) await window.__VIP_FIREBASE_APP.auth().signOut(); } catch (_) {}
    fail(err.message || 'Sesi tidak valid');
  }
})();
