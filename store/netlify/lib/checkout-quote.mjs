/**
 * ImamStore Checkout Security Pro — Tahap 1.2, pure SERVER-side pricing engine.
 * No Firebase app, HTTP endpoint, order write, timer, or browser global.
 * Call ONLY with canonical, server-loaded catalog and trusted voucher policy.
 * request shape: {items:[{productId,variantId,qty}],voucherCodes?:{product,shipping}}
 * Never accept client prices, names, discounts, customer UID, or order status.
 *
 * Important: this engine verifies a stock snapshot, NOT an atomic stock reserve.
 * A later transaction must re-read/recheck stock before a production order is made.
 */
export const CHECKOUT_QUOTE_VERSION = 'server-quote-r1';
export const MAX_CHECKOUT_LINES = 10; // Matches admin sales ledger's orderQuantities() limit.
export const MAX_LINE_QUANTITY = 999;
export const MAX_UNIT_PRICE = 1_000_000_000;
const MAX_VARIANTS = 60;
const OWN = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const ID = /^[A-Za-z0-9_-]{1,120}$/;
const VARIANT_ID = /^[A-Za-z0-9_-]{1,120}$/;
const VOUCHER_CODE = /^[A-Z0-9_-]{1,80}$/;

export class CheckoutQuoteError extends Error {
  constructor(code, detail='') {
    super(code);
    this.name = 'CheckoutQuoteError';
    this.code = code;
    // Safe, intentionally excludes sensitive customer/order details.
    this.detail = detail;
  }
}
function fail(code, detail='') { throw new CheckoutQuoteError(code, detail); }
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function keys(value, allowed, required=[]) {
  if (!plain(value) || Object.keys(value).some(k=>!allowed.includes(k)) || required.some(k=>!OWN(value,k))) {
    fail('REQUEST_SHAPE_INVALID');
  }
}
function id(value, code='PRODUCT_ID_INVALID') {
  if (typeof value !== 'string' || !ID.test(value)) fail(code);
  return value;
}
/** Converts only documented CMS Rupiah fields; ambiguous/negative/decimal data fail closed. */
export function rupiah(value, {optional=false}={}) {
  if ((value === null || value === undefined || value === '') && optional) return 0;
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value>=0 && value<=MAX_UNIT_PRICE) return value;
    fail('CATALOG_PRICE_INVALID');
  }
  if (typeof value !== 'string') fail('CATALOG_PRICE_INVALID');
  const raw = value.trim().replace(/^Rp\s*/i,'').trim();
  if (!raw && optional) return 0;
  if (!/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(raw)) fail('CATALOG_PRICE_INVALID');
  const number=Number(raw.replace(/[.,]/g,''));
  if (!Number.isSafeInteger(number) || number<0 || number>MAX_UNIT_PRICE) fail('CATALOG_PRICE_INVALID');
  return number;
}
function amount(value) { return rupiah(value, {optional:true}); }
function productStatus(p) {
  if (!p || !plain(p) || p.active===false || p.aktif===false || p.deleted===true ||
      p.status==='nonaktif') fail('PRODUCT_UNAVAILABLE');
}
function dateTime(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const v=raw.trim();
  // Admin-V5 writes toISOString() (explicit Z). For old naive dates interpret WIB;
  // Node's default UTC differs from browsers in Jakarta.
  let date=v;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(v)) date=v+'+07:00';
  else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(v)) return null;
  const t=Date.parse(date); return Number.isFinite(t)?t:null;
}
function nowTime(now) {
  const time=now instanceof Date?now.getTime():now;
  if (!Number.isSafeInteger(time) || time<=0) fail('SERVER_TIME_INVALID');
  return time;
}
function flashActive(p, now) {
  const f=p?.flashSale;
  if (f?.enabled !== true) return false;
  const start=dateTime(f.startAt), end=dateTime(f.endAt);
  if (start===null || end===null || end<=start || now<start || now>=end) return false;
  return amount(f.price)>0;
}
function baseQuote(p, now) {
  const normal=amount(p?.harga?.normal??p?.harga);
  const promo=amount(p?.harga?.promo??p?.hargaPromo);
  const regular=promo>0 && (!normal || promo<normal)?promo:normal;
  const campaign=flashActive(p, now);
  const useFlash=campaign && amount(p.flashSale.price)<regular;
  const price=useFlash?amount(p.flashSale.price):regular;
  if (!Number.isSafeInteger(price) || price<0) fail('PRICE_UNAVAILABLE');
  return {normal:Math.max(normal,price), regular, price, flash:useFlash, campaign};
}
function label(v) {
  return typeof v==='string'?v:String(v?.nama??v?.name??v?.label??v?.warna??'');
}
function variantFor(p, requested) {
  if (!Array.isArray(p?.varian) || !p.varian.length) {
    if (requested!==undefined && requested!==null && requested!=='' && requested!=='default') fail('VARIANT_NOT_FOUND');
    return {variantId:'default',name:'Default',record:null};
  }
  if (p.varian.length>MAX_VARIANTS) fail('CATALOG_VARIANTS_INVALID');
  // An old string-only variant is not a permanent identity. Require CMS Publish migration.
  if (typeof requested!=='string' || !VARIANT_ID.test(requested)) fail('VARIANT_ID_REQUIRED');
  const matches=p.varian.filter(v=>plain(v) && v.variantId===requested);
  if (matches.length!==1) fail('VARIANT_NOT_FOUND');
  const record=matches[0];
  const name=label(record).trim();
  if (!name || name.length>150) fail('CATALOG_VARIANTS_INVALID');
  return {variantId:requested,name,record};
}
function quoteVariant(p, variant, now) {
  const base=baseQuote(p,now), v=variant.record;
  if (!v) return base;
  let normal=base.normal, regular=base.price;
  const explicitNormal=amount(v?.harga?.normal??v.hargaNormal??v.normal??v.priceNormal);
  const flat=amount(v?.price??v.hargaJual??v.harga_jual??(typeof v.harga!=='object'?v.harga:null));
  const promo=amount(v?.harga?.promo??v.hargaPromo??v.promo??v.harga_diskon);
  const explicit=Boolean(explicitNormal||flat||promo);
  if (explicit) {
    normal=explicitNormal||flat||base.normal||promo;
    regular=promo>0 && promo<normal?promo:flat||explicitNormal||promo;
    if (flat && normal<flat) normal=flat;
  }
  const variantFlash=amount(v?.flashSale?.price??v?.harga?.flash??v?.flashPrice);
  const flashPrice=base.campaign?(variantFlash || (!explicit?amount(p.flashSale.price):0)):0;
  const flash=flashPrice>0 && flashPrice<regular;
  const price=flash?flashPrice:regular;
  if (!Number.isSafeInteger(price) || price<=0) fail('PRICE_UNAVAILABLE');
  return {normal:Math.max(normal,price),regular,price,flash,campaign:base.campaign};
}
function stockValue(v) {
  if (v==null || v==='') return null;
  const raw=plain(v)?(v.jumlah??v.qty??v.stock??v.quantity):v;
  if (raw==null || raw==='') return null;
  if (typeof raw!=='number' && (typeof raw!=='string'||!/^(0|[1-9]\d*)$/.test(raw.trim()))) fail('CATALOG_STOCK_INVALID');
  const n=Number(raw);
  if (!Number.isSafeInteger(n)||n<0) fail('CATALOG_STOCK_INVALID');
  return n;
}
function effectiveStock(p,variant) {
  const specific=variant.record?.stok??variant.record?.stock;
  const specificQty=stockValue(specific);
  return specificQty===null?{quantity:stockValue(p.stok??p.stock),source:'product'}:
    {quantity:specificQty,source:'variant'};
}
function getProduct(products, productId) {
  if (products instanceof Map) return products.get(productId);
  if (Array.isArray(products)) return products.find(p=>String(p?.id)===productId);
  if (plain(products)) return OWN(products,productId)?products[productId]:undefined;
  fail('TRUSTED_CATALOG_REQUIRED');
}
function voucherMap(vouchers) {
  if (!Array.isArray(vouchers)) fail('TRUSTED_VOUCHERS_REQUIRED');
  const m=new Map();
  for(const v of vouchers) {
    if (!plain(v) || typeof v.code!=='string' || !VOUCHER_CODE.test(v.code) || m.has(v.code)) fail('TRUSTED_VOUCHERS_INVALID');
    m.set(v.code,v);
  }
  return m;
}
function expiresAtWIB(v) {
  const s=v?.expiresOn;
  if (typeof s!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) fail('TRUSTED_VOUCHERS_INVALID');
  const end=Date.parse(s+'T23:59:59.999+07:00');
  if (!Number.isFinite(end)) fail('TRUSTED_VOUCHERS_INVALID');
  return end;
}
function voucherDiscount(v,subtotal) {
  const rate=v.discount;
  if (!Number.isSafeInteger(rate) || rate<0) fail('TRUSTED_VOUCHERS_INVALID');
  let value;
  if (v.type==='product_percent') { if (rate>100) fail('TRUSTED_VOUCHERS_INVALID'); value=Math.floor(subtotal*rate/100); }
  else if (v.type==='product_fixed' || v.type==='shipping_fixed') value=rate;
  else fail('TRUSTED_VOUCHERS_INVALID');
  const cap=v.maxDiscount;
  if (cap!=null) {
    if (!Number.isSafeInteger(cap)||cap<0) fail('TRUSTED_VOUCHERS_INVALID');
    value=Math.min(value,cap);
  }
  return Math.max(0,Math.min(subtotal,value));
}
function applyVoucher(code,slot,subtotal,{map,now,entitlements}) {
  if (code===undefined || code===null || code==='') return null;
  if (typeof code!=='string' || !VOUCHER_CODE.test(code)) fail('VOUCHER_CODE_INVALID');
  const v=map.get(code);
  if (!v || (slot==='shipping' ? v.type!=='shipping_fixed' : v.type==='shipping_fixed')) fail('VOUCHER_UNAVAILABLE');
  if (!Number.isSafeInteger(v.minimumSubtotal)||v.minimumSubtotal<0) fail('TRUSTED_VOUCHERS_INVALID');
  if (subtotal<v.minimumSubtotal) fail('VOUCHER_MINIMUM_NOT_MET');
  if (now>expiresAtWIB(v)) fail('VOUCHER_EXPIRED');
  if (v.maxUsesPerAccount!=null) {
    if (!Number.isSafeInteger(v.maxUsesPerAccount)||v.maxUsesPerAccount<1) fail('TRUSTED_VOUCHERS_INVALID');
    // This entitlement MUST come from a server-side transaction, NEVER request body.
    const eligibility=entitlements instanceof Map?entitlements.get(code):undefined;
    if (eligibility === 'used') fail('VOUCHER_ALREADY_USED');
    if (eligibility === 'reserved') fail('VOUCHER_RESERVED');
    if (eligibility === 'unverified') fail('VOUCHER_LEDGER_NOT_READY');
    if (eligibility !== true) fail('VOUCHER_USAGE_UNVERIFIED');
  }
  if (typeof v.name!=='string' || !v.name.trim() || v.name.length>180) fail('TRUSTED_VOUCHERS_INVALID');
  return {voucher:v,discount:voucherDiscount(v,subtotal)};
}
/**
 * @param {object} request Strict public quote input: items and voucherCodes only.
 * @param {object} trusted Trusted backend dependencies: products, vouchers,
 *   now=Date.now(), voucherEntitlements(Map), stockPolicy='strict'.
 */
export function quoteCheckout(request, trusted) {
  keys(request,['items','voucherCodes'],['items']);
  if (!plain(trusted)) fail('TRUSTED_CONTEXT_REQUIRED');
  const {products,vouchers,now=Date.now(),voucherEntitlements,stockPolicy='strict'}=trusted;
  const time=nowTime(now);
  if (stockPolicy!=='strict' && stockPolicy!=='allow-untracked') fail('STOCK_POLICY_INVALID');
  if (!Array.isArray(request.items) || !request.items.length || request.items.length>MAX_CHECKOUT_LINES) fail('LINE_COUNT_INVALID');
  if (request.voucherCodes!==undefined) keys(request.voucherCodes,['product','shipping']);
  const selected=request.voucherCodes||{};
  const used=new Set(),stockAllocated=new Map(),items=[],orderItems=[],warnings=[];
  let subtotal=0,totalItem=0;
  for(const line of request.items) {
    keys(line,['productId','variantId','qty'],['productId','qty']);
    const productId=id(line.productId);
    const qty=line.qty;
    if (!Number.isSafeInteger(qty)||qty<1||qty>MAX_LINE_QUANTITY) fail('LINE_QUANTITY_INVALID');
    const p=getProduct(products,productId);
    productStatus(p);
    if (p.id!==undefined && String(p.id)!==productId) fail('CATALOG_ID_CONFLICT');
    const variant=variantFor(p,line.variantId);
    const key=productId+'\0'+variant.variantId;
    if (used.has(key)) fail('DUPLICATE_LINE');
    used.add(key);
    const price=quoteVariant(p,variant,time);
    const inventory=effectiveStock(p,variant),available=inventory.quantity;
    const scope=productId+'|'+(inventory.source==='variant'?variant.variantId:'shared');
    const allocated=(stockAllocated.get(scope)||0)+qty;
    stockAllocated.set(scope,allocated);
    if (available===null) {
      if (stockPolicy==='strict') fail('STOCK_UNVERIFIED');
      warnings.push('STOCK_UNVERIFIED');
    } else if (available<allocated) fail('STOCK_INSUFFICIENT');
    // Names are derived exclusively from trusted catalog.
    const name=String(p.nama??p.name??p.title??'').trim();
    if (!name || name.length>200) fail('CATALOG_NAME_INVALID');
    const row={productId,variantId:variant.variantId,nama:name,varian:variant.record?variant.name:'',qty,harga:price.price};
    items.push(Object.freeze({...row,flash:price.flash,stockKnown:available!==null}));
    orderItems.push(Object.freeze({productId,nama:name,varian:row.varian,qty,harga:price.price}));
    subtotal+=price.price*qty;
    totalItem+=qty;
    if (!Number.isSafeInteger(subtotal)||!Number.isSafeInteger(totalItem)) fail('TOTAL_OVERFLOW');
  }
  const map=voucherMap(vouchers);
  const voucherCtx={map,now:time,entitlements:voucherEntitlements};
  const appliedProduct=applyVoucher(selected.product,'product',subtotal,voucherCtx);
  const appliedShipping=applyVoucher(selected.shipping,'shipping',subtotal,voucherCtx);
  const productDiscount=appliedProduct?.discount||0;
  const shippingPotential=appliedShipping?.discount||0;
  const voucherSnapshot={
    product:appliedProduct?.voucher.name||null,
    shipping:appliedShipping?{
      name:appliedShipping.voucher.name,code:appliedShipping.voucher.code,
      potentialDiscount:shippingPotential
    }:null
  };
  const totals={totalItem,subtotal,productDiscount,shippingDiscount:0,
    totalBayar:subtotal-productDiscount,
    productVoucherName:voucherSnapshot.product,
    shippingVoucherName:appliedShipping?.voucher.name||null};
  return Object.freeze({version:CHECKOUT_QUOTE_VERSION,
    items:Object.freeze(items),orderItems:Object.freeze(orderItems),
    totals:Object.freeze(totals),vouchers:Object.freeze(voucherSnapshot),
    stockStatus:warnings.length?'needs-admin-confirmation':'snapshot-checked',
    warnings:Object.freeze([...new Set(warnings)]),
    // No shipping cost known at request creation; shipping voucher applies later.
    shippingPotential,
    flashTimeMs:time});
}
