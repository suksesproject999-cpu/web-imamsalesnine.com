/* ImamStore Variant Identity R1 — satu resolver untuk katalog, transaksi dan legacy cart.
 * variantId permanen dibuat oleh CMS, bukan oleh browser pembeli. */
(()=>{'use strict';
 const norm=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('id-ID');
 const label=value=>typeof value==='string'?value:String(value?.nama??value?.name??value?.label??value?.warna??'');
 const entries=p=>Array.isArray(p?.varian)?p.varian:[];
 const id=value=>typeof value==='object'&&value!==null?String(value.variantId||'').trim():'';
 const aliases=value=>typeof value==='object'&&Array.isArray(value?.legacyNames)?value.legacyNames:[];
 const stable=(p,v)=>id(v)||'legacy-'+encodeURIComponent(norm(label(v)));
 function resolve(p,selected){
  const values=entries(p);
  if(!values.length)return {variantId:'default',name:'Default',record:null,key:String(p?.id)+'|Default'};
  const selector=selected&&typeof selected==='object'?selected:{};
  const requestedId=String(selector.variantId||'').trim();
  const requestedSku=String(selector.sku||'').trim();
  const text=typeof selected==='string'?selected:String(selector.varian??selector.name??'');
  let matches=[];
  if(requestedId){matches=values.filter(v=>stable(p,v)===requestedId);if(matches.length!==1)return null;}
  else if(requestedSku){matches=values.filter(v=>typeof v==='object'&&norm(v.sku)===norm(requestedSku));if(matches.length!==1)return null;}
  else {
   const target=norm(text);
   if(!target)return null;
   matches=values.filter(v=>norm(label(v))===target);
   if(!matches.length)matches=values.filter(v=>aliases(v).some(alias=>norm(alias)===target));
   if(matches.length!==1)return null;
  }
  const record=matches[0],variantId=stable(p,record);
  return {variantId,name:String(label(record)).trim(),record,key:String(p.id)+'|v:'+variantId};
 }
 function forLine(p,line){
  if(!line||!p)return null;
  // Identitas permanen lebih kuat daripada label snapshot dan tetap valid setelah rename.
  const fromId=line.variantId?resolve(p,{variantId:line.variantId}):null;
  if(fromId)return fromId;
  const fromName=resolve(p,{varian:line.varian});
  return fromName||null;
 }
 function cartKey(p,selected){return resolve(p,selected)?.key||''}
 // Shared stock contract for Add to Cart, Buy Now, cart editing and checkout UI.
 // A variant with its own stock uses that SKU; otherwise variants share product stock.
 function parseStock(value){
  if(value==null||value==='')return null;
  const raw=typeof value==='object'?(value.jumlah??value.qty??value.stock??value.quantity):value;
  if(raw==null||raw==='')return null;
  if(typeof raw!=='number'&&(typeof raw!=='string'||!/^(0|[1-9]\d*)$/.test(raw.trim())))return null;
  const quantity=Number(raw);
  return Number.isSafeInteger(quantity)&&quantity>=0?quantity:null;
 }
 function stockInfo(p,selected,lines=[],excludeKey=''){
  const match=resolve(p,selected);
  if(!match)return {stock:null,inCart:0,remaining:0,source:'unknown',known:false};
  const specific=match.record&&(match.record.stok??match.record.stock);
  const variantOwn=specific!==null&&specific!==undefined&&specific!=='';
  const raw=variantOwn?specific:(p?.stok??p?.stock);
  const stock=parseStock(raw);
  const scope=variantOwn?'variant':'product';
  let inCart=0;
  for(const line of Array.isArray(lines)?lines:[]){
   if(String(line?.id)!==String(p?.id)||String(line.key)===String(excludeKey)&&excludeKey)continue;
   const linked=forLine(p,line);
   if(!linked)continue;
   if(scope==='variant'&&linked.variantId!==match.variantId)continue;
   if(scope==='product'){
    const otherOwn=linked.record&&(linked.record.stok??linked.record.stock);
    if(otherOwn!==undefined&&otherOwn!==null&&otherOwn!=='')continue;
   }
   const n=Number(line.qty);
   if(!Number.isSafeInteger(n)||n<0)return {stock,inCart,remaining:0,source:scope,known:false};
   inCart+=n;
  }
  return {stock,inCart,remaining:stock===null?0:Math.max(0,stock-inCart),source:scope,known:stock!==null};
 }
 window.imamstoreVariantIdentity=Object.freeze({norm,label,entries,stable,resolve,forLine,cartKey,stockInfo,version:'variant-id-r2-stock'});
})();
