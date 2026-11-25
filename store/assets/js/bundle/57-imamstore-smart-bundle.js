(()=>{'use strict';
// Optional CMS-curated bundles. No extra Firebase listener, cart store, or checkout flow.
const ROOT='imamstoreSmartBundleSlot',DIVIDER='imamstoreSmartBundleDivider';
const money=n=>'Rp '+Math.round(Math.max(0,Number(n)||0)).toLocaleString('id-ID');
const catalog=()=>{try{return window.imamstoreV29?.products?.()||[]}catch{return []}};
const find=id=>catalog().find(p=>String(p.id)===String(id));
const label=x=>typeof x==='string'?x:String(x?.nama??x?.name??x?.label??x?.warna??'');
const variants=p=>Array.isArray(p?.varian)?p.varian.map(label).filter(Boolean):[];
const active=p=>p&&p.active!==false&&p.aktif!==false&&p.deleted!==true&&p.status!=='nonaktif';
const quote=(p,v)=>window.imamstoreUnifiedPrice?.variantQuote?.(p,v)||{verified:false,price:0};
const image=p=>{
 const v=p?.gambar,raw=typeof v==='string'?v:(v?.url||v?.src||'');
 const s=String(raw||'').trim();
 if(!s||/^(?:javascript|data|blob|file|vbscript):/i.test(s))return '/images/no-image.png';
 try{const u=new URL(s,location.origin+'/');return /^https?:$/.test(u.protocol)?u.href:'/images/no-image.png'}catch{return '/images/no-image.png'}
};
const stockNumber=x=>{
 if(x==null||x==='')return null;
 if(typeof x==='object')return stockNumber(x.jumlah??x.qty??x.stock??x.quantity??x.available);
 const n=Number(x);return Number.isFinite(n)&&n>=0?Math.floor(n):null;
};
function available(p,variant){
 const v=(Array.isArray(p.varian)?p.varian:[]).find(x=>label(x)===variant);
 const st=stockNumber((v&&typeof v==='object'?(v.stok??v.stock):null)??p.stok??p.stock);
 return st===null?null:st;
}
const state=new Map();let currentId='',renderScheduled=false;
let submitBusy=false,submitStatus='',submitResetTimer=0;
function resetSubmit(){clearTimeout(submitResetTimer);submitBusy=false;submitStatus=''}
function submitFinished(ok){
 submitBusy=false;submitStatus=ok?'success':'error';
 clearTimeout(submitResetTimer);
 submitResetTimer=setTimeout(()=>{submitStatus='';schedule()},1400);
 schedule();
}
const text=(tag,cls,value)=>{const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=String(value??'');return el};
function button(cls,value,action,id,variant){
 const b=text('button',cls,value);b.type='button';b.dataset.issbAction=action;
 if(id)b.dataset.issbId=String(id);
 if(variant!==undefined)b.dataset.issbVariant=variant;
 return b;
}
function selection(id,main){
 const key=String(id);if(!state.has(key))state.set(key,{enabled:true,variant:'',qty:1});
 const v=state.get(key);if(main)v.enabled=true;return v;
}
function hide(slot){slot.hidden=true;slot.replaceChildren();const d=document.getElementById(DIVIDER);if(d)d.hidden=true}
function render(){
 const slot=document.getElementById(ROOT);if(!slot)return;
 const detail=document.getElementById('imamstoreLiveOriginalDetail');
 if(!detail?.classList.contains('open'))return hide(slot);
 const id=String(window.imamstoreActiveProduct?.id??new URLSearchParams(location.search).get('product')??'');
 const main=find(id);
 if(!id||!main||main.bundleEnabled!==true||!Array.isArray(main.bundleProductIds))return hide(slot);
 const ids=[...new Set(main.bundleProductIds.map(String))].filter(x=>x&&x!==id).slice(0,3);
 const extras=ids.map(find).filter(active);
 if(!extras.length)return hide(slot);
 if(currentId!==id){currentId=id;state.clear();resetSubmit()}
 const rows=[main,...extras],idsInUse=new Set(rows.map(p=>String(p.id)));
 for(const old of [...state.keys()])if(!idsInUse.has(old))state.delete(old);
 const wrap=document.createElement('div');wrap.className='issb-panel';
 const head=document.createElement('div');head.className='issb-header';
 head.append(text('h3','','Beli Bersamaan'),text('p','','Pilih produk pelengkap yang cocok untuk pesananmu.'));
 wrap.append(head);
 let total=0,selected=0,invalid=false,selectedExtra=0;
 for(const [i,p] of rows.entries()){
  const s=selection(p.id,i===0),vars=variants(p),hasVar=!!vars.length;
  if(hasVar&&!vars.includes(s.variant))s.variant='';
  if(!hasVar)s.variant='';
  const picked=i===0||s.enabled;
  const q=hasVar&&s.variant===''?null:quote(p,s.variant);
  const stock=picked?available(p,s.variant):null;
  const valid=!picked||(q?.verified===true&&q.price>0&&(!hasVar||!!s.variant)&&stock!==0&&(stock===null||s.qty<=stock));
  if(picked){selected++;if(i>0)selectedExtra++;if(!valid)invalid=true;else total+=q.price*s.qty}
  const card=document.createElement('article');card.className='issb-item';card.dataset.issbId=String(p.id);
  const mainline=document.createElement('div');mainline.className='issb-line';
  if(i===0)mainline.append(text('span','issb-main-badge','Utama'));
  else{const ck=document.createElement('input');ck.type='checkbox';ck.className='issb-check';ck.checked=s.enabled;ck.dataset.issbCheck=String(p.id);ck.setAttribute('aria-label','Pilih '+String(p.nama||p.id));mainline.append(ck)}
  const photo=document.createElement('img');photo.className='issb-photo';photo.alt='';photo.loading='lazy';photo.src=window.imamstorePurchaseVariantPhotos?.(p,s.variant)?.[0]||image(p);mainline.append(photo);
  const info=document.createElement('div');info.className='issb-info';info.append(text('strong','issb-name',p.nama||'Produk'));
  if(p.sku)info.append(text('small','issb-sku','SKU: '+p.sku));
  info.append(text('b','issb-price',!picked?'Tidak dipilih':hasVar&&!s.variant?'Pilih varian':q?.verified?money(q.price):'Harga tidak tersedia'));
  mainline.append(info);card.append(mainline);
  if(picked){
   if(hasVar){
    const choice=document.createElement('div');choice.className='issb-variants';choice.setAttribute('role','group');choice.setAttribute('aria-label','Varian '+String(p.nama||p.id));
    for(const name of vars){const b=button('issb-variant',name,'variant',p.id,name);b.setAttribute('aria-pressed',String(s.variant===name));choice.append(b)}
    card.append(choice);
   }
   const foot=document.createElement('div');foot.className='issb-foot';
   const qty=document.createElement('div');qty.className='issb-quantity';qty.append(button('issb-qty-btn','−','minus',p.id),text('span','issb-qty-label',s.qty),button('issb-qty-btn','+','plus',p.id));
   const status=stock===0?'Stok habis':stock!==null&&s.qty>stock?'Stok tidak cukup':hasVar&&!s.variant?'Pilih varian dahulu':!q?.verified?'Harga belum tersedia':'';
   foot.append(qty,text('small','issb-status',status));card.append(foot);
  }
  wrap.append(card);
 }
 const bottom=document.createElement('div');bottom.className='issb-summary';
 const amount=document.createElement('div');amount.append(text('small','','Estimasi subtotal'));amount.append(text('strong','',invalid?'Lengkapi pilihan':money(total)));
 const submitLabel=submitBusy?'Memproses…':submitStatus==='success'?'✓ Berhasil Ditambahkan':submitStatus==='error'?'Gagal · Coba Lagi':'Tambah '+selected+' Produk ke Keranjang';
 const submit=button('issb-submit',submitLabel,'submit');
 submit.disabled=invalid||selectedExtra<1||submitBusy||submitStatus==='success';
 if(submitBusy)submit.classList.add('issb-submit--processing');
 if(submitStatus==='success')submit.classList.add('issb-submit--success');
 if(submitStatus==='error')submit.classList.add('issb-submit--error');
 bottom.append(amount,submit);wrap.append(bottom);
 wrap.append(text('p','issb-note','Harga dan stok akan dicek ulang ketika ditambahkan ke keranjang. Voucher dan ongkir dihitung saat checkout.'));
 slot.replaceChildren(wrap);slot.hidden=false;
 const divider=document.getElementById(DIVIDER);if(divider)divider.hidden=false;
}
function schedule(){if(renderScheduled)return;renderScheduled=true;requestAnimationFrame(()=>{renderScheduled=false;render()})}
// Only the dedicated section owns these controls, never other detail input handlers.
document.addEventListener('click',event=>{
 const b=event.target.closest?.('[data-issb-action]');if(!b||!b.closest('#'+ROOT))return;
 event.preventDefault();event.stopPropagation();
 const id=b.dataset.issbId,action=b.dataset.issbAction,s=id&&state.get(String(id));
 if(action==='variant'&&s)s.variant=b.dataset.issbVariant||'';
 else if(action==='plus'&&s)s.qty=Math.min(999,s.qty+1);
 else if(action==='minus'&&s)s.qty=Math.max(1,s.qty-1);
 else if(action==='submit'){
  if(b.disabled||submitBusy)return;
  const main=find(currentId),ids=[String(currentId),...(main?.bundleProductIds||[]).map(String)];
  const lines=[...new Set(ids)].filter(id=>state.get(id)?.enabled).map(id=>({id,variant:state.get(id)?.variant||'',qty:state.get(id)?.qty||1}));
  submitBusy=true;submitStatus='';
  b.disabled=true;b.classList.add('issb-submit--processing');b.textContent='Memproses…';
  // Beri kesempatan tombol berubah sebelum penyimpanan sinkron berlangsung.
  const requestProductId=currentId;
  setTimeout(()=>{
   if(requestProductId!==currentId){resetSubmit();return}
   let result;
   try{result=window.imamstoreCartBridge?.addProducts?.(lines)||{ok:false,message:'Keranjang belum siap'}}
   catch(err){console.error('Smart Bundle add:',err);result={ok:false,message:'Gagal menambahkan produk. Coba lagi.'}}
   submitFinished(result.ok===true);
   if(result.ok)window.imamstoreRefreshCartBadge?.();
   window.imamstoreCartAddFeedback?.({ok:result.ok===true,message:result.message});
  },90);
  return;
 }
 schedule();
},true);
document.addEventListener('change',event=>{
 const t=event.target;if(!t?.matches?.('#'+ROOT+' [data-issb-check]'))return;
 const s=state.get(String(t.dataset.issbCheck));if(s)s.enabled=t.checked;
 schedule();
},true);
document.addEventListener('imamstore:bundle-detail',schedule);
document.addEventListener('imamstore:catalog-updated',schedule);
document.addEventListener('imamstore:flash-price-change',schedule);
// Handles a detail opened before this module was loaded (direct link / CMS hydration).
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
