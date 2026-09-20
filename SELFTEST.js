
/**
 * NEXAI V11 PRODUCTION TEST
 * node SELFTEST.js https://imamsalesnine.com/.netlify/functions/chat
 */
const endpoint =
  process.argv[2] ||
  "https://imamsalesnine.com/.netlify/functions/chat";

const tests = [
  ["Bro", "smalltalk", null],
  ["Harga R9 berapa", "product_price", "R9"],
  ["Spek MS3", "product_spec", "MS3-SLIM"],
  ["Q6pro apa ada", "product_stock", "Q6-PRO"],
  ["Spek H6 LH2", "product_spec", "H6-LH2"],
  ["Spek V9pro", "product_spec", "V9PRO"],
  ["Beda R9 dan R10 apa", "compare", null],
  ["Imam siapa", "business_profile", null],
  ["Kenapa gak bisa kerja kamu", "general", null]
];

async function ask(message){
  const form = new FormData();
  form.append("message", message);
  form.append("memory", "[]");
  form.append("productMemory", "[]");
  form.append("imamMode", "0");
  form.append("clientTime", new Date().toISOString());
  form.append("clientTimezone", "Asia/Jakarta");

  const r = await fetch(endpoint,{
    method:"POST",
    body:form
  });

  return {
    status:r.status,
    data:await r.json()
  };
}

(async()=>{
  let fail=0;

  for(const [message,route,sku] of tests){
    try{
      const {status,data}=await ask(message);

      const routeOK=data.route===route;
      const skuOK=!sku ||
        String(data.product?.sku||"").toUpperCase()===sku;

      const compareOK =
        route!=="compare" ||
        Array.isArray(data.products) &&
        data.products.length>=2;

      const businessOK =
        route!=="business_profile" ||
        /Imam/i.test(data.reply||"");

      const ok=
        status===200 &&
        routeOK &&
        skuOK &&
        compareOK &&
        businessOK;

      console.log(
        ok?"PASS":"FAIL",
        message,
        "=>",
        data.route,
        data.product?.sku || "",
        Array.isArray(data.products)
          ? data.products.map(x=>x.sku).join(",")
          : "",
        (data.reply||"").slice(0,80)
      );

      if(!ok) fail++;
    }catch(err){
      console.log("FAIL",message,err.message);
      fail++;
    }
  }

  process.exit(fail?1:0);
})();
