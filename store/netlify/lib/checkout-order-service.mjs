/**
 * ImamStore Checkout Security Pro — 1.3, server-only order service.
 * Uses 1.2 quote engine and the existing Firestore database. No UI hooks.
 * API must verify Firebase Auth bearer token before calling these functions.
 * Account-limited vouchers require verified, migrated server redemption ledger.
 * Atomically reserves CMS saleable stock when creating each order. Legacy orders are unchanged.
 */
import {createHash} from 'node:crypto';
import {quoteCheckout,CheckoutQuoteError,MAX_CHECKOUT_LINES} from './checkout-quote.mjs';
import {CHECKOUT_VOUCHERS} from './checkout-vouchers.mjs';
import {usageForVoucher} from './checkout-voucher-usage.mjs';
import {allocationPlan,stockPatches} from './checkout-stock.mjs';

const ID=/^[A-Za-z0-9_-]{1,120}$/;
const NONCE=/^[A-Za-z0-9_-]{16,100}$/;
const CUSTOMER_FIELDS=['nama','wa','email','provinsi','kota','kodepos','alamat'];
const ALLOWED_QUOTE=['action','items','voucherCodes'];
const ALLOWED_CREATE=[...ALLOWED_QUOTE,'requestId','customer','ekspedisi','catatan','quoteHash'];
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
 if(typeof body.quoteHash!=='string'||!/^[a-f0-9]{64}$/.test(body.quoteHash))fail('QUOTE_HASH_REQUIRED');
 if(!str(body.ekspedisi,1,100)||!body.ekspedisi.trim()||!str(body.catatan,0,500))fail('SHIPPING_INVALID');
 return {...request,requestId:body.requestId,quoteHash:body.quoteHash,customer:customerCheck(body.customer),
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
const CANCELLED=new Set(['cancelled','canceled','dibatalkan','batal','rejected','ditolak','expired','kedaluwarsa']);
const FINISHED=new Set(['completed','complete','paid','confirmed','delivered','selesai','lunas']);
const statusOf=order=>String(order?.status||'').trim().toLowerCase();
const statusUsage=order=>CANCELLED.has(statusOf(order))?'cancelled':FINISHED.has(statusOf(order))?'used':'reserved';
/** Verify historical usage from authoritative Firestore orders, including legacy voucher-name snapshots.
 * Fail closed if history cannot be read completely. This is a bounded bridge until migration. */
async function readVoucherHistory(db,uid,codes){
 if(!codes.length)return new Map();
 const collection=db.collection('orders');
 if(typeof collection.where!=='function')return null; // older in-memory mocks only
 let snapshots;
 try{snapshots=await collection.where('uid','==',uid).limit(201).get()}
 catch(_){fail('VOUCHER_HISTORY_UNAVAILABLE',503)}
 if(!Array.isArray(snapshots.docs)||snapshots.docs.length>200)fail('VOUCHER_HISTORY_TOO_LARGE',503);
 const result=new Map(codes.map(code=>[code,{state:'available',orders:[]} ]));
 for(const doc of snapshots.docs){
  const order=doc.data();
  if(order?.uid!==uid)continue;
  for(const code of codes){
   const v=CHECKOUT_VOUCHERS.find(x=>x.code===code);
   if(!v)continue;
   const productName=String(order?.vouchers?.product||order?.totals?.productVoucherName||'').trim();
   const shipping=order?.vouchers?.shipping;
   const shippingName=String((typeof shipping==='object'&&shipping?shipping.name:shipping)||order?.totals?.shippingVoucherName||'').trim();
   const shippingCode=typeof shipping==='object'&&shipping?String(shipping.code||''):'';
   const applied=v.type==='shipping_fixed'?(shippingCode===code||shippingName===v.name):productName===v.name;
   if(!applied)continue;
   const entry=result.get(code);entry.orders.push(doc.id);
   const state=statusUsage(order);
   if(state==='used'||(state==='reserved'&&entry.state!=='used'))entry.state=state;
  }
 }
 return result;
}
async function usageForClaims({db,uid,claims,ledger,history,voucherLedgerReady=false,readOrder}){
 const result=new Map();
 for(let i=0;i<claims.length;i++){
  const {code}=claims[i];
  const policy=CHECKOUT_VOUCHERS.find(v=>v.code===code);
  if(!policy||!Number.isSafeInteger(policy.maxUsesPerAccount))fail('TRUSTED_VOUCHERS_INVALID');
  let usage;
  try{usage=await usageForVoucher({db,uid,code,maxUses:policy.maxUsesPerAccount,
    ledger:ledger[i],history,ledgerReady:voucherLedgerReady,readOrder})}
  catch(err){fail(err?.code||'VOUCHER_USAGE_UNVERIFIED',503)}
  result.set(code,usage);
 }
 return result;
}
function entitlementsFromUsage(usages){
 const result=new Map();
 for(const [code,usage] of usages){
  // Quotes cannot grant a voucher based on browser input.
  if(usage.remaining===0){
   if(usage.reserved>0)fail('VOUCHER_RESERVED',409);
   fail('VOUCHER_LIMIT_REACHED',409);
  }
  result.set(code,true);
 }
 return result;
}
function quoteFor(request,products,entitlement,now){
 return quoteCheckout({items:request.items,voucherCodes:request.voucherCodes},{products,
  vouchers:CHECKOUT_VOUCHERS,voucherEntitlements:entitlement,now,stockPolicy:'strict'});
}
/* Bind buyer consent to exactly one server-verified quote (including names, variant IDs, price and vouchers).
 * This is not an authorization token; server recalculates it in the Firestore transaction. */
function quoteHash(quote){return hash(JSON.stringify({items:quote.items,totals:quote.totals,vouchers:quote.vouchers}));}
function summary(quote){return {quoteHash:quoteHash(quote),version:quote.version,items:quote.items.map(({productId,variantId,nama,varian,qty,harga,flash})=>({productId,variantId,nama,varian,qty,harga,flash})),
 totals:quote.totals,vouchers:quote.vouchers,stockStatus:quote.stockStatus,
 warnings:quote.warnings,shippingPotential:quote.shippingPotential};}
function receipt(order,duplicate=false){return {orderId:order.orderId,orderNumber:order.orderNumber||order.orderId,totals:order.totals,
  items:order.items,vouchers:order.vouchers,duplicate,checkoutStatus:order.status,
  paymentDueAt:order.paymentDueAt?.toDate?.()?.toISOString?.()||
   (order.paymentDueAt instanceof Date?order.paymentDueAt.toISOString():null)};}
function payloadDigest(data){
 const codes=data.voucherCodes||{};
 return hash(JSON.stringify({items:data.items,voucherCodes:{product:codes.product||'',shipping:codes.shipping||''},
  customer:data.customer,ekspedisi:data.ekspedisi,catatan:data.catatan,quoteHash:data.quoteHash}));
}
// R3: a customer-facing 12-character order number, while Firestore document ID
// remains stable for stock reservations, voucher claims and request idempotency.
// Collision is fail-closed through a unique Firestore document created atomically.
const ORDER_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function publicOrderNumber(key){
 let n=BigInt('0x'+key.slice(0,14));
 let result='';
 for(let i=0;i<9;i++){result=ORDER_ALPHABET[Number(n%32n)]+result;n/=32n;}
 return 'IS-'+result;
}
function metaRefs(db,uid,requestId,now){
 const key=hash('request\0'+uid+'\0'+requestId);
 const number=publicOrderNumber(key);
 return {attempt:db.collection('checkout_request_keys').doc(key),
  order:db.collection('orders').doc('ORD-'+key.slice(0,48)),
  orderNumber:number,numberRef:db.collection('checkout_order_numbers').doc(number),
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
 const history=await readVoucherHistory(db,uid,claims.map(x=>x.code));
 const usages=await usageForClaims({db,uid,claims,ledger,history,voucherLedgerReady,
  readOrder:ref=>ref.get()});
 const map=new Map(productRefs.map((x,i)=>[x.id,docs[i]]));
 const products=prepareProducts(req.items,seed,map);
 const quote=quoteFor(req,products,entitlementsFromUsage(usages),now);
 return {...summary(quote),voucherUsage:Object.fromEntries(usages)};
}
/** Read-only, authenticated voucher balance for the customer's voucher sheet. */
export async function voucherStatusForUser({db,uid,now=Date.now(),voucherLedgerReady=false}){
 verifiedUser(uid);
 if(!db||typeof db.collection!=='function')fail('SERVER_CONFIG_INVALID',503);
 const policies=CHECKOUT_VOUCHERS.filter(v=>v.maxUsesPerAccount!=null);
 const claims=claimsFor(db,uid,policies.map(v=>v.code));
 const ledger=await Promise.all(claims.map(x=>x.ref.get()));
 const history=await readVoucherHistory(db,uid,claims.map(x=>x.code));
 const usages=await usageForClaims({db,uid,claims,ledger,history,voucherLedgerReady,
  readOrder:ref=>ref.get()});
 const vouchers={};
 for(const policy of policies){
  const usage=usages.get(policy.code);
  const expired=Number.isFinite(Date.parse(policy.expiresOn+'T23:59:59.999+07:00'))&&
   now>Date.parse(policy.expiresOn+'T23:59:59.999+07:00');
  vouchers[policy.code]={limit:usage.limit,used:usage.used,reserved:usage.reserved,
   remaining:usage.remaining,status:expired?'expired':usage.status};
 }
 return {vouchers};
}
/** Server-only write, OFF in HTTP handler unless explicit gate enabled.
 * Firestore transaction reads all catalog/ledger/idempotency/rate docs before writes.
 * max 6 distinct create orders per 10-min UID bucket, with idempotent retries free.
 */
export async function createForUser({db,seedCatalog,uid,body,now=Date.now(),
 serverTimestamp,voucherLedgerReady=false,expiryEnabled=false}){
 verifiedUser(uid);
 verifiedDependencies({db,seedCatalog,serverTimestamp});
 const req=normalize(body,true),seed=indexSeed(seedCatalog),digest=payloadDigest(req);
 const meta=metaRefs(db,uid,req.requestId,now);
 const productRefs=[...new Set(req.items.map(x=>x.productId))].map(id=>({id,ref:db.collection('cms_products').doc(id)}));
 const claims=redemptionRefs(db,uid,req);
 // Browser cannot write new /orders after R24 cutover; legacy account history is read-only.
 const history=await readVoucherHistory(db,uid,claims.map(x=>x.code));
 return db.runTransaction(async tx=>{
  const refs=[meta.attempt,...productRefs.map(x=>x.ref),...claims.map(x=>x.ref),meta.rate];
  const snapshots=await Promise.all(refs.map(ref=>tx.get(ref)));
  const old=snapshots[0];
  if(old.exists){
   if(old.data()?.uid!==uid||old.data()?.payloadDigest!==digest||old.data()?.orderId!==meta.order.id)
    fail('REQUEST_ID_REUSED',409);
   const orderSnap=await tx.get(meta.order);
   if(!orderSnap.exists||orderSnap.data()?.uid!==uid)fail('ORDER_REFERENCE_BROKEN',503);
   if(CANCELLED.has(statusOf(orderSnap.data())))fail('ORDER_ALREADY_CLOSED',409);
   return receipt(orderSnap.data(),true);
  }
  const cms=new Map(productRefs.map((p,i)=>[p.id,snapshots[1+i]]));
  const products=prepareProducts(req.items,seed,cms);
  const firstClaim=1+productRefs.length;
  const claimSnapshots=snapshots.slice(firstClaim,firstClaim+claims.length);
  // Re-read every historical and current claim order inside the transaction.
  // The shared claim document serializes concurrent orders for the same UID/code.
  const usages=await usageForClaims({db,uid,claims,ledger:claimSnapshots,history,
   voucherLedgerReady,readOrder:ref=>tx.get(ref)});
  const quote=quoteFor(req,products,entitlementsFromUsage(usages),Date.now());
  // Prevent price / voucher / variant changes between quote and order creation.
  if(quoteHash(quote)!==req.quoteHash)fail('QUOTE_CHANGED',409);
  const rateSnap=snapshots[snapshots.length-1];
  const count=rateSnap.exists?rateSnap.data()?.count:0;
  if(!Number.isSafeInteger(count)||count<0||count>=6)fail('ORDER_RATE_LIMITED',429);
  // RESERVE saleable CMS stock atomically in the SAME transaction as the order.
  // Retry on concurrent checkout re-reads CMS; a second order cannot spend the same 100 units.
  const allocations=allocationPlan(quote.items,products);
  const stockWrites=stockPatches(products,allocations,-1);
  // All Firestore reads must precede writes, including implicit order-exists check.
  const timestamp=serverTimestamp();
  // Time is authoritative server time. Legacy R1 orders without dueAt are excluded from auto-expiry.
  const paymentDueAt=expiryEnabled?new Date(Date.now()+60*60_000):null;
  const order={orderId:meta.order.id,orderNumber:meta.orderNumber,uid,customer:req.customer,ekspedisi:req.ekspedisi,
   catatan:req.catatan,items:quote.orderItems.map(i=>({...i})),totals:{...quote.totals},
   vouchers:{...quote.vouchers},status:'checkout_created',channel:'whatsapp',
   createdAt:timestamp,updatedAt:timestamp,...(paymentDueAt?{paymentDueAt}:{})};
  for(const [id,patch] of stockWrites)tx.set(db.collection('cms_products').doc(id),patch,{merge:true});
  // One immutable record of stock held by this order. Admin can release it exactly once.
  tx.create(db.collection('checkout_stock_reservations').doc(meta.order.id),{
   orderId:meta.order.id,uid,state:'reserved',items:allocations,
   ...(paymentDueAt?{expiresAt:paymentDueAt}:{}),createdAt:timestamp,updatedAt:timestamp});
  tx.create(meta.order,order);
  tx.create(meta.numberRef,{orderId:meta.order.id,uid,createdAt:timestamp});
  // Preserve permanent Variant ID privately without changing the legacy order schema.
  tx.create(db.collection('checkout_order_variants').doc(meta.order.id),{
   orderId:meta.order.id,uid,items:quote.items.map(x=>({productId:x.productId,variantId:x.variantId,qty:x.qty})),
   createdAt:timestamp});
  tx.create(meta.attempt,{uid,orderId:meta.order.id,payloadDigest:digest,createdAt:timestamp});
  for(let i=0;i<claims.length;i++){
   const x=claims[i],usage=usages.get(x.code);
   // Keep the legacy orderId field for older readers, and record all active/used claims.
   const payload={uid,code:x.code,orderId:meta.order.id,
    orderIds:[...usage.liveLedgerIds,meta.order.id],state:'reserved',updatedAt:timestamp};
   if(claimSnapshots[i].exists)tx.set(x.ref,payload,{merge:true});
   else tx.create(x.ref,{...payload,createdAt:timestamp});
  }
  tx.set(meta.rate,{count:count+1,updatedAt:timestamp});
  return receipt(order,false);
 });
}
export const CHECKOUT_STAGE_13={version:'api-r1',maxLines:MAX_CHECKOUT_LINES,orderWriteEnabledByDefault:false};
