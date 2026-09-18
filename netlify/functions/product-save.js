const { verifyToken } = require("./utils/auth");
const admin = require("firebase-admin");

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

    const { product } = JSON.parse(event.body || "{}");

    if (!product || !product.id || !String(product.nama || "").trim()) {
      return response(400, {
        success: false,
        message: "ID dan nama produk wajib diisi"
      });
    }

    initFirebase();

    const db = admin.firestore();

    const cleanProduct = {
      ...product,
      id: String(product.id),
      nama: String(product.nama).trim(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db
      .collection("cms_products")
      .doc(String(cleanProduct.id))
      .set(cleanProduct, { merge: false });

    return response(200, {
      success: true,
      id: String(cleanProduct.id),
      message: "Produk berhasil dipublish"
    });

  } catch (err) {
    const message = err?.message || "Publish gagal";

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
