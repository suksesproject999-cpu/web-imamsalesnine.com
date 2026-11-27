/** ImamStore Stock Atomic R2 — deadline and safe expiry processor.
 * Only new R2 reservations have `expiresAt`. No automatic backfill of R1 orders.
 * All stock restoration is atomic with order and reservation state changes.
 */
import {stockPatches} from './checkout-stock.mjs';
export const RESERVATION_MINUTES=60;
export const REPORT_GRACE_MINUTES=30;
const ID=/^ORD-[A-Za-z0-9_-]{16,100}$/;
function fault(code){const err=new Error(code);err.code=code;throw err}
function millis(value){
 if(value?.toMillis)return value.toMillis();
 if(value?.toDate)return value.toDate().getTime();
 if(value instanceof Date)return value.getTime();
 if(typeof value==='string')return Date.parse(value);
 return NaN;
}
function validPlan(p){
 if(!Array.isArray(p)||p.length<1||p.length>30)fault('RESERVATION_PLAN_INVALID');
 for(const x of p){if(!/^[A-Za-z0-9_-]{1,120}$/.test(String(x?.productId||''))||
  !['shared','variant'].includes(x?.scope)||!Number.isSafeInteger(x?.qty)||x.qty<1||x.qty>9990||
  (x.scope==='variant'&&!/^[A-Za-z0-9_-]{1,120}$/.test(String(x.variantId||''))))fault('RESERVATION_PLAN_INVALID')}
 return [...new Set(p.map(x=>x.productId))];
}
const dueISO=d=>new Date(d).toISOString();
/** Transaction-safe one-time payment report: NOT proof of payment.
 * Extends the original 60-minute deadline by 30 minutes once, never indefinitely.
 */
export async function reportPayment({db,uid,orderId,now=Date.now(),serverTimestamp}){
 if(typeof uid!=='string'||!uid||!ID.test(orderId))fault('REPORT_INVALID');
 if(typeof serverTimestamp!=='function')fault('SERVER_CONFIG_INVALID');
 const orderRef=db.collection('orders').doc(orderId),reserveRef=db.collection('checkout_stock_reservations').doc(orderId);
 return db.runTransaction(async tx=>{
  const [orderSnap,resSnap]=await Promise.all([tx.get(orderRef),tx.get(reserveRef)]);
  if(!orderSnap.exists||orderSnap.data()?.uid!==uid)fault('ORDER_NOT_FOUND');
  if(!resSnap.exists||resSnap.data()?.uid!==uid||resSnap.data()?.orderId!==orderId)fault('RESERVATION_MISSING');
  const order=orderSnap.data(),res=resSnap.data();
  if(res.state!=='reserved'||order.status!=='checkout_created')fault('ORDER_NOT_PENDING');
  const initial=millis(res.expiresAt);
  if(!Number.isFinite(initial)||initial<=now)fault('RESERVATION_EXPIRED');
  if(res.paymentReportedAt!=null||order.paymentReportedAt!=null)fault('PAYMENT_ALREADY_REPORTED');
  const next=initial+REPORT_GRACE_MINUTES*60_000;
  const stamp=serverTimestamp();
  tx.update(reserveRef,{expiresAt:new Date(next),paymentReportedAt:stamp,updatedAt:stamp});
  tx.update(orderRef,{paymentDueAt:new Date(next),paymentReportedAt:stamp,updatedAt:stamp});
  return {orderId,paymentDueAt:dueISO(next),reported:true,paymentVerified:false};
 });
}
/** Expire only an unpaid/unconfirmed order with a live reserved allocation.
 * Conflict with admin confirmation/cancellation is resolved by Firestore transaction retries.
 */
export async function expireOrder({db,orderId,now=Date.now(),serverTimestamp}){
 if(!ID.test(orderId)||typeof serverTimestamp!=='function')fault('EXPIRY_INPUT_INVALID');
 const orderRef=db.collection('orders').doc(orderId),reserveRef=db.collection('checkout_stock_reservations').doc(orderId);
 return db.runTransaction(async tx=>{
  const [orderSnap,resSnap]=await Promise.all([tx.get(orderRef),tx.get(reserveRef)]);
  if(!resSnap.exists)return {orderId,result:'legacy_missing_reservation'};
  const res=resSnap.data();
  if(res.state!=='reserved')return {orderId,result:'already_handled'};
  const expires=millis(res.expiresAt);
  if(!Number.isFinite(expires))return {orderId,result:'legacy_no_deadline'};
  if(now<expires)return {orderId,result:'not_due'};
  if(!orderSnap.exists||orderSnap.data()?.orderId!==orderId||orderSnap.data()?.uid!==res.uid)
   fault('ORDER_RESERVATION_MISMATCH');
  // Never unreserve already-paid or otherwise confirmed orders.
  if(orderSnap.data().status!=='checkout_created')return {orderId,result:'status_requires_review'};
  const productIds=validPlan(res.items);
  const productRefs=productIds.map(id=>({id,ref:db.collection('cms_products').doc(id)}));
  const productSnaps=await Promise.all(productRefs.map(x=>tx.get(x.ref)));
  const products=new Map(productRefs.map((x,i)=>[x.id,productSnaps[i].exists?productSnaps[i].data():null]));
  const stock=stockPatches(products,res.items,+1);
  const stamp=serverTimestamp();
  for(const [id,patch] of stock)tx.set(db.collection('cms_products').doc(id),patch,{merge:true});
  tx.update(reserveRef,{state:'released',releaseReason:'expired',releasedAt:stamp,updatedAt:stamp});
  tx.update(orderRef,{status:'expired',updatedAt:stamp});
  return {orderId,result:'expired',releasedItems:res.items.reduce((s,x)=>s+x.qty,0)};
 });
}
/** Requires composite index state ASC, expiresAt ASC. Bounded batch. */
export async function processExpiredReservations({db,serverTimestamp,now=Date.now(),limit=40}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)fault('EXPIRY_BATCH_INVALID');
 const query=await db.collection('checkout_stock_reservations')
  .where('state','==','reserved').where('expiresAt','<=',new Date(now))
  .orderBy('expiresAt','asc').limit(limit).get();
 const output={scanned:query.docs.length,expired:0,skipped:0,errors:[]};
 for(const doc of query.docs){
  try{const r=await expireOrder({db,orderId:doc.id,now,serverTimestamp});
   if(r.result==='expired')output.expired++;else output.skipped++;
  }catch(e){output.errors.push({orderId:doc.id,code:String(e.code||'EXPIRY_FAILED')})}
 }
 return output;
}
