
(()=>{'use strict';
const host=document.getElementById('imamstoreLiveOriginalDetail');
let allProducts=[],currentProduct=null,currentPage='store',selectedVariant='Default',selectedQty=1,stickyClosed=false,lastCategory='',wishlist=[];
const noOp=()=>{};
const formatRupiah=n=>'Rp '+Math.round(Number(n)||0).toLocaleString('id-ID');
const formatProductSold=n=>window.imamstoreFormatSold(n);
const updateStickySummary=noOp,initStickyCheckout=noOp,nineSyncHeaderCart=noOp,updateDetailProductBadge=noOp;
// Satu sumber nilai views yang sudah dikonfirmasi oleh Firestore server.
// Jangan mengambil angka awal dari katalog/cache untuk toast share-link.
const confirmedProductViews=new Map();
let viewUnsubscribe=null,viewProductId='';
function renderedProductViews(id){
 const n=confirmedProductViews.get(String(id));
 return n===undefined?'—':n.toLocaleString('id-ID');
}
function syncProductViews(id,views){
 const n=Number(views);
 if(!Number.isFinite(n)||n<0)return;
 const key=String(id),value=Math.floor(n);
 confirmedProductViews.set(key,value);
 const product=allProducts.find(p=>String(p.id)===key);
 if(product)product.views=value;
 if(String(activeProduct()?.id)===key){
  host.querySelectorAll('[data-detail-views]').forEach(el=>{
   if(el.getAttribute('data-detail-views')===key){
    el.textContent=value.toLocaleString('id-ID')+' dilihat';
   }
  });
 }
 document.dispatchEvent(new CustomEvent('nine:views-updated',{detail:{productId:key,views:value}}));
}
function subscribeProductViews(id){
 const key=String(id);
 if(key===viewProductId&&viewUnsubscribe)return;
 if(typeof viewUnsubscribe==='function')viewUnsubscribe();
 viewUnsubscribe=null;viewProductId=key;
 try{
  if(!window.firebase?.apps?.length)return;
  viewUnsubscribe=window.firebase.firestore().collection('statistik_produk').doc(key)
   .onSnapshot({includeMetadataChanges:true},snapshot=>{
    // Cache / local pending writes dapat berisi nilai sementara seperti '1'.
    // Teruskan ke tampilan dan toast hanya setelah konfirmasi server.
    if(snapshot.metadata?.fromCache||snapshot.metadata?.hasPendingWrites)return;
    if(snapshot.exists)syncProductViews(key,snapshot.data()?.views);
    else syncProductViews(key,0);
   },error=>console.warn('Statistik dilihat belum tersedia:',error));
 }catch(error){console.warn('Listener statistik dilihat:',error)}
}
async function incrementProductView(productId){
 const id=String(productId??'');
 if(!id)return null;
 subscribeProductViews(id);
 // Sama dengan web utama: statistik_produk/{id}.views dengan FieldValue.increment(1).
 // Cegah dua catatan akibat render ulang/navigasi singkat.
 const key='nine_v54_view_'+id;
 try{
  const last=Number(sessionStorage.getItem(key)||0);
  if(Date.now()-last<12000)return null;
  if(!window.firebase?.apps?.length)return null;
  sessionStorage.setItem(key,String(Date.now()));
  const ref=window.firebase.firestore().collection('statistik_produk').doc(id);
  await ref.set({
   views:window.firebase.firestore.FieldValue.increment(1),
   lastViewedAt:window.firebase.firestore.FieldValue.serverTimestamp()
  },{merge:true});
  const snapshot=await ref.get({source:'server'});
  const views=Number(snapshot.data()?.views);
  if(Number.isFinite(views)){syncProductViews(id,views);return views}
 }catch(error){
  console.warn('Gagal mencatat kunjungan produk:',error);
  try{sessionStorage.removeItem(key)}catch(_){}
 }
 return null;
}
window.addEventListener('pagehide',()=>{
 if(typeof viewUnsubscribe==='function'){viewUnsubscribe();viewUnsubscribe=null}
});
const RECENT_KEY='imamstore_recent_original_v60';
function productTile(p){
 // Reuse the original store-profile product-card renderer (card),
 // including live rating, sales, views, price, voucher and Flash Sale badge.
 const template=document.createElement('template');
 const render=window.imamstoreOriginalCardRenderer;
 if(typeof render!=='function'){
  console.warn('Renderer kartu profil Store belum tersedia.');
  return document.createElement('span');
 }
 template.innerHTML=render(p).trim();
 const element=template.content.firstElementChild;
 if(!element)return document.createElement('span');
 // Global [data-product-id] click/keyboard delegation already handles navigation.
 element.classList.add('nine-profile-reused-card');
 return element;
}
function fillProducts(id,items){const root=host.querySelector('#'+id);if(!root)return;root.replaceChildren(...items.map(productTile))}
function renderRelated(p){
 const root=host.querySelector('#relatedProducts');if(!root)return;
 const list=allProducts.filter(x=>String(x.id)!==String(p.id)&&x.kategori===p.kategori).slice(0,15);
 fillProducts('relatedProducts',list);
 const more=document.createElement('button');more.type='button';more.className='nine-related-see-all';more.setAttribute('aria-label','Lihat semua produk toko');
 const circle=document.createElement('span');circle.className='nine-related-see-all-icon';circle.setAttribute('aria-hidden','true');circle.textContent='›';
 const label=document.createElement('span');label.textContent='Lihat Semua';more.append(circle,label);
 more.addEventListener('click',()=>host.querySelector('#nineAllProductsSection')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));
 root.append(more);root.scrollLeft=0;
}
function saveRecent(p){let ids=[];try{ids=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]')}catch{}ids=[String(p.id),...ids.filter(x=>String(x)!==String(p.id))].slice(0,20);try{localStorage.setItem(RECENT_KEY,JSON.stringify(ids))}catch{}const history=ids.filter(id=>id!==String(p.id)).map(id=>allProducts.find(x=>String(x.id)===id)).filter(Boolean);fillProducts('recentProducts',history)}
function nineRenderAllProducts(page=1){
 const p=activeProduct(),list=allProducts.filter(x=>String(x.id)!==String(p?.id)).sort((a,b)=>Number(b.kategori===p?.kategori)-Number(a.kategori===p?.kategori));
 const per=12,total=Math.max(1,Math.ceil(list.length/per)),current=Math.min(total,Math.max(1,Number(page)||1));
 fillProducts('nineAllProductsGrid',list.slice((current-1)*per,current*per));
 const nav=host.querySelector('#nineAllPagination');if(!nav)return;
 nav.replaceChildren();
 const button=(label,pageNumber,disabled=false)=>{
  const b=document.createElement('button');b.type='button';b.textContent=label;
  b.disabled=disabled;b.className='nine-page-premium';
  if(pageNumber===current&&/^\d+$/.test(label))b.setAttribute('aria-current','page');
  b.onclick=()=>{nineRenderAllProducts(pageNumber);host.querySelector('#nineAllProductsSection')?.scrollIntoView({block:'start',behavior:'smooth'})};
  nav.append(b);
 };
 button('‹',Math.max(1,current-1),current===1);
 const numbers=new Set([1,total,current-1,current,current+1].filter(n=>n>=1&&n<=total));
 let last=0;
 for(const n of [...numbers].sort((x,y)=>x-y)){
  if(n-last>1){const dots=document.createElement('span');dots.textContent='…';dots.className='nine-page-ellipsis';nav.append(dots)}
  button(String(n),n);last=n;
 }
 button('›',Math.min(total,current+1),current===total);
}

const renderPage=html=>{host.innerHTML=html;host.classList.add('open');document.body.classList.add('imamstore-original-open');host.scrollTop=0;window.imamstoreUnifiedCards?.syncStoreIdentity?.();window.imamstorePresenceSync?.();};
window.nineEffectivePromo=window.nineEffectivePromo||((p)=>Number(p.harga?.promo)||0);
window.nineFlashActive=window.nineFlashActive||(()=>false);
function imageOf(x){const v=typeof x==='string'?x:(x?.url||x?.src||x?.gambar||'');if(typeof v!=='string'||!v.trim()||/^(?:javascript|blob|file|vbscript):/i.test(v.trim()))return '/images/no-image.png';if(/^data:image\/(?:png|jpeg|jpg|webp|gif|avif);base64,/i.test(v.trim()))return v.trim();try{return new URL(v.trim(),location.origin+'/').href}catch{return '/images/no-image.png'}}
function adapt(p){const raw=p.harga;const n=Number(typeof raw==='object'?raw?.normal:raw);const promo=Number(typeof raw==='object'?raw?.promo:p.hargaPromo);const v=Array.isArray(p.varian)?p.varian.map(x=>typeof x==='string'?x:String(x?.nama||x?.name||x?.label||x?.warna||'')).filter(Boolean):[];const pictures=[...(Array.isArray(p.gallery)?p.gallery:[]),...(Array.isArray(p.galeri)?p.galeri:[]),...(Array.isArray(p.images)?p.images:[])].map(imageOf).filter(Boolean);return {...p,id:String(p.id),nama:String(p.nama||''),gambar:imageOf(p.gambar),gallery:pictures,harga:{normal:Number.isFinite(n)?n:0,promo:Number.isFinite(promo)&&promo>0?promo:null},varian:v,stok:typeof p.stok==='object'&&p.stok?p.stok:{status:Number(p.stok)===0?'Habis':'Ready',jumlah:p.stok},garansi:p.garansi||{},spesifikasi:p.spesifikasi||{},views:Number(p.views)||0,terjual:Number(p.terjual)||0}}
// BEGIN UNMODIFIED ORIGINAL showProduct SOURCE
async function showProduct(nama, options = {}){
  
const productRoot = document.getElementById("product-grid-auto");
if(productRoot){
    productRoot.classList.remove("search-product-mode", "category-mode");
}

currentPage = "product";

const product = allProducts.find(
p => p.nama === nama
);

if(!product) return;

currentProduct = product;

// Navigasi detail memakai URL kanonis dan History API.
// Ketika membuka produk lain, alamat harus ikut berubah.
if(!window.__nineHandlingHistory){
    const target = new URL(window.location.href);
    target.searchParams.set('product',String(product.id));
    const previous = new URLSearchParams(window.location.search).get('product');
    if(previous !== String(product.id)){
        history.pushState({nineProductId:String(product.id)},'',target.pathname+target.search+target.hash);
    }else if(!history.state?.nineProductId){
        history.replaceState({...(history.state||{}),nineProductId:String(product.id)},'',target.pathname+target.search+target.hash);
    }
}

// Catat view asli setiap kali halaman detail produk dibuka.
// Tidak memblokir render detail jika jaringan/Firestore sedang lambat.
Promise.resolve()
    .then(() => options.skipView ? null : (window.V54Views ? window.V54Views.visit(product.id) : incrementProductView(product.id)))
    .then((views) => {
        if(views!==null&&views!==undefined&&Number.isFinite(Number(views))){
            product.views = Number(views);
            requestAnimationFrame(() => {
                if(typeof installInterestBadge === "function"){
                    installInterestBadge();
                }
            });
        }
    })
    .catch((error) => {
        console.warn("View counter tidak dapat diperbarui:", error);
    });

// Selalu sinkronkan varian terpilih dengan data yang sudah dinormalisasi.
selectedVariant = options.preserveVariant && product.varian?.includes(selectedVariant) ? selectedVariant : (product.varian?.[0] || "Default");
selectedQty = 1;

stickyClosed = false;

lastCategory = product.kategori;

// Statistik detail dihidratasi melalui satu listener realtime yang sama
// dengan card. Jangan melakukan pembacaan awal terpisah di sini.
const sold = Number.isFinite(Number(product.terjual)) && Number(product.terjual)>0 ? Number(product.terjual) : 0;
const ratingData = { rating: 0, count: 0 };

let html = `
<div class="nine-detail-shell" id="nineDetailShell">
  <div class="nine-detail-topbar">
    <button type="button" onclick="backToProducts()" aria-label="Kembali"><i class="fa-solid fa-arrow-left"></i></button>
    <div class="nine-search-capsule"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="nineDetailSearchInput" type="search" autocomplete="off" placeholder="Cari lampu LED, Projector, Foglamp..." aria-label="Cari produk"></div>
    <button type="button" class="nine-header-cart" onclick="goCart()" aria-label="Keranjang"><i class="fa-solid fa-cart-shopping"></i><span id="nineHeaderCartCount" hidden></span></button>
    <button type="button" class="nine-share-btn" data-share-product="${product.id}" aria-label="Bagikan produk"><i class="fa-solid fa-share-nodes"></i></button>
  </div>
  <div class="product-detail">
    <div class="product-header">
      <div class="gallery-column">
        <div class="gallery-main">
          <img id="mainProductImage" src="${product.gambar}" alt="${product.nama}" onclick="openLightbox()" onerror="this.onerror=null;this.src='/images/no-image.png'">
          <button type="button" class="nine-gallery-prev" onclick="nineStepGallery(-1)" aria-label="Foto sebelumnya">&#10094;</button><button type="button" class="nine-gallery-next" onclick="nineStepGallery(1)" aria-label="Foto berikutnya">&#10095;</button><span class="nine-gallery-count">1 / ${(product.gallery||[]).length+1}</span>
        </div>
        <div class="gallery-thumb">
          <img class="active" src="${product.gambar}" alt="Foto utama" onclick="changeGallery(this)">
          ${(product.gallery||[]).map((img,i)=>`<img src="${img}" alt="Foto ${i+2}" onclick="changeGallery(this)" onerror="this.style.display='none'">`).join("")}
        </div>
      </div>
      <div class="product-info">
        ${`<div class="nine-detail-flash-badge" ${window.nineFlashActive(product)?'':'hidden'}><strong class="nine-flash-label" aria-label="Flash Sale"><i class="fa-solid fa-bolt" aria-hidden="true"></i><span>FLASH SALE</span></strong><span class="nine-flash-timer" data-nine-flash-end="${product.flashSale?.endAt||''}">Berakhir --:--:--</span></div>`}
        <div class="nine-old-price">${window.nineEffectivePromo(product) && product.harga?.normal>window.nineEffectivePromo(product) ? `<del>Rp ${product.harga.normal.toLocaleString("id-ID")}</del><span class="nine-discount-percent">-${Math.round((1-window.nineEffectivePromo(product)/product.harga.normal)*100)}%</span>` : ""}</div>
        <div class="nine-price-row">
          <div class="price">Rp ${(window.nineEffectivePromo(product) || product.harga?.normal || 0).toLocaleString("id-ID")}</div>${window.nineEffectivePromo(product) && product.harga?.normal>window.nineEffectivePromo(product) ? `<span class="nine-saving">Hemat Rp ${(product.harga.normal-window.nineEffectivePromo(product)).toLocaleString("id-ID")}</span>` : ""}
        </div><div class="nine-meta-actions">
          <button type="button" class="nine-voucher" onclick="nineOpenOriginalVoucher()"><i class="fa-solid fa-ticket" aria-hidden="true"></i> Voucher</button>
          <div class="nine-meta-stats"><span class="nine-detail-views" data-detail-views="${product.id}">${renderedProductViews(product.id)} dilihat</span><span class="detail-product-sold" data-detail-sold="${product.id}">${formatProductSold(Number(sold)||Number(product.terjual)||Number(product.sold)||Number(product.totalTerjual)||0)} terjual</span></div><button class="wishlist-btn" type="button" aria-label="Favorit">${wishlist.some(w=>String(w)===String(product.id)) ? "❤️" : "🤍"}</button></div>
        <div class="product-title"><h2>${product.brand ? `<span class="nine-inline-brand">${product.brand}</span> ` : ""}${product.nama}</h2></div>
        <div class="product-highlights">
          <span><i class="fa-solid fa-circle-check"></i><small>${product.stok?.status || "Ready"}</small></span>
          <span data-detail-rating-badge="${product.id}"><i class="fa-solid fa-star"></i><small>Rating —</small></span>
          <span><i class="fa-solid fa-shield-halved"></i><small>${product.garansi?.lama || "Garansi"}</small></span>
          <span><i class="fa-solid fa-truck-fast"></i><small>Seluruh Indonesia</small></span>
        </div>
        <div class="nine-detail-divider"></div>
        <input type="hidden" id="varian" value="${selectedVariant}">
        <section class="nine-review-section">
          <div class="nine-review-heading"><strong><span data-detail-rating="${product.id}">—</span> <span id="nineReviewCount"></span></strong><button type="button" onclick="nineOpenReviews()">Lihat Semua <i class="fa-solid fa-chevron-right"></i></button></div>
          <details class="nine-review-composer"><summary>Beri Ulasan Pembeli <i class="fa-solid fa-chevron-down"></i></summary><div class="nine-review-form"><div class="nine-review-stars" id="nineReviewStars">${[1,2,3,4,5].map(n=>`<button type="button" onclick="nineSetReviewStars(${n})" aria-label="${n} bintang">★</button>`).join("")}</div><textarea id="v17ReviewText" placeholder="Ceritakan pengalamanmu (opsional). Penilaian bintang tetap diperlukan." maxlength="1200" rows="3"></textarea><button type="button" onclick="nineSubmitDetailReview(this)">Kirim Ulasan</button></div></details><div id="nineReviewPreview" class="nine-review-preview"></div>
        </section>
        <div class="nine-detail-divider"></div>
        <div class="nine-store">
          <div class="nine-store-identity"><a class="nine-store-avatar" href="https://store.imamsales.com/" aria-label="Kunjungi Store Imam Sales"><i class="fa-solid fa-store"></i></a><div><a class="nine-store-name-link" href="https://store.imamsales.com/">store.imamsales.com</a><small data-nine-store-presence aria-live="polite">Memuat status toko...</small></div><button type="button" onclick="nineVisitStore()">Kunjungi</button></div>
          <div class="nine-store-stats"><div><strong data-nine-store-rating aria-live="polite">—</strong><small>Penilaian</small></div><div><strong>${allProducts.length}</strong><small>Produk</small></div><div><strong>—</strong><small>Chat Dibalas</small></div></div>
        </div>
        <div class="nine-detail-divider"></div>
        <section class="issb-slot" id="imamstoreSmartBundleSlot" hidden aria-label="Beli Bersamaan"></section>
        <div class="nine-detail-divider issb-slot-divider" id="imamstoreSmartBundleDivider" hidden></div>
        <section class="nine-store-related" aria-label="Produk lain di toko ini">
          <div class="nine-store-related-head"><h3>Produk Lain di Toko Ini</h3></div>
          <div id="relatedProducts" class="nine-store-related-track" aria-label="Geser untuk melihat produk lain"></div>
        </section>
        <div class="nine-detail-divider"></div>
        <button type="button" class="nine-detail-link" onclick="nineOpenSpecs()"><span>Spesifikasi Produk</span><i class="fa-solid fa-chevron-right"></i></button>
        <div class="nine-detail-divider"></div>
        <section class="nine-description"><div class="nine-section-head">Deskripsi Produk</div><div class="nine-description-text" id="nineDescription">${product.deskripsi || "Belum ada deskripsi."}</div><button type="button" id="nineDescToggle" onclick="nineToggleDescription()">Selengkapnya <i class="fa-solid fa-chevron-down"></i></button></section>
      </div>
    </div>
    <div class="product-bottom">
      
      <section><h2>Terakhir Dilihat</h2><div id="recentProducts" class="product-grid"></div></section><section class="nine-all-products" id="nineAllProductsSection"><h2>Mungkin Kamu Juga Suka</h2><div id="nineAllProductsGrid"></div><nav id="nineAllPagination" aria-label="Halaman produk"></nav><button type="button" class="nine-rec-see-all-wide" id="nineBrowseStoreAll" onclick="window.imamstoreShowAllStoreProducts?.()">Lihat Semua Produk <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button><button type="button" id="nineAllBackTop" aria-label="Kembali ke atas halaman detail" title="Kembali ke atas"><i class="fa-solid fa-arrow-up"></i></button></section>
    </div>
  </div>
  <div class="nine-spec-overlay" id="nineSpecOverlay" onclick="if(event.target===this)nineCloseSpecs()">
    <div class="nine-spec-sheet" role="dialog" aria-modal="true" aria-label="Spesifikasi Produk">
      <div class="nine-sheet-grip"></div>
      <div class="nine-sheet-head"><strong>Spesifikasi Produk</strong><button onclick="nineCloseSpecs()" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="nine-spec-list">${Object.entries(product.spesifikasi||{}).map(([k,v])=>`<div class="nine-spec-item"><span>${String(k).replace(/_/g," ")}</span><strong>${v==null||v===""?"—":(typeof v==="object"?Object.values(v).filter(x=>x!=null&&x!=="").join(", "):String(v))}</strong></div>`).join("") || '<p>Spesifikasi belum tersedia.</p>'}</div>
      <button class="nine-spec-ok" onclick="nineCloseSpecs()">OK</button>
    </div>
  </div>
  <div class="nine-review-page" id="nineReviewPage" aria-hidden="true">
    <header><button type="button" class="nine-reviews-back-v29" onclick="nineCloseReviews()" aria-label="Kembali ke detail produk"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button><strong>Penilaian &amp; Ulasan</strong></header>
    <div class="nine-review-tabs"><button class="active">Penilaian Produk</button></div>
    <div class="nine-review-filter"><button class="active" onclick="nineFilterReview(this)">Semua</button><button onclick="nineFilterReview(this)">Dengan Foto/Video</button>${[5,4,3,2,1].map(x=>`<button onclick="nineFilterReview(this)">${x} Bintang</button>`).join("")}</div>
    <div class="nine-review-page-body" id="nineReviewFullList"><p>Belum ada ulasan yang dapat ditampilkan.</p></div>
  </div>
</div>
<!-- =======================================
STICKY CHECKOUT
======================================= -->

<div id="stickyCheckout" class="sticky-checkout">

<button
id="stickyClose"
class="sticky-close"
onclick="closeStickyCheckout()"
aria-label="Tutup Sticky Checkout">

<svg
width="18"
height="18"
viewBox="0 0 24 24"
fill="none"
stroke="currentColor"
stroke-width="2"
stroke-linecap="round"
stroke-linejoin="round">

<line x1="18" y1="6" x2="6" y2="18"/>

<line x1="6" y1="6" x2="18" y2="18"/>

</svg>

</button>

<div class="sticky-content">


    <div class="sticky-product">

        <img
            id="stickyImage"
            src=""
            alt="Produk">

        <div class="sticky-info">

    <span id="stickyName"></span>
    
    <span id="stickyVariant"></span>

    <div class="sticky-price-box">

    <small
    id="stickyNormalPrice">

    </small>

    <strong
    class="sticky-price-copy">

    Rp 0

    </strong>

</div>

</div>

    </div>
    
    <div class="sticky-qty">

    <button
        type="button"
        onclick="stickyQtyMinus()">

        −

    </button>

    <span id="stickyQty">

        1

    </span>

    <button
        type="button"
        onclick="stickyQtyPlus()">

        +

    </button>

</div>

<div class="sticky-total">

    Total

    <strong id="stickyTotal">

        Rp0

    </strong>

</div>
    
  </div>

    <div class="sticky-actions">

    <button
    id="stickyChatBtn"
    class="sticky-icon-btn"
    onclick="openStickyWhatsApp()">

       <svg aria-hidden="true" viewBox="0 0 24 24" width="35" height="35" fill="#555"><path d="M9.5 3C4.8 3 1 6.2 1 10.2c0 2.1 1.1 4 2.9 5.4L3 19l4.1-2.2c.8.2 1.6.3 2.4.3 4.7 0 8.5-3.2 8.5-7.1S14.2 3 9.5 3Z"/><path d="M19 9.4c2.4 1.2 4 3.4 4 5.8 0 1.7-.8 3.2-2.1 4.3l.7 2.5-3-1.6c-.6.2-1.3.2-2 .2-2.3 0-4.3-1-5.6-2.5 5-.5 8.8-4.1 8.8-8.7H19Z"/></svg>
       

    </button>

    <button
    id="stickyCartBtn"
    class="sticky-icon-btn"
    onclick="openCartSheet()">
    

        <i class="fa-solid fa-cart-shopping"></i>

    </button>

    <button
    id="stickyBuyBtn"
    class="sticky-buy-btn"
    onclick="openBuySheet()">

        BELI SEKARANG

    </button>

</div>

</div>

</div>

`;

renderPage(html, false);
document.dispatchEvent(new CustomEvent('imamstore:bundle-detail',{detail:{id:String(product.id)}}));

const stickyPrice = document.getElementById("stickyPrice");

const stickyNormal =
document.getElementById("stickyNormalPrice");

if(stickyPrice && stickyNormal){

    const promo =
    window.nineEffectivePromo(product) || 0;

    const normal =
    product.harga?.normal || promo;

    stickyPrice.textContent =
    formatRupiah(promo);

    if(normal > promo){

        stickyNormal.textContent =
        formatRupiah(normal);

    }else{

        stickyNormal.textContent = "";

    }

}

const stickyImage = document.getElementById("stickyImage");

if (stickyImage) {
    stickyImage.src = product.gambar;
    stickyImage.alt = product.nama;
}

const stickyName = document.getElementById("stickyName");

if (stickyName) {
    stickyName.textContent = product.nama;
    
}
    const stickyVariant =
document.getElementById("stickyVariant");

const selectedVarian =
document.getElementById("varian")?.value || "";

if(stickyVariant){

    stickyVariant.textContent =
    selectedVarian;

}

/* Redundant second render removed for smoother detail transition. */

updateStickySummary();

initStickyCheckout();

renderRelated(product);

saveRecent(product);
nineRenderAllProducts(1);
nineSyncHeaderCart();

updateDetailProductBadge(product.id);

// Setelah render, baca statistik server yang sama dengan card biasa.
// Data harus diterapkan ke ID yang masih aktif, bukan detail yang sudah diganti.
const detailProductId = String(product.id);
requestAnimationFrame(() => {
    if(String(currentProduct?.id)!==detailProductId) return;
    window.__hydrateRealtimeProductStats?.(document);
});

if(!window.__productTransitionActive && !options.fromDeepLink){
    requestAnimationFrame(()=>{
        window.scrollProductDetailIntoView?.("smooth");
    });
}

}
// END UNMODIFIED ORIGINAL showProduct SOURCE
function close(){host.classList.remove('open');host.replaceChildren();document.body.classList.remove('imamstore-original-open');const url=new URL(location.href);url.searchParams.delete('product');history.replaceState(history.state,'',url.pathname+url.search+url.hash)}
window.backToProducts=()=>{closePurchase();close()};
window.goCart=()=>{close();document.dispatchEvent(new Event('imamstore:open-cart'))};
// Original detail purchase actions now use a real local cart bridge (no Firebase writes).
let purchaseMode='cart';
function activeProduct(){return window.imamstoreActiveProduct||null}
function variantOptions(p){return Array.isArray(p?.varian)?p.varian.map(v=>typeof v==='string'?v:String(v?.nama||v?.name||v?.label||'')).filter(Boolean):[]}
window.imamstorePurchaseVariantOptions=variantOptions;
function purchaseVariantPhotos(product,selectedName){
 const entries=Array.isArray(product?.varian)?product.varian:[];
 const selected=entries.find(v=>v&&typeof v==='object'&&
  String(v.nama||v.name||v.label||'')===String(selectedName));
 if(!selected)return [];
 const out=[];
 const add=value=>{
  if(typeof value==='string'&&value.trim())out.push(value);
  else if(value&&typeof value==='object'){
   const url=value.url||value.src||value.gambar||value.image||value.foto;
   if(typeof url==='string'&&url.trim())out.push(url);
  }
 };
 ['gambar','image','foto','thumbnail'].forEach(key=>add(selected[key]));
 ['gallery','galeri','images','fotoTambahan'].forEach(key=>{
  if(Array.isArray(selected[key]))selected[key].forEach(add);
 });
 return [...new Set(out)];
}
window.imamstorePurchaseVariantPhotos=purchaseVariantPhotos;
function openPurchase(mode){
 const p=activeProduct();if(!p)return;
 purchaseMode=mode;
 const panel=document.getElementById('imamstoreOriginalPurchase');if(!panel)return;
 const options=variantOptions(p);
 const selector=panel.querySelector('#imamstorePurchaseVariant');selector.replaceChildren();
 if(!options.length)selector.append(new Option('Default','Default'));
 else options.forEach(v=>selector.append(new Option(v,v)));
 selector.value=options.includes(selectedVariant)?selectedVariant:(options[0]||'Default');
 panel.querySelector('#imamstorePurchaseTitle').textContent=p.nama||'Produk';
 const sheetImage=panel.querySelector('#imamstorePurchaseImage');
 const activeImage=host.querySelector('#mainProductImage');
 sheetImage.src=imageOf(p.gambar||p.gallery?.[0]||p.galeri?.[0]);
 sheetImage.alt=p.nama||'Foto produk';
 sheetImage.onerror=()=>{sheetImage.onerror=null;sheetImage.src='/images/no-image.png'};
 const updateVariantImage=()=>{
  const photos=purchaseVariantPhotos(p,selector.value);
  if(photos.length){
   sheetImage.src=imageOf(photos[0]);
   sheetImage.dataset.variantGallery='1';
  }else{
   sheetImage.src=imageOf(p.gambar||p.gallery?.[0]||p.galeri?.[0]);
   delete sheetImage.dataset.variantGallery;
  }
 };
 selector.onchange=()=>{updateVariantImage();document.getElementById('imamstorePurchaseQty')?.dispatchEvent(new Event('input',{bubbles:true}))};
 updateVariantImage();
 // Gunakan satu pengelola preview bersama; jangan membuka lightbox lama bersamaan.
 sheetImage.onclick=null;
 panel.querySelector('#imamstorePurchaseQty').value=String(Math.max(1,selectedQty));
 panel.querySelector('#imamstorePurchaseAction').textContent=mode==='buy'?'Lihat Ringkasan Pesanan':'Masukkan Keranjang';
 panel.querySelector('#imamstorePurchaseMessage').textContent='';panel.querySelector('#imamstorePurchaseMessage').hidden=true;
 panel.hidden=false;panel.classList.add('open');
 panel.querySelector('#imamstorePurchaseAction').focus();
 queueMicrotask(()=>document.getElementById('imamstorePurchaseQty')?.dispatchEvent(new Event('input',{bubbles:true})));
}
function closePurchase(){const p=document.getElementById('imamstoreOriginalPurchase');if(p){p.classList.remove('open');p.hidden=true}}
window.openCartSheet=()=>openPurchase('cart');
window.openBuySheet=()=>openPurchase('buy');
window.openStickyWhatsApp=()=>{const p=activeProduct();if(!p)return;const msg='Halo, saya ingin bertanya tentang '+p.nama;const url='https://wa.me/?text='+encodeURIComponent(msg);window.open(url,'_blank','noopener,noreferrer')};
window.closePurchaseSheet=closePurchase;
window.closeStickyCheckout=()=>{const el=host.querySelector('#stickyCheckout');if(el)el.style.display='none'};
window.stickyQtyMinus=()=>{selectedQty=Math.max(1,selectedQty-1);host.querySelectorAll('#stickyQty').forEach(x=>x.textContent=selectedQty);updateOriginalSticky()};
window.stickyQtyPlus=()=>{selectedQty=Math.min(999,selectedQty+1);host.querySelectorAll('#stickyQty').forEach(x=>x.textContent=selectedQty);updateOriginalSticky()};
window.changeGallery=el=>{const img=host.querySelector('#mainProductImage');if(img&&el?.src){img.src=el.src;const thumbs=[...host.querySelectorAll('.gallery-thumb img')];thumbs.forEach(x=>x.classList.toggle('active',x===el));const n=thumbs.indexOf(el);const count=host.querySelector('.nine-gallery-count');if(count&&n>=0)count.textContent=`${n+1} / ${thumbs.length}`}};
let touchStart=null;
host.addEventListener('touchstart',e=>{if(!e.target.closest('.gallery-main'))return;const t=e.touches[0];if(t)touchStart={x:t.clientX,y:t.clientY}},{passive:true});
host.addEventListener('touchend',e=>{if(!touchStart||!e.target.closest('.gallery-main')){touchStart=null;return}const t=e.changedTouches[0],dx=t.clientX-touchStart.x,dy=t.clientY-touchStart.y;touchStart=null;if(Math.abs(dx)<45||Math.abs(dx)<Math.abs(dy)*1.3)return;const thumbs=[...host.querySelectorAll('.gallery-thumb img')].filter(x=>x.offsetParent!==null);if(thumbs.length<2)return;const idx=thumbs.findIndex(x=>x.classList.contains('active'));window.changeGallery(thumbs[(idx+(dx<0?1:-1)+thumbs.length)%thumbs.length])},{passive:true});
window.nineStepGallery=step=>{const thumbs=[...host.querySelectorAll('.gallery-thumb img')].filter(x=>x.getAttribute('src'));if(!thumbs.length)return;const current=Math.max(0,thumbs.findIndex(x=>x.classList.contains('active')));window.changeGallery(thumbs[(current+step+thumbs.length)%thumbs.length])};
window.openLightbox=()=>{const img=host.querySelector('#mainProductImage');if(img){const g=document.getElementById('s9Lightbox');const target=document.getElementById('s9LightboxImage');if(g&&target){target.src=img.src;g.classList.add('open')}}};
window.nineOpenOriginalVoucher=()=>window.imamstoreV43?.openVoucher?.();
let specsReturnFocus=null;
window.nineOpenSpecs=()=>{const p=host.querySelector('#nineSpecOverlay');if(!p)return;specsReturnFocus=document.activeElement;p.style.display='block';p.setAttribute('role','dialog');p.setAttribute('aria-modal','true');p.querySelector('button')?.focus()};
window.nineCloseSpecs=()=>{const p=host.querySelector('#nineSpecOverlay');if(!p)return;p.style.display='none';if(specsReturnFocus?.isConnected)specsReturnFocus.focus();specsReturnFocus=null};
let specsStart=null;
host.addEventListener('touchstart',e=>{const p=e.target.closest('#nineSpecOverlay .nine-sheet-head');if(!p)return;const touch=e.touches[0];if(touch)specsStart={y:touch.clientY,x:touch.clientX}},{passive:true});
host.addEventListener('touchend',e=>{if(!specsStart)return;const touch=e.changedTouches[0];const start=specsStart;specsStart=null;if(touch&&touch.clientY-start.y>85&&Math.abs(touch.clientX-start.x)<70)window.nineCloseSpecs()},{passive:true});
window.nineVisitStore=close;
function refreshWishlist(){
 wishlist=window.imamstoreWishlist?.ids()||[];
 const p=activeProduct();if(!p)return;
 const liked=window.imamstoreWishlist?.has(p.id)===true;
 host.querySelectorAll('.wishlist-btn').forEach(b=>{b.textContent=liked?'❤️':'🤍';b.setAttribute('aria-pressed',String(liked));b.setAttribute('aria-label',liked?'Hapus dari favorit':'Tambahkan ke favorit')});
}
let wishlistToastTimer;
function wishlistToast(message){let el=document.getElementById('imamstoreWishlistToast');if(!el){el=document.createElement('div');el.id='imamstoreWishlistToast';el.className='nine-clean-wishlist-toast';el.setAttribute('role','status');document.body.append(el)}el.textContent=message;el.hidden=false;clearTimeout(wishlistToastTimer);wishlistToastTimer=setTimeout(()=>{el.hidden=true},1900)}
document.addEventListener('nine:wishliststate',refreshWishlist);
window.toggleWishlist=async id=>{
 const target=String(id??activeProduct()?.id??'');if(!target)return;
 const result=await window.imamstoreWishlist?.toggle(target);
 if(!result?.ok){wishlistToast(result?.reason==='loading'?'Menyiapkan favorit akun. Coba lagi sebentar.':'Favorit belum tersimpan. Periksa koneksi lalu coba lagi.');return}
 if(!result.unchanged)wishlistToast(result.liked?'❤️ Ditambahkan ke Produk Favorit':'♡ Dihapus dari Produk Favorit');
};
window.nineToggleDescription=()=>{const d=host.querySelector('#nineDescription');if(d)d.classList.toggle('expanded')};
function updateOriginalSticky(){
 const p=activeProduct();if(!p)return;
 const raw=p.harga;const price=Number(typeof raw==='object'?(raw.promo||raw.normal):raw)||0;
 host.querySelectorAll('#stickyName').forEach(x=>x.textContent=p.nama||'');
 host.querySelectorAll('#stickyVariant').forEach(x=>x.textContent=selectedVariant);
 host.querySelectorAll('#stickyTotal,.sticky-price-copy').forEach(x=>x.textContent=formatRupiah(price*selectedQty));
 const im=host.querySelector('#stickyImage');if(im&&typeof p.gambar==='string')im.src=p.gambar;
 host.querySelectorAll('#stickyQty').forEach(x=>x.textContent=selectedQty);
}
// Keep the original layout but make share, wishlist, and product search usable.
host.addEventListener('click',async e=>{
 const wish=e.target.closest('.wishlist-btn');if(wish){e.preventDefault();e.stopPropagation();window.toggleWishlist(activeProduct()?.id);return}
 const share=e.target.closest('[data-share-product]');if(share){e.preventDefault();const p=activeProduct();if(!p)return;window.imamstoreShareChoices?.open(p,share);return}
},true);
window.addEventListener('popstate',()=>{if(!host.classList.contains('open'))return;const id=new URLSearchParams(location.search).get('product');if(!id){host.classList.remove('open');host.replaceChildren();document.body.classList.remove('imamstore-original-open')}else if(String(activeProduct()?.id)!==id){document.dispatchEvent(new CustomEvent('imamstore:open-product',{detail:{id}}))}});
window.imamstoreOriginalDetailActive=true;
document.addEventListener('imamstore:open-product',async e=>{const id=e.detail?.id;let data=[];try{data=typeof products!=='undefined'&&Array.isArray(products)?products:[]}catch{}const p=data.find(x=>String(x.id)===String(id));if(!p)return;window.imamstoreActiveProduct=p;allProducts=data.map(adapt);try{await showProduct(adapt(p).nama,{skipView:e.detail?.skipView===true,fromDeepLink:e.detail?.fromDeepLink===true});refreshWishlist();updateOriginalSticky();document.body.classList.remove('stage4-detail-open')}catch(err){console.error('Original renderer failed',err);host.classList.remove('open');document.body.classList.remove('imamstore-original-open');window.Swal?.fire({icon:'error',text:'Detail produk belum berhasil dimuat.'})}});
/* Sinkronisasi galeri detail saat CMS selesai memuat, tanpa membuka produk ulang.
   Re-render showProduct di sini akan mencatat view kedua kali, mengulang toast,
   mengubah pilihan varian dan scroll. Karena itu cukup media gallery yang dihidratasi. */
function syncOpenDetailGalleryFromCms(){
 if(window.imamstoreDeepLinkCatalogState?.phase!=='cms'||!host.classList.contains('open'))return;
 const id=String(currentProduct?.id??'');
 if(!id||new URLSearchParams(location.search).get('product')!==id)return;
 const raw=products.find(p=>String(p.id)===id);
 if(!raw)return;
 const data=adapt(raw);
 const urls=[data.gambar,...data.gallery];
 const gallery=host.querySelector('.product-detail .gallery-thumb');
 const main=host.querySelector('.product-detail #mainProductImage');
 const count=host.querySelector('.product-detail .nine-gallery-count');
 if(!main||!gallery||!count||!urls.length)return;
 const absolute=value=>{try{return new URL(value,location.origin+'/').href}catch{return value}};
 const wanted=urls.map(absolute);
 const previous=[...gallery.querySelectorAll('img')];
 // Firestore onSnapshot can fire repeatedly, even without changes to product media.
 // Never disturb focus, photo selection or DOM if the thumbnail list is already current.
 if(previous.length===wanted.length&&previous.every((img,i)=>absolute(img.getAttribute('src')||'')===wanted[i]))return;
 const chosen=previous.find(img=>img.classList.contains('active'))?.getAttribute('src')||main.getAttribute('src')||'';
 const match=wanted.indexOf(absolute(chosen));
 const index=match<0?0:match;
 const nodes=document.createDocumentFragment();
 wanted.forEach((url,i)=>{
  const image=document.createElement('img');
  image.src=url;
  image.alt=i===0?'Foto utama':'Foto '+(i+1);
  image.loading='lazy';
  if(i===index)image.classList.add('active');
  if(i>0)image.onerror=()=>{image.style.display='none'};
  image.onclick=()=>window.changeGallery?.(image);
  nodes.appendChild(image);
 });
 gallery.replaceChildren(nodes);
 if(absolute(main.getAttribute('src')||'')!==wanted[index])main.src=wanted[index];
 count.textContent=(index+1)+' / '+wanted.length;
 host.querySelectorAll('.gallery-main .nine-gallery-prev,.gallery-main .nine-gallery-next').forEach(button=>{button.disabled=wanted.length<2});
 // Media fields in the already-open renderer must match the hydrated gallery.
 // Leave views, sales stats, listener handles, toast state and price untouched.
 currentProduct.gambar=data.gambar;
 currentProduct.gallery=data.gallery;
 const activeRaw=window.imamstoreActiveProduct;
 if(String(activeRaw?.id??'')===id){
  for(const key of ['gambar','gallery','galeri','images']){
   if(Object.prototype.hasOwnProperty.call(raw,key))activeRaw[key]=raw[key];
  }
 }
}
document.addEventListener('imamstore:catalog-updated',syncOpenDetailGalleryFromCms);

document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('imamstoreOriginalPurchase')?.classList.contains('open'))closePurchase();else if(e.key==='Escape'&&host.classList.contains('open'))close()});
window.imamstoreOriginalDetailStatus=()=>({active:host.classList.contains('open'),renderer:'original-showProduct',transactionsEnabled:false});
})();
