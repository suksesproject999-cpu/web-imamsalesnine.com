

const firebaseConfig = {
  apiKey: "AIzaSyBkyMCw47sYQb2BBkGMxgfsXppozWw4Cec",
  authDomain: "apin-web.firebaseapp.com",
  projectId: "apin-web",
  storageBucket: "apin-web.firebasestorage.app",
  messagingSenderId: "733140414417",
  appId: "1:733140414417:web:b6967fd053ac462b2ffaf0",
  measurementId: "G-6ZN6TQ1YVE"
};

// Firebase app initialized in VIP bootstrap (named app).

// Firebase App Check - reCAPTCHA Enterprise (sinkron dengan website utama)
const VIP_RECAPTCHA_ENTERPRISE_SITE_KEY = "6LdyvOktAAAAAPcWRB-_bmuw3Z6wVSzgX1kAG11M";
try {
  window.__VIP_FIREBASE_APP.appCheck().activate(
    new firebase.appCheck.ReCaptchaEnterpriseProvider(VIP_RECAPTCHA_ENTERPRISE_SITE_KEY),
    true
  );
  console.info("[VIP] Firebase App Check activated");
} catch (error) {
  console.error("[VIP] Firebase App Check initialization failed", error);
}

const db = window.__VIP_FIREBASE_APP.firestore();

db.collection("info_distributor")
.onSnapshot(snap=>{

const badge =
document.getElementById(
"info-badge"
);

if(badge){

badge.innerText = snap.size;

if(snap.size > 0){

badge.style.display =
"inline-block";

}else{

badge.style.display =
"none";

}

}

});

function updateActivity(){

  db.collection("aktivitas_vip")
  .doc(window.__VIP_CONTEXT.nama)
  .set({

    nama:window.__VIP_CONTEXT.nama,

    last_active:
    firebase.firestore
    .FieldValue
    .serverTimestamp()

  });

}

