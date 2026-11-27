
(()=>{'use strict';
 const el=id=>document.getElementById(id),cartPanel=el('s5Cart'),draft=el('s5Draft');
 const STORAGE='imamstore_cart_stage5';let item=null,images=[],idx=0,selected=null,previousFocus=null,startX=0,draftItems=null,draftOrigin='cart';
 const safeUrl=x=>{const raw=typeof productImageUrl==='function'?productImageUrl(x):String(x||'');const u=String(raw||'').trim();return /^(?:javascript|data|vbscript|file):/i.test(u)||/[\u0000-\u001f]/.test(u)?'':u};
 const fmt=n=>'Rp '+Math.round(Math.max(0,Number(n)||0)).toLocaleString('id-ID');
 const getPrice=p=>typeof price==='function'?price(p):Number(p.harga?.promo||p.harga?.normal||0);
 const variantName=v=>v==null?'':typeof v==='string'?v:String(v.nama||v.name||v.label||v.warna||'');
 const variantPrice=(p,v)=>{const name=variantName(v);const q=window.imamstoreUnifiedPrice?.variantQuote?.(p,name);return q?.verified&&q.price>0?q.price:NaN};
 const variantImage=(p,variant)=>safeUrl(window.imamstorePurchaseVariantPhotos?.(p,variant)?.[0]||p?.gambar?.url||p?.gambar?.src||p?.gambar);
 const stockInfo=(p,selected,lines=[],excludeKey='')=>window.imamstoreVariantIdentity?.stockInfo?.(p,selected,lines,excludeKey)||{stock:null,inCart:0,remaining:0,known:false};
 const liveProduct=id=>(typeof products!=='undefined'&&Array.isArray(products)?products:[]).find(p=>String(p.id)===String(id));
 // One-time, in-place reconciliation of old 'id|' and 'id|Default' cart rows.
 // Only products confirmed to have no real variants are eligible; other SKU keys stay distinct.
 function reconcileNoVariantRows(lines){
  const identity=window.imamstoreVariantIdentity;
  if(!identity)return lines;
  const groups=new Map(),next=[],mappings=new Map();let changed=false;
  for(const line of lines){
   const p=liveProduct(line.id);
   const resolved=p?identity.forLine(p,line):null;
   if(!resolved){next.push(line);continue} // Tidak menebak SKU atau memaksa migrasi saat CMS belum siap.
   const key=resolved.key;
   const updated={...line,key,varian:resolved.name,variantId:resolved.variantId};
   const existing=groups.get(key);
   if(existing){
    const qty=Number(existing.qty)+Number(line.qty);
    if(!Number.isSafeInteger(qty)||qty>999)return lines; // Jangan membuang kuantitas.
    existing.qty=qty;changed=true;
   }else{groups.set(key,updated);next.push(updated)}
   if(key!==line.key||resolved.name!==line.varian||line.variantId!==resolved.variantId)changed=true;
   if(!mappings.has(key))mappings.set(key,[]);
   mappings.get(key).push(String(line.key));
  }
  if(!changed)return lines;
  let oldSelection=null;
  try{
   const selKey='imamstore_cart_selection_v43';oldSelection=localStorage.getItem(selKey);
   const selection=JSON.parse(oldSelection||'{}')||{},updated={...selection};
   for(const [key,oldKeys] of mappings){
    // Checkbox konservatif: jika satu baris lama tidak dicentang, gabungan tetap tidak dicentang.
    if(oldKeys.some(old=>selection[old]===false))updated[key]=false;
    else if(oldKeys.some(old=>selection[old]===true))updated[key]=true;
    else delete updated[key];
    for(const old of oldKeys)if(old!==key)delete updated[old];
   }
   const previous=localStorage.getItem(STORAGE);
   try{localStorage.setItem(selKey,JSON.stringify(updated));localStorage.setItem(STORAGE,JSON.stringify(next));}
   catch(e){if(oldSelection===null)localStorage.removeItem(selKey);else localStorage.setItem(selKey,oldSelection);if(previous!==null)localStorage.setItem(STORAGE,previous);throw e}
   document.dispatchEvent(new CustomEvent('imamstore:variant-cart-migrated'));
   return next;
  }catch(error){console.warn('Migrasi keranjang ditunda; data lama dipertahankan',error);return lines}
 }
 const read=()=>{try{const v=JSON.parse(localStorage.getItem(STORAGE)||'[]');return Array.isArray(v)?reconcileNoVariantRows(v.filter(x=>x&&typeof x.id==='string'&&typeof x.key==='string'&&Number.isFinite(Number(x.qty))&&Number(x.qty)>0&&Number.isFinite(Number(x.harga))&&Number(x.harga)>0&&Number(x.qty)<=999).slice(0,200).map(x=>({...x,qty:Math.min(999,Math.floor(Number(x.qty))),harga:Number(x.harga)}))):[]}catch{return []}};
 const save=v=>{try{localStorage.setItem(STORAGE,JSON.stringify(v));return true}catch(e){console.warn('Cart storage unavailable',e);return false}};
 const text=(id,value)=>{el(id).textContent=String(value??'')};
 function row(x,editable){const wrap=document.createElement('div');wrap.className='s5-item';const img=document.createElement('img');img.src=safeUrl(x.gambar);img.alt='';const main=document.createElement('main'),name=document.createElement('h3');name.textContent=x.nama;main.append(name);const desc=document.createElement('p');desc.textContent=[x.varian,fmt(x.harga)].filter(Boolean).join(' · ');main.append(desc);const qty=document.createElement('div');qty.className='s5-qty';if(editable){const minus=document.createElement('button');minus.textContent='−';minus.setAttribute('aria-label','Kurangi jumlah');minus.onclick=()=>update(x.key,-1);qty.append(minus)}const label=document.createElement('span');label.textContent='Jumlah: '+x.qty;qty.append(label);if(editable){const plus=document.createElement('button');plus.textContent='+';plus.setAttribute('aria-label','Tambah jumlah');plus.onclick=()=>update(x.key,1);qty.append(plus)}main.append(qty);wrap.append(img,main);return wrap}
 function update(key,delta){const data=read(),x=data.find(i=>i.key===key);if(!x)return;const p=liveProduct(x.id);if(delta>0&&p){const identity=window.imamstoreVariantIdentity?.forLine(p,x);const info=stockInfo(p,identity?{variantId:identity.variantId}:x.varian,data);const stockWarning=cartStockProblem(info,info.inCart+delta);if(stockWarning){showCheckoutAvailabilityDialog([{...stockWarning,name:x.nama,variant:x.varian,key:x.key}]);return}}x.qty=Math.min(999,x.qty+delta);if(!save(data.filter(i=>i.qty>0)))console.warn('ImamStore: cart update not saved');renderCart();window.__nineSyncVisibleTotals?.();document.dispatchEvent(new CustomEvent('nine:cartchange',{detail:{source:'qty-change',id:x.id}}))}
 function total(data){return fmt(data.reduce((a,x)=>a+(Number(x.harga)||0)*Math.max(1,Number(x.qty)||1),0))}
 function cartDeleteToast(count){
 const message=count===1?'Produk dihapus dari keranjang':count+' produk dihapus dari keranjang';
 if(cartPanel.classList.contains('open'))window.imamstoreCartToast?.(message);
}
 function renderCart(){
 const data=read(),target=el('s5CartItems');target.replaceChildren();
 const head=document.createElement('div');head.className='imam-cart-heading';
 const title=document.createElement('strong');title.textContent='Produk dalam keranjang ('+data.length+')';head.append(title);
 if(data.length){const clear=document.createElement('button');clear.type='button';clear.textContent='Hapus semua';clear.addEventListener('click',()=>{if(window.Swal?.fire){window.Swal.fire({title:'Hapus semua produk?',icon:'warning',showCancelButton:true,confirmButtonText:'Hapus',cancelButtonText:'Batal',confirmButtonColor:'#8cc63f',width:'min(90vw,410px)'}).then(r=>{if(r.isConfirmed&&save([])){renderCart();cartDeleteToast(data.length)}})}else{console.warn('Konfirmasi tidak tersedia; keranjang tidak dihapus.')}});head.append(clear)}target.append(head);
 if(!data.length){const empty=document.createElement('div');empty.className='imam-cart-empty';empty.textContent='Keranjang masih kosong. Pilih produk untuk mulai belanja.';target.append(empty)}
 data.forEach(x=>{
  const item=document.createElement('article');item.className='imam-cart-product';item.dataset.cartKey=String(x.key);
  item.classList.add('nexai-cart-swipe');
  const select=document.createElement('input');select.type='checkbox';select.className='ref-v42-select';select.dataset.cartKey=String(x.key);select.setAttribute('aria-label','Pilih '+x.nama);
  select.checked=window.imamstoreV43?.isSelected?.(x.key)!==false;select.addEventListener('click',e=>e.stopPropagation());select.addEventListener('change',()=>{const key='imamstore_cart_selection_v43';let state={};try{state=JSON.parse(localStorage.getItem(key)||'{}')||{}}catch{}state[String(x.key)]=select.checked;localStorage.setItem(key,JSON.stringify(state));window.imamstoreV43?.sync?.()});item.append(select);
  const img=document.createElement('img');img.src=safeUrl(x.gambar);img.alt='Foto '+x.nama;img.loading='lazy';
  const info=document.createElement('div');info.className='imam-cart-product-info';
  const name=document.createElement('h3');name.textContent=x.nama;info.append(name);
  
  const priceEl=document.createElement('strong');priceEl.className='imam-cart-price';priceEl.textContent=fmt(x.harga);info.append(priceEl);
  const controls=document.createElement('div');controls.className='imam-cart-controls';
  const remove=document.createElement('button');remove.type='button';remove.className='imam-cart-remove';remove.textContent='Hapus';remove.onclick=async()=>{const confirm=window.Swal?.fire?await window.Swal.fire({title:'Hapus produk ini?',text:x.nama,icon:'warning',showCancelButton:true,confirmButtonText:'Hapus',cancelButtonText:'Batal',confirmButtonColor:'#8cc63f',width:'min(90vw,360px)'}):{isConfirmed:false};if(!confirm.isConfirmed)return;const remaining=read().filter(i=>i.key!==x.key);if(save(remaining)){renderCart();cartDeleteToast(1)}};
  const qty=document.createElement('div');qty.className='imam-cart-qty';
  const minus=document.createElement('button');minus.type='button';minus.textContent='−';minus.setAttribute('aria-label','Kurangi jumlah '+x.nama);minus.onclick=()=>update(x.key,-1);
  const amount=document.createElement('span');amount.textContent=String(x.qty);amount.setAttribute('aria-label','Jumlah '+x.qty);
  const plus=document.createElement('button');plus.type='button';plus.textContent='+';plus.setAttribute('aria-label','Tambah jumlah '+x.nama);plus.onclick=()=>update(x.key,1);
  qty.append(minus,amount,plus);controls.append(remove,qty);info.append(controls);item.append(img,info);
  const swipeActions=document.createElement('div');swipeActions.className='nexai-swipe-actions';
  const similar=document.createElement('button');similar.type='button';similar.textContent='Serupa';similar.className='nexai-similar';
  similar.onclick=e=>{e.stopPropagation();item.classList.remove('nexai-swipe-open');cartPanel.classList.remove('open');document.body.classList.remove('stage4-detail-open');document.dispatchEvent(new CustomEvent('imamstore:cart-similar',{detail:{id:x.id,nama:x.nama}}));};
  const swipeDelete=document.createElement('button');swipeDelete.type='button';swipeDelete.textContent='Hapus';swipeDelete.className='nexai-delete';
  swipeDelete.onclick=e=>{e.stopPropagation();remove.click()};
  swipeActions.append(similar,swipeDelete);item.append(swipeActions);target.append(item);
 });
 const sum=data.reduce((n,x)=>n+Number(x.harga)*x.qty,0);const count=data.reduce((n,x)=>n+x.qty,0);
 const summary=el('s5CartTotal');summary.replaceChildren();
 const line=document.createElement('div');line.className='imam-cart-summary-line';
 const label=document.createElement('span');label.textContent='Subtotal ('+count+' barang)';const value=document.createElement('strong');value.textContent=fmt(sum);line.append(label,value);summary.append(line);
 const note=document.createElement('p');note.className='imam-cart-summary-note';note.textContent='Ongkir, voucher, dan pembayaran belum dihitung. Tidak ada transaksi yang dikirim.';summary.append(note);
 el('s5Checkout').disabled=!data.length;
 }
 window.__nexaiCoreRenderCart=renderCart;
 function openCart(){document.getElementById('imamstoreLiveOriginalDetail')?.classList.remove('open');document.body.classList.remove('imamstore-original-open');draft.classList.remove('open');document.getElementById('imamstoreOriginalPurchase')?.classList.remove('open');const purchase=document.getElementById('imamstoreOriginalPurchase');if(purchase)purchase.hidden=true;cartPanel.classList.add('open');document.body.classList.add('stage4-detail-open');renderCart();window.imamstoreV43?.sync?.()}

 /* ImamStore Checkout Availability R5 */
 function cartStockProblem(info,requested){
  if(!info?.known||!Number.isSafeInteger(Number(info.stock))||Number(info.stock)<0)
   return {code:'stock-unknown',available:null,requested};
  const available=Number(info.stock);
  if(available===0)return {code:'stock-zero',available,requested};
  if(Number(requested)>available)return {code:'stock-low',available,requested};
  return null;
 }
 function cartStockMessage(problem){
  if(!problem)return '';
  if(problem.code==='stock-unknown')return 'Stok belum dapat dipastikan. Silakan periksa kembali nanti.';
  if(problem.code==='stock-zero')return 'Stok produk atau varian pilihan sedang habis.';
  return 'Stok tercatat '+problem.available+' unit, sedangkan jumlah dalam keranjang '+problem.requested+' unit.';
 }
 function showCheckoutAvailabilityDialog(problems){
  const previous=document.activeElement;
  document.getElementById('imamstoreStockDialogR5')?.remove();
  if(!document.getElementById('imamstoreStockStyleR5')){
   const style=document.createElement('style');style.id='imamstoreStockStyleR5';
   style.textContent=`
    #imamstoreStockDialogR5 {position:fixed;inset:0;z-index:2147483640;display:flex;align-items:center;justify-content:center;background:rgba(9,19,15,.67);padding:16px;box-sizing:border-box}
    #imamstoreStockDialogR5 * {box-sizing:border-box}
    #imamstoreStockDialogR5 .isc-panel {width:min(100%,510px);max-height:min(86dvh,680px);overflow-y:auto;overscroll-behavior:contain;border-radius:23px;background:#fff;color:#18251d;box-shadow:0 18px 64px #0004;font-family:inherit}
    #imamstoreStockDialogR5 .isc-head {display:flex;align-items:flex-start;gap:12px;padding:22px 20px 12px}
    #imamstoreStockDialogR5 .isc-symbol {width:42px;height:42px;flex:none;display:grid;place-items:center;border-radius:13px;background:#fff3d8;color:#9c5b00;font-size:22px}
    #imamstoreStockDialogR5 .isc-title {font-size:20px;font-weight:750;line-height:1.3;margin:0}
    #imamstoreStockDialogR5 .isc-subtitle {font-size:13px;color:#5d685f;line-height:1.55;margin:7px 0 0}
    #imamstoreStockDialogR5 .isc-close {margin-left:auto;border:0;background:#f1f4ef;color:#304036;border-radius:50%;width:35px;height:35px;flex:none;font-size:23px;cursor:pointer}
    #imamstoreStockDialogR5 .isc-list {display:grid;gap:10px;list-style:none;margin:0;padding:8px 20px 16px}
    #imamstoreStockDialogR5 .isc-item {border:1px solid #e4eae1;border-radius:15px;padding:13px 14px;background:#fbfcfa}
    #imamstoreStockDialogR5 .isc-item-title {font-weight:700;font-size:14px;line-height:1.5;overflow-wrap:anywhere}
    #imamstoreStockDialogR5 .isc-item-detail {color:#516050;font-size:13px;line-height:1.55;margin-top:6px}
    #imamstoreStockDialogR5 .isc-status {display:inline-flex;align-items:center;font-size:11px;font-weight:700;border-radius:50px;background:#fff0df;color:#8d4c06;padding:4px 9px;margin-top:9px}
    #imamstoreStockDialogR5 .isc-foot {display:flex;flex-wrap:wrap;gap:9px;padding:14px 20px 20px;border-top:1px solid #ecf0ea}
    #imamstoreStockDialogR5 .isc-btn {flex:1 1 180px;min-height:47px;border:1px solid #d7e4d1;border-radius:12px;background:#fff;color:#30452a;font-weight:700;font-size:14px;cursor:pointer;transition:transform .15s,background .15s}
    #imamstoreStockDialogR5 .isc-btn.primary {background:#8cc63f;border-color:#8cc63f;color:#15230c}
    #imamstoreStockDialogR5 button:active {transform:scale(.975);filter:brightness(.94)}
    #imamstoreStockDialogR5 button:focus-visible {outline:3px solid #426c18;outline-offset:3px}
    @media(max-width:550px){#imamstoreStockDialogR5 {align-items:flex-end;padding:0}#imamstoreStockDialogR5 .isc-panel {width:100%;max-height:86dvh;border-radius:24px 24px 0 0;padding-bottom:env(safe-area-inset-bottom)}}
    @media(prefers-reduced-motion:reduce){#imamstoreStockDialogR5 .isc-btn {transition:none}}
   `;document.head.append(style);
  }
  const root=document.createElement('div');root.id='imamstoreStockDialogR5';
  const panel=document.createElement('section');panel.className='isc-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','isc-title');panel.setAttribute('aria-describedby','isc-description');
  const head=document.createElement('header');head.className='isc-head';
  const symbol=document.createElement('span');symbol.className='isc-symbol';symbol.textContent='!';symbol.setAttribute('aria-hidden','true');
  const content=document.createElement('div');
  const title=document.createElement('h2');title.id='isc-title';title.className='isc-title';title.textContent='Periksa produk sebelum checkout';
  const subtitle=document.createElement('p');subtitle.id='isc-description';subtitle.className='isc-subtitle';subtitle.textContent='Ada '+problems.length+' produk yang perlu diperiksa. Pesanan belum dibuat dan pembayaran belum dilakukan.';
  content.append(title,subtitle);
  const closeButton=document.createElement('button');closeButton.type='button';closeButton.className='isc-close';closeButton.textContent='×';closeButton.setAttribute('aria-label','Tutup pemberitahuan');
  head.append(symbol,content,closeButton);
  const list=document.createElement('ul');list.className='isc-list';
  const labels={'stock-unknown':'Stok belum terkonfirmasi','stock-zero':'Stok habis','stock-low':'Jumlah melebihi stok','catalog':'Produk belum termuat','inactive':'Produk tidak tersedia','variant':'Varian berubah','price-unknown':'Harga belum tersedia','price-changed':'Harga berubah'};
  problems.forEach(issue=>{
   const item=document.createElement('li');item.className='isc-item';
   const name=document.createElement('div');name.className='isc-item-title';name.textContent=String(issue.name||'Produk')+(issue.variant&&issue.variant!=='Default'?' · '+String(issue.variant):'');
   const detail=document.createElement('div');detail.className='isc-item-detail';
   const code=issue.code;
   if(code==='stock-unknown')detail.textContent='Informasi stok varian ini belum tersedia atau belum valid. Sistem tidak dapat memastikan jumlah yang bisa dipesan.';
   else if(code==='stock-zero')detail.textContent='Stok yang tercatat di katalog adalah 0 unit. Silakan pilih varian atau produk lain.';
   else if(code==='stock-low')detail.textContent='Total di keranjang '+issue.requested+' unit, sedangkan stok yang tercatat '+issue.available+' unit. Kurangi jumlah pesanan atau pilih varian lain.';
   else if(code==='catalog')detail.textContent='Informasi produk belum berhasil dimuat. Muat ulang halaman, kemudian periksa kembali.';
   else if(code==='inactive')detail.textContent='Produk tidak tersedia untuk pembelian saat ini.';
   else if(code==='variant')detail.textContent='Varian yang dipilih tidak lagi ditemukan di katalog. Silakan pilih varian lain.';
   else if(code==='price-unknown')detail.textContent='Harga terbaru untuk pilihan ini belum tersedia. Silakan periksa produk kembali.';
   else if(code==='price-changed')detail.textContent='Harga di keranjang '+fmt(issue.oldPrice)+'; harga katalog terbaru '+fmt(issue.newPrice)+'. Periksa kembali harga sebelum membeli.';
   else detail.textContent='Informasi produk perlu diperbarui sebelum checkout.';
   const tag=document.createElement('span');tag.className='isc-status';tag.textContent=labels[code]||'Periksa produk';
   item.append(name,detail,tag);list.append(item);
  });
  const foot=document.createElement('footer');foot.className='isc-foot';
  const refresh=document.createElement('button');refresh.type='button';refresh.className='isc-btn';refresh.textContent='Muat Ulang Katalog';
  const inspect=document.createElement('button');inspect.type='button';inspect.className='isc-btn primary';inspect.textContent=draftOrigin==='cart'?'Periksa Keranjang':'Kembali ke Produk';
  foot.append(refresh,inspect);panel.append(head,list,foot);root.append(panel);document.body.append(root);
  let closed=false;
  function close(inspectCart){
   if(closed)return;closed=true;document.removeEventListener('keydown',onKey,true);root.remove();
   if(inspectCart&&draftOrigin==='cart'){
    const bad=problems[0];
    const cards=[...cartPanel.querySelectorAll('[data-cart-key]')];
    const card=cards.find(c=>String(c.dataset.cartKey)===String(bad?.key));
    if(card){card.setAttribute('tabindex','-1');card.focus({preventScroll:true});card.scrollIntoView({behavior:'smooth',block:'center'});return}
   }
   if(previous?.isConnected&&typeof previous.focus==='function')previous.focus({preventScroll:true});
  }
  function onKey(e){
   if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close(false);return}
   if(e.key!=='Tab')return;
   const buttons=[...panel.querySelectorAll('button:not([disabled])')];
   const index=buttons.indexOf(document.activeElement);
   if(e.shiftKey&&(index<=0)){e.preventDefault();buttons[buttons.length-1]?.focus()}
   else if(!e.shiftKey&&(index===buttons.length-1||index===-1)){e.preventDefault();buttons[0]?.focus()}
  }
  document.addEventListener('keydown',onKey,true);
  closeButton.addEventListener('click',()=>close(false));inspect.addEventListener('click',()=>close(true));
  refresh.addEventListener('click',()=>{refresh.disabled=true;refresh.textContent='Memuat ulang…';window.location.reload()});
  root.addEventListener('click',e=>{if(e.target===root)close(false)});
  inspect.focus();
 }

 function openDraft(lines){draftOrigin=Array.isArray(lines)?'detail':'cart';const data=Array.isArray(lines)?lines:read().filter(x=>window.imamstoreV43?.isSelected?.(x.key)!==false);if(!data.length)return;
 // Never treat a locally saved price as authoritative. Recheck product, variant and price.
 const warnings=[];const checked=[];
 for(const line of data){const p=liveProduct(line.id);if(!p){warnings.push({code:'catalog',name:line.nama,variant:line.varian,key:line.key});continue}
 if(p.active===false||p.deleted===true||p.aktif===false||p.status==='nonaktif'){warnings.push({code:'inactive',name:line.nama,variant:line.varian,key:line.key});continue}
 const variants=Array.isArray(p.varian)?p.varian:[];const v=window.imamstoreVariantIdentity?.forLine(p,line)?.record;
 if(variants.length&&!v){warnings.push({code:'variant',name:line.nama,variant:line.varian,key:line.key});continue}
 const info=stockInfo(p,window.imamstoreVariantIdentity?.forLine(p,line)||line.varian,data);
 const stockIssue=cartStockProblem(info,info.inCart);if(stockIssue){warnings.push({...stockIssue,name:line.nama,variant:line.varian,key:line.key});continue}
 const current=variantPrice(p,v||null);if(!Number.isFinite(current)||current<=0){warnings.push({code:'price-unknown',name:line.nama,variant:line.varian,key:line.key});continue}
 if(current!==Number(line.harga)){warnings.push({code:'price-changed',name:line.nama,variant:line.varian,key:line.key,oldPrice:line.harga,newPrice:current});continue}
 checked.push({...line,harga:current})}
 if(warnings.length){showCheckoutAvailabilityDialog(warnings);return false}
 if(!checked.length)return false;window.__nexaiCheckoutLines=checked.map((x,i)=>({...x,__checkoutLineId:'checkout-'+i+'-'+String(x.key)}));window.__nexaiCheckoutMode=draftOrigin;draftItems=window.__nexaiCheckoutLines;window.imamstoreV43?.beginCheckout?.(draftOrigin);cartPanel.classList.remove('open');draft.classList.add('open');document.body.classList.add('stage4-detail-open');
 let notice=document.getElementById('nineVoucherReconcileNotice');
 if(!notice){notice=document.createElement('div');notice.id='nineVoucherReconcileNotice';notice.setAttribute('role','status');notice.hidden=true;el('s5DraftItems')?.before(notice)}
 notice.hidden=true;notice.textContent='';
 const target=el('s5DraftItems');target.replaceChildren();checked.forEach(x=>target.append(row(x,false)));text('s5DraftTotal','SIMULASI — bukan pesanan. Subtotal (belum termasuk ongkir): '+total(checked));window.imamstoreV43?.publishQuote?.();document.dispatchEvent(new Event('imamstore:quote-refresh'));return true}
 document.addEventListener('imamstore:catalog-updated',()=>{const before=localStorage.getItem(STORAGE);const data=read();if(data.length&&before!==localStorage.getItem(STORAGE)){renderCart();window.imamstoreV43?.sync?.();window.imamstoreRefreshCartBadge?.()}});
 document.addEventListener('imamstore:cart-line-updated',()=>{
  if(!cartPanel.classList.contains('open'))return;
  const data=read();
  [...el('s5CartItems').querySelectorAll('.imam-cart-product')].forEach((card,i)=>{
   const line=data.find(x=>String(x.key)===card.dataset.cartKey)||data[i];if(!line)return;
   const count=card.querySelector('.imam-cart-qty span');if(count)count.textContent=String(line.qty);
   const price=card.querySelector('.imam-cart-price');if(price)price.textContent=fmt(line.harga);
   const variant=card.querySelector('.ref-v42-change');if(variant)variant.textContent='Varian: '+(line.varian||'Standar')+'  ▾';
  });
  const count=data.reduce((n,x)=>n+(Number(x.qty)||0),0),sum=data.reduce((n,x)=>n+(Number(x.harga)||0)*(Number(x.qty)||0),0);
  const summary=el('s5CartTotal');if(summary){const a=summary.querySelector('.imam-cart-summary-line span'),b=summary.querySelector('.imam-cart-summary-line strong');if(a)a.textContent='Subtotal ('+count+' barang)';if(b)b.textContent=fmt(sum)}
  window.imamstoreV43?.sync?.();window.imamstoreRefreshCartBadge?.();
 });
 el('s5CartBack').onclick=()=>{
  cartPanel.classList.remove('open');
  document.body.classList.remove('stage4-detail-open');
 };
 el('s5DraftBack').onclick=()=>{
  draftItems=null;window.__nexaiCheckoutLines=null;window.__nexaiCheckoutMode=null;draft.classList.remove('open');window.imamstoreV43?.endCheckout?.();
  if(draftOrigin==='detail'){
   document.getElementById('imamstoreLiveOriginalDetail')?.classList.add('open');
   document.body.classList.add('imamstore-original-open');
  }else openCart();
 };
 el('s5Checkout').onclick=function(){ openDraft(); };

 // Product detail original -> existing local cart and checkout simulation.
 window.imamstoreCartBridge=Object.freeze({
  getProduct(id){return liveProduct(id)||null},
  getLines(){return read()},
  addProduct(id,variant,qty){
   const p=liveProduct(id);if(!p)return {ok:false,message:'Produk tidak ditemukan'};
   const variants=Array.isArray(p.varian)?p.varian:[];
   const resolved=window.imamstoreVariantIdentity?.resolve(p,variant);
   if(!resolved)return {ok:false,message:'Pilih varian yang tersedia'};
   variant=resolved.name;const v=resolved.record;
   if(variants.length&&(!v||resolved.variantId.startsWith('legacy-')))return {ok:false,message:'Variant ID resmi belum tersedia. Hubungi admin toko.'};
   const count=Number(qty);if(!Number.isSafeInteger(count)||count<1||count>999)return {ok:false,message:'Jumlah tidak valid'};
   if(p.aktif===false||p.active===false||p.deleted===true||p.status==='nonaktif')return {ok:false,message:'Produk tidak aktif'};
   const data=read(),key=resolved.key,old=data.find(x=>x.key===key);
   if(old&&old.qty+count>999)return {ok:false,message:'Jumlah varian dalam keranjang maksimal 999'};
   const info=stockInfo(p,{variantId:resolved.variantId},data);
   const stockWarning=cartStockProblem(info,info.inCart+count);if(stockWarning)return {ok:false,message:cartStockMessage(stockWarning)};
   const unit=variantPrice(p,v||null);if(!Number.isFinite(unit)||unit<=0)return {ok:false,message:'Harga produk tidak valid'};
   if(old){old.qty+=count;old.harga=unit;}else{
    if(data.length>=200)return {ok:false,message:'Keranjang penuh'};
    data.push({key,id:String(p.id),nama:String(p.nama||''),variantId:resolved.variantId,varian:variant,harga:unit,gambar:variantImage(p,variant),qty:count});
   }
   return save(data)?{ok:true,message:'Ditambahkan ke keranjang'}:{ok:false,message:'Penyimpanan keranjang gagal'};
  },
  // Smart Bundle: validate every item first, then write exactly once.
  // No bundle-specific storage, pricing snapshot or partial cart writes.
  addProducts(lines){
   if(!Array.isArray(lines)||lines.length<2||lines.length>4)return {ok:false,message:'Pilih produk utama dan minimal satu pelengkap'};
   const next=read(),keys=new Set();
   for(const line of lines){
    const p=liveProduct(line?.id);
    if(!p)return {ok:false,message:'Produk tidak tersedia di katalog'};
    if(p.aktif===false||p.active===false||p.deleted===true||p.status==='nonaktif')return {ok:false,message:'Produk tidak aktif: '+String(p.nama||p.id)};
    const variants=Array.isArray(p.varian)?p.varian:[],resolved=window.imamstoreVariantIdentity?.resolve(p,line?.variantId?{variantId:line.variantId}:{varian:line?.variant});
    if(!resolved)return {ok:false,message:'Pilih varian: '+String(p.nama||p.id)};
    const variant=resolved.name,v=resolved.record;
    if(variants.length&&(!v||resolved.variantId.startsWith('legacy-')))return {ok:false,message:'Variant ID resmi belum tersedia: '+String(p.nama||p.id)};
    const qty=Number(line?.qty);
    if(!Number.isSafeInteger(qty)||qty<1||qty>999)return {ok:false,message:'Jumlah produk tidak valid'};
    const key=resolved.key;
    if(keys.has(key))return {ok:false,message:'Produk yang sama dipilih dua kali'};
    keys.add(key);
    const info=stockInfo(p,{variantId:resolved.variantId},next);
    const old=next.find(x=>x.key===key),existing=old?.qty||0;
    if(existing+qty>999)return {ok:false,message:'Jumlah keranjang melebihi batas'};
    const stockWarning=cartStockProblem(info,info.inCart+qty);if(stockWarning)return {ok:false,message:cartStockMessage(stockWarning)+' '+String(p.nama||p.id)};
    const unit=variantPrice(p,v||null);
    if(!Number.isFinite(unit)||unit<=0)return {ok:false,message:'Harga belum tersedia: '+String(p.nama||p.id)};
    if(old){old.qty=existing+qty;old.harga=unit;}
    else{
     if(next.length>=200)return {ok:false,message:'Keranjang penuh'};
     next.push({key,id:String(p.id),nama:String(p.nama||''),variantId:resolved.variantId,varian:variant,harga:unit,gambar:variantImage(p,variant),qty});
    }
   }
   if(!save(next))return {ok:false,message:'Gagal menyimpan keranjang. Tidak ada produk yang ditambahkan'};
   window.__nexaiCoreRenderCart?.();
   window.imamstoreV43?.sync?.();
   window.imamstoreRefreshCartBadge?.();
   document.dispatchEvent(new CustomEvent('nine:cartchange',{detail:{source:'smart-bundle',count:lines.length}}));
   return {ok:true,message:lines.length+' produk berhasil ditambahkan'};
  },
  openCart(){openCart()},
  previewBuy(id,variant,qty){
   const p=liveProduct(id);if(!p)return {ok:false,message:'Produk tidak ditemukan'};
   const variants=Array.isArray(p.varian)?p.varian:[];const resolved=window.imamstoreVariantIdentity?.resolve(p,variant);if(!resolved)return {ok:false,message:'Pilih varian yang tersedia'};variant=resolved.name;const v=resolved.record;
   if(variants.length&&(!v||resolved.variantId.startsWith('legacy-')))return {ok:false,message:'Variant ID resmi belum tersedia. Hubungi admin toko.'};
   const count=Number(qty);if(!Number.isSafeInteger(count)||count<1||count>999)return {ok:false,message:'Jumlah tidak valid'};
   if(p.aktif===false||p.active===false||p.deleted===true||p.status==='nonaktif')return {ok:false,message:'Produk tidak aktif'};
   const unit=variantPrice(p,v||null);if(!Number.isFinite(unit)||unit<=0)return {ok:false,message:'Harga tidak valid'};
   const info=stockInfo(p,{variantId:resolved.variantId});
   const stockWarning=cartStockProblem(info,count);if(stockWarning)return {ok:false,message:cartStockMessage(stockWarning)};
   const opened=openDraft([{key:resolved.key,id:String(p.id),nama:String(p.nama||''),variantId:resolved.variantId,varian:variant,harga:unit,gambar:variantImage(p,variant),qty:count}]);if(!opened)return {ok:false,message:'Periksa kembali informasi produk sebelum checkout.'};
   return {ok:true,message:'Simulasi ringkasan pesanan dibuka'};
  }
 });

 // 5J.3: Editor checkout terikat pada baris checkout, bukan indeks keranjang.
 // Satu editor bottom sheet untuk keranjang dan checkout; hanya sumber data yang berbeda.
 function nineDraftEdit(index){
   window.imamstoreV42?.openVariant(index,'checkout');
 }
 document.addEventListener('imamstore:checkout-variant-updated',event=>{
   const updated=event.detail?.items;
   if(!Array.isArray(updated)||!draft.classList.contains('open'))return;
   draftItems=updated;
   window.imamstoreRefreshCartBadge?.();
   const target=el('s5DraftItems');target.replaceChildren();
   updated.forEach(x=>target.append(row(x,false)));
   text('s5DraftTotal','SIMULASI — bukan pesanan. Subtotal (belum termasuk ongkir): '+total(updated));
   window.imamstoreV43?.publishQuote?.();
   document.dispatchEvent(new Event('imamstore:quote-refresh'));
 });
 function nineDecorateDraft(){
   if(!draft.classList.contains('open'))return;
   const target=el('s5DraftItems'),lines=window.__nexaiCheckoutLines;
   if(!target||!Array.isArray(lines))return;
   [...target.children].forEach((card,i)=>{
     if(!lines[i]||card.querySelector('.nine-checkout-edit-btn'))return;
     const btn=document.createElement('button');btn.type='button';btn.className='nine-checkout-edit-btn';
     btn.textContent='Ubah Varian / Jumlah';
     const lineId=String(lines[i].__checkoutLineId||'checkout-'+i+'-'+String(lines[i].key));
     card.dataset.checkoutLineId=lineId;
     btn.addEventListener('click',()=>{
      const current=window.__nexaiCheckoutLines||[];
      const currentIndex=current.findIndex(x=>String(x.__checkoutLineId||'')===card.dataset.checkoutLineId);
      if(currentIndex<0){
       // Older checkout sessions may not have a stable identifier.
       const position=[...target.children].indexOf(card);
       if(position<0||position>=current.length){window.Swal?.fire?.({icon:'info',text:'Ringkasan telah diperbarui. Buka ulang checkout.'});return}
       nineDraftEdit(position);return;
      }
      nineDraftEdit(currentIndex);
     });
     (card.querySelector('main')||card).append(btn);
   });
 }
 const nineDraftTarget=el('s5DraftItems');
 if(nineDraftTarget)new MutationObserver(nineDecorateDraft).observe(nineDraftTarget,{childList:true,subtree:true});
 new MutationObserver(nineDecorateDraft).observe(draft,{attributes:true,attributeFilter:['class']});

 document.addEventListener('imamstore:open-cart',openCart);
 document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(draft.classList.contains('open'))el('s5DraftBack')?.click();
  else if(cartPanel.classList.contains('open'))el('s5CartBack')?.click();
 });
})();

