'use strict';

// Function ini berada di project Netlify WEBSITE UTAMA.
// Tetap gunakan store dan key asli agar heartbeat dashboard admin tidak terputus.
const jwt = require('jsonwebtoken');
const { getStore, connectLambda } = require('@netlify/blobs');

const STORE = 'admin-presence';
const KEY = 'imamsalesnine';
const ONLINE_MS = 90 * 1000;

function respond(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
    body: JSON.stringify(data)
  };
}

function openPresenceStore(event) {
  // exports.handler memakai Lambda compatibility mode. SDK Netlify Blobs
  // membutuhkan context event sebelum getStore() di mode ini.
  if (typeof connectLambda === 'function') {
    connectLambda(event);
  }

  // Pembacaan default Netlify Blobs memakai eventual consistency, yang bisa
  // menampilkan heartbeat lama hingga 60 detik. Pakai strong consistency.
  const options = { name: STORE, consistency: 'strong' };

  // Kompatibilitas dengan versi lama yang belum menyediakan connectLambda.
  // Jangan pakai kredensial manual bila context Lambda sudah tersedia.
  if (typeof connectLambda !== 'function' &&
      process.env.NETLIFY_SITE_ID && process.env.NETLIFY_BLOBS_TOKEN) {
    options.siteID = process.env.NETLIFY_SITE_ID;
    options.token = process.env.NETLIFY_BLOBS_TOKEN;
  }

  return getStore(options);
}

exports.handler = async (event) => {
  try {
    const method = String(event?.httpMethod || '').toUpperCase();

    if (method === 'GET') {
      const store = openPresenceStore(event);
      const saved = await store.get(KEY, { type: 'json', consistency: 'strong' });
      const timestamp = typeof saved?.lastActiveAt === 'string'
        ? Date.parse(saved.lastActiveAt)
        : NaN;
      const lastActiveAt = Number.isFinite(timestamp)
        ? new Date(timestamp).toISOString()
        : null;
      const ageMs = Number.isFinite(timestamp) ? Date.now() - timestamp : Infinity;
      const online = ageMs >= 0 && ageMs < ONLINE_MS;

      return respond(200, { success: true, online, lastActiveAt });
    }

    if (method !== 'POST') {
      return respond(405, { success: false, message: 'Method Not Allowed' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return respond(500, { success: false, message: 'Server configuration error' });
    }

    const authorization = event?.headers?.authorization ||
                          event?.headers?.Authorization || '';
    const match = String(authorization).match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return respond(401, { success: false, message: 'Token diperlukan' });
    }

    let payload;
    try {
      payload = jwt.verify(match[1], secret, { algorithms: ['HS256'] });
    } catch (_) {
      return respond(401, { success: false, message: 'Token tidak valid' });
    }

    if (payload?.role !== 'admin') {
      return respond(403, { success: false, message: 'Akses ditolak' });
    }

    const store = openPresenceStore(event);
    const lastActiveAt = new Date().toISOString();
    await store.setJSON(KEY, { lastActiveAt });

    return respond(200, { success: true, online: true, lastActiveAt });
  } catch (error) {
    console.error('[admin-presence] Failed:', error);
    return respond(500, {
      success: false,
      message: 'Gagal memproses status admin'
    });
  }
};
