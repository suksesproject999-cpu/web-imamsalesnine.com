
/* ImamStore Commerce Sheet R2: one state, one quote, one commit path. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const sheet=$('imamstoreOriginalPurchase'),select=$('imamstorePurchaseVariant'),qtyInput=$('imamstorePurchaseQty'),action=$('imamstorePurchaseAction'),message=$('imamstorePurchaseMessage');
if(!sheet||!select||!qtyInput||!action)return;
const CART='imamstore_cart_stage5', SELECTION='imamstore_cart_selection_v43';
const normalize=x=>String(x??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('id-ID');
const label=x=>typeof x==='string'?x:String(x?.nama??x?.name??x?.label??x?.warna??'');
const money=n=>'Rp'+Math.round(n).toLocaleString('id-ID');
const safeQty=n=>Math.max(1,Math.min(999,Math.floor(Number(n)||1)));
const readCart=()=>{try{const x=JSON.parse(localStorage.getItem(CART)||'[]');return Array.isArray(x)?x:[]}catch{return []}};
const modeTitle={cart:'Masukkan Keranjang',buy:'Lihat Ringkasan Pesanan',editCart:'Konfirmasi',editCheckout:'Konfirmasi'};
const state={kind:null,productId:'',variant:'',qty:1,qtyInvalid:false,lineKey:'',checkoutLineId:'',checkoutIndex:-1,busy:false,submitError:'',submitStatus:'',returnFocus:null};
let cartSuccessCloseTimer=0;
const isOpen=()=>!sheet.hidden&&sheet.classList.contains('open')&&!!state.kind;
const product=()=>state.productId?window.imamstoreCartBridge?.getProduct?.(state.productId)||null:null;
const entries=p=>Array.isArray(p?.varian)?p.varian:[];
const options=p=>{const vals=entries(p).map(label).map(x=>x.trim()).filter(Boolean);return vals.length?[...new Set(vals)]:['Default']};
function stockNumber(value){
 if(value==null||value==='')return null;
 if(typeof value==='object')return stockNumber(value.jumlah??value.qty??value.stock??value.quantity??value.available);
 const n=Number(value);return Number.isFinite(n)&&n>=0?Math.floor(n):null;
}
function stockFor(p,variant){const entry=entries(p).find(x=>normalize(label(x))===normalize(variant));const v=entry&&typeof entry==='object'?(entry.stok??entry.stock??entry.quantity??entry.qty):null;return stockNumber(v??p?.stok??p?.stock)}
/* R3: penggunaan URL gambar dan fallback identik antara thumbnail dan preview. */
const FALLBACK_IMAGE='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" rx="16" fill="#f5f5f5"/><g fill="none" stroke="#b5bdb0" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="28" y="39" width="144" height="119" rx="12"/><circle cx="72" cy="78" r="13"/><path d="M40 143l43-43 25 25 25-30 27 48"/></g></svg>');
const photoCache={key:'',urls:[],index:0};
let photoTimeout=0;
function canonicalPhoto(value){
 const raw=typeof value==='string'?value:value?.url??value?.src??value?.gambar??value?.image??value?.foto??'';
 if(typeof raw!=='string')return '';
 const s=raw.trim();if(!s||/[\u0000-\u001f]/.test(s)||/^(?:javascript|blob|file|vbscript):/i.test(s))return '';
 if(/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i.test(s))return s;
 if(/^data:/i.test(s))return '';
 try{const base=/^https?:$/.test(location.protocol)?location.origin+'/':(document.querySelector('link[rel="canonical"]')?.href||document.baseURI);const url=new URL(s,base);return /^https?:$/.test(url.protocol)?url.href:''}catch{return ''}
}
function photoSources(p,variant=state.variant){
 const seen=new Set(),urls=[];
 const add=value=>{const url=canonicalPhoto(value);if(url&&!seen.has(url)&&!url.endsWith('/images/no-image.png')){seen.add(url);urls.push(url)}};
 const skuPhotos=window.imamstorePurchaseVariantPhotos?.(p,variant)||[];
 if(skuPhotos.length)skuPhotos.forEach(add);
 else {
  ['gambar','image','foto','thumbnail'].forEach(key=>add(p?.[key]));
  ['gallery','galeri','images','fotoTambahan'].forEach(key=>{const a=p?.[key];if(Array.isArray(a))a.forEach(add)});
 }
 /* Gambar detail yang sudah sukses dimuat boleh menjadi cadangan, hanya jika ID produknya sama. */
 if(!skuPhotos.length&&String(window.imamstoreActiveProduct?.id??'')===String(p?.id??'')){
  const main=$('imamstoreLiveOriginalDetail')?.querySelector('#mainProductImage');
  if(main?.complete&&main.naturalWidth>0)add(main.currentSrc||main.src);
 }
 return urls;
}
/* Preload sebelum mengganti src: URL yang rusak tidak sempat muncul sebagai broken-image. */
function showPhoto(image,url){
 // KEDIP-FREE-PREVIEW-20261126: preload/decode; satu swap setelah valid, abaikan respon lama.
 clearTimeout(photoTimeout);
 photoCache.token=(photoCache.token||0)+1;
 const token=photoCache.token;
 if(url===FALLBACK_IMAGE){
  if(image.src!==FALLBACK_IMAGE)image.src=FALLBACK_IMAGE;
  image.removeAttribute('aria-busy');delete image.dataset.pendingVariant;
  return;
 }
 if(image.src===url&&image.complete&&image.naturalWidth>0){
  image.removeAttribute('aria-busy');delete image.dataset.pendingVariant;
  return;
 }
 image.setAttribute('aria-busy','true');image.dataset.pendingVariant=state.variant;
 const probe=new Image();
 const fail=()=>{if(photoCache.token!==token||!isOpen())return;advancePhoto()};
 probe.onload=async()=>{
  if(photoCache.token!==token||!isOpen())return;
  if(!probe.naturalWidth){fail();return}
  clearTimeout(photoTimeout);
  // Decode selesai sebelum source gambar yang terlihat diganti.
  if(typeof probe.decode==='function'){try{await probe.decode()}catch(_){}}
  if(photoCache.token!==token||!isOpen())return;
  if(image.src!==url)image.src=url;
  image.removeAttribute('aria-busy');delete image.dataset.pendingVariant;
 };
 probe.onerror=fail;
 photoTimeout=setTimeout(fail,12000);
 probe.src=url;
}
function advancePhoto(){
 const image=$('imamstorePurchaseImage');if(!image||!isOpen())return;
 photoCache.index++;
 showPhoto(image,photoCache.urls[photoCache.index]||FALLBACK_IMAGE);
}
function refreshImage(p){
 const image=$('imamstorePurchaseImage');if(!image)return;
 const urls=photoSources(p),key=String(p?.id)+'|'+state.variant+'|'+urls.join('\n');
 if(photoCache.key!==key){
  const sameProduct=photoCache.productId===String(p?.id);
  photoCache.key=key;photoCache.productId=String(p?.id);photoCache.urls=urls;photoCache.index=0;
  // Untuk SKU dalam produk sama, jangan bolak-balik ke placeholder.
  // Foto lama bertahan hanya selama preload; aria-busy menandai pemuatan.
  if(!sameProduct||!image.complete||image.naturalWidth===0){
   if(image.src!==FALLBACK_IMAGE)image.src=FALLBACK_IMAGE;
  }
  showPhoto(image,urls[0]||FALLBACK_IMAGE);
 }
 image.alt=p?.nama||'Foto produk';
 if((window.imamstorePurchaseVariantPhotos?.(p,state.variant)||[]).length)image.dataset.variantGallery='1';else delete image.dataset.variantGallery;
}
$('imamstorePurchaseImage')?.addEventListener('error',advancePhoto);
function resolve(){
 const p=product();if(!p)return {ok:false,error:'Data katalog produk belum siap. Muat ulang produk.'};
 if(p.active===false||p.aktif===false||p.deleted===true||p.status==='nonaktif')return {ok:false,p,error:'Produk tidak aktif'};
 const available=options(p);
 const name=available.find(x=>normalize(x)===normalize(state.variant));
 if(!name)return {ok:false,p,error:'Pilihan varian sudah tidak tersedia'};
 const count=Number(state.qty);
 const qtyInvalid=state.qtyInvalid||!Number.isSafeInteger(count)||count<1||count>999;
 const quote=window.imamstoreUnifiedPrice?.variantQuote?.(p,name);
 const unit=Number(quote?.price);
 if(!quote?.verified||!Number.isFinite(unit)||unit<=0)return {ok:false,p,error:'Harga varian belum tersedia'};
 const stock=stockFor(p,name);
 if(qtyInvalid)return {ok:false,p,quote,unit,stock,error:'Jumlah harus 1–999'};
 const alreadyInCart=state.kind==='cart'?readCart().filter(x=>String(x.id)===state.productId&&normalize(x.varian)===normalize(name)).reduce((n,x)=>n+Number(x.qty||0),0):0;
 if(stock!==null&&count+alreadyInCart>stock)return {ok:false,p,quote,unit,stock,error:'Jumlah melebihi stok; tersisa '+Math.max(0,stock-alreadyInCart)+' untuk varian ini'};
 return {ok:true,p,name,count,quote,unit,stock};
}
function setText(id,str){const node=$(id);if(node&&node.textContent!==str)node.textContent=str}
function render(){
 if(!isOpen())return;
 const r=resolve(),p=r.p||product(),q=r.quote;
 if(p){const fresh=options(p),shown=[...select.options].map(x=>x.value);
  if(fresh.length!==shown.length||fresh.some((x,i)=>x!==shown[i])){
   select.replaceChildren(...fresh.map(name=>new Option(name,name)));
   const hasSelected=fresh.find(x=>normalize(x)===normalize(state.variant));
   if(hasSelected)select.value=hasSelected;else select.selectedIndex=-1;
  }
 }
 setText('refPurchasePrice',r.unit>0?money(r.unit):'Harga belum tersedia');
 setText('refPurchaseNormal',r.ok&&Number(q?.normal)>r.unit?money(q.normal):'');
 setText('refPurchaseBadge',r.ok&&q.percent>0?'-'+q.percent+'%':'');
 setText('refPurchaseSaving',r.ok&&q.saving>0?'Hemat '+money(q.saving):'');
 setText('ninePurchaseBudgetValue',!state.qtyInvalid&&r.unit>0?money(r.unit*state.qty):'—');
 setText('ninePurchaseBudgetLabel','Total belanja · '+state.qty+' pcs');
 const stock=r.stock??(p?stockFor(p,state.variant):null);
 const inCart=state.kind==='cart'?readCart().filter(x=>String(x.id)===state.productId&&normalize(x.varian)===normalize(state.variant)).reduce((n,x)=>n+Number(x.qty||0),0):0;
 setText('refPurchaseStock',stock===null?'Stok: Perlu konfirmasi':'Stok: '+stock+(inCart?' · Sisa untuk keranjang: '+Math.max(0,stock-inCart):''));
 const err=r.ok?state.submitError:r.error;
 if(message){message.textContent=err;message.hidden=!err}
 action.disabled=!r.ok||state.busy;
 action.classList.toggle('is-processing',state.kind==='cart'&&state.submitStatus==='processing');
 action.classList.toggle('is-confirmed',state.kind==='cart'&&state.submitStatus==='success');
 action.classList.toggle('is-failed',state.kind==='cart'&&state.submitStatus==='failed');
 action.textContent=state.kind==='cart'&&state.submitStatus==='success'?'✓ Berhasil Ditambahkan':state.kind==='cart'&&state.submitStatus==='processing'?'Memproses…':state.kind==='cart'&&state.submitStatus==='failed'?'Gagal · Coba Lagi':modeTitle[state.kind]||'Konfirmasi';
 if(!state.qtyInvalid)qtyInput.value=String(state.qty);
 [...sheet.querySelectorAll('.ref-v45-variant-grid button')].forEach(b=>b.setAttribute('aria-pressed',String(normalize(b.textContent)===normalize(state.variant))));
 if(p)refreshImage(p);
}
function choicesFor(p){
 select.replaceChildren();
 for(const name of options(p))select.add(new Option(name,name));
 select.value=state.variant;
 if(select.value!==state.variant){state.variant=select.value||options(p)[0];select.value=state.variant}
}
function open(kind,id,variant,qty,key='',lineId='',checkoutIndex=-1){
 if(!id)return false;
 const p=window.imamstoreCartBridge?.getProduct?.(id);
 if(!p){window.imamstoreToast?.('Data produk belum siap. Coba kembali.','warning');return false}
 if(isOpen())close(false);
 state.kind=kind;state.productId=String(id);state.lineKey=String(key||'');state.checkoutLineId=String(lineId||'');state.checkoutIndex=checkoutIndex;
 const available=options(p);
 state.variant=available.find(x=>normalize(x)===normalize(variant))||available[0];
 state.qty=safeQty(qty);state.qtyInvalid=false;state.busy=false;state.submitError='';state.submitStatus='';state.returnFocus=document.activeElement;
 clearTimeout(photoTimeout);photoCache.token=(photoCache.token||0)+1;photoCache.key='';
 delete sheet.dataset.nineEditing;
 const title=$('imamstorePurchaseTitle');if(title)title.textContent=p.nama||'Produk';
 sheet.dataset.commerceMode=kind;sheet.hidden=false;sheet.classList.add('open');
 choicesFor(p);notifyVariant();render();
 sheet.querySelector('.ref-v45-variant-grid')?.scrollTo({top:0,behavior:'instant'});
 return true;
}
function close(focus=true){
 clearTimeout(cartSuccessCloseTimer);
 if(!sheet.hidden){sheet.classList.remove('open');sheet.hidden=true}
 delete sheet.dataset.commerceMode;delete sheet.dataset.nineEditing;
 clearTimeout(photoTimeout);photoCache.token=(photoCache.token||0)+1;photoCache.key='';
 sheet.querySelector('.imamstore-purchase-panel')?.style.removeProperty('transform');
 const prior=state.returnFocus;
 state.kind=null;state.productId='';state.lineKey='';state.checkoutLineId='';state.checkoutIndex=-1;state.qtyInvalid=false;state.busy=false;state.submitError='';state.submitStatus='';
 action.classList.remove('is-processing','is-confirmed','is-failed');
 action.disabled=false;
 if(focus&&prior?.isConnected&&typeof prior.focus==='function')prior.focus({preventScroll:true});
}
function openEditor(index,source='cart'){
 const checkout=source==='checkout';
 if(checkout&&!$('s5Draft')?.classList.contains('open'))return false;
 const lines=checkout?window.__nexaiCheckoutLines:readCart();
 const line=Array.isArray(lines)?lines[index]:null;if(!line)return false;
 const stableId=String(line.__checkoutLineId||'');
 return open(checkout?'editCheckout':'editCart',line.id,line.varian,line.qty,line.key,stableId,index);
}
function syncAfterCartChange(){
 window.__nexaiCoreRenderCart?.();
 window.imamstoreV43?.sync?.();
 window.imamstoreReferenceV38?.refresh?.();
 window.imamstoreRefreshCartBadge?.();
 document.dispatchEvent(new CustomEvent('imamstore:cart-line-updated'));
 document.dispatchEvent(new CustomEvent('nine:cartchange',{detail:{source:'commerce-sheet'}}));
}
function commitCart(r){
 const data=readCart(),idx=data.findIndex(x=>String(x.key)===state.lineKey&&String(x.id)===state.productId);
 if(idx<0)return {ok:false,message:'Baris keranjang berubah. Tutup dan buka lagi editor.'};
 const newKey=String(r.p.id)+'|'+r.name;
 if(data.some((x,i)=>i!==idx&&String(x.key)===newKey))return {ok:false,message:'Varian ini sudah ada di keranjang. Ubah jumlah pada baris tersebut.'};
 const oldKey=String(data[idx].key);
 data[idx]={...data[idx],id:String(r.p.id),nama:String(r.p.nama||data[idx].nama),gambar:window.imamstorePurchaseVariantPhotos?.(r.p,r.name)?.[0]||r.p.gambar||data[idx].gambar,varian:r.name,qty:r.count,harga:r.unit,key:newKey};
 try{
  localStorage.setItem(CART,JSON.stringify(data));
  if(oldKey!==newKey){let saved={};try{saved=JSON.parse(localStorage.getItem(SELECTION)||'{}')||{}}catch{};if(Object.hasOwn(saved,oldKey)){saved[newKey]=saved[oldKey];delete saved[oldKey];localStorage.setItem(SELECTION,JSON.stringify(saved))}}
 }catch(e){console.error('Cart write',e);return {ok:false,message:'Perubahan gagal disimpan'};}
 syncAfterCartChange();return {ok:true};
}
function commitCheckout(r){
 const current=window.__nexaiCheckoutLines;
 if(!Array.isArray(current))return {ok:false,message:'Ringkasan checkout sudah berubah'};
 const index=state.checkoutLineId?current.findIndex(x=>String(x.__checkoutLineId||'')===state.checkoutLineId):state.checkoutIndex;
 if(index<0||!current[index]||String(current[index].id)!==state.productId||String(current[index].key)!==state.lineKey)return {ok:false,message:'Produk checkout berubah. Buka ulang editor.'};
 const next=current.map(x=>({...x}));
 next[index]={...next[index],varian:r.name,qty:r.count,harga:r.unit,gambar:window.imamstorePurchaseVariantPhotos?.(r.p,r.name)?.[0]||r.p.gambar||next[index].gambar,key:String(r.p.id)+'|'+r.name};
 if('jumlah'in next[index])next[index].jumlah=r.count;
 if(!window.imamstoreV43?.commitCheckoutItems?.(next))return {ok:false,message:'Gagal menyinkronkan checkout dan keranjang. Periksa pilihan varian.'};
 return {ok:true};
}
function submit(){
 if(!isOpen()||state.busy)return;
 const r=resolve();render();if(!r.ok)return;
 const kind=state.kind;
 state.busy=true;state.submitError='';
 if(kind==='cart'){state.submitStatus='processing';render()}
 else action.disabled=true;
 // Penambahan keranjang ditunda sebentar supaya status klik bisa terlihat.
 // Mode checkout dan edit tetap memakai alur commit yang sama seperti sebelumnya.
 const commit=()=>{
  if(!isOpen()||state.kind!==kind)return;
  let result;
  try{
   if(kind==='editCart')result=commitCart(r);
   else if(kind==='editCheckout')result=commitCheckout(r);
   else {
    const bridge=window.imamstoreCartBridge;
    result=kind==='buy'?bridge?.previewBuy?.(r.p.id,r.name,r.count):bridge?.addProduct?.(r.p.id,r.name,r.count);
   }
   if(!result?.ok){
    state.submitError=result?.message||'Gagal memproses produk';
    if(kind==='cart'){
     state.submitStatus='failed';
     window.imamstoreCartAddFeedback?.({ok:false,message:state.submitError});
    }
    return;
   }
   if(kind==='cart'){
    // Satu write melalui CartBridge, tidak pernah menulis localStorage dari UI.
    window.imamstoreRefreshCartBadge?.();
    document.dispatchEvent(new CustomEvent('nine:cartchange',{detail:{source:'purchase-add'}}));
    document.dispatchEvent(new CustomEvent('nine:productactivity',{detail:{type:'cart',ids:[String(r.p.id)]}}));
    state.submitStatus='success';
    render();
    window.imamstoreCartAddFeedback?.({ok:true,message:'Produk berhasil masuk ke keranjang'});
    cartSuccessCloseTimer=setTimeout(()=>{if(isOpen()&&state.kind==='cart'&&state.submitStatus==='success')close(false)},650);
    return;
   }
   close(false);
   if(kind==='buy'){
    $('imamstoreLiveOriginalDetail')?.classList.remove('open');
    document.body.classList.remove('imamstore-original-open');
   }else window.imamstoreToast?.('Varian dan jumlah berhasil diperbarui','success');
  }catch(err){
   console.error('Commerce sheet submit error',err);
   state.submitError='Terjadi kendala. Silakan coba lagi.';
   if(kind==='cart'){state.submitStatus='failed';window.imamstoreCartAddFeedback?.({ok:false,message:state.submitError})}
  }finally{
   // Pertahankan pengunci hingga sheet sukses ditutup agar tidak double-add.
   if(kind==='cart'&&state.submitStatus==='success')render();
   else{state.busy=false;render()}
  }
 };
 if(kind==='cart')setTimeout(commit,90);
 else commit();
}
function notifyVariant(){
 if(!state.productId||!state.variant)return;
 document.dispatchEvent(new CustomEvent('imamstore:variant-selected',{detail:{id:state.productId,variant:state.variant,source:state.kind}}));
}
select.addEventListener('change',()=>{if(!isOpen())return;state.variant=select.value;state.submitError='';notifyVariant();render()});
qtyInput.addEventListener('input',()=>{if(!isOpen())return;const v=Number(qtyInput.value);if(Number.isSafeInteger(v)&&v>=1&&v<=999){state.qty=v;state.qtyInvalid=false;state.submitError='';render()}else{state.qtyInvalid=true;state.submitError='';render()}});
qtyInput.addEventListener('change',()=>{if(!isOpen())return;state.qty=safeQty(qtyInput.value);state.qtyInvalid=false;state.submitError='';render()});
$('imamstoreQtyMinus')?.addEventListener('click',()=>{if(!isOpen())return;state.qty=safeQty(state.qty-1);state.qtyInvalid=false;state.submitError='';render()});
$('imamstoreQtyPlus')?.addEventListener('click',()=>{if(!isOpen())return;state.qty=safeQty(state.qty+1);state.qtyInvalid=false;state.submitError='';render()});
$('imamstorePurchaseClose')?.addEventListener('click',()=>close());
sheet.addEventListener('click',e=>{if(e.target===sheet)close()});
action.addEventListener('click',submit);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&isOpen()){e.stopImmediatePropagation();close()}},true);
document.addEventListener('imamstore:flash-price-change',render);
function openFromDetail(kind){
 const p=window.imamstoreActiveProduct;if(!p)return false;
 const detail=$('imamstoreLiveOriginalDetail');
 const preferred=detail?.querySelector('#varian')?.value||label(p.varian?.[0])||'Default';
 const preferredQty=detail?.querySelector('#stickyQty')?.textContent||1;
 return open(kind,p.id,preferred,safeQty(preferredQty));
}
window.imamstoreCommerceSheet=Object.freeze({openCart:()=>openFromDetail('cart'),openBuy:()=>openFromDetail('buy'),openEditor,close,refresh:render,getState:()=>({...state}),photoSources:()=>photoSources(product())});
window.openCartSheet=window.imamstoreCommerceSheet.openCart;
window.openBuySheet=window.imamstoreCommerceSheet.openBuy;
window.closePurchaseSheet=close;
})();

