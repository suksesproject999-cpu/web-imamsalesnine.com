/**
 * VIP JWT -> Firebase Custom Token bridge (NETLIFY MAIN SITE ONLY).
 * Modern Netlify Functions API: default export (Request -> Response).
 * Compatible with the R24 pilot VIP HTML and claims.
 * Never trusts VIP name/folder supplied in the request body.
 */
import jwt from 'jsonwebtoken';
import admin from 'firebase-admin';
import { createHash } from 'node:crypto';

const PROJECT_ID = 'apin-web';
const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
};
const json = (status, payload) => new Response(JSON.stringify(payload), { status, headers });

function firebaseAuth() {
  if (!admin.apps.length) {
    // Reuse the same split env credentials that Product Admin already uses.
    // No new 2-3KB JSON environment variable is necessary when these exist.
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    let cert;
    if (projectId && clientEmail && privateKey) {
      if (projectId !== PROJECT_ID) throw new Error('FIREBASE_ADMIN_PROJECT_MISMATCH');
      cert = {projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n')};
    } else if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.project_id !== PROJECT_ID || !parsed.private_key || !parsed.client_email) {
        throw new Error('FIREBASE_ADMIN_PROJECT_MISMATCH');
      }
      cert = parsed;
    } else {
      throw new Error('FIREBASE_ADMIN_NOT_CONFIGURED');
    }
    admin.initializeApp({ credential: admin.credential.cert(cert), projectId: PROJECT_ID });
  }
  return admin.auth();
}

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { success: false, message: 'Method Not Allowed' });
  const raw = request.headers.get('authorization') || '';
  const bearer = /^Bearer\s+([^\s]+)$/i.exec(raw);
  if (!bearer) return json(401, { success: false, message: 'Session invalid or expired' });

  let user;
  try {
    user = jwt.verify(bearer[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return json(401, { success: false, message: 'Session invalid or expired' });
  }
  if (user.role !== 'vip') return json(403, { success: false, message: 'Forbidden' });

  const folder = user.folder;
  const nama = user.nama;
  if (typeof folder !== 'string' || !/^[a-z0-9][a-z0-9-]{1,64}$/.test(folder) ||
      typeof nama !== 'string' || !nama.trim() || nama.trim().length > 100) {
    return json(403, { success: false, message: 'Invalid VIP account' });
  }
  const expireAt = Number(user.exp) * 1000;
  if (!Number.isSafeInteger(expireAt) || expireAt <= Date.now() ||
      expireAt > Date.now() + 31 * 60 * 1000) {
    return json(401, { success: false, message: 'Expired session' });
  }

  // Additional allowlist check: stale or altered VIP account is not signed.
  let accounts;
  try { accounts = JSON.parse(process.env.VIP_ACCOUNTS || '[]'); }
  catch { return json(503, { success: false, message: 'VIP identity service unavailable' }); }
  if (!Array.isArray(accounts) || !accounts.some(x =>
    x && x.username === user.username && x.folder === folder && x.nama === nama)) {
    return json(403, { success: false, message: 'Invalid VIP account' });
  }

  const uid = 'vip_' + createHash('sha256')
    .update('imam-vip-v1:' + folder).digest('hex').slice(0, 40);
  try {
    const firebaseToken = await firebaseAuth().createCustomToken(uid, {
      vip: true,
      vip_folder: folder,
      vip_name: nama.trim(),
      vip_expires_ms: expireAt,
    });
    return json(200, { success: true, firebaseToken });
  } catch (error) {
    console.error('[vip-firebase-session] unavailable:', error?.code || error?.name || 'unknown');
    return json(503, { success: false, message: 'VIP identity service unavailable' });
  }
}
