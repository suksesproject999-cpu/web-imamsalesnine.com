const { verifyToken } = require("./utils/auth");
const admin = require("firebase-admin");

function getApp() {
  if (admin.apps.length) return admin.app();

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ success:false, message:"Method Not Allowed" }) };
  }

  try {
    const user = verifyToken(event);

    if (user.role !== "product_admin") {
      return { statusCode: 403, body: JSON.stringify({ success:false, message:"Akses ditolak" }) };
    }

    const { productId, kind, filename, mime, base64 } = JSON.parse(event.body || "{}");

    if (!productId || !base64 || !mime) {
      return { statusCode: 400, body: JSON.stringify({ success:false, message:"Data upload tidak lengkap" }) };
    }

    getApp();

    const bucket = admin.storage().bucket();
    const safeName = String(filename || "image").replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = mime === "image/webp" ? "webp" : (safeName.split(".").pop() || "jpg");
    const objectPath =
      `products/${String(productId).replace(/[^a-zA-Z0-9_-]/g,"_")}/${kind || "image"}-${Date.now()}.${ext}`;

    const file = bucket.file(objectPath);
    const buffer = Buffer.from(base64, "base64");

    await file.save(buffer, {
      resumable:false,
      contentType:mime,
      metadata:{ cacheControl:"public,max-age=31536000,immutable" }
    });

    await file.makePublic();

    const url = `https://storage.googleapis.com/${bucket.name}/${objectPath}`;

    return {
      statusCode:200,
      body:JSON.stringify({ success:true, url, path:objectPath })
    };

  } catch (err) {
    return {
      statusCode:500,
      body:JSON.stringify({ success:false, message:err.message || "Upload gagal" })
    };
  }
};