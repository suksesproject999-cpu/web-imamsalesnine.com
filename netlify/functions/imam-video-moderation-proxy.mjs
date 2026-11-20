/**
 * ImamStore R39.4 — Netlify Functions (modern Request/Response API).
 * Replaces only the R39.3 main-site proxy, preserving its security contract.
 *
 * IMPORTANT: Do not put admin or Firebase secrets into this source file.
 * The upstream Store backend is responsible for verifying Firebase ID token,
 * Netlify Admin session, App Check, and the moderator's UID/role.
 */
const STORE_ENDPOINT = 'https://store.imamsales.com/.netlify/functions/video-social';
const ADMIN_ORIGIN = 'https://imamsalesnine.com';
const ACTIONS = new Set(['moderatorStatus', 'listPending', 'listReported', 'moderate']);
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function respond(status, message) {
  return new Response(JSON.stringify({ success: false, message }), {
    status,
    headers: JSON_HEADERS,
  });
}

// A default-exported Request -> Response function uses the modern Netlify runtime.
export default async function imamVideoModerationProxy(request) {
  if (request.method !== 'POST') {
    return respond(405, 'Gunakan metode POST.');
  }

  const origin = request.headers.get('origin') || '';
  if (origin && origin !== ADMIN_ORIGIN) {
    return respond(403, 'Origin tidak diizinkan untuk moderator.');
  }

  // Reject clearly oversized requests before reading the body.
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 12000) return respond(413, 'Permintaan terlalu besar.');

  let raw;
  try {
    raw = await request.text();
  } catch {
    return respond(400, 'Gagal membaca permintaan.');
  }
  if (raw.length > 12000) return respond(413, 'Permintaan terlalu besar.');

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return respond(400, 'Format JSON salah.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !ACTIONS.has(data.action)) {
    return respond(400, 'Aksi moderasi tidak valid.');
  }

  const firebaseToken = request.headers.get('authorization') || '';
  const appCheckToken = request.headers.get('x-firebase-appcheck') || '';
  const netlifySession = request.headers.get('x-imam-admin-session') || '';

  // Do not log, persist, or expose any authentication token.
  if (!/^Bearer\s+\S{15,8192}$/i.test(firebaseToken) || !appCheckToken || !netlifySession) {
    return respond(401, 'Sesi Firebase, App Check, atau sesi Admin V5 belum tersedia.');
  }
  if (firebaseToken.length > 8200 || appCheckToken.length > 8192 || netlifySession.length > 8192) {
    return respond(413, 'Header autentikasi terlalu besar.');
  }

  try {
    const upstream = await fetch(STORE_ENDPOINT, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(16000),
      headers: {
        Origin: ADMIN_ORIGIN,
        'Content-Type': 'application/json',
        Authorization: firebaseToken,
        'X-Firebase-AppCheck': appCheckToken,
        'X-Imam-Admin-Session': netlifySession,
      },
      body: raw,
    });
    const upstreamText = await upstream.text();
    if (upstreamText.length > 500000) return respond(502, 'Respons moderasi terlalu besar.');

    let parsed;
    try {
      parsed = JSON.parse(upstreamText);
    } catch {
      return respond(502, 'Respons Store tidak berupa JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return respond(502, 'Respons Store tidak valid.');
    }

    return new Response(JSON.stringify(parsed), { status: upstream.status, headers: JSON_HEADERS });
  } catch {
    return respond(503, 'Penghubung Admin V5 gagal menghubungi Function Store. Periksa log Netlify kedua project.');
  }
}
