
/**
 * NEXAI V9 RUNTIME SMOKE TEST
 * Jalankan setelah deploy:
 * node SELFTEST.js https://imamsalesnine.com/.netlify/functions/chat
 */
const endpoint =
  process.argv[2] ||
  "https://imamsalesnine.com/.netlify/functions/chat";

const tests = [
  ["Bro", "smalltalk", ""],
  ["Harga R9 berapa", "product_price", "R9"],
  ["Foto R9", "product_photo", "R9"],
  ["Spek Z2", "product_spec", "Z2"],
  ["Foto Z2 dan spek lengkap", "product_photo_spec", "Z2"]
];

(async()=>{
  let fail = 0;

  for(const [message, expectedRoute, expectedSku] of tests){
    const form = new FormData();
    form.append("message", message);
    form.append("memory", "[]");
    form.append("productMemory", "[]");
    form.append("imamMode", "0");
    form.append("clientTime", new Date().toISOString());
    form.append("clientTimezone", "Asia/Jakarta");

    try{
      const r = await fetch(endpoint,{
        method:"POST",
        body:form
      });

      const data = await r.json();

      const routeOK =
        data.route === expectedRoute;

      const skuOK =
        !expectedSku ||
        String(data.product?.sku || "").toUpperCase() === expectedSku;

      const ok =
        r.ok &&
        routeOK &&
        skuOK;

      console.log(
        ok ? "PASS" : "FAIL",
        message,
        "=>",
        data.route,
        data.product?.sku || "",
        data.reply?.slice(0,100) || ""
      );

      if(!ok) fail++;
    }catch(err){
      console.log("FAIL", message, err.message);
      fail++;
    }
  }

  process.exit(fail ? 1 : 0);
})();
