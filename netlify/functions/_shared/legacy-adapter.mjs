/**
 * Modern Netlify Request/Response <-> original in-repository Function contract.
 * Preserves multipart bytes for chat/Formidable (Lambda originally used base64).
 * Non-HTTP helpers stay in netlify/functions/_shared and are not endpoints.
 */
export async function requestAsLegacyEvent(request) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const headers = Object.fromEntries(request.headers.entries());
  let body = null;
  let isBase64Encoded = false;
  if (method !== 'GET' && method !== 'HEAD') {
    const contentType = request.headers.get('content-type') || '';
    const binary = /^(multipart\/form-data|application\/octet-stream)(?:;|$)/i.test(contentType.trim());
    if (binary) {
      body = Buffer.from(await request.arrayBuffer()).toString('base64');
      isBase64Encoded = true;
    } else {
      body = await request.text();
    }
  }
  return {
    httpMethod: method,
    path: url.pathname,
    headers,
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body,
    isBase64Encoded,
  };
}

export function legacyResponseAsWeb(reply) {
  if (reply instanceof Response) return reply;
  if (!reply || typeof reply !== 'object') throw new Error('Legacy Function returned no response');
  const status = Number(reply.statusCode ?? 200);
  const headers = new Headers(reply.headers || {});
  const raw = reply.body == null ? '' : String(reply.body);
  const body = reply.isBase64Encoded ? Buffer.from(raw, 'base64') : raw;
  return new Response(body, { status, headers });
}
