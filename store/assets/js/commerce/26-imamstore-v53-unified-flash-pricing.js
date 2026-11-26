
(()=>{'use strict';
/* Harga produk & varian dari katalog; tidak pernah membaca harga snapshot keranjang sebagai sumber. */
const KEY='imamstore_cart_stage5',fmt=n=>'Rp '+Math.round(Number(n)||0).toLocaleString('id-ID');
const amount=x=>{
 if(x==null||x==='')return 0;
 if(typeof x==='number')return Number.isFinite(x)&&x>0?x:0;
 const v=String(x).replace(/[^\d,.-]/g,'').trim();
 if(!v)return 0;
 let normalized=v;
 if(v.includes(',')&&v.includes('.'))normalized=v.lastIndexOf(',')>v.lastIndexOf('.')?v.replace(/\./g,'').replace(',','.'):v.replace(/,/g,'');
 else if(v.includes(','))normalized=/,\d{1,2}$/.test(v)?v.replace(',','.'):v.replace(/,/g,'');
 else if(v.includes('.'))normalized=/\.\d{3}(?:\.\d{3})*$/.test(v)?v.replace(/\./g,''):v;
 const n=Number(normalized);return Number.isFinite(n)&&n>0?n:0;
};
const label=v=>typeof v==='string'?v:(v?.nama??v?.name??v?.label??v?.warna??'');
const norm=x=>String(x??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('id-ID');
function active(p,now=Date.now()){
 const f=p?.flashSale,start=Date.parse(f?.startAt||''),end=Date.parse(f?.endAt||'');
 return f?.enabled===true&&Number.isFinite(start)&&Number.isFinite(end)&&start<=now&&now<end&&amount(f?.price)>0;
}
function quote(p,now=Date.now()){
 const normal=amount(p?.harga?.normal??p?.harga),promo=amount(p?.harga?.promo??p?.hargaPromo);
 const regular=promo>0&&(!normal||promo<normal)?promo:normal;
 const flash=active(p,now)&&amount(p.flashSale.price)<regular;
 const price=flash?amount(p.flashSale.price):regular;
 return {normal:Math.max(normal,price),price,flash,percent:normal>price?Math.round((normal-price)/normal*100):0,saving:Math.max(0,normal-price),endAt:flash?Date.parse(p.flashSale.endAt):null,verified:price>0};
}
function variantQuote(p,name,now=Date.now()){
 const base=quote(p,now),entries=Array.isArray(p?.varian)?p.varian:[];
 const canonical=window.imamstoreVariantIdentity?.resolve(p,typeof name==='object'?name:String(name??''));
 const found=canonical?.record||(entries.find(x=>norm(label(x))===norm(name)));
 if(entries.length&&!found)return {...base,price:0,verified:false,variantFound:false};
 const obj=found&&typeof found==='object'?found:null;
 let normal=base.normal,regular=base.price;
 if(obj){
  const explicitNormal=amount(obj?.harga?.normal??obj.hargaNormal??obj.normal??obj.priceNormal);
  const flat=amount(obj?.price??obj.hargaJual??obj.harga_jual??(typeof obj.harga!=='object'?obj.harga:null));
  const promo=amount(obj?.harga?.promo??obj.hargaPromo??obj.promo??obj.harga_diskon);
  if(explicitNormal||flat||promo){
   normal=explicitNormal||flat||base.normal||promo;
   regular=promo>0&&promo<normal?promo:flat||explicitNormal||promo;
   if(flat&&normal<flat)normal=flat;
  }
 }
 // Variant-specific pricing has priority. A global flash price must not flatten
 // different SKU prices. Optionally a SKU can define its own flash price, using
 // the product flash schedule (only when product flash is enabled and active).
 const explicit=!!obj&&(amount(obj?.harga?.normal??obj.hargaNormal??obj.normal??obj.priceNormal)>0||amount(obj?.price??obj.hargaJual??obj.harga_jual??(typeof obj.harga!=='object'?obj.harga:null))>0||amount(obj?.harga?.promo??obj.hargaPromo??obj.promo??obj.harga_diskon)>0);
 const variantFlash=amount(obj?.flashSale?.price??obj?.harga?.flash??obj?.flashPrice);
 const useFlash=active(p,now);
 const flashPrice=useFlash?(variantFlash||(!explicit?amount(p.flashSale.price):0)):0;
 const flash=flashPrice>0&&flashPrice<regular;
 const price=flash?flashPrice:regular;
 normal=Math.max(normal,price);
 return {normal,price,flash,percent:normal>price?Math.round((normal-price)/normal*100):0,saving:Math.max(0,normal-price),endAt:flash?Date.parse(p.flashSale.endAt):null,verified:Number.isFinite(price)&&price>0,variantFound:!!found||!entries.length};
}
window.nineFlashActive=active;window.nineEffectivePromo=p=>quote(p).price;
window.imamstoreUnifiedPrice=Object.freeze({quote,variantQuote,active,version:'R2-canonical'});
const catalog=()=>{try{return window.imamstoreV29?.products?.()||[]}catch{return []}};
const find=id=>catalog().find(p=>String(p.id)===String(id));
function updateCart(){let lines;try{lines=window.imamstoreCartBridge?.getLines?.()||JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return false}if(!Array.isArray(lines)||!lines.length)return false;
 let changed=false;for(const line of lines){const p=find(line.id);if(!p)continue;const canonical=window.imamstoreVariantIdentity?.forLine(p,line);if(!canonical)continue;const q=variantQuote(p,canonical.name);
  if(line.varian!==canonical.name){line.varian=canonical.name;changed=true}const next=q.verified?q.price:0;
  if(next>0&&amount(line.harga)!==next){line.harga=next;changed=true}
  const photo=window.imamstorePurchaseVariantPhotos?.(p,canonical.name)?.[0];if(photo&&photo!==line.gambar){line.gambar=photo;changed=true}}
 if(changed){try{localStorage.setItem(KEY,JSON.stringify(lines))}catch{return false}
  document.dispatchEvent(new CustomEvent('imamstore:prices-updated'));
  window.__nexaiCoreRenderCart?.();window.imamstoreV43?.sync?.();window.imamstoreRefreshCartBadge?.();
  window.dispatchEvent(new Event('storage'))}
 return changed;
}
function setText(el,value){if(el&&el.textContent!==value)el.textContent=value}
function refreshCheckoutPrices(){
 const draft=document.getElementById('s5Draft'),lines=window.__nexaiCheckoutLines;
 if(!draft?.classList.contains('open')||!Array.isArray(lines)||!lines.length)return false;
 let changed=false;const latest=lines.map(line=>{
  const p=find(line.id);if(!p)return line;
  const canonical=window.imamstoreVariantIdentity?.forLine(p,line);if(!canonical)return line;
  const quote=variantQuote(p,canonical.name);if(!quote.verified)return line;
  if(Number(line.harga)===quote.price&&line.varian===canonical.name)return line;
  changed=true;return {...line,varian:canonical.name,variantId:canonical.variantId,key:canonical.key,harga:quote.price};
 });
 if(changed){window.__nexaiCheckoutLines=latest;
  document.dispatchEvent(new CustomEvent('imamstore:checkout-variant-updated',{detail:{items:latest,source:'reprice'}}));
  window.dispatchEvent(new CustomEvent('imamstore:checkout-variant-updated',{detail:{items:latest,source:'reprice'}}));
 }
 return changed;
}
/* Badge Flash Sale adalah status kampanye katalog, BUKAN indikasi bahwa
 * flash price memberi diskon tambahan terhadap promo/varian yang dipilih.
 * Samakan kelayakan kampanye dengan flashIsActive di core 02 (harga flash
 * < harga normal). Sinkronkan sebelum pemeriksaan quote varian agar saat
 * pilihan varian belum valid sekalipun badge/countdown tidak menghilang. */
function syncDetailFlashCampaign(root,p,now=Date.now()){
 const badge=root.querySelector('.nine-detail-flash-badge');
 if(!badge)return;
 const live=active(p,now)&&amount(p?.flashSale?.price)<amount(p?.harga?.normal??p?.harga);
 badge.hidden=!live;
 const timer=badge.querySelector('[data-nine-flash-end]');
 if(!timer)return;
 const end=live?Date.parse(p.flashSale.endAt):0;
 timer.setAttribute('data-nine-flash-end',live?String(p.flashSale.endAt):'');
 if(!live||!Number.isFinite(end)||end<=now){setText(timer,'Berakhir --:--:--');return}
 const sec=Math.max(0,Math.ceil((end-now)/1000));
 const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;
 setText(timer,`Berakhir ${[h,m,s].map(x=>String(x).padStart(2,'0')).join(':')}`);
}
function updateDetail(){const root=document.getElementById('imamstoreLiveOriginalDetail');if(!root?.classList.contains('open'))return;
 const current=window.imamstoreActiveProduct,p=current&&(find(current.id)||current);if(!p)return;
 syncDetailFlashCampaign(root,p);
 const selected=root.querySelector('#varian')?.value||'';const q=(Array.isArray(p.varian)&&p.varian.length)?variantQuote(p,selected):quote(p);if(!q.verified)return;const info=root.querySelector('.product-info');if(!info)return;
 setText(info.querySelector('.nine-price-row .price'),fmt(q.price));
 const old=info.querySelector('.nine-old-price');if(old){const html=q.percent?`<del>${fmt(q.normal)}</del><span class="nine-discount-percent">-${q.percent}%</span>`:'';if(old.innerHTML!==html)old.innerHTML=html}
 const priceRow=info.querySelector('.nine-price-row');let saving=priceRow?.querySelector('.nine-saving');
 if(q.saving>0&&priceRow&&!saving){saving=document.createElement('span');saving.className='nine-saving';priceRow.append(saving)}
 if(saving){if(q.saving>0)setText(saving,'Hemat '+fmt(q.saving));else saving.remove()}
 setText(root.querySelector('#stickyPrice'),fmt(q.price));setText(root.querySelector('#stickyNormalPrice'),q.percent?fmt(q.normal):'');
 const qty=Number(root.querySelector('#stickyQty')?.textContent)||1;setText(root.querySelector('#stickyTotal'),fmt(q.price*qty));
}
let lastState='';function tick(){const now=Date.now(),data=catalog();
 const flashSignature=data.map(p=>p.flashSale?.enabled?String(p.id)+':'+Number(active(p,now))+':'+quote(p,now).price:'').filter(Boolean).join('|');
 const sheet=window.imamstoreCommerceSheet?.getState?.();
 const sheetProduct=sheet?.kind&&find(sheet.productId),sheetQuote=sheetProduct?variantQuote(sheetProduct,sheet.variant,now):null;
 const sheetSignature=sheetProduct?String(sheet.productId)+':'+String(sheet.variant)+':'+String(sheetQuote?.price)+':'+JSON.stringify(sheetProduct.varian)+':'+JSON.stringify(sheetProduct.stok):'';
 const state=flashSignature+'|'+sheetSignature;
 const priceChanged=updateCart(),checkoutChanged=refreshCheckoutPrices();
 if(state!==lastState||priceChanged||checkoutChanged){lastState=state;document.dispatchEvent(new CustomEvent('imamstore:flash-price-change'));window.imamstoreReferenceV38?.refresh?.()}
 updateDetail();
}
document.addEventListener('click',e=>{if(e.target.closest('#refPlaceOrder,#s5Checkout')){updateCart();updateDetail()}},true);
document.addEventListener('imamstore:variant-detail-updated',updateDetail);document.addEventListener('imamstore:open-product',()=>setTimeout(tick,0));document.addEventListener('imamstore:open-cart',()=>setTimeout(tick,0));
window.addEventListener('storage',()=>setTimeout(updateDetail,0));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{tick();setInterval(tick,1000)},{once:true});else{tick();setInterval(tick,1000)}
})();

