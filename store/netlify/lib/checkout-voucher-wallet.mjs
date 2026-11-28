/** ImamStore R10 — saved vouchers, separate from checkout redemption.
 * Saved state only organizes a customer's Voucher Saya; it NEVER grants a discount.
 * Existing checkout 5-use ledger is the only authority for usage/reservations.
 * Legacy R9 claimed data is read and migrated to saved on the next write.
 */
import {createHash} from 'node:crypto';
import {CHECKOUT_VOUCHERS} from './checkout-vouchers.mjs';

const CODE=/^[A-Z0-9_]{1,40}$/;
export class VoucherWalletError extends Error {
 constructor(code,status=400){super(code);this.name='VoucherWalletError';this.code=code;this.status=status}
}
function requireUid(uid){
 if(typeof uid!=='string'||uid.length<1||uid.length>256)throw new VoucherWalletError('AUTH_REQUIRED',401);
}
function voucherPolicy(code){
 if(typeof code!=='string'||!CODE.test(code))throw new VoucherWalletError('VOUCHER_UNAVAILABLE');
 const p=CHECKOUT_VOUCHERS.find(v=>v.code===code&&v.maxUsesPerAccount===5);
 if(!p)throw new VoucherWalletError('VOUCHER_UNAVAILABLE');
 return p;
}
function hasExpired(policy,now){
 const end=Date.parse(policy.expiresOn+'T23:59:59.999+07:00');
 return !Number.isFinite(end)||now>end;
}
function walletRef(db,uid){
 return db.collection('checkout_voucher_wallet').doc(createHash('sha256').update('imamstore-wallet-v1\0'+uid).digest('hex'));
}
function readSaved(snapshot,uid){
 if(!snapshot.exists)return {};
 const data=snapshot.data();
 if(!data||data.uid!==uid)throw new VoucherWalletError('WALLET_UNAVAILABLE',503);
 // Migrate R9's real claims only; prior purchases must NOT imply a save.
 const flags=data.saved??data.claimed;
 if(!flags||typeof flags!=='object'||Array.isArray(flags))throw new VoucherWalletError('WALLET_UNAVAILABLE',503);
 if(Object.entries(flags).some(([k,v])=>!CODE.test(k)||typeof v!=='boolean'))
  throw new VoucherWalletError('WALLET_UNAVAILABLE',503);
 return flags;
}
export async function readVoucherWallet({db,uid}){
 requireUid(uid);
 if(!db?.collection)throw new VoucherWalletError('WALLET_UNAVAILABLE',503);
 const saved=readSaved(await walletRef(db,uid).get(),uid);
 return Object.fromEntries(CHECKOUT_VOUCHERS.filter(v=>v.maxUsesPerAccount===5).map(v=>[v.code,saved[v.code]===true]));
}
export async function setVoucherSavedForUser({db,uid,code,saved,now=Date.now()}){
 requireUid(uid);
 if(!db?.runTransaction)throw new VoucherWalletError('WALLET_UNAVAILABLE',503);
 if(typeof saved!=='boolean')throw new VoucherWalletError('REQUEST_SHAPE_INVALID');
 const policy=voucherPolicy(code);
 if(saved&&hasExpired(policy,now))throw new VoucherWalletError('VOUCHER_EXPIRED',409);
 const ref=walletRef(db,uid);
 return db.runTransaction(async tx=>{
  const current=readSaved(await tx.get(ref),uid);
  const alreadySaved=current[code]===true;
  if(alreadySaved===saved)return {code,saved,unchanged:true};
  // Full rewrite migrates legacy `claimed` away. One wallet document, no second ledger.
  const updated={...current,[code]:saved};
  tx.set(ref,{uid,saved:updated,updatedAt:new Date(now).toISOString()});
  return {code,saved,unchanged:false};
 });
}
export function attachSavedToUsage(vouchers,saved){
 return Object.fromEntries(Object.entries(vouchers||{}).map(([code,item])=>[
  code,{...item,saved:saved?.[code]===true}
 ]));
}
