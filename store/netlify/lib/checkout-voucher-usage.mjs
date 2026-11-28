/** ImamStore account voucher usage v5 — server only.
 * A reservation holds one of five slots; cancelled/expired orders release it.
 * Reads authoritative orders, including legacy claim orderId and historical orders.
 * Call inside the order-create Firestore transaction with readOrder=tx.get;
 * all new claims update the same UID/code document to serialize concurrent checkout.
 */
const CANCELLED=new Set(['cancelled','canceled','dibatalkan','batal','rejected','ditolak','expired','kedaluwarsa']);
const FINISHED=new Set(['completed','complete','paid','confirmed','delivered','selesai','lunas']);
const ORDER_ID=/^[A-Za-z0-9_-]{1,180}$/; // Includes historical Firestore order document IDs.
export function usageState(order){
 const status=String(order?.status||'').trim().toLowerCase();
 return CANCELLED.has(status)?'cancelled':FINISHED.has(status)?'used':'reserved';
}
export function claimIds(ledger,uid,code){
 if(!ledger?.exists)return [];
 const d=ledger.data();
 if(!d||d.uid!==uid||d.code!==code)throw Object.assign(new Error('VOUCHER_USAGE_UNVERIFIED'),{code:'VOUCHER_USAGE_UNVERIFIED'});
 const ids=[...(Array.isArray(d.orderIds)?d.orderIds:[]),...(typeof d.orderId==='string'?[d.orderId]:[])];
 if(!ids.length||ids.length>201||ids.some(id=>!ORDER_ID.test(id)))
  throw Object.assign(new Error('VOUCHER_USAGE_UNVERIFIED'),{code:'VOUCHER_USAGE_UNVERIFIED'});
 return [...new Set(ids)];
}
export async function usageForVoucher({db,uid,code,maxUses,ledger,history,ledgerReady=false,readOrder}){
 if(!Number.isSafeInteger(maxUses)||maxUses<1||maxUses>100)throw Object.assign(new Error('TRUSTED_VOUCHERS_INVALID'),{code:'TRUSTED_VOUCHERS_INVALID'});
 if(history===null&&!ledgerReady)throw Object.assign(new Error('VOUCHER_USAGE_UNVERIFIED'),{code:'VOUCHER_USAGE_UNVERIFIED'});
 const claimOrderIds=claimIds(ledger,uid,code);
 const historical=history?.get(code)?.orders||[];
 if(!Array.isArray(historical)||historical.some(x=>typeof x!=='string'))
  throw Object.assign(new Error('VOUCHER_USAGE_UNVERIFIED'),{code:'VOUCHER_USAGE_UNVERIFIED'});
 const allIds=[...new Set([...historical,...claimOrderIds])];
 // A corrupt/unmigrated ledger cannot silently reset the buyer's usage.
 if(allIds.length>200)throw Object.assign(new Error('VOUCHER_HISTORY_TOO_LARGE'),{code:'VOUCHER_HISTORY_TOO_LARGE'});
 const states=new Map();
 for(const id of allIds){
  if(!ORDER_ID.test(id))throw Object.assign(new Error('VOUCHER_USAGE_UNVERIFIED'),{code:'VOUCHER_USAGE_UNVERIFIED'});
  const ref=db.collection('orders').doc(id);
  const doc=await readOrder(ref);
  if(!doc?.exists||doc.data()?.uid!==uid)
   throw Object.assign(new Error('VOUCHER_USAGE_UNVERIFIED'),{code:'VOUCHER_USAGE_UNVERIFIED'});
  states.set(id,usageState(doc.data()));
 }
 let used=0,reserved=0;
 for(const state of states.values()){
  if(state==='used')used++;
  else if(state==='reserved')reserved++;
 }
 const remaining=Math.max(0,maxUses-used-reserved);
 return {code,limit:maxUses,used,reserved,remaining,
  status:remaining>0?'available':reserved>0?'reserved':'used',
  // Prune cancelled reservations on every new claim; retain used+reserved only.
  liveLedgerIds:claimOrderIds.filter(id=>states.get(id)!=='cancelled')};
}
