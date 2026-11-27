/** ImamStore R2 — scheduled automatic release of unpaid reservations.
 * Do NOT use Firestore TTL: deleting a document cannot restore stock.
 * Netlify Scheduled Functions run only after deploy; the gate is OFF by default.
 */
import {FieldValue} from 'firebase-admin/firestore';
import {getPresenceFirebase} from '../lib/firebase-admin.mjs';
import {processExpiredReservations} from '../lib/checkout-expiry.mjs';
export const config={schedule:'*/5 * * * *'};
export default async function handler(){
 if(process.env.CONTEXT!=='production'||process.env.CHECKOUT_STOCK_EXPIRY_ENABLED!=='true')
  return new Response(JSON.stringify({enabled:false}),{status:200});
 if(process.env.CHECKOUT_SECURITY_WRITE_ENABLED!=='true')
  throw new Error('STOCK_EXPIRY_STOP: secure order creation is not enabled');
 const {db}=getPresenceFirebase();
 const result=await processExpiredReservations({db,serverTimestamp:()=>FieldValue.serverTimestamp(),limit:40});
 if(result.errors.length){
  console.error('[stock-expiry] orders require reconciliation',JSON.stringify(result.errors));
  throw new Error('STOCK_EXPIRY_PARTIAL_FAILURE');
 }
 console.log('[stock-expiry]',JSON.stringify({scanned:result.scanned,expired:result.expired,skipped:result.skipped}));
 return new Response(JSON.stringify(result),{status:200});
}
