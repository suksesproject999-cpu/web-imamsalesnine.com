/**
 * ImamStore Atomic Inventory R1 — shared algorithm for server checkout.
 * Firestore CMS `stok` is the remaining SALEABLE quantity (including pending orders deducted).
 * Product-level stock is shared by variants with no own numeric `stok`.
 * Stock of explicit variants is tracked independently.
 */
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const ID=/^[A-Za-z0-9_-]{1,120}$/;
function fail(code){const e=new Error(code);e.code=code;throw e}
function numberOfStock(stock){
 const raw=(stock!==null&&typeof stock==='object'&&!Array.isArray(stock))?
  (stock.jumlah??stock.qty??stock.stock??stock.quantity):stock;
 if(typeof raw==='number'&&Number.isSafeInteger(raw)&&raw>=0)return raw;
 if(typeof raw==='string'&&/^(0|[1-9]\d*)$/.test(raw.trim()))return Number(raw);
 fail('STOCK_UNVERIFIED');
}
function adjustedStock(stock,newQty){
 if(!Number.isSafeInteger(newQty)||newQty<0)fail('STOCK_INSUFFICIENT');
 if(stock!==null&&typeof stock==='object'&&!Array.isArray(stock)){
  const next={...stock};
  const key=['jumlah','qty','stock','quantity'].find(k=>next[k]!==undefined&&next[k]!==null);
  if(!key)fail('STOCK_UNVERIFIED');
  next[key]=newQty;
  if(typeof next.status==='string'){
   if(newQty===0)next.status='Habis';
   else if(next.status==='Habis')next.status='Ready';
  }
  return next;
 }
 return newQty;
}
export function allocationPlan(quoteItems,products){
 const grouped=new Map();
 for(const line of quoteItems){
  const productId=String(line.productId||'');
  if(!ID.test(productId)||!Number.isSafeInteger(line.qty)||line.qty<1)fail('STOCK_PLAN_INVALID');
  const p=products.get(productId);if(!p)fail('STOCK_PLAN_INVALID');
  let record=null;
  if(Array.isArray(p.varian)&&p.varian.length){
   record=p.varian.find(v=>v&&typeof v==='object'&&v.variantId===line.variantId);
   if(!record)fail('STOCK_PLAN_INVALID');
  }
  const ownStock=record&&(record.stok??record.stock)!=null&&(record.stok??record.stock)!=='';
  const scope=ownStock?'variant':'shared';
  const k=productId+'|'+(scope==='shared'?'shared':'v:'+line.variantId);
  const prev=grouped.get(k);
  if(prev)prev.qty+=line.qty;
  else grouped.set(k,{productId,variantId:scope==='variant'?line.variantId:null,scope,qty:line.qty});
 }
 return [...grouped.values()];
}
function editOne(p,part,sign){
 const next={...p};
 if(part.scope==='shared'){
  const current=next.stok??next.stock,after=numberOfStock(current)+sign*part.qty;
  next.stok=adjustedStock(current,after);
 }else{
  if(!Array.isArray(next.varian))fail('STOCK_PLAN_INVALID');
  const list=next.varian.map(v=>typeof v==='object'&&v!==null?{...v}:v);
  const idx=list.findIndex(v=>v&&typeof v==='object'&&v.variantId===part.variantId);
  if(idx<0)fail('STOCK_PLAN_INVALID');
  const current=list[idx].stok??list[idx].stock;
  if(current===undefined||current===null)fail('STOCK_PLAN_INVALID');
  const after=numberOfStock(current)+sign*part.qty;
  list[idx].stok=adjustedStock(current,after);
  next.varian=list;
 }
 return next;
}
export function stockPatches(products,parts,sign=-1){
 if(sign!==-1&&sign!==1)fail('STOCK_PLAN_INVALID');
 const revised=new Map();
 for(const part of parts){
  const p=revised.get(part.productId)||products.get(part.productId);
  if(!p)fail('STOCK_UNVERIFIED');
  revised.set(part.productId,editOne(p,part,sign));
 }
 const changes=new Map();
 for(const [id,p] of revised){
  const original=products.get(id);
  const patch={id};
  if(p.stok!==original.stok)patch.stok=p.stok;
  if(p.varian!==original.varian)patch.varian=p.varian;
  changes.set(id,patch);
 }
 return changes;
}
