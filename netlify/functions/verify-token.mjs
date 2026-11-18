/** ImamSales verify-token — modern Netlify API, legacy JSON contract intact. */
import jwt from 'jsonwebtoken';
const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
};
const json = (status, payload) => new Response(JSON.stringify(payload), { status, headers });

export default async function handler(request) {
  if (request.method !== 'GET') return json(405, { success: false, message: 'Method Not Allowed' });
  try {
    const raw = request.headers.get('authorization') || '';
    const match = /^Bearer\s+([^\s]+)$/i.exec(raw);
    if (!match || !process.env.JWT_SECRET) throw new Error('INVALID_SESSION');
    const user = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    return json(200, { success: true, user });
  } catch {
    return json(401, { success: false, message: 'Token tidak valid atau sudah expired' });
  }
}
