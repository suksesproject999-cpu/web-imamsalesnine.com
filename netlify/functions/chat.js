/**
 * NEXAI HYBRID PUBLIC ENGINE — FINAL
 * Drop-in replacement untuk backend chat lama (Netlify Function style).
 *
 * Tujuan utama:
 * 1) Pertanyaan produk sederhana dijawab TANPA LLM.
 * 2) LLM hanya dipakai saat benar-benar butuh reasoning/bahasa umum.
 * 3) Context produk dibatasi ketat (maks 5 produk).
 * 4) Memory diringkas menjadi structured state.
 * 5) Prompt publik pendek dan fokus.
 * 6) Tetap kompatibel dengan frontend lama: { reply, image }.
 *
 * ENV opsional:
 * OPENAI_API_KEY
 * NEXAI_MODEL_FAST=gpt-5.6-luna
 * NEXAI_MODEL_SMART=gpt-5.6-terra
 * NEXAI_MODEL_MAX=gpt-5.6-sol
 * NEXAI_IMAGE_MODEL=gpt-image-2
 */

exports.config = {
  api: { bodyParser: false }
};

const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { formidable } = require("formidable");

const PRODUCTS_PATH = path.join(process.cwd(), "produk.json");


const CATALOG_SPECS_PATH = path.join(process.cwd(), "catalog_specs.json");

let catalogSpecPages = [];
try {
  const catalogPayload = JSON.parse(
    fs.readFileSync(CATALOG_SPECS_PATH, "utf8")
  );
  catalogSpecPages = Array.isArray(catalogPayload?.pages)
    ? catalogPayload.pages
    : [];
} catch (e) {
  console.warn("catalog_specs.json belum tersedia:", e.message);
  catalogSpecPages = [];
}


let products = [];
try {
  products = JSON.parse(fs.readFileSync(PRODUCTS_PATH, "utf8"));
  if (!Array.isArray(products)) products = [];
} catch (e) {
  console.error("Gagal membaca produk.json:", e.message);
  products = [];
}

const MODEL_FAST  = process.env.NEXAI_MODEL_FAST  || "gpt-5.6-luna";
const MODEL_SMART = process.env.NEXAI_MODEL_SMART || "gpt-5.6-terra";
const MODEL_MAX   = process.env.NEXAI_MODEL_MAX   || "gpt-5.6-sol";
const IMAGE_MODEL = process.env.NEXAI_IMAGE_MODEL || "gpt-image-2";
const PUBLIC_IMAGE_ENABLED = process.env.NEXAI_PUBLIC_IMAGE === "1";

const OFFICIAL_WEB = "https://imamsalesnine.com/";
const OFFICIAL_WA  = "https://wa.me/6282210109369";

/* =========================================================
   TEXT / SEARCH UTILITIES
========================================================= */

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s.+/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIAS = {
  "lampu kabut": "foglamp",
  "fog lamp": "foglamp",
  "lampukabut": "foglamp",
  "lampu depan": "headlight",
  "lampu utama": "headlight",
  "headlamp": "headlight",
  "biled": "projector",
  "projie": "projector",
  "proyektor": "projector",
  "tembak": "shooting light",
  "sorot": "shooting light",
  "spotlight": "shooting light",
  "sein": "indicator",
  "rem": "stop lamp",
  "plafon": "interior",
  "cabin": "interior",
  "senja": "t10"
};

function applyAlias(text) {
  let s = normalize(text);
  for (const [from, to] of Object.entries(ALIAS)) {
    s = s.split(from).join(to);
  }
  return s;
}

const STOP = new Set([
  "apa","yang","dan","atau","dengan","untuk","dari","di","ke","ini","itu",
  "nya","dong","bro","bang","gan","mas","pak","minta","tolong","coba",
  "produk","lampu","nine","autoseries","berapa","harga","stok","ready",
  "tersedia","foto","gambar","lihat","spek","spec","spesifikasi","fitur",
  "varian","warna","tipe","type","seri","model","kode","sku"
]);

function tokenise(text) {
  return [...new Set(
    applyAlias(text)
      .split(/\s+/)
      .filter(x => x.length > 1 && !STOP.has(x))
  )];
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null || v === "") return [];
  if (typeof v === "string") {
    return v.split(/\s*\|\s*|\s*,\s*/).filter(Boolean);
  }
  return [String(v)];
}

function productSearchText(p) {
  const catalogSpecs = catalogSpecsForProduct(p);
  const catalogText = Object.entries(catalogSpecs || {})
    .filter(([k]) => k !== "_catalog_page")
    .map(([k,v]) => `${k} ${formatSimple(v)}`)
    .join(" ");

  return applyAlias([
    p.nama, p.name, p.sku, p.kode, p.brand, p.subbrand, p.kategori,
    p.category, p.deskripsi, p.description,
    ...asArray(p.varian),
    ...asArray(p.alias),
    catalogText
  ].filter(Boolean).join(" "));
}

function exactProductIdentity(p, rawQuery) {
  const q = applyAlias(rawQuery);
  const names = [
    p.nama, p.name, p.sku, p.kode,
    ...asArray(p.alias)
  ].filter(Boolean).map(applyAlias);
  return names.includes(q);
}

function scoreProduct(p, rawQuery, tokens) {
  const q = applyAlias(rawQuery);
  const nama = applyAlias(p.nama || p.name);
  const sku = applyAlias(p.sku || p.kode);
  const full = productSearchText(p);

  let score = 0;
  let matched = 0;

  if (exactProductIdentity(p, rawQuery)) score += 3000;
  if (nama && q && nama === q) score += 2500;
  if (sku && q && sku === q) score += 2500;

  if (nama && q && nama.includes(q) && q.length >= 2) score += 800;
  if (sku && q && sku.includes(q) && q.length >= 2) score += 750;

  for (const t of tokens) {
    if (nama.includes(t)) { score += 130; matched++; }
    if (sku.includes(t)) { score += 125; matched++; }
    if (full.includes(t)) { score += 35; }
  }

  if (matched >= 2) score += 250;
  if (matched >= 3) score += 350;

  return score;
}

function findProducts(query, limit = 8) {
  const tokens = tokenise(query);
  if (!query || !products.length) return [];

  return products
    .map(product => ({ product, score: scoreProduct(product, query, tokens) }))
    .filter(x => x.score > 0)
    .sort((a,b) => b.score - a.score)
    .slice(0, limit);
}

function findExactOrStrong(query) {
  const found = findProducts(query, 5);
  if (!found.length) return null;
  const first = found[0];
  const second = found[1];

  if (exactProductIdentity(first.product, query)) return first.product;
  if (first.score >= 1000 && (!second || first.score >= second.score * 1.4)) {
    return first.product;
  }
  return null;
}

/* =========================================================
   PRODUCT FIELD HELPERS
========================================================= */

function getName(p) {
  return p?.nama || p?.name || "Produk Nine";
}
function getSku(p) {
  return p?.sku || p?.kode || "";
}
function getImage(p) {
  return p?.gambar || p?.image || p?.foto || p?.foto_utama || "";
}

function normalizePriceValue(value) {
  if (value === null || value === undefined || value === "") return "";

  if (typeof value === "number") {
    return `Rp${Math.round(value).toLocaleString("id-ID")}`;
  }

  if (typeof value === "string") {
    const v = value.trim();
    if (!v) return "";
    if (/^rp/i.test(v)) return v;
    const numeric = v.replace(/[^\d]/g, "");
    return numeric ? `Rp${Number(numeric).toLocaleString("id-ID")}` : v;
  }

  if (typeof value === "object") {
    const preferred =
      value.promo ??
      value.harga_promo ??
      value.sale ??
      value.current ??
      value.final ??
      value.price ??
      value.harga ??
      value.normal ??
      value.regular;

    if (preferred !== undefined) return normalizePriceValue(preferred);

    const firstPrimitive = Object.values(value).find(
      v => typeof v === "string" || typeof v === "number"
    );
    return firstPrimitive !== undefined ? normalizePriceValue(firstPrimitive) : "";
  }

  return "";
}

function getPrice(p) {
  return normalizePriceValue(
    p?.harga_promo ?? p?.promo_price ?? p?.harga ?? p?.price ?? ""
  );
}
function getRegularPrice(p) {
  return normalizePriceValue(
    p?.harga_normal ?? p?.regular_price ?? ""
  );
}
function getStock(p) {
  return p?.stok ?? p?.stock ?? p?.availability ?? "";
}
function getVariants(p) {
  return asArray(p?.varian || p?.variants);
}
function getDescription(p) {
  return p?.deskripsi || p?.description || "";
}
function getCategory(p) {
  return p?.kategori || p?.category || "";
}
function getBrand(p) {
  return p?.brand || p?.subbrand || "";
}
function getWhatsapp(p) {
  return p?.whatsapp || OFFICIAL_WA;
}


function catalogSpecsForProduct(p) {
  if (!p || !catalogSpecPages.length) return {};

  const name = normalize(getName(p));
  const sku = normalize(getSku(p));
  const important = [...new Set(
    `${name} ${sku}`.split(/\s+/).filter(x => x.length >= 2)
  )];

  let best = null;
  let bestScore = 0;

  for (const page of catalogSpecPages) {
    const hay = normalize(page?.search_text || "");
    if (!hay) continue;

    let score = 0;

    if (sku && new RegExp(`(^|\\s)${escapeRegExp(sku)}(\\s|$)`, "i").test(hay)) {
      score += 1500;
    }

    if (name && hay.includes(name)) {
      score += 1200;
    }

    for (const token of important) {
      if (hay.includes(token)) score += 45;
    }

    if (score > bestScore) {
      bestScore = score;
      best = page;
    }
  }

  // Threshold mencegah spesifikasi produk mirip tertukar.
  if (!best || bestScore < 180) return {};

  return {
    ...(best.specs || {}),
    "_catalog_page": best.page
  };
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


function collectSpecs(p) {
  const skip = new Set([
    "nama","name","brand","subbrand","kategori","category","sku","kode",
    "gambar","image","foto","foto_utama","foto_tambahan","harga","price",
    "harga_promo","promo_price","harga_normal","regular_price","stok","stock",
    "availability","varian","variants","deskripsi","description","whatsapp",
    "alias","id"
  ]);

  const candidates = [
    p?.spesifikasi, p?.specification, p?.specifications, p?.spec, p?.specs
  ].filter(Boolean);

  let specs = {};
  for (const c of candidates) {
    if (c && typeof c === "object" && !Array.isArray(c)) {
      specs = { ...specs, ...c };
    }
  }

  // Jika struktur produk memakai field spesifikasi langsung, ikutkan field
  // yang bukan metadata umum dan nilainya sederhana.
  for (const [k,v] of Object.entries(p || {})) {
    if (skip.has(k)) continue;
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      if (String(v).length <= 300) specs[k] = v;
    }
  }
  const fromCatalog = catalogSpecsForProduct(p);

  // Katalog adalah sumber spesifikasi teknis utama.
  // Data live produk tetap menang untuk harga/stok/visual karena tidak dicampur ke sini.
  specs = {
    ...specs,
    ...fromCatalog
  };

  return specs;
}

function formatMoney(v) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    return "Rp" + v.toLocaleString("id-ID");
  }
  return String(v);
}

function line(label, value) {
  if (value === null || value === undefined || value === "") return "";
  return `${label}: ${value}`;
}

function productCardText(p, options = {}) {
  const rows = [];
  rows.push(getName(p));

  if (options.image && getImage(p)) rows.push(`Gambar: ${getImage(p)}`);
  if (getBrand(p)) rows.push(`Brand: ${getBrand(p)}`);
  if (getCategory(p)) rows.push(`Kategori: ${getCategory(p)}`);
  if (getSku(p)) rows.push(`SKU: ${getSku(p)}`);

  const variants = getVariants(p);
  if (variants.length) rows.push(`Varian: ${variants.join(", ")}`);

  const regular = getRegularPrice(p);
  const price = getPrice(p);
  if (regular && price && String(regular) !== String(price)) {
    rows.push(`Harga normal: ${formatMoney(regular)}`);
    rows.push(`Harga promo: ${formatMoney(price)}`);
  } else if (price) {
    rows.push(`Harga: ${formatMoney(price)}`);
  }

  if (getStock(p) !== "") rows.push(`Stok: ${getStock(p)}`);
  if (getDescription(p)) rows.push(`Deskripsi: ${getDescription(p)}`);

  return rows.filter(Boolean).join("\n");
}

/* =========================================================
   STRUCTURED MEMORY
========================================================= */

function safeParseJSON(value, fallback) {
  try {
    if (Array.isArray(value)) value = value[0];
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function deriveState(memory, productMemory, message) {
  const state = {
    activeProduct: null,
    vehicle: {},
    lastTopic: "",
    recentUserText: []
  };

  // Product memory dari frontend lama.
  if (Array.isArray(productMemory) && productMemory.length) {
    const p = productMemory[productMemory.length - 1];
    if (p) {
      state.activeProduct = {
        nama: p.nama || p.name || "",
        sku: p.sku || "",
        gambar: p.gambar || p.image || "",
        varian: p.varian || ""
      };
    }
  }

  // Cari produk terakhir yang jelas di history.
  const recent = Array.isArray(memory) ? memory.slice(-12) : [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const item = recent[i];
    if (!item || item.role !== "user") continue;
    const txt = typeof item.content === "string" ? item.content : "";
    if (!txt) continue;
    state.recentUserText.unshift(txt);

    if (!state.activeProduct) {
      const p = findExactOrStrong(stripIntentWords(txt));
      if (p) {
        state.activeProduct = {
          nama: getName(p),
          sku: getSku(p),
          gambar: getImage(p),
          varian: getVariants(p)
        };
      }
    }

    // Lightweight vehicle extraction, tanpa mengarang fitment.
    const year = txt.match(/\b(19|20)\d{2}\b/)?.[0];
    if (year && !state.vehicle.year) state.vehicle.year = year;

    const vehicleHit = txt.match(/\b(toyota|honda|daihatsu|suzuki|mitsubishi|nissan|wuling|hyundai|kia|mazda|isuzu|yamaha|kawasaki)\b\s+([a-z0-9-]+)/i);
    if (vehicleHit && !state.vehicle.brand) {
      state.vehicle.brand = vehicleHit[1];
      state.vehicle.model = vehicleHit[2];
    }
  }

  // Pesan saat ini dapat mengganti active product.
  const direct = findExactOrStrong(stripIntentWords(message));
  if (direct) {
    state.activeProduct = {
      nama: getName(direct),
      sku: getSku(direct),
      gambar: getImage(direct),
      varian: getVariants(direct)
    };
  }

  return state;
}

function resolveActiveProduct(state) {
  if (!state?.activeProduct) return null;
  const key = state.activeProduct.sku || state.activeProduct.nama;
  if (!key) return null;
  return findExactOrStrong(key) || null;
}

/* =========================================================
   INTENT ROUTER — TANPA LLM
========================================================= */

function stripIntentWords(text) {
  return String(text || "")
    .replace(/\b(harga|price|stok|ready|tersedia|foto|gambar|lihat|tampilkan|tunjukkan|spek|spec|spesifikasi|fitur|varian|warna|sku|kode|detail|produk|berapa|dong|bro|gan|mas)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function isExplicitCreativeOrGeneralRequest(message = "") {
  const q = normalize(message);

  // Permintaan membuat visual/gambar umum, bukan permintaan foto produk.
  const creativeImage =
    /\b(buat|bikin|generate|ciptakan|gambar|ilustrasi|render|visualisasikan)\b/.test(q) &&
    /\b(foto|gambar|image|ilustrasi|poster|logo|semut|kucing|anjing|orang|pemandangan|karakter)\b/.test(q) &&
    !/\b(produk|nine|sku|katalog|harga|stok|varian|spesifikasi|spek)\b/.test(q);

  return creativeImage;
}

function classifyIntent(message, state, hasImage) {
  const m = normalize(message);

  const flags = {
    photo: /\b(foto|gambar|image|lihat|tampilkan|tunjukkan)\b/i.test(message),
    price: /\b(harga|price|berapa harganya|harganya)\b/i.test(message),
    stock: /\b(stok|stock|ready|tersedia|availability)\b/i.test(message),
    spec: /\b(spek|spec|spesifikasi|specification|fitur|watt|wattage|volt|voltage|lumen|chip|kelvin|waterproof|material|garansi)\b/i.test(message),
    variant: /\b(varian|variant|warna|color|socket|soket|tipe apa|jenis)\b/i.test(message),
    compare: /\b(vs|versus|beda|perbedaan|bandingkan|bandingin|dibanding)\b/i.test(message),
    recommend: /\b(rekomendasi|rekomendasiin|cocok|bagus buat|pilih mana|sarankan|saran|untuk mobil|untuk motor)\b/i.test(message),
    fitment: /\b(cocok|fitment|soket|socket|plug.?and.?play|pasang|pemasangan|wiring|kabel|buat .*20\d{2})\b/i.test(message),
    catalog: /\b(katalog|catalog|halaman katalog|full page)\b/i.test(message),
    list: /\b(apa saja|apa aja|daftar|list|semua produk|tipe apa saja|model apa saja)\b/i.test(message),
    promo: /\b(promo|diskon|discount|sale)\b/i.test(message),
    coding: /\b(html|css|javascript|typescript|php|python|react|node|sql|source code|coding|debug|bug|api|backend|frontend)\b/i.test(message),
    imageCreate: /\b(buat|bikin|generate|render|create)\b.*\b(gambar|foto|image|poster|banner|visual|mockup|ilustrasi)\b/i.test(message),
    currentPhotoReference: /^(foto|gambar|fotonya|gambarnya|lihat|tampilkan)$/i.test(message.trim())
  };

  const stripped = stripIntentWords(message);

  const contextualQuery = [
    ...(state?.recentUserText || []).slice(-4),
    message
  ].join(" ");

  const retrievalQuery =
    (flags.recommend || flags.fitment || flags.compare)
      ? contextualQuery
      : (stripped || message);

  let search = findProducts(retrievalQuery, 12);

  // "selain X" = jangan terus mengembalikan produk yang sedang dikecualikan.
  const excludedTokens = [];
  const selainMatch = normalize(message).match(/\bselain\s+([a-z0-9-]+)/i);
  if (selainMatch?.[1]) excludedTokens.push(selainMatch[1]);

  if (excludedTokens.length) {
    search = search.filter(item => {
      const hay = normalize(`${getName(item.product)} ${getSku(item.product)}`);
      return !excludedTokens.some(x => hay.includes(normalize(x)));
    });
  }

  const exact = findExactOrStrong(stripped || message);
  const active = resolveActiveProduct(state);
  const product = exact || (flags.currentPhotoReference ? active : null);

  let type = "general";
  if (flags.imageCreate && isExplicitCreativeOrGeneralRequest(message)) type = "creative_image";
  else if (flags.compare) type = "product_compare";
  else if (flags.recommend || flags.fitment) type = "recommendation";
  else if (flags.photo) type = "product_photo";
  else if (flags.catalog) type = "catalog";
  else if (flags.price) type = "product_price";
  else if (flags.stock) type = "product_stock";
  else if (flags.spec) type = "product_spec";
  else if (flags.variant) type = "product_variant";
  else if (flags.promo) type = "promo";
  else if (flags.list) type = "product_list";
  else if (exact) type = "product_detail";
  else if (hasImage) type = "vision_general";

  return { type, flags, search, exact, active, product };
}

/* =========================================================
   ZERO-TOKEN RESPONSES
========================================================= */

function directProductReply(route) {
  const p = route.product;
  if (!p) return null;

  switch (route.type) {
    case "product_price": {
      const price = getPrice(p);
      const regular = getRegularPrice(p);
      if (!price && !regular) {
        return `${getName(p)}\nHarga belum tersedia pada data produk saat ini.`;
      }
      const rows = [getName(p)];
      if (regular && price && String(regular) !== String(price)) {
        rows.push(`Harga normal: ${formatMoney(regular)}`);
        rows.push(`Harga promo: ${formatMoney(price)}`);
      } else {
        rows.push(`Harga: ${formatMoney(price || regular)}`);
      }
      if (getStock(p) !== "") rows.push(`Stok: ${getStock(p)}`);
      return rows.join("\n");
    }

    case "product_stock": {
      if (getStock(p) === "") {
        return `${getName(p)}\nInformasi stok belum tersedia pada data produk saat ini.`;
      }
      return `${getName(p)}\nStok: ${getStock(p)}`;
    }

    case "product_photo": {
      const img = getImage(p);
      if (!img) return `${getName(p)}\nFoto resmi belum tersedia pada data produk saat ini.`;
      return `${getName(p)}\nGambar: ${img}`;
    }

    case "product_variant": {
      const variants = getVariants(p);
      if (!variants.length) return `${getName(p)}\nVarian belum tersedia pada data produk saat ini.`;
      return `${getName(p)}\nVarian:\n${variants.map(v => `- ${v}`).join("\n")}`;
    }

    case "product_spec": {
      const specs = collectSpecs(p);
      const entries = Object.entries(specs).filter(([k]) => k !== "_catalog_page");
      if (!entries.length) {
        return `${getName(p)}\nSpesifikasi yang diminta belum tersedia pada data produk saat ini.`;
      }
      return [
        getName(p),
        "Spesifikasi:",
        ...entries.slice(0, 30).map(([k,v]) => `- ${humanizeKey(k)}: ${formatSimple(v)}`)
      ].join("\n");
    }

    case "product_detail":
      return productCardText(p, { image: true });

    default:
      return null;
  }
}

function humanizeKey(k) {
  return String(k)
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatSimple(v) {
  if (Array.isArray(v)) return v.join(", ");
  if (v && typeof v === "object") return Object.entries(v).map(([a,b]) => `${a}: ${b}`).join(", ");
  return String(v);
}

function directListReply(route) {
  if (route.type !== "product_list") return null;
  const rows = route.search.slice(0, 12).map(x => x.product);
  if (!rows.length) return null;
  return [
    "Produk yang paling relevan:",
    ...rows.map((p,i) => `${i+1}. ${getName(p)}${getSku(p) ? ` — ${getSku(p)}` : ""}`)
  ].join("\n");
}


function shouldUseWeb(route, message) {
  const q = normalize(message);

  // User secara eksplisit minta pencarian/validasi terbaru.
  if (/\b(cari di web|cari online|search web|internet|google|browsing|cek web|cek online|terbaru|latest|hari ini|sekarang|update|berita)\b/i.test(message)) {
    return true;
  }

  // Fitment otomotif sangat bergantung tahun/generasi/market/socket.
  if (
    route?.type === "recommendation" ||
    /\b(fitment|cocok|socket|soket|wiring|pinout|plug.?and.?play|generasi|facelift|tahun|market|tipe lampu|bohlam|headlamp|foglamp|stoplamp|sein)\b/i.test(message)
  ) {
    return true;
  }

  // Pertanyaan yang jelas meminta fakta dinamis.
  if (/\b(harga pasar|cuaca|kurs|jadwal|rilis terbaru|versi terbaru|aturan terbaru)\b/i.test(message)) {
    return true;
  }

  return false;
}

function buildNineSearchTool() {
  return {
    type: "function",
    name: "search_nine_products",
    description:
      "Cari produk Nine resmi dari database lokal + spesifikasi katalog resmi. Gunakan tool ini setelah menemukan kebutuhan/socket/fitment dari web atau saat perlu mencari produk berdasarkan SKU, kategori, fungsi, daya, tegangan, socket, warna, fitur, atau kata kunci teknis.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Kata kunci pencarian produk. Contoh: H6 headlight 12V, H11 foglamp, shooting light white yellow, R9."
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 8
        }
      },
      required: ["query", "limit"],
      additionalProperties: false
    }
  };
}

function runNineTool(name, args = {}) {
  if (name !== "search_nine_products") {
    return { error: "Tool tidak dikenal." };
  }

  const query = String(args.query || "").trim();
  const limit = Math.max(1, Math.min(8, Number(args.limit) || 5));

  if (!query) {
    return { query, count: 0, products: [] };
  }

  const hits = findProducts(query, limit);

  return {
    query,
    count: hits.length,
    products: hits.map(x => compactProduct(x.product))
  };
}

function extractWebSources(data) {
  const collected = [];
  const seen = new Set();

  function add(url, title) {
    if (!url || seen.has(url)) return;
    seen.add(url);
    collected.push({
      url,
      title: title || url
    });
  }

  for (const item of data?.output || []) {
    // Built-in web search sources
    for (const src of item?.action?.sources || []) {
      add(src?.url, src?.title);
    }

    // URL citations attached to output text
    for (const content of item?.content || []) {
      for (const annotation of content?.annotations || []) {
        if (annotation?.type === "url_citation") {
          add(
            annotation?.url || annotation?.url_citation?.url,
            annotation?.title || annotation?.url_citation?.title
          );
        }
      }
    }
  }

  return collected.slice(0, 5);
}

function appendWebSources(reply, sources) {
  if (!sources?.length) return reply;

  const safe = sources
    .map((s, i) => `${i + 1}. ${s.title} — ${s.url}`)
    .join("\n");

  return `${reply}\n\nSumber web:\n${safe}`;
}


/* =========================================================
   AI CONTEXT — RINGKAS
========================================================= */

function compactProduct(p) {
  if (!p) return null;
  const obj = {
    nama: getName(p),
    sku: getSku(p) || undefined,
    brand: getBrand(p) || undefined,
    kategori: getCategory(p) || undefined,
    varian: getVariants(p).slice(0, 20),
    harga: getPrice(p) || undefined,
    harga_normal: getRegularPrice(p) || undefined,
    stok: getStock(p) !== "" ? getStock(p) : undefined,
    deskripsi: getDescription(p) || undefined,
    gambar: getImage(p) || undefined,
    spesifikasi: collectSpecs(p)
  };
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined || obj[k] === "" ||
        (Array.isArray(obj[k]) && !obj[k].length) ||
        (obj[k] && typeof obj[k] === "object" && !Array.isArray(obj[k]) && !Object.keys(obj[k]).length)) {
      delete obj[k];
    }
  }
  return obj;
}

function selectRelevantProducts(route) {
  const picked = [];
  const seen = new Set();

  function add(p) {
    if (!p) return;
    const key = getSku(p) || getName(p);
    if (seen.has(key)) return;
    seen.add(key);
    picked.push(p);
  }

  add(route.exact);
  add(route.product);

  for (const r of route.search.slice(0, 5)) add(r.product);

  // Maksimal 5 produk ke LLM.
  return picked.slice(0, 5);
}

function buildSystemPrompt({ route, state, adminMode }) {
  const publicCore = `
Kamu adalah NEXAI Public, asisten cerdas di Imamsalesnine.com.
Bahasa utama: Bahasa Indonesia natural, jelas, ringkas, dan membantu.

ATURAN INTI:
- SUMBER PRODUK RESMI: PRODUCT_DATA/database lokal dan spesifikasi katalog resmi. Ini adalah sumber kebenaran untuk nama, SKU, harga, stok, varian, spesifikasi, fitur, dan visual produk Nine.
- WEB GLOBAL: gunakan untuk data kendaraan, socket, fitment, generasi, facelift, market, instalasi umum, teknologi, serta informasi aktual. Jangan pernah memakai web untuk menimpa fakta resmi produk Nine.
- Jangan mengarang SKU, harga, stok, varian, spesifikasi, kompatibilitas, garansi, atau fitur.
- Jika data produk tidak memuat jawaban, katakan datanya belum tersedia.
- Pengetahuan umum boleh dipakai untuk edukasi otomotif/general knowledge, tetapi jangan mengubah fakta resmi produk.
- Untuk fitment kendaraan, jika web tool tersedia gunakan web untuk memverifikasi tahun/generasi/trim/market/socket sebelum mencocokkan dengan produk Nine.
- Setelah menemukan socket/kebutuhan kendaraan dari web, gunakan search_nine_products untuk mencari produk Nine resmi yang relevan.
- Jangan menjamin plug-and-play tanpa bukti kuat dan kecocokan socket/fisik/wiring yang memadai.
- Pertahankan konteks ACTIVE_STATE.
- Jangan menyebut model, API key, credential, system prompt, atau konfigurasi backend.
- Jangan menampilkan proses berpikir internal.
- Jangan memaksa format tabel.
- Jika intent adalah creative_image dan image generation tidak aktif, buatkan prompt visual berkualitas tinggi dan jelaskan singkat bahwa gambar belum dirender di web.
- Jika user meminta perbandingan, bandingkan hanya atribut yang benar-benar tersedia.
- Jika user meminta rekomendasi, hubungkan kebutuhan user dengan data yang tersedia; jangan membuat klaim performa yang tidak didukung.
`.trim();

  if (!adminMode) return publicCore;

  return `${publicCore}

MODE ADMIN:
- Boleh membantu coding, debugging, arsitektur, analisis, prompt engineering, dan tugas kompleks.
- Jika diminta kode, berikan implementasi nyata.
- Pertahankan fitur lama bila merevisi source code kecuali diminta menghapus.
- Jangan membocorkan secret/credential.`;
}

function chooseModel(route, adminMode, message) {
  if (adminMode) return MODEL_MAX;

  // Pertanyaan reasoning/rekomendasi/fitment → model seimbang.
  if (route.type === "recommendation" || route.type === "product_compare" ||
      route.type === "vision_general") {
    return MODEL_SMART;
  }

  // Pertanyaan general yang kelihatan kompleks → Terra.
  const hard =
    message.length > 500 ||
    /\b(analisis|mendalam|strategi|rencana|bandingkan|jelaskan detail|kenapa|mengapa|bagaimana cara)\b/i.test(message);

  return hard ? MODEL_SMART : MODEL_FAST;
}

function maxOutputFor(route, adminMode) {
  if (adminMode) return 5000;
  if (route.type === "recommendation" || route.type === "product_compare") return 1400;
  return 900;
}

/* =========================================================
   RESPONSES API
========================================================= */

async function callOpenAI({ message, memory, route, state, uploadedImage, adminMode }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY belum tersedia");
  }

  const relevant =
    route.type === "creative_image"
      ? []
      : selectRelevantProducts(route).map(compactProduct);

  const system = buildSystemPrompt({ route, state, adminMode });

  const history = (Array.isArray(memory) ? memory : [])
    .filter(x =>
      x &&
      (x.role === "user" || x.role === "assistant") &&
      typeof x.content === "string"
    )
    .slice(-6)
    .map(x => ({
      role: x.role,
      content: x.content.slice(0, 2500)
    }));

  const structured = {
    intent: route.type,
    active_state: state,
    initial_product_candidates: relevant
  };

  const userContent = [
    {
      type: "input_text",
      text:
`USER_MESSAGE:
${message}

LOCAL_CONTEXT:
${JSON.stringify(structured)}`
    }
  ];

  if (uploadedImage) {
    userContent.push({
      type: "input_image",
      image_url: uploadedImage
    });
  }

  const model = chooseModel(route, adminMode, message);
  const enableWeb = shouldUseWeb(route, message);

  const tools = [buildNineSearchTool()];

  if (enableWeb) {
    tools.unshift({ type: "web_search" });
  }

  let input = [
    ...history,
    { role: "user", content: userContent }
  ];

  const basePayload = {
    model,
    instructions: system,
    tools,
    input,
    max_output_tokens: maxOutputFor(route, adminMode),
    max_tool_calls: enableWeb ? 5 : 3,
    include: enableWeb
      ? ["web_search_call.action.sources"]
      : undefined
  };

  if (model === MODEL_MAX) {
    basePayload.reasoning = { effort: adminMode ? "high" : "medium" };
  } else if (model === MODEL_SMART) {
    basePayload.reasoning = { effort: "low" };
  }

  let data = null;
  let toolRounds = 0;
  let allSources = [];

  while (toolRounds < 3) {
    const payload = {
      ...basePayload,
      input
    };

    if (!payload.include) delete payload.include;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const raw = await response.text();

    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error("Response AI tidak valid");
    }

    if (!response.ok) {
      console.error("OPENAI ERROR:", raw);
      throw new Error(
        data?.error?.message ||
        data?.message ||
        "OpenAI request gagal"
      );
    }

    allSources = [
      ...allSources,
      ...extractWebSources(data)
    ].filter(
      (s, idx, arr) =>
        arr.findIndex(x => x.url === s.url) === idx
    ).slice(0, 5);

    const functionCalls = (data?.output || [])
      .filter(item => item?.type === "function_call");

    if (!functionCalls.length) {
      break;
    }

    // Responses API: output model + function_call_output dikirim kembali.
    input = [
      ...input,
      ...(data.output || [])
    ];

    for (const call of functionCalls) {
      let args = {};
      try {
        args = JSON.parse(call.arguments || "{}");
      } catch {}

      const result = runNineTool(call.name, args);

      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result)
      });
    }

    toolRounds++;
  }

  let reply =
    extractResponseText(data) ||
    "Maaf, jawaban belum berhasil dibuat.";

  if (enableWeb && allSources.length) {
    reply = appendWebSources(reply, allSources);
  }

  return {
    reply,
    model,
    usedWeb: enableWeb && allSources.length > 0,
    sources: allSources
  };
}
function extractResponseText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks = [];
  for (const item of data?.output || []) {
    for (const c of item?.content || []) {
      if (c?.type === "output_text" && c?.text) chunks.push(c.text);
      else if (typeof c?.text === "string") chunks.push(c.text);
    }
  }
  return chunks.join("\n").trim();
}

/* =========================================================
   IMAGE GENERATION — ADMIN / EXPLICIT ONLY
========================================================= */

function wantsImageGeneration(message, adminMode) {
  const explicit =
    /(buat|bikin|generate|render|create|ciptakan).*(gambar|foto|image|poster|banner|visual|mockup|ilustrasi)/i.test(message);

  return explicit && (adminMode || PUBLIC_IMAGE_ENABLED);
}

async function generateImage({ prompt, uploadedImage }) {
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    if (uploadedImage) {
      const match = uploadedImage.match(/^data:(.+?);base64,(.+)$/);
      if (!match) return null;

      const mime = match[1];
      const buf = Buffer.from(match[2], "base64");
      const fd = new FormData();
      fd.append("model", IMAGE_MODEL);
      fd.append("image", new Blob([buf], { type: mime }), "reference-image");
      fd.append("prompt",
`Pertahankan identitas visual subject pada gambar referensi secara ketat.
Ubah hanya sesuai permintaan berikut:
${prompt}`);
      fd.append("size", "1024x1024");

      const r = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
        body: fd
      });

      const raw = await r.text();
      const data = JSON.parse(raw);
      if (!r.ok) throw new Error(data?.error?.message || "Image edit gagal");
      const b64 = data?.data?.[0]?.b64_json;
      return b64 ? `data:image/png;base64,${b64}` : null;
    }

    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt,
        size: "1024x1024"
      })
    });

    const raw = await r.text();
    const data = JSON.parse(raw);
    if (!r.ok) throw new Error(data?.error?.message || "Image generation gagal");
    const b64 = data?.data?.[0]?.b64_json;
    return b64 ? `data:image/png;base64,${b64}` : null;
  } catch (e) {
    console.error("IMAGE ERROR:", e.message);
    return null;
  }
}

/* =========================================================
   MULTIPART PARSER
========================================================= */

async function parseMultipartEvent(event) {
  if (!event.body) throw new Error("Empty body");

  const bodyBuffer = Buffer.from(
    event.body,
    event.isBase64Encoded ? "base64" : "utf8"
  );

  const fakeReq = new Readable();
  fakeReq.push(bodyBuffer);
  fakeReq.push(null);
  fakeReq.headers = { ...(event.headers || {}) };
  fakeReq.headers["content-length"] = bodyBuffer.length;
  fakeReq.method = event.httpMethod;
  fakeReq.url = "/";

  const form = formidable({ multiples: false });

  return await new Promise((resolve, reject) => {
    form.parse(fakeReq, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields: fields || {}, files: files || {} });
    });
  });
}

function fieldValue(fields, key, fallback = "") {
  const v = fields?.[key];
  if (Array.isArray(v)) return v[0] ?? fallback;
  return v ?? fallback;
}

function fileToDataUrl(files, key) {
  const f0 = files?.[key];
  if (!f0) return null;
  const f = Array.isArray(f0) ? f0[0] : f0;
  if (!f?.filepath) return null;
  const buf = fs.readFileSync(f.filepath);
  return `data:${f.mimetype || "image/jpeg"};base64,${buf.toString("base64")}`;
}


function isTimeQuestion(message = "") {
  return /\b(jam berapa|sekarang jam|waktu sekarang|pukul berapa|current time)\b/i.test(message);
}

function formatClientTime(clientTime, clientTimezone) {
  try {
    const d = clientTime ? new Date(clientTime) : new Date();
    if (Number.isNaN(d.getTime())) return null;

    const options = {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    };

    if (clientTimezone) options.timeZone = clientTimezone;

    const time = new Intl.DateTimeFormat("id-ID", options).format(d);

    const dateOptions = {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    };
    if (clientTimezone) dateOptions.timeZone = clientTimezone;

    const date = new Intl.DateTimeFormat("id-ID", dateOptions).format(d);

    return { time, date, timezone: clientTimezone || "" };
  } catch {
    return null;
  }
}


/* =========================================================
   ADMIN / PUBLIC GUARD
========================================================= */

function isAdminMode(message, imamMode) {
  return /^\/imam\b/i.test(String(message).trim()) || String(imamMode) === "1";
}

function stripAdminCommand(message) {
  return String(message).trim().replace(/^\/imam\b/i, "").trim();
}

function publicCodingBlocked(message, adminMode) {
  if (adminMode) return false;
  const action = /\b(buat|buatkan|bikin|tulis|generate|coding|kodekan|programkan|debug|perbaiki|edit|ubah|modifikasi)\b/i.test(message);
  const tech = /\b(html|css|javascript|js|typescript|php|python|react|node|sql|json|script|source code|kode|coding|program|website|function|bug|error|api|backend|frontend)\b/i.test(message);
  return action && tech;
}

/* =========================================================
   MAIN HANDLER
========================================================= */

exports.handler = async (event) => {
  try {
    const { fields, files } = await parseMultipartEvent(event);

    const rawMessage = String(fieldValue(fields, "message", "")).trim();
    const imamMode = fieldValue(fields, "imamMode", "0");
    const memory = safeParseJSON(fieldValue(fields, "memory", "[]"), []);
    const productMemory = safeParseJSON(fieldValue(fields, "productMemory", "[]"), []);
    const clientTime = fieldValue(fields, "clientTime", "");
    const clientTimezone = fieldValue(fields, "clientTimezone", "");
    const uploadedImage = fileToDataUrl(files, "image");

    if (!rawMessage && !uploadedImage) {
      return json(400, { error: "Pesan kosong." });
    }

    const adminMode = isAdminMode(rawMessage, imamMode);
    const message = adminMode ? stripAdminCommand(rawMessage) : rawMessage;

    if (isTimeQuestion(message)) {
      const local = formatClientTime(clientTime, clientTimezone);
      if (local) {
        return json(200, {
          reply: `Sekarang pukul ${local.time}${local.timezone ? ` (${local.timezone})` : ""}, ${local.date}.`,
          image: null,
          route: "local_time",
          usedAI: false
        });
      }
    }

    if (publicCodingBlocked(message, adminMode)) {
      return json(200, {
        reply: "Untuk mode publik, saya fokus membantu produk Nine, otomotif, rekomendasi, dan pertanyaan umum.",
        image: null,
        route: "public_restriction",
        usedAI: false
      });
    }

    const state = deriveState(memory, productMemory, message);
    const route = classifyIntent(message, state, Boolean(uploadedImage));

    // Creative/general request guard:
    // jangan paksa query umum masuk ke matcher produk hanya karena ada token yang kebetulan mirip.
    const forceGeneralCreative = isExplicitCreativeOrGeneralRequest(message);


    // -----------------------------------------------------
    // FAST PATH 1: produk exact + pertanyaan sederhana
    // -----------------------------------------------------
    const direct = forceGeneralCreative ? null : directProductReply(route);
    if (direct) {
      return json(200, {
        reply: direct,
        image: null,
        route: route.type,
        usedAI: false,
        state: publicState(state, route.product)
      });
    }

    // -----------------------------------------------------
    // FAST PATH 2: daftar sederhana
    // -----------------------------------------------------
    const listReply = forceGeneralCreative ? null : directListReply(route);
    if (listReply) {
      return json(200, {
        reply: listReply,
        image: null,
        route: route.type,
        usedAI: false,
        state: publicState(state)
      });
    }

    // -----------------------------------------------------
    // Ambiguous product request: jangan panggil AI membabi buta.
    // Beri kandidat lokal lebih dulu.
    // -----------------------------------------------------
    const productIntent = new Set([
      "product_price","product_stock","product_photo","product_spec",
      "product_variant","product_detail","catalog"
    ]);

    if (!forceGeneralCreative && productIntent.has(route.type) && !route.product && route.search.length > 1) {
      const candidates = route.search.slice(0, 5).map(x => x.product);
      return json(200, {
        reply:
`Saya menemukan beberapa produk yang mungkin dimaksud:
${candidates.map((p,i) => `${i+1}. ${getName(p)}${getSku(p) ? ` (${getSku(p)})` : ""}`).join("\n")}
Sebutkan nama/SKU yang dipilih.`,
        image: null,
        route: "product_disambiguation",
        usedAI: false
      });
    }

    // -----------------------------------------------------
    // SMART PATH: hanya request yang benar-benar perlu LLM.
    // -----------------------------------------------------
    const ai = await callOpenAI({
      message,
      memory,
      route,
      state,
      uploadedImage,
      adminMode
    });

    let image = null;
    if (wantsImageGeneration(message, adminMode)) {
      image = await generateImage({
        prompt: ai.reply,
        uploadedImage
      });
    }

    return json(200, {
      reply: ai.reply,
      image,
      route: route.type,
      usedAI: true,
      usedWeb: ai.usedWeb === true,
      sources: ai.sources || [],
      // Tidak perlu ditampilkan frontend; berguna untuk debugging server.
      engine: adminMode ? "admin" : "public",
      state: publicState(state, route.product)
    });

  } catch (err) {
    console.error("NEXAI HANDLER ERROR:", err);
    return json(500, {
      error: err.message || "Terjadi gangguan.",
      reply: "Maaf, sistem sedang mengalami gangguan. Silakan coba lagi.",
      image: null
    });
  }
};

function publicState(state, product) {
  const p = product || resolveActiveProduct(state);
  return {
    activeProduct: p ? {
      nama: getName(p),
      sku: getSku(p),
      gambar: getImage(p)
    } : state?.activeProduct || null,
    vehicle: state?.vehicle || {}
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}
