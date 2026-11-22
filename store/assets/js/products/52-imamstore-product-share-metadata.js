
/* One social-preview source: products() => same live product ID, name and photo as detail renderer.
   No new product renderer, no second CMS listener, no Firebase Admin SDK. */
(function () {
  'use strict';
  const DEFAULT_TITLE = 'ImamStore | Toko Online Produk Otomotif';
  const DEFAULT_DESCRIPTION = 'Temukan produk otomotif, foto, pilihan varian, dan ulasan di ImamStore.';
  const BASE_URL = 'https://store.imamsales.com/';
  const fallbackDescription = document.querySelector('meta[name="description"]')?.content || DEFAULT_DESCRIPTION;
  let lastSignature = '';
  let pending = false;

  function idFromUrl() {
    const value = new URLSearchParams(location.search).get('product');
    return value && /^[A-Za-z0-9_-]{1,120}$/.test(value) ? value : '';
  }
  function currentProduct(id) {
    if (!id) return null;
    const list = window.imamstoreV29?.products?.();
    if (Array.isArray(list)) {
      const product = list.find(p => p && String(p.id) === id && p.active !== false && p.deleted !== true);
      if (product) return product;
    }
    const active = window.imamstoreActiveProduct;
    return active && String(active.id) === id ? active : null;
  }
  function plain(value, limit = 180) {
    return String(value ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(?:nbsp|amp|quot|lt|gt);/gi, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, limit);
  }
  function photoURL(value) {
    if (!value || typeof value !== 'string') return '';
    try {
      const url = new URL(value.trim(), BASE_URL);
      // Data/blobs/private browser URLs cannot be fetched by a preview robot.
      if (url.protocol !== 'https:') return '';
      if (/(?:\/no-image\.|\/placeholder\.)/i.test(url.pathname)) return '';
      return url.href;
    } catch { return ''; }
  }
  function imageFromProduct(product) {
    const candidates = [product?.gambar, product?.image, product?.thumbnail,
      product?.foto, product?.fotoUtama, product?.mainImage,
      ...(Array.isArray(product?.gallery) ? product.gallery : []),
      ...(Array.isArray(product?.galeri) ? product.galeri : []),
      ...(Array.isArray(product?.images) ? product.images : []),
      ...(Array.isArray(product?.fotoProduk) ? product.fotoProduk : [])];
    for (const v of candidates) {
      const source = typeof v === 'string' ? v : v?.url || v?.src;
      // The public Edge image route makes catalog Base64 photos usable in previews.
      if (typeof source === 'string' && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(source)
          && /^[A-Za-z0-9_-]{1,120}$/.test(String(product.id ?? ''))) {
        return BASE_URL + '_share-image/' + encodeURIComponent(String(product.id));
      }
      const url = photoURL(source);
      if (url) return url;
    }
    return '';
  }
  function writeMeta(selector, attribute, content, enabled = true) {
    let el = document.head.querySelector(selector);
    if (!enabled || !content) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attribute, selector.startsWith('meta[property=') ? selector.match(/\[property="([^"]+)"\]/)[1] : selector.match(/\[name="([^"]+)"\]/)[1]);
      document.head.appendChild(el);
    }
    if (el.getAttribute('content') !== String(content)) el.setAttribute('content', String(content));
  }
  function property(name, value, enabled = true) {
    writeMeta('meta[property="' + name + '"]', 'property', value, enabled);
  }
  function named(name, value, enabled = true) {
    writeMeta('meta[name="' + name + '"]', 'name', value, enabled);
  }
  function priceText(product) {
    const harga = product?.harga;
    const normal = Number(typeof harga === 'object' && harga !== null ? harga.normal : harga);
    const promo = Number(typeof harga === 'object' && harga !== null ? harga.promo : product?.hargaPromo);
    const best = promo > 0 && (normal <= 0 || promo < normal) ? promo : normal;
    return Number.isFinite(best) && best > 0 ? 'Harga mulai Rp ' + best.toLocaleString('id-ID') + '.' : '';
  }
  function update() {
    pending = false;
    const id = idFromUrl();
    const product = currentProduct(id);
    // Do not overwrite server-side OG metadata with store defaults while CMS loads.
    if (id && !product) return;
    const title = product ? plain(product.nama || product.name || 'Produk ImamStore', 90) + ' | ImamStore' : DEFAULT_TITLE;
    const intro = product ? plain(product.deskripsi || product.description || '', 145) : '';
    const description = product ? [intro, priceText(product), 'Lihat foto dan ulasan di ImamStore.'].filter(Boolean).join(' ').slice(0,240) : fallbackDescription;
    const canonical = id ? BASE_URL + '?product=' + encodeURIComponent(id) : BASE_URL;
    const image = product ? imageFromProduct(product) : '';
    const signature = [id, title, description, canonical, image].join('\n');
    if (signature === lastSignature) return;
    lastSignature = signature;
    document.title = title;
    const canonTag = document.querySelector('link[rel="canonical"]');
    if (canonTag) canonTag.href = canonical;
    named('description', description);
    property('og:type', 'website');
    property('og:site_name', 'ImamStore');
    property('og:locale', 'id_ID');
    property('og:title', title);
    property('og:description', description);
    property('og:url', canonical);
    property('og:image', image, !!image);
    property('og:image:secure_url', image, !!image);
    property('og:image:alt', product ? plain(product.nama, 90) : '', !!image);
    named('twitter:card', image ? 'summary_large_image' : 'summary');
    named('twitter:title', title);
    named('twitter:description', description);
    named('twitter:image', image, !!image);
    // Diagnostic for validating the finished product preview in a JS-capable browser/prerender service.
    document.documentElement.dataset.imamstoreSharePreview = product && image ? 'ready' : id ? 'loading' : 'store';
    // Server-side social previews are resolved before this script executes.
    // The client updater is retained only for in-app page title/history changes.
  }
  function schedule() {
    if (pending) return;
    pending = true;
    queueMicrotask(update);
  }
  document.addEventListener('imamstore:catalog-updated', schedule);
  document.addEventListener('imamstore:open-product', schedule);
  window.addEventListener('popstate', schedule);
  window.addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) schedule(); });
  window.imamstoreProductSharePreview = Object.freeze({ refresh: schedule, forProduct: currentProduct });
  schedule();
})();
