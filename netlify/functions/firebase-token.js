"use strict";

const admin = require("firebase-admin");
const { verifyToken } = require("./utils/auth");

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}

function getFirebaseAdmin() {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
    if (!projectId || !clientEmail || !privateKey) throw new Error("Firebase Admin configuration missing");
    admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }), projectId });
  }
  return admin;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return respond(405, { success: false, message: "Method Not Allowed" });
  let identity;
  try {
    identity = verifyToken(event);
  } catch (_) {
    return respond(401, { success: false, message: "Token tidak valid atau kedaluwarsa" });
  }

  if (identity.role !== "vip" || typeof identity.username !== "string" || !identity.username.trim()) {
    return respond(403, { success: false, message: "Akses khusus akun VIP" });
  }

  // Recheck the current server-side account registry, so disabled/changed VIPs cannot exchange old JWTs.
  let accounts;
  try {
    accounts = JSON.parse(process.env.VIP_ACCOUNTS || "[]");
    if (!Array.isArray(accounts)) throw new Error("Invalid VIP registry");
  } catch (_) {
    return respond(500, { success: false, message: "Konfigurasi VIP tidak valid" });
  }
  const vip = accounts.find(a => a && a.username === identity.username);
  if (!vip || typeof vip.nama !== "string" || !vip.nama.trim() || vip.nama !== identity.nama || vip.folder !== identity.folder) {
    return respond(403, { success: false, message: "Akun VIP tidak aktif atau identitas berubah" });
  }

  // Stable UID and tenant ID based on the unique server-managed username.
  // Do not use client-provided names or folder paths as authorization input.
  const vipId = identity.username;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(vipId)) {
    return respond(500, { success: false, message: "Username VIP perlu ID stabil (huruf/angka/_/-)" });
  }
  const uid = `vip_${vipId}`;

  try {
    const firebase = getFirebaseAdmin();
    const customToken = await firebase.auth().createCustomToken(uid, {
      role: "vip", vipId
    });
    return respond(200, { success: true, customToken, vipId, nama: vip.nama });
  } catch (err) {
    console.error("Firebase custom token creation failed:", err.message);
    return respond(500, { success: false, message: "Gagal membuat sesi Firebase" });
  }
};
