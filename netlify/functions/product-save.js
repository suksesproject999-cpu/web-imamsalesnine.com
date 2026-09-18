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
    return { statusCode:405, body:JSON.stringify({ success:false, message:"Method Not Allowed" }) };
  }

  try {
    const user = verifyToken(event);

    if (user.role !== "product_admin") {
      return { statusCode:403, body:JSON.stringify({ success:false, message:"Akses ditolak" }) };
    }

    const { product } = JSON.parse(event.body || "{}");

    if (!product || !product.id || !String(product.nama || "").trim()) {
      return { statusCode:400, body:JSON.stringify({ success:false, message:"Data produk tidak lengkap" }) };
    }

    getApp();

    const db = admin.firestore();

    await db.collection("cms_products")
      .doc(String(product.id))
      .set({
        ...product,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge:false });

    return {
      statusCode:200,
      body:JSON.stringify({ success:true, id:String(product.id) })
    };

  } catch (err) {
    return {
      statusCode:500,
      body:JSON.stringify({ success:false, message:err.message || "Publish gagal" })
    };
  }
};