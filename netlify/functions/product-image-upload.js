const { verifyToken } = require("./utils/auth");
const admin = require("firebase-admin");
const crypto = require("crypto");

function initFirebase() {
  if (admin.apps.length) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  if (!projectId || !clientEmail || !privateKeyRaw || !storageBucket) {
    throw new Error("Firebase environment variables belum lengkap");
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, "\n")
    }),
    storageBucket
  });
}

function response(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(payload)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return response(405, {
      success: false,
      message: "Method Not Allowed"
    });
  }

  try {
    const user = verifyToken(event);

    if (user.role !== "product_admin") {
      return response(403, {
        success: false,
        message: "Akses ditolak"
      });
    }

    const {
      productId,
      kind = "image",
      mime,
      base64
    } = JSON.parse(event.body || "{}");

    if (!productId || !mime || !base64) {
      return response(400, {
        success: false,
        message: "Data upload tidak lengkap"
      });
    }

    if (!String(mime).startsWith("image/")) {
      return response(400, {
        success: false,
        message: "File harus berupa gambar"
      });
    }

    if (String(base64).length > 8_000_000) {
      return response(413, {
        success: false,
        message: "Ukuran gambar terlalu besar"
      });
    }

    initFirebase();

    const bucket = admin.storage().bucket();

    const safeProductId = String(productId)
      .replace(/[^a-zA-Z0-9_-]/g, "_");

    const safeKind = String(kind)
      .replace(/[^a-zA-Z0-9_-]/g, "_");

    const downloadToken = crypto.randomUUID();

    const objectPath =
      `products/${safeProductId}/${safeKind}-${Date.now()}.webp`;

    const file = bucket.file(objectPath);
    const buffer = Buffer.from(base64, "base64");

    await file.save(buffer, {
      resumable: false,
      contentType: "image/webp",
      metadata: {
        cacheControl: "public,max-age=31536000,immutable",
        metadata: {
          firebaseStorageDownloadTokens: downloadToken
        }
      }
    });

    const encodedPath = encodeURIComponent(objectPath);

    const url =
      `https://firebasestorage.googleapis.com/v0/b/` +
      `${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;

    return response(200, {
      success: true,
      url,
      path: objectPath,
      message: "Upload berhasil"
    });

  } catch (err) {
    const message = err?.message || "Upload gagal";

    if (/jwt|token|expired/i.test(message)) {
      return response(401, {
        success: false,
        message: "Sesi login tidak valid atau sudah expired"
      });
    }

    return response(500, {
      success: false,
      message
    });
  }
};
