/** ImamStore Voucher Wallet R9 — claim once, spend within existing five-use ledger.
 * This wallet is marketing ownership only. NEVER use it to authorize discount.
 * checkout-order-service's usageForVoucher and transaction remain authoritative.
 */
import {createHash} from 'node:crypto';
import {CHECKOUT_VOUCHERS} from './checkout-vouchers.mjs';

const CODE=/^[A-Z0-9_]{1,40}$/;
export class VoucherWalletError extends Error {
 constructor(code,status=400){super(code);this.name='VoucherWalletError';this.code=code;this.status=status}
}
function trusted(uid){if(typeof uid!=='string'||uid.length<1||uid.length>256)throw new VoucherWalletError('AUTH_REQUIRED',401)}
function policyFor(code){
 if(typeof code!=='string'||!CODE.test(code))throw new VoucherWalletError('VOUCHER_UNAVAILABLE');
 const p=CHECKOUT_VOUCHERS.find(x=>x.code===code&&x.maxUsesPerAccount===5);
 if(!p)throw new VoucherWalletError('VOUCHER_UNAVAILABLE');
 return p;
}
function expired(p,now){const end=Date.parse(p.expiresOn+'T23:59:59.999+07:00');return !Number.isFinite(end)||now>end}
function walletRef(db,uid){return db.collection('checkout_voucher_wallet').doc(createHash('sha256').update('imamstore-wallet-v1\0'+uid).digest('hex'))}
function normalize(doc,uid){
 if(!doc.exists)return {};
 const data=doc.data();
 if(!data||data.uid!==uid||!data.claimed||typeof data.claimed!=='object'||Array.isArray(data.claimed))
  throw new VoucherWalletError('WALLET_UNAVAILABLE',503);
 return data.claimed;
}
export async function readVoucherWallet({db,uid}){
 trusted(uid);
 if(!db?.collection)throw new VoucherWalletError('WALLET_UNAVAILABLE',503);
 const claimed=normalize(await walletRef(db,uid).get(),uid);
 return Object.fromEntries(CHECKOUT_VOUCHERS.filter(p=>p.maxUsesPerAccount===5).map(p=>[p.code,claimed[p.code]===true]));
}
export async function claimVoucherForUser({db,uid,code,now=Date.now()}){
 trusted(uid);
 if(!db?.runTransaction)throw new VoucherWalletError('WALLET_UNAVAILABLE',503);
 const policy=policyFor(code);
 if(expired(policy,now))throw new VoucherWalletError('VOUCHER_EXPIRED',409);
 const ref=walletRef(db,uid);
 return db.runTransaction(async tx=>{
  const snapshot=await tx.get(ref);
  const existing=normalize(snapshot,uid);
  if(existing[code]===true)return {code,claimed:true,alreadyClaimed:true};
  // merge:true preserves other voucher claims, and transaction serializes concurrent updates.
  tx.set(ref,{uid,claimed:{[code]:true},updatedAt:new Date(now).toISOString()},{merge:true});
  return {code,claimed:true,alreadyClaimed:false};
 });
}
export function attachWalletToUsage(vouchers,claimed){
 const output={};
 for(const [code,item] of Object.entries(vouchers||{})){
  const prior=Number(item?.used||0)+Number(item?.reserved||0)>0;
  output[code]={...item,claimed:claimed?.[code]===true||prior};
 }
 return output;
}
