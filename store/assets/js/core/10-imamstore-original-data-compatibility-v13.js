(function(){
'use strict';
// Read-only compatibility layer. No Firebase writes, no DOM replacement.
const num = value => {const n=Number(value);return Number.isFinite(n)?n:null;};
const safeUrl = value => {if(typeof value!=='string')return '';const v=value.trim();if(!v||/^(javascript|data|vbscript):/i.test(v))return '';return v;};
function adaptProduct(p){
 if(!p||typeof p!=='object'||p.id==null)return null;
 const raw=p.harga;
 const normal=num(typeof raw==='object'&&raw!==null?raw.normal:raw);
 const promo=num(typeof raw==='object'&&raw!==null?raw.promo:p.hargaPromo);
 const gallery=Array.isArray(p.gallery)?p.gallery.filter(x=>safeUrl(x)):[];
 const varian=Array.isArray(p.varian)?p.varian.filter(x=>typeof x==='string'&&x.trim()):[];
 const image=safeUrl(p.gambar);
 return { ...p, id:String(p.id),nama:String(p.nama||''),gambar:image,gallery,
   harga:{normal:normal??0,promo:promo&&promo>0?promo:null},
   varian,stok:(p.stok&&typeof p.stok==='object')?p.stok:{status:num(p.stok)===0?'Habis':'Ready',jumlah:num(p.stok)},
   terjual:num(p.terjual)??0,views:num(p.views)??0 };
}
function inspect(){
 const required=['product-detail-container','purchaseSheet','nfSheetGallery','v38VariantModal','v38VoucherModal','v38TermsModal'];
 const dom=Object.fromEntries(required.map(id=>[id,!!document.getElementById(id)]));
 const hooks=['showProduct','backToProducts','goCart','openLightbox','changeGallery','stickyQtyMinus','stickyQtyPlus','nineOpenOriginalVoucher','nineOpenReviews','incrementProductView','formatProductSold'];
 const functions=Object.fromEntries(hooks.map(name=>[name,typeof window[name]==='function']));
 return {dom,functions,originalRendererReady:Object.values(dom).every(Boolean)&&Object.values(functions).every(Boolean),transactionsEnabled:false};
}
window.ImamStoreOriginalCompatibility=Object.freeze({adaptProduct,inspect,version:'v13-read-only'});
})();