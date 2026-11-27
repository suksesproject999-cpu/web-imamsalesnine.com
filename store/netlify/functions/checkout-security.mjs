/** ImamStore Checkout Security Pro 1.3 — isolated Netlify Function.
 * No direct effect on existing checkout until Stage 1.4 changes its caller.
 * POST {action:'quote',items,voucherCodes}; optional create is explicitly gated.
 * Static /produk.json is bundled from store/produk.json copied by Netlify build.
 */
import catalogSeed from '../../produk.json' with {type:'json'};
import {FieldValue} from 'firebase-admin/firestore';
import {getPresenceFirebase} from '../lib/firebase-admin.mjs';
import {CheckoutQuoteError} from '../lib/checkout-quote.mjs';
import {CheckoutServerError,quoteForUser,createForUser} from '../lib/checkout-order-service.mjs';
const ORIGINS=new Set(['https://store.imamsales.com','https://store.imamsalesnine.com']);
const MAX_BODY_BYTES=12_288;
// Per-instance best-effort throttle; durable 6-per-10min create limit lives in Firestore.
const QUOTE_THROTTLE=new Map();
function quoteAllowed(uid){
 const now=Date.now();let slot=QUOTE_THROTTLE.get(uid);
 if(!slot||now-slot.start>=60_000){slot={start:now,count:0};QUOTE_THROTTLE.set(uid,slot)}
 slot.count++;
 if(QUOTE_THROTTLE.size>2000){for(const [k,v] of QUOTE_THROTTLE){if(now-v.start>=60_000)QUOTE_THROTTLE.delete(k)}
  if(QUOTE_THROTTLE.size>2000)QUOTE_THROTTLE.clear()}
 return slot.count<=40;
}
const MESSAGES={
 AUTH_REQUIRED:'Silakan masuk menggunakan akun pelanggan.',
 REQUEST_SHAPE_INVALID:'Data permintaan checkout tidak sesuai.',
 REQUEST_ID_REUSED:'Permintaan ini sudah pernah digunakan untuk pesanan lain.',
 PRODUCT_UNAVAILABLE:'Produk tidak tersedia atau sudah dinonaktifkan.',
 VARIANT_NOT_FOUND:'Varian sudah berubah. Pilih varian kembali.',
 VARIANT_ID_REQUIRED:'Varian belum memiliki identitas resmi. Hubungi admin toko.',
 STOCK_UNVERIFIED:'Stok produk belum dapat dikonfirmasi. Hubungi admin.',
 STOCK_INSUFFICIENT:'Stok tidak mencukupi. Perbarui jumlah pesanan.',
 VOUCHER_USAGE_UNVERIFIED:'Hak penggunaan voucher belum dapat diverifikasi.',
 VOUCHER_UNAVAILABLE:'Voucher tidak tersedia untuk pesanan ini.',
 VOUCHER_EXPIRED:'Voucher sudah berakhir.',
 VOUCHER_MINIMUM_NOT_MET:'Minimal pembelian voucher belum terpenuhi.',
 ORDER_RATE_LIMITED:'Terlalu banyak permintaan. Coba kembali nanti.',
 REQUEST_ID_INVALID:'ID permintaan tidak valid.',
 LINE_COUNT_INVALID:'Maksimal 10 jenis produk per pesanan.',
 CUSTOMER_INVALID:'Alamat dan data penerima perlu diperiksa.',
 SHIPPING_INVALID:'Pilihan ekspedisi atau catatan tidak sesuai.',
};
function respond(status,obj,origin=''){
 const h=new Headers({'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Vary':'Origin'});
 if(ORIGINS.has(origin)){
  h.set('Access-Control-Allow-Origin',origin);
  h.set('Access-Control-Allow-Methods','POST, OPTIONS');
  h.set('Access-Control-Allow-Headers','Authorization, Content-Type');
 }
 return new Response(status===204?null:JSON.stringify(obj),{status,headers:h});
}
export default async function handler(request){
 const origin=request.headers.get('origin')||'';
 if(origin&&!ORIGINS.has(origin))return respond(403,{success:false,code:'ORIGIN_FORBIDDEN'},origin);
 if(request.method==='OPTIONS')return respond(204,null,origin);
 if(request.method!=='POST')return respond(405,{success:false,code:'METHOD_NOT_ALLOWED'},origin);
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))
  return respond(415,{success:false,code:'JSON_REQUIRED'},origin);
 const bearer=/^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization')||'');
 if(!bearer)return respond(401,{success:false,code:'AUTH_REQUIRED',message:MESSAGES.AUTH_REQUIRED},origin);
 if(Number(request.headers.get('content-length')||0)>MAX_BODY_BYTES)
  return respond(413,{success:false,code:'REQUEST_TOO_LARGE'},origin);
 let body;
 try{
  const raw=await request.text();
  if(Buffer.byteLength(raw,'utf8')>MAX_BODY_BYTES)
   return respond(413,{success:false,code:'REQUEST_TOO_LARGE'},origin);
  body=JSON.parse(raw);
 }catch{return respond(400,{success:false,code:'INVALID_JSON'},origin)}
 try{
  const {auth,db}=getPresenceFirebase();
  let decoded;
  try{decoded=await auth.verifyIdToken(bearer[1],true)}
  catch{return respond(401,{success:false,code:'SESSION_INVALID',message:'Sesi habis. Masuk kembali.'},origin)}
  if(!decoded?.uid||decoded.firebase?.sign_in_provider==='anonymous')
   return respond(403,{success:false,code:'CUSTOMER_REQUIRED',message:MESSAGES.AUTH_REQUIRED},origin);
  const args={db,seedCatalog:catalogSeed,uid:decoded.uid,body,
   voucherLedgerReady:process.env.CHECKOUT_VOUCHER_LEDGER_READY==='true'};
  if(body?.action==='quote'){
   if(!quoteAllowed(decoded.uid))return respond(429,{success:false,code:'QUOTE_RATE_LIMITED',message:'Terlalu banyak permintaan harga. Coba kembali.'},origin);
   const data=await quoteForUser(args);
   return respond(200,{success:true,...data},origin);
  }
  if(body?.action==='create'){
   // Default OFF — do NOT activate until Rules cutover and Stage 1.4 client integration.
   if(process.env.CHECKOUT_SECURITY_WRITE_ENABLED!=='true')
    return respond(503,{success:false,code:'ORDER_WRITE_NOT_ACTIVATED',
     message:'Pembuatan pesanan aman belum diaktifkan.'},origin);
   const data=await createForUser({...args,serverTimestamp:()=>FieldValue.serverTimestamp()});
   return respond(200,{success:true,...data},origin);
  }
  return respond(400,{success:false,code:'ACTION_INVALID'},origin);
 }catch(err){
  if(err instanceof CheckoutQuoteError||err instanceof CheckoutServerError){
   const code=err.code||'CHECKOUT_INVALID',status=err instanceof CheckoutServerError?err.status:400;
   return respond(status,{success:false,code,message:MESSAGES[code]||'Data checkout perlu diperiksa kembali.'},origin);
  }
  console.error('[checkout security]',String(err?.code||err?.name||'INTERNAL').slice(0,60));
  return respond(503,{success:false,code:'CHECKOUT_UNAVAILABLE',
   message:'Layanan checkout belum tersedia. Coba kembali.'},origin);
 }
}
