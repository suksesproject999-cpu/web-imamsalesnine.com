/**
 * ImamStore Checkout Security Pro — 1.3, server-only order service.
 * Uses 1.2 quote engine and the existing Firestore database. No UI hooks.
 * API must verify Firebase Auth bearer token before calling these functions.
 * Account-limited vouchers require verified, migrated server redemption ledger.
 * Does NOT reserve inventory. Do not claim oversell protection.
 */
import {createHash} from 'node:crypto';
import {quoteCheckout,CheckoutQuoteError,MAX_CHECKOUT_LINES} from './checkout-quote.mjs';
import {CHECKOUT_VOUCHERS} from './checkout-vouchers.mjs';

const ID=/^[A-Za-z0-9_-]{1,120}$/;
const NONCE=/^[A-Za-z0-9_-]{16,100}$/;
const CUSTOMER_FIELDS=['nama','wa','email','provinsi','kota','kodepos','alamat'];
const ALLOWED_QUOTE=['action','items','voucherCodes'];
const ALLOWED_CREATE=[...ALLOWED_QUOTE,'requestId','customer','ekspedisi','catatan'];
const OWN=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const hash=s=>createHash('sha256').update(s).digest('hex');
export class CheckoutServerError extends Error{
  constructor(code,status=400){super(code);this.name='CheckoutServerError';this.code=code;this.status=status}
}
function fail(code,status){throw new CheckoutServerError(code,status)}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)&&(
 Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null)}
function allowed(o,fields,required=[]){
 if(!plain(o)||Object.keys(o).some(k=>!fields.includes(k))||required.some(k=>!OWN(o,k)))fail('REQUEST_SHAPE_INVALID');
}
function str(x,min,max){return typeof x==='string'&&x.length>=min&&x.length<=max&&
 !/[\x00-\x1f\x7f]/.test(x)}
function customerCheck(c){
 allowed(c,CUSTOMER_FIELDS,CUSTOMER_FIELDS);
 if(!str(c.nama,1,160)||!c.nama.trim()||!str(c.wa,8,30)||!/^\+?[0-9 ()-]{8,30}$/.test(c.wa)||
    !str(c.email,0,160)||!str(c.provinsi,1,150)||!c.provinsi.trim()||
    !str(c.kota,1,150)||!c.kota.trim()||!str(c.kodepos,5,5)||!/^\d{5}$/.test(c.kodepos)||
    !str(c.alamat,1,1600)||!c.alamat.trim())fail('CUSTOMER_INVALID');
 return Object.fromEntries(CUSTOMER_FIELDS.map(k=>[k,c[k].trim()]));
}
function normalize(body,creating){
 allowed(body,creating?ALLOWED_CREATE:ALLOWED_QUOTE,['action','items',...(creating?['requestId','customer','ekspedisi','catatan']:[])]);
 if(body.action!==(creating?'create':'quote'))fail('ACTION_INVALID');
 if(!Array.isArray(body.items)||body.items.length<1||body.items.length>MAX_CHECKOUT_LINES)fail('LINE_COUNT_INVALID');
 const items=body.items.map(line=>{
  allowed(line,['productId','variantId','qty'],['productId','qty']);
  if(typeof line.productId!=='string'||!ID.test(line.productId))fail('PRODUCT_ID_INVALID');
  if(line.variantId!==undefined&&(typeof line.variantId!=='string'||!ID.test(line.variantId)))fail('VARIANT_ID_INVALID');
  if(!Number.isSafeInteger(line.qty)||line.qty<1||line.qty>999)fail('LINE_QUANTITY_INVALID');
  return {...line};
 });
 const vouchers=body.voucherCodes;
 if(vouchers!==undefined){
  allowed(vouchers,['product','shipping']);
  for(const key of ['product','shipping'])if(vouchers[key]!==undefined&&vouchers[key]!==null&&
     (typeof vouchers[key]!=='string'||vouchers[key].length>80))fail('VOUCHER_CODE_INVALID');
 }
 const request={items,voucherCodes:vouchers};
 if(!creating)return request;
 if(typeof body.requestId!=='string'||!NONCE.test(body.requestId))fail('REQUEST_ID_INVALID');
 if(!str(body.ekspedisi,1,100)||!body.ekspedisi.trim()||!str(body.catatan,0,500))fail('SHIPPING_INVALID');
 return {...request,requestId:body.requestId,customer:customerCheck(body.customer),
   ekspedisi:body.ekspedisi.trim(),catatan:body.catatan.trim()};
}
function indexSeed(seed){
 if(!Array.isArray(seed))fail('SEED_CATALOG_UNAVAILABLE',503);
 const mapped=new Map();
 for(const p of seed){
  if(!plain(p))continue;
  const k=String(p.id??'');
  if(!ID.test(k))continue;
  if(mapped.has(k))fail('SEED_ID_CONFLICT',503);
  mapped.set(k,p);
 }
 return mapped;
}
function prepareProducts(lines,seed,documents){
 const products=new Map();
 for(const line of lines){
  const id=line.productId;
  if(products.has(id))continue;
  const doc=documents.get(id);
  const base=seed.get(id);
  if(doc?.exists){
   const data=doc.data();
   if(!plain(data)|| (data.id!==undefined&&String(data.id)!==id))fail('CMS_ID_CONFLICT',503);
   products.set(id,{...base,...data,id});
  }else if(base)products.set(id,{...base,id});
 }
 return products;
}
function voucherCodesFrom(request){
 const codes=[request.voucherCodes?.product,request.voucherCodes?.shipping].filter(x=>typeof x==='string'&&x);
 return [...new Set(codes)];
}
function claimsFor(db,uid,codes){return codes.map(code=>({code,ref:db.collection('checkout_voucher_claims').doc(hash('voucher\0'+uid+'\0'+code))}));}
function redemptionRefs(db,uid,request){
 return claimsFor(db,uid,voucherCodesFrom(request).filter(code=>CHECKOUT_VOUCHERS.some(v=>v.code===code&&v.maxUsesPerAccount!=null)));
}
function entitlements(refs,snapshots,enabled){
 const map=new Map();
 for(let i=0;i<refs.length;i++)map.set(refs[i].code,enabled&&!snapshots[i].exists);
 return map;
}
function quoteFor(request,products,entitlement,now){
 return quoteCheckout({items:request.items,voucherCodes:request.voucherCodes},{products,
  vouchers:CHECKOUT_VOUCHERS,voucherEntitlements:entitlement,now,stockPolicy:'strict'});
}
function summary(quote){return {version:quote.version,items:quote.items.map(({productId,variantId,nama,varian,qty,harga,flash})=>({productId,variantId,nama,varian,qty,harga,flash})),
 totals:quote.totals,vouchers:quote.vouchers,stockStatus:quote.stockStatus,
 warnings:quote.warnings,shippingPotential:quote.shippingPotential};}
function receipt(order,duplicate=false){return {orderId:order.orderId,totals:order.totals,
  items:order.items,vouchers:order.vouchers,duplicate,checkoutStatus:order.status};}
function payloadDigest(data){
 const codes=data.voucherCodes||{};
 return hash(JSON.stringify({items:data.items,voucherCodes:{product:codes.product||'',shipping:codes.shipping||''},
  customer:data.customer,ekspedisi:data.ekspedisi,catatan:data.catatan}));
}
function metaRefs(db,uid,requestId,now){
 const key=hash('request\0'+uid+'\0'+requestId);
 return {attempt:db.collection('checkout_request_keys').doc(key),
  order:db.collection('orders').doc('ORD-'+key.slice(0,48)),
  rate:db.collection('checkout_order_limits').doc(hash('rate\0'+uid+'\0'+Math.floor(now/600000)))};
}
function verifiedUser(uid){if(typeof uid!=='string'||uid.length<1||uid.length>128)fail('AUTH_REQUIRED',401)}
function verifiedDependencies({db,seedCatalog,serverTimestamp}){
 if(!db||typeof db.collection!=='function'||typeof db.runTransaction!=='function'||!Array.isArray(seedCatalog)||
 typeof serverTimestamp!=='function')fail('SERVER_CONFIG_INVALID',503);
}
/** Read-only estimate; no stock reserve or voucher claim. */
export async function quoteForUser({db,seedCatalog,uid,body,now=Date.now(),voucherLedgerReady=false}){
 verifiedUser(uid);
 if(!db||typeof db.collection!=='function')fail('SERVER_CONFIG_INVALID',503);
 const req=normalize(body,false),seed=indexSeed(seedCatalog);
 const productRefs=[...new Set(req.items.map(x=>x.productId))].map(id=>({id,ref:db.collection('cms_products').doc(id)}));
 const claims=redemptionRefs(db,uid,req);
 const docs=await Promise.all(productRefs.map(x=>x.ref.get()));
 const ledger=await Promise.all(claims.map(x=>x.ref.get()));
 const map=new Map(productRefs.map((x,i)=>[x.id,docs[i]]));
 const products=prepareProducts(req.items,seed,map);
 const quote=quoteFor(req,products,entitlements(claims,ledger,voucherLedgerReady),now);
 return summary(quote);
}
/** Server-only write, OFF in HTTP handler unless explicit gate enabled.
 * Firestore transaction reads all catalog/ledger/idempotency/rate docs before writes.
 * max 6 distinct create orders per 10-min UID bucket, with idempotent retries free.
 */
export async function createForUser({db,seedCatalog,uid,body,now=Date.now(),
 serverTimestamp,voucherLedgerReady=false}){
 verifiedUser(uid);
 verifiedDependencies({db,seedCatalog,serverTimestamp});
 const req=normalize(body,true),seed=indexSeed(seedCatalog),digest=payloadDigest(req);
 const meta=metaRefs(db,uid,req.requestId,now);
 const productRefs=[...new Set(req.items.map(x=>x.productId))].map(id=>({id,ref:db.collection('cms_products').doc(id)}));
 const claims=redemptionRefs(db,uid,req);
 return db.runTransaction(async tx=>{
  const refs=[meta.attempt,...productRefs.map(x=>x.ref),...claims.map(x=>x.ref),meta.rate];
  const snapshots=await Promise.all(refs.map(ref=>tx.get(ref)));
  const old=snapshots[0];
  if(old.exists){
   if(old.data()?.uid!==uid||old.data()?.payloadDigest!==digest||old.data()?.orderId!==meta.order.id)
    fail('REQUEST_ID_REUSED',409);
   const orderSnap=await tx.get(meta.order);
   if(!orderSnap.exists||orderSnap.data()?.uid!==uid)fail('ORDER_REFERENCE_BROKEN',503);
   return receipt(orderSnap.data(),true);
  }
  const cms=new Map(productRefs.map((p,i)=>[p.id,snapshots[1+i]]));
  const products=prepareProducts(req.items,seed,cms);
  const firstClaim=1+productRefs.length;
  const claimSnapshots=snapshots.slice(firstClaim,firstClaim+claims.length);
  const quote=quoteFor(req,products,entitlements(claims,claimSnapshots,voucherLedgerReady),Date.now());
  const rateSnap=snapshots[snapshots.length-1];
  const count=rateSnap.exists?rateSnap.data()?.count:0;
  if(!Number.isSafeInteger(count)||count<0||count>=6)fail('ORDER_RATE_LIMITED',429);
  // All Firestore reads must precede writes, including implicit order-exists check.
  const timestamp=serverTimestamp();
  const order={orderId:meta.order.id,uid,customer:req.customer,ekspedisi:req.ekspedisi,
   catatan:req.catatan,items:quote.orderItems.map(i=>({...i})),totals:{...quote.totals},
   vouchers:{...quote.vouchers},status:'checkout_created',channel:'whatsapp',
   createdAt:timestamp,updatedAt:timestamp};
  tx.create(meta.order,order);
  // Preserve permanent Variant ID privately without changing the legacy order schema.
  tx.create(db.collection('checkout_order_variants').doc(meta.order.id),{
   orderId:meta.order.id,uid,items:quote.items.map(x=>({productId:x.productId,variantId:x.variantId,qty:x.qty})),
   createdAt:timestamp});
  tx.create(meta.attempt,{uid,orderId:meta.order.id,payloadDigest:digest,createdAt:timestamp});
  for(const x of claims)tx.create(x.ref,{uid,code:x.code,orderId:meta.order.id,createdAt:timestamp});
  tx.set(meta.rate,{count:count+1,updatedAt:timestamp});
  return receipt(order,false);
 });
}
export const CHECKOUT_STAGE_13={version:'api-r1',maxLines:MAX_CHECKOUT_LINES,orderWriteEnabledByDefault:false};
