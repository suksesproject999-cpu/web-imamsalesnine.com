const jwt = require("jsonwebtoken");
const { getStore } = require("@netlify/blobs");

const STORE = "admin-presence";
const KEY = "imamsalesnine";
const ONLINE_MS = 90 * 1000;

const response = (statusCode, data) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  },
  body: JSON.stringify(data)
});

exports.handler = async (event) => {
  try {
    const store = getStore(STORE);

    if (event.httpMethod === "GET") {
      const saved = await store.get(KEY, { type: "json" });
      const lastActiveAt = saved?.lastActiveAt || null;

      const timestamp = lastActiveAt
        ? Date.parse(lastActiveAt)
        : NaN;

      const online = Number.isFinite(timestamp)
        && Date.now() - timestamp >= 0
        && Date.now() - timestamp < ONLINE_MS;

      return response(200, {
        success: true,
        online,
        lastActiveAt
      });
    }

    if (event.httpMethod !== "POST") {
      return response(405, {
        success: false,
        message: "Method Not Allowed"
      });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      return response(500, {
        success: false,
        message: "Server configuration error"
      });
    }

    const auth = event.headers.authorization || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return response(401, {
        success: false,
        message: "Token diperlukan"
      });
    }

    let payload;

    try {
      payload = jwt.verify(match[1], secret, {
        algorithms: ["HS256"]
      });
    } catch {
      return response(401, {
        success: false,
        message: "Token tidak valid"
      });
    }

    if (payload.role !== "admin") {
      return response(403, {
        success: false,
        message: "Akses ditolak"
      });
    }

    const lastActiveAt = new Date().toISOString();

    await store.setJSON(KEY, { lastActiveAt });

    return response(200, {
      success: true,
      online: true,
      lastActiveAt
    });

  } catch (error) {
    console.error("Admin presence error:", error.message);

    return response(500, {
      success: false,
      message: "Gagal memproses status admin"
    });
  }
};
