
(()=>{'use strict';
 const el=id=>document.getElementById(id),cartPanel=el('s5Cart'),draft=el('s5Draft');
 const STORAGE='imamstore_cart_stage5';let item=null,images=[],idx=0,selected=null,previousFocus=null,startX=0,draftItems=null,draftOrigin='cart';
 const safeUrl=x=>{const raw=typeof productImageUrl==='function'?productImageUrl(x):String(x||'');const u=String(raw||'').trim();return /^(?:javascript|data|vbscript|file):/i.test(u)||/[\u0000-\u001f]/.test(u)?'':u};
 const fmt=n=>'Rp '+Math.round(Math.max(0,Number(n)||0)).toLocaleString('id-ID');
 const getPrice=p=>typeof price==='function'?price(p):Number(p.harga?.promo||p.harga?.normal||0);
 const variantName=v=>v==null?'':typeof v==='string'?v:String(v.nama||v.name||v.label||v.warna||'');
 // 'Default' is the sole canonical cart identity for a product without actual variants.
 // A product that defines a real 'Default' variant still uses its real variant record.
 const cartVariant=(p,variant)=>Array.isArray(p?.varian)&&p.varian.length?String(variant??''):'Default';
 const variantPrice=(p,v)=>{const name=variantName(v);const q=window.imamstoreUnifiedPrice?.variantQuote?.(p,name);return q?.verified&&q.price>0?q.price:NaN};
 const variantImage=(p,variant)=>safeUrl(window.imamstorePurchaseVariantPhotos?.(p,variant)?.[0]||p?.gambar?.url||p?.gambar?.src||p?.gambar);
 const stockValue=v=>{if(v==null||v==='')return NaN;if(typeof v==='object')return stockValue(v.jumlah??v.qty??v.stock??v.quantity??v.available);const n=Number(v);return Number.isFinite(n)&&n>=0?Math.floor(n):NaN};
 const liveProduct=id=>(typeof products!=='undefined'&&Array.isArray(products)?products:[]).find(p=>String(p.id)===String(id));
 // One-time, in-place reconciliation of old 'id|' and 'id|Default' cart rows.
 // Only products confirmed to have no real variants are eligible; other SKU keys stay distinct.
 function reconcileNoVariantRows(lines){
  const groups=new Map(),next=[],moved=new Map();let changed=false;
  for(const line of lines){
   const p=liveProduct(line.id),name=String(line.varian??'').trim();
   const plain=!!p&&(!Array.isArray(p.varian)||p.varian.length===0)&&(!name||name.toLowerCase()==='default');
   if(!plain){next.push(line);continue}
   const key=String(p.id)+'|Default';
   const row={...line,key,varian:'Default'};
   if(!groups.has(key)){
    groups.set(key,next.length);next.push(row);
   }else{
    const prior=next[groups.get(key)];prior.qty+=row.qty;
    // Never silently truncate quantities or discard a cart line on overflow.
    if(prior.qty>999)return lines;
    const verified=variantPrice(p,null);
    if(Number.isFinite(verified))prior.harga=verified;
    changed=true;
   }
   if(line.key!==key||line.varian!=='Default')changed=true;
   if(!moved.has(key))moved.set(key,[]);
   moved.get(key).push(String(line.key));
  }
  if(!changed)return lines;
  // A merged row is left unselected if *any* old row was unselected.
  // This avoids adding previously unchecked quantities to checkout silently.
  let selection={};try{selection=JSON.parse(localStorage.getItem('imamstore_cart_selection_v43')||'{}')||{}}catch{}
  const updated={...selection};
  for(const [key,oldKeys] of moved){
   if(oldKeys.some(old=>selection[old]===false))updated[key]=false;
   else delete updated[key];
   for(const old of oldKeys)if(old!==key)delete updated[old];
  }
  const oldSelection=localStorage.getItem('imamstore_cart_selection_v43');
  try{
   localStorage.setItem('imamstore_cart_selection_v43',JSON.stringify(updated));
   localStorage.setItem(STORAGE,JSON.stringify(next));
   return next;
  }catch(err){
   console.warn('Rekonsiliasi keranjang gagal; data lama dipertahankan',err);
   try{if(oldSelection===null)localStorage.removeItem('imamstore_cart_selection_v43');else localStorage.setItem('imamstore_cart_selection_v43',oldSelection)}catch{}
   return lines;
  }
 }
 const read=()=>{try{const v=JSON.parse(localStorage.getItem(STORAGE)||'[]');return Array.isArray(v)?reconcileNoVariantRows(v.filter(x=>x&&typeof x.id==='string'&&typeof x.key==='string'&&Number.isFinite(Number(x.qty))&&Number(x.qty)>0&&Number.isFinite(Number(x.harga))&&Number(x.harga)>0&&Number(x.qty)<=999).slice(0,200).map(x=>({...x,qty:Math.min(999,Math.floor(Number(x.qty))),harga:Number(x.harga)}))):[]}catch{return []}};
 const save=v=>{try{localStorage.setItem(STORAGE,JSON.stringify(v));return true}catch(e){console.warn('Cart storage unavailable',e);return false}};
 const text=(id,value)=>{el(id).textContent=String(value??'')};
 function row(x,editable){const wrap=document.createElement('div');wrap.className='s5-item';const img=document.createElement('img');img.src=safeUrl(x.gambar);img.alt='';const main=document.createElement('main'),name=document.createElement('h3');name.textContent=x.nama;main.append(name);const desc=document.createElement('p');desc.textContent=[x.varian,fmt(x.harga)].filter(Boolean).join(' · ');main.append(desc);const qty=document.createElement('div');qty.className='s5-qty';if(editable){const minus=document.createElement('button');minus.textContent='−';minus.setAttribute('aria-label','Kurangi jumlah');minus.onclick=()=>update(x.key,-1);qty.append(minus)}const label=document.createElement('span');label.textContent='Jumlah: '+x.qty;qty.append(label);if(editable){const plus=document.createElement('button');plus.textContent='+';plus.setAttribute('aria-label','Tambah jumlah');plus.onclick=()=>update(x.key,1);qty.append(plus)}main.append(qty);wrap.append(img,main);return wrap}
 function update(key,delta){const data=read(),x=data.find(i=>i.key===key);if(!x)return;const p=liveProduct(x.id);if(delta>0&&p){const v=(Array.isArray(p.varian)?p.varian:[]).find(y=>variantName(y)===x.varian);const rawStock=(v&&typeof v==='object'?(v.stok??v.stock):null)??p.stok??p.stock;const stock=stockValue(rawStock);if(Number.isFinite(stock)&&stock>=0&&x.qty>=stock){if(window.Swal?.fire)window.Swal.fire({icon:'info',text:'Jumlah melebihi stok tersedia.',confirmButtonText:'OK'});else console.warn('Jumlah melebihi stok tersedia.');return}}x.qty=Math.min(999,x.qty+delta);if(!save(data.filter(i=>i.qty>0)))console.warn('ImamStore: cart update not saved');renderCart();window.__nineSyncVisibleTotals?.();document.dispatchEvent(new CustomEvent('nine:cartchange',{detail:{source:'qty-change',id:x.id}}))}
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
 function openDraft(lines){draftOrigin=Array.isArray(lines)?'detail':'cart';const data=Array.isArray(lines)?lines:read().filter(x=>window.imamstoreV43?.isSelected?.(x.key)!==false);if(!data.length)return;
 // Never treat a locally saved price as authoritative. Recheck product, variant and price.
 const warnings=[];const checked=[];
 for(const line of data){const p=liveProduct(line.id);if(!p){warnings.push(line.nama+': data produk belum tersedia; tunggu katalog dimuat.');continue}
 if(p.active===false||p.deleted===true||p.aktif===false||p.status==='nonaktif'){warnings.push(line.nama+': produk tidak aktif.');continue}
 const variants=Array.isArray(p.varian)?p.varian:[];const v=variants.find(x=>variantName(x)===line.varian);
 if(variants.length&&!v){warnings.push(line.nama+': varian sudah tidak tersedia.');continue}
 const rawStock=(v&&typeof v==='object'?(v.stok??v.stock):null)??p.stok??p.stock;const stock=stockValue(rawStock);
 if(Number.isFinite(stock)&&stock>=0&&line.qty>stock){warnings.push(line.nama+': stok kurang dari jumlah dalam keranjang.');continue}
 const current=variantPrice(p,v||null);if(!Number.isFinite(current)||current<=0){warnings.push(line.nama+': harga tidak valid.');continue}
 if(current!==Number(line.harga)){warnings.push(line.nama+': harga berubah dari '+fmt(line.harga)+' menjadi '+fmt(current)+'.');continue}
 checked.push({...line,harga:current})}
 if(warnings.length){alert('Ringkasan pesanan ditahan karena data katalog berubah atau belum siap:\n\n'+warnings.join('\n')+'\n\nPeriksa ulang produk sebelum melanjutkan.');return false}
 if(!checked.length)return false;window.__nexaiCheckoutLines=checked.map((x,i)=>({...x,__checkoutLineId:'checkout-'+i+'-'+String(x.key)}));window.__nexaiCheckoutMode=draftOrigin;draftItems=window.__nexaiCheckoutLines;window.imamstoreV43?.beginCheckout?.(draftOrigin);cartPanel.classList.remove('open');draft.classList.add('open');document.body.classList.add('stage4-detail-open');
 let notice=document.getElementById('nineVoucherReconcileNotice');
 if(!notice){notice=document.createElement('div');notice.id='nineVoucherReconcileNotice';notice.setAttribute('role','status');notice.hidden=true;el('s5DraftItems')?.before(notice)}
 notice.hidden=true;notice.textContent='';
 const target=el('s5DraftItems');target.replaceChildren();checked.forEach(x=>target.append(row(x,false)));text('s5DraftTotal','SIMULASI — bukan pesanan. Subtotal (belum termasuk ongkir): '+total(checked));window.imamstoreV43?.publishQuote?.();document.dispatchEvent(new Event('imamstore:quote-refresh'));return true}
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
  addProduct(id,variant,qty){
   const p=liveProduct(id);if(!p)return {ok:false,message:'Produk tidak ditemukan'};
   const variants=Array.isArray(p.varian)?p.varian:[];
   variant=cartVariant(p,variant);
   const v=variants.find(x=>variantName(x)===variant);
   if(variants.length&&!v)return {ok:false,message:'Pilih varian yang tersedia'};
   const count=Math.floor(Number(qty));if(!Number.isFinite(count)||count<1||count>999)return {ok:false,message:'Jumlah tidak valid'};
   if(p.aktif===false||p.active===false||p.deleted===true||p.status==='nonaktif')return {ok:false,message:'Produk tidak aktif'};
   const rawStock=(v&&typeof v==='object'?(v.stok??v.stock):null)??p.stok??p.stock;
   const stock=stockValue(rawStock);
   const data=read(),key=String(p.id)+'|'+variant,old=data.find(x=>x.key===key),existing=old?.qty||0;
   if(Number.isFinite(stock)&&stock>=0&&existing+count>stock)return {ok:false,message:'Jumlah melebihi stok tersedia'};
   const unit=variantPrice(p,v||null);if(!Number.isFinite(unit)||unit<=0)return {ok:false,message:'Harga produk tidak valid'};
   if(old){old.qty+=count;old.harga=unit;}else{
    if(data.length>=200)return {ok:false,message:'Keranjang penuh'};
    data.push({key,id:String(p.id),nama:String(p.nama||''),varian:variant,harga:unit,gambar:variantImage(p,variant),qty:count});
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
    const variants=Array.isArray(p.varian)?p.varian:[],variant=cartVariant(p,line?.variant);
    const v=variants.find(x=>variantName(x)===variant);
    if(variants.length&&!v)return {ok:false,message:'Pilih varian: '+String(p.nama||p.id)};
    const qty=Number(line?.qty);
    if(!Number.isSafeInteger(qty)||qty<1||qty>999)return {ok:false,message:'Jumlah produk tidak valid'};
    const key=String(p.id)+'|'+variant;
    if(keys.has(key))return {ok:false,message:'Produk yang sama dipilih dua kali'};
    keys.add(key);
    const stock=stockValue((v&&typeof v==='object'?(v.stok??v.stock):null)??p.stok??p.stock);
    const old=next.find(x=>x.key===key),existing=old?.qty||0;
    if(existing+qty>999)return {ok:false,message:'Jumlah keranjang melebihi batas'};
    if(Number.isFinite(stock)&&existing+qty>stock)return {ok:false,message:'Stok tidak cukup: '+String(p.nama||p.id)};
    const unit=variantPrice(p,v||null);
    if(!Number.isFinite(unit)||unit<=0)return {ok:false,message:'Harga belum tersedia: '+String(p.nama||p.id)};
    if(old){old.qty=existing+qty;old.harga=unit;}
    else{
     if(next.length>=200)return {ok:false,message:'Keranjang penuh'};
     next.push({key,id:String(p.id),nama:String(p.nama||''),varian:variant,harga:unit,gambar:variantImage(p,variant),qty});
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
   const variants=Array.isArray(p.varian)?p.varian:[];variant=cartVariant(p,variant);const v=variants.find(x=>variantName(x)===variant);
   if(variants.length&&!v)return {ok:false,message:'Pilih varian yang tersedia'};
   const count=Math.floor(Number(qty));if(!Number.isFinite(count)||count<1||count>999)return {ok:false,message:'Jumlah tidak valid'};
   if(p.aktif===false||p.active===false||p.deleted===true||p.status==='nonaktif')return {ok:false,message:'Produk tidak aktif'};
   const unit=variantPrice(p,v||null);if(!Number.isFinite(unit)||unit<=0)return {ok:false,message:'Harga tidak valid'};
   const rawStock=(v&&typeof v==='object'?(v.stok??v.stock):null)??p.stok??p.stock;
   const stock=stockValue(rawStock);
   if(Number.isFinite(stock)&&stock>=0&&count>stock)return {ok:false,message:'Stok tidak mencukupi'};
   openDraft([{key:String(p.id)+'|'+variant,id:String(p.id),nama:String(p.nama||''),varian:variant,harga:unit,gambar:variantImage(p,variant),qty:count}]);
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

