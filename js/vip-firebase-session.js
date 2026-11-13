"use strict";
/* VIP R21: gerbang login Firebase dari sesi Netlify yang diverifikasi server.
   Berkas ini TIDAK berisi password atau secret Firebase Admin SDK. */
(function () {
  const OVERLAY_ID = 'vip-firebase-auth-guard';
  function overlay(message, failed) {
    let box = document.getElementById(OVERLAY_ID);
    if (!box) {
      box = document.createElement('div');
      box.id = OVERLAY_ID;
      box.setAttribute('role', 'status');
      box.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(8,20,44,.96);color:white;display:flex;align-items:center;justify-content:center;padding:24px;font:14px/1.6 Arial,sans-serif;text-align:center';
      const content = document.createElement('div');
      content.style.cssText = 'max-width:430px;border:1px solid rgba(255,255,255,.18);border-radius:15px;padding:25px;background:#162747;width:100%;box-shadow:0 16px 48px rgba(0,0,0,.4)';
      const heading = document.createElement('strong');
      heading.textContent = 'Verifikasi Sesi VIP';
      heading.style.cssText = 'display:block;font-size:18px;margin-bottom:12px';
      const msg = document.createElement('p');
      msg.id = 'vip-auth-guard-message';
      msg.style.cssText = 'margin:0 0 14px';
      const action = document.createElement('a');
      action.id = 'vip-auth-guard-action';
      action.href = '/login';
      action.textContent = 'Masuk kembali';
      action.style.cssText = 'display:none;margin-top:12px;padding:11px 18px;border-radius:9px;background:#8CC63F;color:#10210a;text-decoration:none;font-weight:700';
      content.append(heading, msg, action); box.append(content); document.body.append(box);
    }
    box.querySelector('#vip-auth-guard-message').textContent = message;
    box.querySelector('#vip-auth-guard-action').style.display = failed ? 'inline-block' : 'none';
    box.style.display = 'flex';
    return box;
  }
  function errorLabel(code) {
    const descriptions = {
      MISSING_SESSION: 'Sesi Netlify tidak ditemukan.',
      INVALID_SESSION: 'Sesi Netlify tidak valid atau kedaluwarsa.',
      NETLIFY_SESSION_EXPIRED: 'Waktu login VIP sudah habis.',
      VIP_IDENTITY_MISMATCH: 'Identitas VIP tidak cocok dengan data server.',
      VIP_ONLY: 'Akun ini bukan akun VIP.',
      VIP_ACCOUNTS_NOT_READY: 'Daftar akun VIP di server belum siap.',
      FIREBASE_SERVER_UNAVAILABLE: 'Layanan Firebase di server belum siap.',
    };
    return descriptions[code] || 'Verifikasi Firebase belum berhasil (' + String(code || 'unknown') + ').';
  }
  function start(app, expected) {
    const folder = expected && expected.folder;
    const vipName = expected && expected.name;
    if (!folder || !vipName) return Promise.reject(new Error('VIP_IDENTITY_NOT_SET'));
    overlay('Memverifikasi login Netlify dan menyiapkan Firebase…', false);
    return (async function () {
      const jwt = localStorage.getItem('token');
      if (!jwt) throw new Error('MISSING_SESSION');
      const response = await fetch('/.netlify/functions/firebase-session', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Authorization': 'Bearer ' + jwt, 'Content-Type': 'application/json' },
        body: '{}'
      });
      let payload;
      try { payload = await response.json(); }
      catch (_) { throw new Error('INVALID_SERVER_RESPONSE'); }
      if (!response.ok || !payload.success || typeof payload.token !== 'string') {
        throw new Error(payload.code || 'INVALID_SERVER_RESPONSE');
      }
      if (payload.folder !== folder || payload.vipName !== vipName ||
          window.location.pathname.split('/')[2] !== folder) {
        throw new Error('VIP_IDENTITY_MISMATCH');
      }
      if (typeof firebase.auth !== 'function') throw new Error('FIREBASE_AUTH_SDK_MISSING');
      const auth = app.auth();
      // Named app khusus VIP agar tidak mengambil alih login Google ImamStore.
      await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
      const result = await auth.signInWithCustomToken(payload.token);
      const verified = await result.user.getIdTokenResult(true);
      const claims = verified.claims || {};
      if (result.user.uid !== 'netlify-vip:' + folder ||
          claims.legacyVip !== true || claims.vipFolder !== folder ||
          claims.vipName !== vipName || claims.loginSource !== 'netlify' ||
          Number(claims.legacySessionEndsAt) !== Number(payload.sessionEndsAt)) {
        await auth.signOut();
        throw new Error('VIP_IDENTITY_MISMATCH');
      }
      const expiresAt = Number(payload.sessionEndsAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 3000) {
        await auth.signOut();
        throw new Error('NETLIFY_SESSION_EXPIRED');
      }
      const guard = document.getElementById(OVERLAY_ID);
      if (guard) guard.remove();
      const timer = setInterval(() => {
        if (Date.now() >= expiresAt) {
          clearInterval(timer);
          overlay('Sesi VIP 30 menit telah habis. Draft yang tersimpan di perangkat tidak dihapus. Masuk kembali sebelum melanjutkan transaksi.', true);
        }
      }, 1000);
      return { folder, vipName, expiresAt };
    })().catch(error => {
      const code = error && (error.code || error.message) || 'UNKNOWN';
      console.error('[VIP Firebase R21]', code);
      overlay(errorLabel(code) + ' Periksa konfigurasi fungsi Netlify dan rules, atau login ulang.', true);
      throw error;
    });
  }
  window.VIP_FIREBASE_SESSION = Object.freeze({ start });
})();
