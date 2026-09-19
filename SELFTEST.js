
const K=require("./netlify/functions/nexai/knowledge");
const R=require("./netlify/functions/nexai/router");
const tests=[
  ["bro harga r9 berapa","r9","product_price"],
  ["foto r9","r9","product_photo"],
  ["v9 ada","v9","product_stock"],
  ["foto z2 dan spek lengkap","z2","product_photo_spec"],
  ["spek z2","z2","product_spec"],
  ["foto saklar hb8s","saklar-hb8s","product_photo"],
  ["bro",null,"smalltalk"],
  ["gas",null,"smalltalk"]
];
let failed=0;
for(const [q,pid,type] of tests){
  const route=R.classify(q,{});
  const got=route.product?.product_id||null;
  const ok=got===pid&&route.type===type;
  console.log(ok?"PASS":"FAIL",q,"=>",got,route.type);
  if(!ok)failed++;
}
if(failed)process.exit(1);
