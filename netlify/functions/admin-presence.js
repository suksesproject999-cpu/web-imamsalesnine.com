'use strict';

// Project: Netlify website utama (bukan project ImamStore).
// Endpoint publik: GET /.netlify/functions/admin-presence
// Heartbeat admin: POST endpoint yang sama memakai JWT admin yang sudah ada.
const jwt = require('jsonwebtoken');
const { getStore, connectLambda } = require('@netlify/blobs');

const STORE_NAME = 'admin-presence';
const STORE_KEY = 'imamsalesnine';
const ONLINE_WINDOW_MS = 90_000;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0'
    },
    body: JSON.stringify(payload)
  };
}

function presenceStore(event) {
  // Penting: pertahankan kredensial eksplisit dari fungsi ORIGINAL bila tersedia.
  // Patch sebelumnya melewatkannya saat connectLambda tersedia, yang bisa
  // mengubah jalur akses ke Blobs dan membuat data seolah hilang / GET error.
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: STORE_NAME, siteID, token, consistency: 'strong' });
  }

  // Lambda compatibility Netlify: gunakan context hanya jika tidak ada pasangan
  // kredensial eksplisit. Tidak menambah env var atau dependency baru.
  if (typeof connectLambda === 'function') connectLambda(event);
  return getStore({ name: STORE_NAME, consistency: 'strong' });
}

exports.handler = async function handler(event) {
  const method = String(event?.httpMethod || '').toUpperCase();
  try {
    if (method === 'GET') {
      const store = presenceStore(event);
      const saved = await store.get(STORE_KEY, { type: 'json', consistency: 'strong' });
      const parsed = typeof saved?.lastActiveAt === 'string'
        ? Date.parse(saved.lastActiveAt)
        : NaN;
      const valid = Number.isFinite(parsed) && parsed > 0;
      const lastActiveAt = valid ? new Date(parsed).toISOString() : null;
      const age = valid ? Date.now() - parsed : Infinity;
      return json(200, {
        success: true,
        online: age >= 0 && age < ONLINE_WINDOW_MS,
        lastActiveAt,
        serverTime: new Date().toISOString()
      });
    }

    if (method !== 'POST') {
      return json(405, { success: false, message: 'Method Not Allowed' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('[admin-presence] JWT_SECRET is missing');
      return json(500, { success: false, message: 'Server configuration error' });
    }

    const header = event?.headers?.authorization || event?.headers?.Authorization || '';
    const match = String(header).match(/^Bearer\s+(.+)$/i);
    if (!match) return json(401, { success: false, message: 'Token diperlukan' });

    let claims;
    try {
      claims = jwt.verify(match[1], secret, { algorithms: ['HS256'] });
    } catch (_) {
      return json(401, { success: false, message: 'Token tidak valid' });
    }
    if (claims?.role !== 'admin') {
      return json(403, { success: false, message: 'Akses ditolak' });
    }

    const store = presenceStore(event);
    const lastActiveAt = new Date().toISOString();
    await store.setJSON(STORE_KEY, { lastActiveAt });
    if (process.env.ADMIN_PRESENCE_DEBUG === '1') {
      console.info('[admin-presence] Admin heartbeat berhasil:', lastActiveAt);
    }
    return json(200, { success: true, online: true, lastActiveAt });
  } catch (err) {
    // Pesan teknis hanya di log Netlify Functions, bukan dikirim ke publik.
    console.error('[admin-presence] Error:', err);
    return json(500, { success: false, message: 'Gagal memproses status admin' });
  }
};
