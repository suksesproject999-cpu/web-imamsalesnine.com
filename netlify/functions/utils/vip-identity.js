"use strict";
const { verifyToken } = require('./auth');  // auth.js asli milik server, tidak diganti
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

function vipIdentity(event) {
  let user;
  try { user = verifyToken(event); }
  catch (_) { throw Object.assign(new Error('INVALID_SESSION'), { statusCode: 401 }); }
  if (!user || user.role !== 'vip') throw Object.assign(new Error('VIP_ONLY'), { statusCode: 403 });
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(user.iat) || !Number.isSafeInteger(user.exp) ||
      user.iat > now + 30 || user.exp <= now + 5 ||
      user.exp <= user.iat || user.exp - user.iat > 31 * 60) {
    throw Object.assign(new Error('NETLIFY_SESSION_EXPIRED'), { statusCode: 401 });
  }
  if (!user.username || typeof user.username !== 'string' ||
      typeof user.folder !== 'string' || !/^[a-z0-9_-]{2,70}$/.test(user.folder) ||
      typeof user.nama !== 'string' || user.nama.trim() !== user.nama ||
      user.nama.length < 2 || user.nama.length > 120) {
    throw Object.assign(new Error('VIP_IDENTITY_MISMATCH'), { statusCode: 403 });
  }
  let accounts;
  try { accounts = JSON.parse(process.env.VIP_ACCOUNTS || '[]'); }
  catch (_) { throw Object.assign(new Error('VIP_ACCOUNTS_NOT_READY'), { statusCode: 503 }); }
  if (!Array.isArray(accounts) || accounts.length < 1 || accounts.length > 200) {
    throw Object.assign(new Error('VIP_ACCOUNTS_NOT_READY'), { statusCode: 503 });
  }
  // Login username/folder harus unik, tidak terima role/nama dari request body.
  const matches = accounts.filter(a => a &&
    (a.username === user.username || a.folder === user.folder));
  if (matches.length !== 1 || matches[0].username !== user.username ||
      matches[0].folder !== user.folder || matches[0].nama !== user.nama) {
    throw Object.assign(new Error('VIP_IDENTITY_MISMATCH'), { statusCode: 403 });
  }
  return { username: user.username, folder: user.folder, nama: user.nama, exp: user.exp };
}
function firebaseAdminApp() {
  const existing = getApps().find(a => a.name === 'vip-r21-backend');
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (projectId !== 'apin-web' || !clientEmail || !privateKey) {
    throw Object.assign(new Error('FIREBASE_SERVER_UNAVAILABLE'), { statusCode: 503 });
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId }, 'vip-r21-backend');
}
const firebaseAdminAuth = () => getAuth(firebaseAdminApp());
const firebaseAdminDb = () => getFirestore(firebaseAdminApp());
module.exports = { vipIdentity, firebaseAdminAuth, firebaseAdminDb };
