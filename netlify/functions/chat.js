
exports.config = { api: { bodyParser: false } };

const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { formidable } = require("formidable");

const PRODUCT_REMOTE_URL =
  process.env.NEXAI_PRODUCT_JSON_URL ||
  "https://imamsalesnine.com/produk.json";

const MODEL_FAST =
  process.env.NEXAI_MODEL_FAST ||
  process.env.NEXAI_MODEL ||
  "gpt-4.1-mini";

const MODEL_SMART =
  process.env.NEXAI_MODEL_SMART ||
  process.env.NEXAI_MODEL ||
  "gpt-4.1-mini";

const PUBLIC_IMAGE_ENABLED =
  process.env.NEXAI_PUBLIC_IMAGE === "1";

const IMAGE_MODEL =
  process.env.NEXAI_IMAGE_MODEL ||
  "gpt-image-1";

/* =========================================================
   DATA LOADING
========================================================= */

let productCache = null;
let productCacheAt = 0;
const PRODUCT_TTL_MS = 60 * 1000;

function safeReadJSON(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

const catalogPayload = safeReadJSON(
  path.join(__dirname, "data", "catalog_specs.json"),
  { pages: [] }
);

const catalogPages = Array.isArray(catalogPayload?.pages)
  ? catalogPayload.pages
  : [];

async function loadProducts() {
  const now = Date.now();

  if (
    Array.isArray(productCache) &&
    productCache.length &&
    now - productCacheAt < PRODUCT_TTL_MS
  ) {
    return productCache;
  }

  // Prefer the live public JSON because it is the same data source
  // used by the website and contains current visual/catalog_page metadata.
  try {
    const response = await fetch(PRODUCT_REMOTE_URL, {
      headers: { "Accept": "application/json" }
    });

    if (response.ok) {
      const data = await response.json();

      if (Array.isArray(data) && data.length) {
        productCache = data;
        productCacheAt = now;
        return productCache;
      }
    }
  } catch (err) {
    console.warn("NEXAI remote product warning:", err.message);
  }

  // Local fallback for deploy/runtime environments that expose the root.
  const localCandidates = [
    path.join(process.cwd(), "produk.json"),
    path.join(process.cwd(), "public", "produk.json"),
    path.join(__dirname, "..", "..", "produk.json")
  ];

  for (const candidate of localCandidates) {
    const data = safeReadJSON(candidate, null);

    if (Array.isArray(data) && data.length) {
      productCache = data;
      productCacheAt = now;
      return productCache;
    }
  }

  throw new Error("Data produk resmi tidak berhasil dimuat.");
}

/* =========================================================
   NORMALIZATION
========================================================= */

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s.+/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value) {
  return normalize(value)
    .replace(/[^a-z0-9]/g, "");
}

function arr(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];

  if (typeof value === "string") {
    return value
      .split(/\s*\|\s*|\s*,\s*/)
      .map(x => x.trim())
      .filter(Boolean);
  }

  return [String(value)];
}

function money(value) {
  if (value === null || value === undefined || value === "") return "";

  if (typeof value === "number") {
    return "Rp" + Math.round(value).toLocaleString("id-ID");
  }

  if (typeof value === "object") {
    for (const key of [
      "promo","harga_promo","sale","current","final",
      "price","harga","normal","regular"
    ]) {
      if (value[key] !== undefined) {
        return money(value[key]);
      }
    }

    const primitive = Object.values(value).find(
      x => typeof x === "string" || typeof x === "number"
    );

    return primitive !== undefined
      ? money(primitive)
      : "";
  }

  const text = String(value).trim();

  if (!text) return "";
  if (/^rp/i.test(text)) return text;

  const numeric = text.replace(/[^\d]/g, "");

  return numeric
    ? "Rp" + Number(numeric).toLocaleString("id-ID")
    : text;
}

function stockText(value) {
  if (value === null || value === undefined || value === "") return "";

  if (typeof value === "object") {
    const status =
      value.status ??
      value.availability ??
      value.stok ??
      value.stock ??
      "";

    const qty =
      value.qty ??
      value.quantity ??
      null;

    if (status && qty !== null && qty !== undefined && qty !== "") {
      return `${status} (${qty})`;
    }

    if (status) return String(status);

    const primitive = Object.values(value).find(
      x => typeof x === "string" || typeof x === "number"
    );

    return primitive !== undefined
      ? String(primitive)
      : "";
  }

  return String(value);
}

/* =========================================================
   PRODUCT ACCESSORS
========================================================= */

function productName(p) {
  return p?.nama || p?.name || "Produk Nine";
}

function productSku(p) {
  return p?.sku || p?.kode || "";
}

function productImage(p) {
  return (
    p?.visual?.foto_utama ||
    p?.visual?.main ||
    p?.gambar ||
    p?.image ||
    p?.foto ||
    p?.foto_utama ||
    ""
  );
}

function productFullPage(p) {
  return (
    p?.visual?.full_page ||
    p?.full_page ||
    ""
  );
}

function productCatalogPage(p) {
  return (
    p?.visual?.catalog_page ||
    p?.catalog_page ||
    ""
  );
}

function productVariants(p) {
  return arr(p?.varian || p?.variants);
}

function productPrice(p) {
  return money(
    p?.harga_promo ??
    p?.promo_price ??
    p?.harga ??
    p?.price ??
    ""
  );
}

function productRegularPrice(p) {
  return money(
    p?.harga_normal ??
    p?.regular_price ??
    p?.harga?.normal ??
    ""
  );
}

function productStock(p) {
  return stockText(
    p?.stok ??
    p?.stock ??
    p?.availability ??
    ""
  );
}

function productDescription(p) {
  return p?.deskripsi || p?.description || "";
}

function productBrand(p) {
  return p?.brand || p?.subbrand || "";
}

function productCategory(p) {
  return p?.kategori || p?.category || "";
}

function productLiveSpecs(p) {
  const raw =
    p?.spesifikasi ||
    p?.specification ||
    p?.specifications ||
    p?.spec ||
    p?.specs ||
    {};

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const result = {};

  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value) && !value.length) continue;

    const text =
      Array.isArray(value)
        ? value.filter(Boolean)
        : value;

    if (
      Array.isArray(text)
        ? text.length
        : String(text).trim() !== ""
    ) {
      result[key] = text;
    }
  }

  return result;
}

/* =========================================================
   EXACT ENTITY RESOLUTION
========================================================= */

function codeTokensFromProduct(p) {
  const values = [
    productSku(p),
    productName(p),
    ...arr(p?.alias),
    ...arr(p?.aliases)
  ];

  const tokens = [];

  for (const value of values) {
    const n = normalize(value);

    for (const token of n.split(/\s+/)) {
      // Product-code-looking token: contains at least one digit.
      if (
        /[a-z]/i.test(token) &&
        /\d/.test(token)
      ) {
        tokens.push(token);
      }
    }
  }

  return [...new Set(tokens)];
}

function productAliasForms(p) {
  const base = [
    productSku(p),
    productName(p),
    ...arr(p?.alias),
    ...arr(p?.aliases),
    ...codeTokensFromProduct(p)
  ].filter(Boolean);

  const forms = [];

  for (const value of base) {
    const n = normalize(value);
    const c = compact(value);

    if (n) forms.push({ raw: n, compact: c });
  }

  return forms;
}

function boundaryContains(message, phrase) {
  const q = normalize(message);
  const p = normalize(phrase);

  if (!q || !p) return false;
  if (q === p) return true;

  const escaped =
    p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(
    `(^|\\s)${escaped}(?=\\s|$|[,.!?/+-])`,
    "i"
  ).test(q);
}

function compactTokenSet(message) {
  return new Set(
    normalize(message)
      .split(/\s+/)
      .map(compact)
      .filter(Boolean)
  );
}

function productMentionScore(p, message) {
  const q = normalize(message);
  const qCompactTokens = compactTokenSet(message);

  let score = 0;

  const skuN = normalize(productSku(p));
  const skuC = compact(productSku(p));

  for (const form of productAliasForms(p)) {
    if (!form.raw) continue;

    if (q === form.raw) {
      score = Math.max(
        score,
        100000 +
        (form.raw === skuN ? 30000 : 0) +
        form.raw.length
      );
    }

    if (boundaryContains(message, form.raw)) {
      score = Math.max(
        score,
        60000 +
        (form.raw === skuN ? 25000 : 0) +
        form.raw.length
      );
    }

    // Separator-insensitive SKU/code detection:
    // Q6PRO matches Q6-PRO, H6LH2 matches H6-LH2.
    if (
      form.compact &&
      form.compact.length >= 2 &&
      qCompactTokens.has(form.compact)
    ) {
      score = Math.max(
        score,
        50000 +
        (form.compact === skuC ? 20000 : 0) +
        form.compact.length
      );
    }
  }

  return score;
}

function resolveProducts(products, message, limit = 4) {
  const ranked = products
    .map(product => ({
      product,
      score: productMentionScore(product, message)
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const result = [];
  const seen = new Set();

  for (const item of ranked) {
    const key =
      compact(productSku(item.product)) ||
      compact(productName(item.product));

    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push(item.product);

    if (result.length >= limit) break;
  }

  return result;
}

/* =========================================================
   FUZZY SEARCH — ONLY FOR DISCOVERY/RECOMMENDATION
========================================================= */

const STOP_WORDS = new Set([
  "apa","yang","dan","atau","dengan","untuk","dari","di","ke",
  "ini","itu","nya","bro","bang","gan","mas","pak","minta",
  "tolong","coba","produk","lampu","nine","autoseries","berapa",
  "harga","stok","ready","tersedia","foto","gambar","lihat",
  "spek","spec","spesifikasi","fitur","varian","warna","tipe",
  "type","seri","model","kode","sku"
]);

function queryTokens(message) {
  return [...new Set(
    normalize(message)
      .split(/\s+/)
      .filter(
        x =>
          x.length > 1 &&
          !STOP_WORDS.has(x)
      )
  )];
}

function productSearchText(p) {
  return normalize([
    productName(p),
    productSku(p),
    productBrand(p),
    productCategory(p),
    productDescription(p),
    ...productVariants(p),
    ...arr(p?.alias),
    ...arr(p?.aliases),
    JSON.stringify(productLiveSpecs(p))
  ].filter(Boolean).join(" "));
}

function fuzzySearch(products, query, limit = 8) {
  const tokens = queryTokens(query);

  return products
    .map(p => {
      const hay = productSearchText(p);
      let score = 0;

      for (const token of tokens) {
        if (
          compact(productSku(p)) === compact(token)
        ) {
          score += 2000;
        }

        if (hay.includes(token)) {
          score += 50;
        }
      }

      return { p, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.p);
}

/* =========================================================
   CATALOG SPECS — EXACT PAGE FIRST
========================================================= */

const SPEC_KEYS = [
  "product name",
  "suitable for",
  "type led",
  "led type",
  "socket",
  "light source",
  "voltage",
  "power",
  "wattage",
  "luminous flux",
  "lumen",
  "waterproof rate",
  "waterproof",
  "color temperature",
  "color temp",
  "working temp",
  "working temperature",
  "material",
  "cooling system",
  "lifespan",
  "service life",
  "color",
  "special feature",
  "devil color",
  "function"
];

const SPEC_KEY_ID = {
  "product name": "Nama produk",
  "suitable for": "Cocok untuk",
  "type led": "Tipe LED",
  "led type": "Tipe LED",
  "socket": "Soket",
  "light source": "Sumber cahaya",
  "voltage": "Tegangan",
  "power": "Daya",
  "wattage": "Daya",
  "luminous flux": "Lumen",
  "lumen": "Lumen",
  "waterproof rate": "Tingkat tahan air",
  "waterproof": "Tingkat tahan air",
  "color temperature": "Suhu warna",
  "color temp": "Suhu warna",
  "working temp": "Suhu kerja",
  "working temperature": "Suhu kerja",
  "material": "Material",
  "cooling system": "Sistem pendingin",
  "lifespan": "Umur pakai",
  "service life": "Umur pakai",
  "color": "Warna",
  "special feature": "Fitur khusus",
  "devil color": "Warna devil",
  "function": "Fungsi"
};

function parseKeysFromHeader(header) {
  let remaining = normalize(header);
  const found = [];

  while (remaining) {
    let matched = null;

    for (const key of SPEC_KEYS) {
      if (
        remaining === key ||
        remaining.startsWith(key + " ")
      ) {
        matched = key;
        break;
      }
    }

    if (!matched) {
      // Move one token forward if the flattened catalog contains noise.
      const parts = remaining.split(/\s+/);
      parts.shift();
      remaining = parts.join(" ");
      continue;
    }

    found.push(matched);
    remaining =
      remaining.slice(matched.length).trim();
  }

  return found;
}

function deriveSpecsFromPageText(searchText) {
  const text = String(searchText || "");

  const start =
    text.indexOf("specification :");

  if (start < 0) return {};

  const after =
    text.slice(start + "specification :".length);

  const stop =
    after.indexOf(" spesifikasi :");

  const block =
    (stop >= 0 ? after.slice(0, stop) : after)
      .trim();

  if (!block) return {};

  const segments =
    block
      .split(/\s+:\s+/)
      .map(x => x.trim())
      .filter(Boolean);

  if (segments.length < 2) return {};

  const keys =
    parseKeysFromHeader(segments[0]);

  const values =
    segments.slice(1);

  if (!keys.length || !values.length) return {};

  const out = {};

  for (
    let i = 0;
    i < Math.min(keys.length, values.length);
    i++
  ) {
    const key =
      SPEC_KEY_ID[keys[i]] ||
      keys[i];

    out[key] =
      values[i];
  }

  return normalizeSpecSemantics(out);
}

function normalizeSpecSemantics(input) {
  const out = { ...(input || {}) };

  const voltageKey =
    Object.keys(out).find(
      k => normalize(k) === "tegangan"
    );

  const powerKey =
    Object.keys(out).find(
      k => normalize(k) === "daya"
    );

  // Correct obvious flattened-layout inversions:
  // voltage containing W and power containing V.
  if (voltageKey && powerKey) {
    const voltage =
      String(out[voltageKey] || "");

    const power =
      String(out[powerKey] || "");

    if (
      /\bw\b/i.test(voltage) &&
      /\bv\b/i.test(power)
    ) {
      out[voltageKey] = power;
      out[powerKey] = voltage;
    }
  }

  return out;
}

function catalogPageByNumber(pageNumber) {
  if (
    pageNumber === null ||
    pageNumber === undefined ||
    pageNumber === ""
  ) {
    return null;
  }

  return (
    catalogPages.find(
      p =>
        String(p.page) ===
        String(pageNumber)
    ) ||
    null
  );
}

function exactCatalogFallback(p) {
  const sku = normalize(productSku(p));
  const name = normalize(productName(p));

  let best = null;
  let bestScore = 0;

  for (const page of catalogPages) {
    const hay = normalize(
      page?.search_text || ""
    );

    if (!hay) continue;

    let score = 0;

    if (
      sku &&
      boundaryContains(hay, sku)
    ) {
      score += 3000;
    }

    if (
      name &&
      hay.includes(name)
    ) {
      score += 2000;
    }

    if (score > bestScore) {
      bestScore = score;
      best = page;
    }
  }

  return bestScore >= 2000
    ? best
    : null;
}

function catalogSpecsForProduct(p) {
  if (!p) return {};

  // 1) Exact official catalog_page from product JSON.
  let page =
    catalogPageByNumber(
      productCatalogPage(p)
    );

  // 2) Only if the product has no page mapping, use cautious exact fallback.
  if (!page) {
    page =
      exactCatalogFallback(p);
  }

  if (!page) {
    return productLiveSpecs(p);
  }

  let specs =
    page.specs &&
    Object.keys(page.specs).length
      ? normalizeSpecSemantics(page.specs)
      : deriveSpecsFromPageText(
          page.search_text
        );

  // Merge non-empty product JSON specs as additional official fields.
  specs = {
    ...specs,
    ...productLiveSpecs(p)
  };

  if (Object.keys(specs).length) {
    specs._catalog_page = page.page;
  }

  return specs;
}

/* =========================================================
   STRUCTURED PAYLOAD
========================================================= */

function productPayload(p) {
  return {
    name: productName(p),
    sku: productSku(p),
    brand: productBrand(p),
    category: productCategory(p),
    variants: productVariants(p),
    price: productPrice(p),
    regular_price: productRegularPrice(p),
    stock: productStock(p),
    description: productDescription(p),
    specs: catalogSpecsForProduct(p),
    visual: {
      main: productImage(p),
      full_page: productFullPage(p),
      catalog_page: productCatalogPage(p)
    }
  };
}

/* =========================================================
   INTENT + FOLLOW-UP POLICY
========================================================= */

function classify(message, hasExplicitProduct = false) {
  const m = normalize(message);

  const flags = {
    smalltalk:
      /^(bro|broo+|halo|hai|hi|hello|gas|gaskeun|sip|siap|oke|ok|makasih|terima kasih|thanks)[.!?\s]*$/.test(m),

    time:
      /\b(jam berapa|sekarang jam|pukul berapa|waktu sekarang)\b/.test(m),

    price:
      /\b(harga|price|harganya)\b/.test(m),

    stock:
      /\b(stok|stock|ready|tersedia|availability)\b/.test(m) ||
      (hasExplicitProduct && /\b(ada|ready)\b/.test(m)),

    photo:
      /\b(foto|gambar|lihat|tampilkan|tunjukkan)\b/.test(m),

    catalog:
      /\b(halaman katalog|foto katalog|full page|katalog)\b/.test(m),

    spec:
      /\b(spek|spec|spesifikasi|watt|daya|volt|tegangan|lumen|material|kelvin|suhu|pendingin|chip|ampere|arus)\b/.test(m),

    variant:
      /\b(varian|warna|variant|color)\b/.test(m),

    compare:
      /\b(vs|versus|beda|perbedaan|bandingkan|bandingin)\b/.test(m),

    fitment:
      /\b(cocok|fitment|socket|soket|wiring|plug.?and.?play|pakai apa|buat .*20\d{2})\b/.test(m),

    web:
      /\b(cari web|cari online|internet|google|browsing|terbaru|latest|hari ini|update|berita)\b/.test(m),

    creative:
      /\b(buat|bikin|generate|render|ciptakan)\b.*\b(foto|gambar|image|poster|banner|visual|ilustrasi)\b/.test(m)
  };

  let type = "general";

  if (flags.smalltalk) type = "smalltalk";
  else if (flags.time) type = "local_time";
  else if (flags.creative) type = "creative_image";
  else if (flags.fitment) type = "fitment";
  else if (flags.compare) type = "compare";
  else if (flags.catalog) type = "catalog_page";
  else if (flags.photo && flags.spec) type = "product_photo_spec";
  else if (flags.photo) type = "product_photo";
  else if (flags.price) type = "product_price";
  else if (flags.stock) type = "product_stock";
  else if (flags.spec) type = "product_spec";
  else if (flags.variant) type = "product_variant";
  else if (flags.web) type = "web_general";
  else if (hasExplicitProduct) type = "product_detail";

  return { type, flags };
}

function isReferentialFollowup(message) {
  const m = normalize(message);
  const words = m.split(/\s+/).filter(Boolean);

  if (words.length > 7) return false;

  return (
    /^(harganya|harga|fotonya|foto|gambarnya|gambar|speknya|spek|spec|spesifikasinya|spesifikasi|stoknya|stok|variannya|varian|warnanya|warna|berapa watt|berapa volt|berapa lumen|yang ini|yang itu|yang tadi|ini|itu)$/.test(m) ||
    /\b(nya|yang tadi|yang ini|yang itu)\b/.test(m)
  );
}

/* =========================================================
   STATE
========================================================= */

function safeParseJSON(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function buildState(memory, productMemory) {
  const state = {
    activeProduct: null,
    vehicle: {},
    recentUserText: []
  };

  const pm =
    Array.isArray(productMemory)
      ? productMemory
      : [];

  if (pm.length) {
    const p = pm[pm.length - 1];

    state.activeProduct = {
      name:
        p?.nama ||
        p?.name ||
        "",
      sku:
        p?.sku ||
        ""
    };
  }

  for (const item of (
    Array.isArray(memory)
      ? memory
      : []
  ).slice(-8)) {
    if (
      item?.role === "user" &&
      typeof item.content === "string"
    ) {
      state.recentUserText.push(
        item.content
      );

      const year =
        item.content.match(
          /\b(19|20)\d{2}\b/
        )?.[0];

      if (year) {
        state.vehicle.year = year;
      }

      const vehicle =
        item.content.match(
          /\b(honda|toyota|daihatsu|suzuki|mitsubishi|yamaha|kawasaki|nissan|wuling|hyundai|kia|mazda|isuzu)\b\s+([a-z0-9-]+)/i
        );

      if (vehicle) {
        state.vehicle.brand =
          vehicle[1];

        state.vehicle.model =
          vehicle[2];
      }
    }
  }

  return state;
}

function findActiveProduct(products, state) {
  if (!state?.activeProduct) return null;

  const key =
    state.activeProduct.sku ||
    state.activeProduct.name;

  if (!key) return null;

  return (
    resolveProducts(
      products,
      key,
      1
    )[0] ||
    null
  );
}

/* =========================================================
   DIRECT RESPONSE
========================================================= */

function smalltalkReply(message) {
  const m = normalize(message);

  if (/^broo*$/.test(m))
    return "Siap bro 👋 Mau tanya apa?";

  if (/^(halo|hai|hi|hello)$/.test(m))
    return "Halo bro 👋 Mau tanya produk Nine, otomotif, fitment, atau hal lain?";

  if (/^(gas|gaskeun)$/.test(m))
    return "Gas bro. Mau lanjut bahas apa?";

  if (/^(makasih|terima kasih|thanks)$/.test(m))
    return "Sama-sama bro 👌";

  return "Siap bro.";
}

function specText(product) {
  const payload =
    productPayload(product);

  const entries =
    Object.entries(
      payload.specs || {}
    ).filter(
      ([key]) =>
        key !== "_catalog_page"
    );

  if (!entries.length) {
    return (
      `${payload.name}\n` +
      "Spesifikasi teknis belum tersedia pada data resmi saat ini."
    );
  }

  return [
    payload.name,
    "Spesifikasi resmi:",
    ...entries.map(
      ([key, value]) =>
        `- ${key}: ${
          Array.isArray(value)
            ? value.join(", ")
            : value
        }`
    )
  ].join("\n");
}

function directReply(type, product) {
  if (!product) return null;

  const p =
    productPayload(product);

  if (type === "product_price") {
    const lines = [p.name];

    if (
      p.regular_price &&
      p.price &&
      p.regular_price !== p.price
    ) {
      lines.push(
        `Harga normal: ${p.regular_price}`
      );
      lines.push(
        `Harga promo: ${p.price}`
      );
    } else {
      lines.push(
        `Harga: ${
          p.price ||
          "Belum tersedia"
        }`
      );
    }

    if (p.stock !== "") {
      lines.push(
        `Stok: ${p.stock}`
      );
    }

    return lines.join("\n");
  }

  if (type === "product_stock") {
    return (
      `${p.name}\nStok: ` +
      `${
        p.stock !== ""
          ? p.stock
          : "Belum tersedia"
      }`
    );
  }

  if (type === "product_photo") {
    return (
      `${p.name}\nGambar: ` +
      `${
        p.visual.main ||
        "Foto resmi belum tersedia"
      }`
    );
  }

  if (type === "product_photo_spec") {
    return (
      `${p.name}\nGambar: ` +
      `${
        p.visual.main ||
        "Foto resmi belum tersedia"
      }\n\n` +
      specText(product)
    );
  }

  if (type === "product_variant") {
    return (
      `${p.name}\nVarian:\n` +
      `${
        p.variants.length
          ? p.variants
              .map(x => `- ${x}`)
              .join("\n")
          : "Belum tersedia"
      }`
    );
  }

  if (type === "product_spec") {
    return specText(product);
  }

  if (type === "catalog_page") {
    return (
      `${p.name}\n` +
      `${
        p.visual.full_page
          ? `Halaman katalog: ${p.visual.full_page}`
          : "Halaman katalog resmi belum tersedia."
      }`
    );
  }

  if (type === "product_detail") {
    return [
      p.name,
      p.brand && `Brand: ${p.brand}`,
      p.category && `Kategori: ${p.category}`,
      p.sku && `SKU: ${p.sku}`,
      p.price && `Harga: ${p.price}`,
      p.stock !== "" && `Stok: ${p.stock}`,
      p.variants.length &&
        `Varian: ${p.variants.join(", ")}`,
      p.description &&
        `Deskripsi: ${p.description}`
    ]
      .filter(Boolean)
      .join("\n");
  }

  return null;
}

function compareReply(products) {
  if (!Array.isArray(products) || products.length < 2) {
    return null;
  }

  const payloads =
    products
      .slice(0, 4)
      .map(productPayload);

  const specKeys =
    [...new Set(
      payloads.flatMap(
        p =>
          Object.keys(p.specs || {})
            .filter(k => k !== "_catalog_page")
      )
    )];

  const priority = [
    "Daya",
    "Tegangan",
    "Lumen",
    "Tipe LED",
    "Sumber cahaya",
    "Suhu warna",
    "Tingkat tahan air",
    "Material",
    "Sistem pendingin",
    "Fungsi"
  ];

  const orderedKeys = [
    ...priority.filter(
      k => specKeys.includes(k)
    ),
    ...specKeys.filter(
      k => !priority.includes(k)
    )
  ].slice(0, 10);

  const lines = [
    `Perbandingan ${payloads.map(p => p.sku || p.name).join(" vs ")}:`
  ];

  for (const p of payloads) {
    lines.push("");
    lines.push(`${p.name}${p.sku ? ` (${p.sku})` : ""}`);

    if (p.price) {
      lines.push(`- Harga: ${p.price}`);
    }

    if (p.stock !== "") {
      lines.push(`- Stok: ${p.stock}`);
    }

    if (p.variants.length) {
      lines.push(
        `- Varian: ${p.variants.join(", ")}`
      );
    }

    for (const key of orderedKeys) {
      const value =
        p.specs?.[key];

      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        lines.push(
          `- ${key}: ${
            Array.isArray(value)
              ? value.join(", ")
              : value
          }`
        );
      }
    }
  }

  lines.push("");
  lines.push(
    "Perbedaan di atas hanya berdasarkan data resmi yang tersedia."
  );

  return lines.join("\n");
}

/* =========================================================
   TIME
========================================================= */

function formatClientTime(iso, timezone) {
  try {
    const d =
      iso
        ? new Date(iso)
        : new Date();

    const t =
      new Intl.DateTimeFormat(
        "id-ID",
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone:
            timezone ||
            undefined
        }
      ).format(d);

    const date =
      new Intl.DateTimeFormat(
        "id-ID",
        {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone:
            timezone ||
            undefined
        }
      ).format(d);

    return (
      `Sekarang pukul ${t}` +
      `${
        timezone
          ? ` (${timezone})`
          : ""
      }, ${date}.`
    );
  } catch {
    return null;
  }
}

/* =========================================================
   AI TOOLING
========================================================= */

function localProductTool() {
  return {
    type: "function",
    name: "search_nine_products",
    description:
      "Cari produk Nine resmi dari database live. Gunakan hanya untuk rekomendasi/discovery setelah kebutuhan user dipahami.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string"
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 8
        }
      },
      required: [
        "query",
        "limit"
      ],
      additionalProperties:
        false
    }
  };
}

async function runLocalTool(
  products,
  name,
  args
) {
  if (
    name !==
    "search_nine_products"
  ) {
    return {
      error:
        "tool_unknown"
    };
  }

  const results =
    fuzzySearch(
      products,
      args?.query || "",
      Math.max(
        1,
        Math.min(
          8,
          Number(args?.limit) || 5
        )
      )
    );

  return {
    products:
      results.map(
        productPayload
      )
  };
}

function extractText(data) {
  if (
    typeof data?.output_text ===
      "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  const chunks = [];

  for (
    const item of
    data?.output || []
  ) {
    for (
      const content of
      item?.content || []
    ) {
      if (content?.text) {
        chunks.push(
          content.text
        );
      }
    }
  }

  return chunks
    .join("\n")
    .trim();
}

function extractSources(data) {
  const list = [];
  const seen = new Set();

  function add(url, title) {
    if (
      !url ||
      seen.has(url)
    ) return;

    seen.add(url);

    list.push({
      url,
      title:
        title ||
        url
    });
  }

  for (
    const item of
    data?.output || []
  ) {
    for (
      const source of
      item?.action?.sources || []
    ) {
      add(
        source?.url,
        source?.title
      );
    }

    for (
      const content of
      item?.content || []
    ) {
      for (
        const annotation of
        content?.annotations || []
      ) {
        if (
          annotation?.type ===
          "url_citation"
        ) {
          add(
            annotation?.url ||
            annotation
              ?.url_citation
              ?.url,
            annotation?.title ||
            annotation
              ?.url_citation
              ?.title
          );
        }
      }
    }
  }

  return list.slice(0, 5);
}

async function callAI({
  products,
  message,
  route,
  state,
  memory,
  image,
  product,
  productsMentioned
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY belum tersedia"
    );
  }

  const useWeb =
    route.type === "fitment" ||
    route.type === "web_general" ||
    route.flags.web;

  const model =
    route.type === "fitment"
      ? MODEL_SMART
      : MODEL_FAST;

  const tools = [
    localProductTool()
  ];

  if (useWeb) {
    tools.unshift({
      type: "web_search"
    });
  }

  const localProducts =
    (productsMentioned || [])
      .map(productPayload);

  if (
    product &&
    !localProducts.length
  ) {
    localProducts.push(
      productPayload(product)
    );
  }

  const instructions = `
Kamu adalah NEXAI Web, asisten publik imamsalesnine.com.

ATURAN WAJIB:
- Bahasa Indonesia natural, cerdas, jelas, dan tidak bertele-tele.
- Fakta produk Nine hanya boleh berasal dari LOCAL_PRODUCTS atau tool search_nine_products.
- Jangan mengarang kategori, harga, stok, varian, spek, gambar, atau fitment produk Nine.
- Jangan menyebut nama file, database internal, Product Master, registry, source policy, atau arsitektur internal.
- Untuk fitment kendaraan, web boleh dipakai untuk socket, generasi, tahun, market, wiring umum, dan data otomotif eksternal.
- Web tidak boleh mengubah fakta resmi produk Nine.
- Bila LOCAL_PRODUCTS kosong, jangan mengaku produk tertentu tidak ada kecuali memang hasil tool lokal mendukung itu.
- Untuk pertanyaan umum/nonproduk, jawab normal tanpa menyeret produk yang dibahas sebelumnya.
- Jangan tampilkan proses berpikir internal.
  `.trim();

  const historyLimit =
    route.type === "general"
      ? 2
      : 5;

  const history =
    (
      Array.isArray(memory)
        ? memory
        : []
    )
      .filter(
        x =>
          x &&
          ["user","assistant"]
            .includes(x.role) &&
          typeof x.content ===
            "string"
      )
      .slice(-historyLimit)
      .map(
        x => ({
          role: x.role,
          content:
            x.content.slice(
              0,
              1800
            )
        })
      );

  const userContent = [
    {
      type: "input_text",
      text:
`USER_MESSAGE:
${message}

ROUTE:
${route.type}

STATE:
${JSON.stringify(state || {})}

LOCAL_PRODUCTS:
${JSON.stringify(localProducts)}`
    }
  ];

  if (image) {
    userContent.push({
      type: "input_image",
      image_url: image
    });
  }

  let input = [
    ...history,
    {
      role: "user",
      content: userContent
    }
  ];

  let data = null;
  let allSources = [];

  for (
    let round = 0;
    round < 3;
    round++
  ) {
    const payload = {
      model,
      instructions,
      input,
      tools,
      max_output_tokens:
        1400,
      max_tool_calls:
        useWeb ? 5 : 3
    };

    if (useWeb) {
      payload.include = [
        "web_search_call.action.sources"
      ];
    }

    const response =
      await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            "Authorization":
              `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body:
            JSON.stringify(
              payload
            )
        }
      );

    const raw =
      await response.text();

    try {
      data =
        JSON.parse(raw);
    } catch {
      throw new Error(
        "Response AI tidak valid."
      );
    }

    if (!response.ok) {
      throw new Error(
        data?.error?.message ||
        "OpenAI request gagal"
      );
    }

    allSources = [
      ...allSources,
      ...extractSources(data)
    ]
      .filter(
        (x, i, a) =>
          a.findIndex(
            y =>
              y.url === x.url
          ) === i
      )
      .slice(0, 5);

    const calls =
      (
        data.output || []
      ).filter(
        x =>
          x.type ===
          "function_call"
      );

    if (!calls.length) {
      break;
    }

    input = [
      ...input,
      ...(data.output || [])
    ];

    for (
      const call of calls
    ) {
      let args = {};

      try {
        args =
          JSON.parse(
            call.arguments ||
            "{}"
          );
      } catch {}

      const result =
        await runLocalTool(
          products,
          call.name,
          args
        );

      input.push({
        type:
          "function_call_output",
        call_id:
          call.call_id,
        output:
          JSON.stringify(
            result
          )
      });
    }
  }

  let reply =
    extractText(data) ||
    "Maaf, jawaban belum berhasil dibuat.";

  if (
    useWeb &&
    allSources.length
  ) {
    reply +=
      "\n\nSumber web:\n" +
      allSources
        .map(
          (s, i) =>
            `${i + 1}. ${s.title} — ${s.url}`
        )
        .join("\n");
  }

  return {
    reply,
    usedWeb:
      useWeb &&
      allSources.length > 0,
    sources:
      allSources
  };
}

/* =========================================================
   IMAGE GENERATION
========================================================= */

async function generateImage(prompt) {
  if (
    !PUBLIC_IMAGE_ENABLED ||
    !process.env.OPENAI_API_KEY
  ) {
    return null;
  }

  const response =
    await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          "Authorization":
            `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body:
          JSON.stringify({
            model:
              IMAGE_MODEL,
            prompt,
            size:
              "1024x1024"
          })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "Image generation gagal."
    );
  }

  const b64 =
    data?.data?.[0]
      ?.b64_json;

  return b64
    ? `data:image/png;base64,${b64}`
    : null;
}

/* =========================================================
   MULTIPART
========================================================= */

async function parseMultipartEvent(event) {
  if (!event.body) {
    throw new Error(
      "Empty body"
    );
  }

  const bodyBuffer =
    Buffer.from(
      event.body,
      event.isBase64Encoded
        ? "base64"
        : "utf8"
    );

  const fakeReq =
    new Readable();

  fakeReq.push(
    bodyBuffer
  );

  fakeReq.push(null);

  fakeReq.headers = {
    ...(event.headers || {}),
    "content-length":
      bodyBuffer.length
  };

  fakeReq.method =
    event.httpMethod;

  fakeReq.url = "/";

  const form =
    formidable({
      multiples: false
    });

  return await new Promise(
    (resolve, reject) => {
      form.parse(
        fakeReq,
        (
          err,
          fields,
          files
        ) => {
          if (err) {
            reject(err);
          } else {
            resolve({
              fields:
                fields || {},
              files:
                files || {}
            });
          }
        }
      );
    }
  );
}

function fieldValue(
  fields,
  key,
  fallback = ""
) {
  const value =
    fields?.[key];

  if (
    Array.isArray(value)
  ) {
    return (
      value[0] ??
      fallback
    );
  }

  return (
    value ??
    fallback
  );
}

function imageData(files) {
  const value =
    files?.image;

  if (!value) return null;

  const f =
    Array.isArray(value)
      ? value[0]
      : value;

  if (!f?.filepath) {
    return null;
  }

  const buffer =
    fs.readFileSync(
      f.filepath
    );

  return (
    `data:${
      f.mimetype ||
      "image/jpeg"
    };base64,` +
    buffer.toString(
      "base64"
    )
  );
}

/* =========================================================
   RESPONSE
========================================================= */

function jsonResponse(
  statusCode,
  body
) {
  return {
    statusCode,
    headers: {
      "Content-Type":
        "application/json",
      "Cache-Control":
        "no-store"
    },
    body:
      JSON.stringify(body)
  };
}

/* =========================================================
   MAIN
========================================================= */

exports.handler = async event => {
  try {
    const products =
      await loadProducts();

    // Production health probe.
    if (
      event.httpMethod === "GET" &&
      String(
        event.queryStringParameters
          ?.health || ""
      ) === "1"
    ) {
      const critical =
        ["R9","R10","Z2","MS3","Q6-PRO","H6-LH2"];

      const checks =
        Object.fromEntries(
          critical.map(
            code => {
              const match =
                resolveProducts(
                  products,
                  code,
                  1
                )[0];

              return [
                code,
                match
                  ? productSku(match) ||
                    productName(match)
                  : null
              ];
            }
          )
        );

      return jsonResponse(
        200,
        {
          status:
            "ok",
          productCount:
            products.length,
          catalogPages:
            catalogPages.length,
          checks
        }
      );
    }

    const {
      fields,
      files
    } =
      await parseMultipartEvent(
        event
      );

    const message =
      String(
        fieldValue(
          fields,
          "message",
          ""
        )
      ).trim();

    const memory =
      safeParseJSON(
        fieldValue(
          fields,
          "memory",
          "[]"
        ),
        []
      );

    const productMemory =
      safeParseJSON(
        fieldValue(
          fields,
          "productMemory",
          "[]"
        ),
        []
      );

    const uploadedImage =
      imageData(files);

    if (
      !message &&
      !uploadedImage
    ) {
      return jsonResponse(
        400,
        {
          reply:
            "Pesan kosong.",
          image: null
        }
      );
    }

    const explicitProducts =
      resolveProducts(
        products,
        message,
        4
      );

    const route =
      classify(
        message,
        explicitProducts.length > 0
      );

    if (
      route.type ===
      "smalltalk"
    ) {
      return jsonResponse(
        200,
        {
          reply:
            smalltalkReply(
              message
            ),
          image: null,
          route:
            "smalltalk",
          usedAI: false,
          usedWeb: false
        }
      );
    }

    if (
      route.type ===
      "local_time"
    ) {
      const reply =
        formatClientTime(
          fieldValue(
            fields,
            "clientTime",
            ""
          ),
          fieldValue(
            fields,
            "clientTimezone",
            ""
          )
        );

      if (reply) {
        return jsonResponse(
          200,
          {
            reply,
            image: null,
            route:
              "local_time",
            usedAI: false,
            usedWeb: false
          }
        );
      }
    }

    const state =
      buildState(
        memory,
        productMemory
      );

    const activeProduct =
      findActiveProduct(
        products,
        state
      );

    // Active product is ONLY allowed on real referential follow-up.
    const product =
      explicitProducts[0] ||
      (
        isReferentialFollowup(
          message
        )
          ? activeProduct
          : null
      );

    if (
      explicitProducts[0]
    ) {
      state.activeProduct = {
        name:
          productName(
            explicitProducts[0]
          ),
        sku:
          productSku(
            explicitProducts[0]
          )
      };
    }

    // Deterministic factual comparison.
    if (
      route.type ===
      "compare" &&
      explicitProducts.length >= 2
    ) {
      return jsonResponse(
        200,
        {
          reply:
            compareReply(
              explicitProducts
            ),
          image: null,
          route:
            "compare",
          usedAI: false,
          usedWeb: false,
          products:
            explicitProducts.map(
              productPayload
            ),
          state: {
            activeProduct:
              state.activeProduct,
            vehicle:
              state.vehicle
          }
        }
      );
    }

    const fastRoutes =
      new Set([
        "product_price",
        "product_stock",
        "product_photo",
        "product_photo_spec",
        "product_variant",
        "product_spec",
        "catalog_page",
        "product_detail"
      ]);

    if (
      fastRoutes.has(
        route.type
      ) &&
      product
    ) {
      return jsonResponse(
        200,
        {
          reply:
            directReply(
              route.type,
              product
            ),
          image: null,
          route:
            route.type,
          usedAI: false,
          usedWeb: false,
          product:
            productPayload(
              product
            ),
          state: {
            activeProduct: {
              name:
                productName(
                  product
                ),
              nama:
                productName(
                  product
                ),
              sku:
                productSku(
                  product
                ),
              gambar:
                productImage(
                  product
                )
            },
            vehicle:
              state.vehicle
          }
        }
      );
    }

    if (
      fastRoutes.has(
        route.type
      ) &&
      !product
    ) {
      return jsonResponse(
        200,
        {
          reply:
            "Produk Nine yang dimaksud belum berhasil saya identifikasi. Sebutkan nama atau SKU produknya.",
          image: null,
          route:
            "product_not_identified",
          usedAI: false,
          usedWeb: false
        }
      );
    }

    const ai =
      await callAI({
        products,
        message,
        route,
        state,
        memory,
        image:
          uploadedImage,
        product,
        productsMentioned:
          explicitProducts
      });

    let generatedImage =
      null;

    if (
      route.type ===
        "creative_image" &&
      PUBLIC_IMAGE_ENABLED
    ) {
      generatedImage =
        await generateImage(
          message
        );
    }

    return jsonResponse(
      200,
      {
        reply:
          ai.reply,
        image:
          generatedImage,
        route:
          route.type,
        usedAI: true,
        usedWeb:
          ai.usedWeb,
        sources:
          ai.sources,
        product:
          product
            ? productPayload(
                product
              )
            : null,
        state: {
          activeProduct:
            product
              ? {
                  name:
                    productName(
                      product
                    ),
                  nama:
                    productName(
                      product
                    ),
                  sku:
                    productSku(
                      product
                    ),
                  gambar:
                    productImage(
                      product
                    )
                }
              : state.activeProduct,
          vehicle:
            state.vehicle
        }
      }
    );
  } catch (error) {
    console.error(
      "NEXAI V10 ERROR:",
      error
    );

    return jsonResponse(
      500,
      {
        reply:
          "Maaf, data NEXAI sedang tidak dapat dimuat. Silakan coba lagi sebentar.",
        image: null,
        error:
          error.message
      }
    );
  }
};
