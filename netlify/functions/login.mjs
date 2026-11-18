/**
 * ImamSales main-site login — Netlify modern Functions API.
 * Endpoint and response fields match the legacy login.js.
 * Do not log or return passwords, JWT_SECRET or VIP_ACCOUNTS.
 */
import jwt from 'jsonwebtoken';

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
};
const json = (status, payload) => new Response(JSON.stringify(payload), { status, headers });
const issue = (role, secret, extra = {}) => jwt.sign({ role, ...extra }, secret, { expiresIn: '30m' });

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { success: false, message: 'Method Not Allowed' });
  try {
    const adminUser = process.env.ADMIN_USER;
    const adminPass = process.env.ADMIN_PASS;
    const productAdminUser = process.env.PRODUCT_ADMIN_USER;
    const productAdminPass = process.env.PRODUCT_ADMIN_PASS;
    const secret = process.env.JWT_SECRET;
    if (!adminUser || !adminPass || !secret) {
      return json(500, { success: false, message: 'Server configuration error' });
    }

    // Same credentials and payload as old code. Invalid JSON is a bad request.
    let body;
    try { body = await request.json(); }
    catch { return json(400, { success: false, message: 'Permintaan login tidak valid' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        typeof body.username !== 'string' || typeof body.password !== 'string' ||
        body.username.length > 160 || body.password.length > 512) {
      return json(400, { success: false, message: 'Permintaan login tidak valid' });
    }
    const { username, password } = body;

    if (productAdminUser && productAdminPass &&
        username === productAdminUser && password === productAdminPass) {
      return json(200, { success: true, role: 'product_admin', token: issue('product_admin', secret) });
    }
    if (username === adminUser && password === adminPass) {
      return json(200, { success: true, role: 'admin', token: issue('admin', secret) });
    }

    // Preserve legacy VIP_ACCOUNTS format: [{username,password,folder,nama}, ...]
    let vipAccounts;
    try { vipAccounts = JSON.parse(process.env.VIP_ACCOUNTS || '[]'); }
    catch { return json(500, { success: false, message: 'Server configuration error' }); }
    if (!Array.isArray(vipAccounts)) {
      return json(500, { success: false, message: 'Server configuration error' });
    }
    const vip = vipAccounts.find(item => item && item.username === username && item.password === password);
    if (vip) {
      const token = issue('vip', secret, {
        username: vip.username,
        folder: vip.folder,
        nama: vip.nama,
      });
      return json(200, { success: true, role: 'vip', nama: vip.nama, folder: vip.folder, token });
    }
    return json(401, { success: false, message: 'Username atau password salah' });
  } catch {
    return json(500, { success: false, message: 'Internal Server Error' });
  }
}
