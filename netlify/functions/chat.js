
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
   CACHE + DATA LOADING
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

  const response = await fetch(PRODUCT_REMOTE_URL, {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) {
    throw new Error(
      `Data produk tidak tersedia. HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data) || !data.length) {
    throw new Error("Data produk kosong atau format tidak valid.");
  }

  productCache = data;
  productCacheAt = now;
  return productCache;
}

/* =========================================================
   TEXT UTILITIES
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
      "promo",
      "harga_promo",
      "sale",
      "current",
      "final",
      "price",
      "harga",
      "normal",
      "regular"
    ]) {
      if (value[key] !== undefined) {
        return money(value[key]);
      }
    }

    const primitive = Object.values(value).find(
      x => typeof x === "string" || typeof x === "number"
    );

    return primitive !== undefined ? money(primitive) : "";
  }

  const text = String(value).trim();
  if (!text) return "";

  if (/^rp/i.test(text)) return text;

  const numeric = text.replace(/[^\d]/g, "");
  return numeric
    ? "Rp" + Number(numeric).toLocaleString("id-ID")
    : text;
}

function productName(p) {
  return p?.nama || p?.name || "Produk Nine";
}

function productSku(p) {
  return p?.sku || p?.kode || "";
}

function productImage(p) {
  return (
    p?.gambar ||
    p?.image ||
    p?.foto ||
    p?.foto_utama ||
    p?.visual?.foto_utama ||
    ""
  );
}

function productAliases(p) {
  return [
    productSku(p),
    productName(p),
    ...arr(p?.alias),
    ...arr(p?.aliases)
  ]
    .map(normalize)
    .filter(Boolean);
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
    ""
  );
}

function productStock(p) {
  return (
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

/* =========================================================
   EXACT PRODUCT RESOLVER
   Exact SKU/name/alias in CURRENT message always wins.
========================================================= */

function productMentionScore(p, message) {
  const q = normalize(message);
  const padded = ` ${q} `;
  let best = 0;

  for (const alias of productAliases(p)) {
    if (!alias) continue;

    // Exact full query.
    if (q === alias) {
      best = Math.max(best, 100000 + alias.length);
      continue;
    }

    // Token-boundary exact mention in longer message.
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(^|\\s)${escaped}(?=\\s|$|[,.!?/+-])`,
      "i"
    );

    if (re.test(q)) {
      const skuBonus =
        normalize(productSku(p)) === alias ? 50000 : 0;

      best = Math.max(
        best,
        20000 + skuBonus + alias.length
      );
    }
  }

  return best;
}

function resolveExactProduct(products, message) {
  const ranked = products
    .map(p => ({
      product: p,
      score: productMentionScore(p, message)
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.product || null;
}

/* =========================================================
   FUZZY SEARCH — ONLY FOR RECOMMENDATION / DISCOVERY
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
      .filter(x => x.length > 1 && !STOP_WORDS.has(x))
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
    ...arr(p?.aliases)
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
          normalize(productSku(p)) === token
        ) score += 1000;

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
   CATALOG ENRICHMENT
   Uses SKU/name matching against pre-extracted official catalog.
========================================================= */

function catalogSpecsForProduct(p) {
  if (!p || !catalogPages.length) return {};

  const sku = normalize(productSku(p));
  const name = normalize(productName(p));

  let best = null;
  let bestScore = 0;

  for (const page of catalogPages) {
    const hay = normalize(page?.search_text || "");
    if (!hay) continue;

    let score = 0;

    if (sku && hay.includes(sku)) {
      score += 1500;
    }

    if (name && hay.includes(name)) {
      score += 1200;
    }

    if (score > bestScore) {
      bestScore = score;
      best = page;
    }
  }

  if (!best || bestScore < 1200) {
    return {};
  }

  return {
    ...(best.specs || {}),
    _catalog_page: best.page
  };
}

/* =========================================================
   STRUCTURED PRODUCT PAYLOAD
========================================================= */

function productPayload(p) {
  const specs = catalogSpecsForProduct(p);

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
    specs,
    visual: {
      main: productImage(p),
      full_page:
        p?.visual?.full_page ||
        p?.full_page ||
        ""
    }
  };
}

/* =========================================================
   INTENT ROUTER
========================================================= */

function classify(message) {
  const m = normalize(message);

  const flags = {
    smalltalk:
      /^(bro|broo+|halo|hai|hi|hello|gas|gaskeun|sip|siap|oke|ok|makasih|terima kasih|thanks)[.!?\s]*$/.test(m),

    time:
      /\b(jam berapa|sekarang jam|pukul berapa|waktu sekarang)\b/.test(m),

    price:
      /\b(harga|price|harganya)\b/.test(m),

    stock:
      /\b(stok|stock|ready|tersedia|availability)\b/.test(m),

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

  return { type, flags };
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

  const pm = Array.isArray(productMemory)
    ? productMemory
    : [];

  if (pm.length) {
    const p = pm[pm.length - 1];
    state.activeProduct = {
      name: p?.nama || p?.name || "",
      sku: p?.sku || ""
    };
  }

  for (const item of (
    Array.isArray(memory) ? memory : []
  ).slice(-8)) {
    if (
      item?.role === "user" &&
      typeof item.content === "string"
    ) {
      state.recentUserText.push(item.content);

      const year =
        item.content.match(/\b(19|20)\d{2}\b/)?.[0];

      if (year) {
        state.vehicle.year = year;
      }

      const vehicle =
        item.content.match(
          /\b(honda|toyota|daihatsu|suzuki|mitsubishi|yamaha|kawasaki|nissan|wuling|hyundai|kia|mazda|isuzu)\b\s+([a-z0-9-]+)/i
        );

      if (vehicle) {
        state.vehicle.brand = vehicle[1];
        state.vehicle.model = vehicle[2];
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

  return resolveExactProduct(products, key);
}

/* =========================================================
   DIRECT RESPONSES — NO AI
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
  const payload = productPayload(product);

  const entries = Object.entries(
    payload.specs || {}
  ).filter(([key]) => key !== "_catalog_page");

  if (!entries.length) {
    return `${payload.name}\nSpesifikasi teknis belum tersedia pada katalog resmi.`;
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

  const p = productPayload(product);

  if (type === "product_price") {
    const lines = [p.name];

    if (
      p.regular_price &&
      p.price &&
      p.regular_price !== p.price
    ) {
      lines.push(`Harga normal: ${p.regular_price}`);
      lines.push(`Harga promo: ${p.price}`);
    } else {
      lines.push(`Harga: ${p.price || "Belum tersedia"}`);
    }

    if (p.stock !== "") {
      lines.push(`Stok: ${p.stock}`);
    }

    return lines.join("\n");
  }

  if (type === "product_stock") {
    return `${p.name}\nStok: ${
      p.stock !== ""
        ? p.stock
        : "Belum tersedia"
    }`;
  }

  if (type === "product_photo") {
    return `${p.name}\nGambar: ${
      p.visual.main ||
      "Foto resmi belum tersedia"
    }`;
  }

  if (type === "product_photo_spec") {
    return `${p.name}\nGambar: ${
      p.visual.main ||
      "Foto resmi belum tersedia"
    }\n\n${specText(product)}`;
  }

  if (type === "product_variant") {
    return `${p.name}\nVarian:\n${
      p.variants.length
        ? p.variants.map(x => `- ${x}`).join("\n")
        : "Belum tersedia"
    }`;
  }

  if (type === "product_spec") {
    return specText(product);
  }

  if (type === "catalog_page") {
    return `${p.name}\n${
      p.visual.full_page
        ? `Halaman katalog: ${p.visual.full_page}`
        : "Halaman katalog resmi belum tersedia."
    }`;
  }

  return null;
}

/* =========================================================
   TIME
========================================================= */

function formatClientTime(iso, timezone) {
  try {
    const d = iso
      ? new Date(iso)
      : new Date();

    const t = new Intl.DateTimeFormat(
      "id-ID",
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: timezone || undefined
      }
    ).format(d);

    const date = new Intl.DateTimeFormat(
      "id-ID",
      {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: timezone || undefined
      }
    ).format(d);

    return `Sekarang pukul ${t}${
      timezone ? ` (${timezone})` : ""
    }, ${date}.`;
  } catch {
    return null;
  }
}

/* =========================================================
   AI TOOLS
========================================================= */

function localProductTool() {
  return {
    type: "function",
    name: "search_nine_products",
    description:
      "Cari produk Nine resmi dari database produk live. Pakai setelah kebutuhan/socket/kategori diketahui.",
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
      required: ["query", "limit"],
      additionalProperties: false
    }
  };
}

async function runLocalTool(
  products,
  name,
  args
) {
  if (name !== "search_nine_products") {
    return { error: "tool_unknown" };
  }

  const results = fuzzySearch(
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
    products: results.map(productPayload)
  };
}

function extractText(data) {
  if (
    typeof data?.output_text === "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  const chunks = [];

  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.text) {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function extractSources(data) {
  const list = [];
  const seen = new Set();

  function add(url, title) {
    if (!url || seen.has(url)) return;
    seen.add(url);
    list.push({
      url,
      title: title || url
    });
  }

  for (const item of data?.output || []) {
    for (const source of item?.action?.sources || []) {
      add(source?.url, source?.title);
    }

    for (const content of item?.content || []) {
      for (const annotation of content?.annotations || []) {
        if (annotation?.type === "url_citation") {
          add(
            annotation?.url ||
            annotation?.url_citation?.url,
            annotation?.title ||
            annotation?.url_citation?.title
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
  product
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY belum tersedia");
  }

  const useWeb =
    route.type === "fitment" ||
    route.type === "web_general" ||
    route.flags.web;

  const model =
    route.type === "fitment" ||
    route.type === "compare"
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

  const productContext =
    product
      ? productPayload(product)
      : null;

  const instructions = `
Kamu adalah NEXAI Web, asisten publik imamsalesnine.com.

ATURAN WAJIB:
- Bahasa Indonesia natural, ringkas, jelas, dan membantu.
- Fakta produk Nine hanya boleh berasal dari LOCAL_PRODUCT atau tool search_nine_products.
- Jangan pernah menebak kategori, harga, stok, varian, spesifikasi, atau foto produk Nine.
- Jangan pernah bilang produk Nine adalah sepatu, helm, apparel, atau kategori lain kecuali data resmi menyatakannya.
- Jika produk disebut dan LOCAL_PRODUCT tersedia, gunakan produk itu sebagai identitas resmi.
- Katalog resmi di LOCAL_PRODUCT.specs adalah sumber spesifikasi teknis.
- Web hanya untuk fitment kendaraan, socket, generasi, market, informasi aktual, dan pengetahuan eksternal.
- Web tidak boleh mengubah fakta produk Nine.
- Untuk fitment: cari socket/generasi di web, lalu panggil search_nine_products untuk mencocokkan produk Nine.
- Jangan menjamin plug-and-play tanpa bukti.
- Jangan menyebut nama file, Product Master, registry, source policy, atau arsitektur internal kepada user.
- Kalau datanya belum cukup, jelaskan apa yang belum terverifikasi.
- Jangan tampilkan proses berpikir internal.
  `.trim();

  const historyLimit =
    route.type === "general"
      ? 2
      : 6;

  const history = (
    Array.isArray(memory)
      ? memory
      : []
  )
    .filter(x =>
      x &&
      ["user", "assistant"].includes(x.role) &&
      typeof x.content === "string"
    )
    .slice(-historyLimit)
    .map(x => ({
      role: x.role,
      content: x.content.slice(0, 2000)
    }));

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

LOCAL_PRODUCT:
${JSON.stringify(productContext)}`
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

  for (let round = 0; round < 3; round++) {
    const payload = {
      model,
      instructions,
      input,
      tools,
      max_output_tokens: 1400,
      max_tool_calls: useWeb ? 5 : 3
    };

    if (useWeb) {
      payload.include = [
        "web_search_call.action.sources"
      ];
    }

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization":
            `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify(payload)
      }
    );

    const raw = await response.text();

    try {
      data = JSON.parse(raw);
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
          a.findIndex(y => y.url === x.url) === i
      )
      .slice(0, 5);

    const calls = (
      data.output || []
    ).filter(
      x => x.type === "function_call"
    );

    if (!calls.length) {
      break;
    }

    input = [
      ...input,
      ...(data.output || [])
    ];

    for (const call of calls) {
      let args = {};

      try {
        args = JSON.parse(
          call.arguments || "{}"
        );
      } catch {}

      const result = await runLocalTool(
        products,
        call.name,
        args
      );

      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result)
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
    sources: allSources
  };
}

/* =========================================================
   IMAGE
========================================================= */

async function generateImage(prompt) {
  if (
    !PUBLIC_IMAGE_ENABLED ||
    !process.env.OPENAI_API_KEY
  ) {
    return null;
  }

  const response = await fetch(
    "https://api.openai.com/v1/images/generations",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization":
          `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt,
        size: "1024x1024"
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "Image generation gagal."
    );
  }

  const b64 =
    data?.data?.[0]?.b64_json;

  return b64
    ? `data:image/png;base64,${b64}`
    : null;
}

/* =========================================================
   MULTIPART
========================================================= */

async function parseMultipartEvent(event) {
  if (!event.body) {
    throw new Error("Empty body");
  }

  const bodyBuffer = Buffer.from(
    event.body,
    event.isBase64Encoded
      ? "base64"
      : "utf8"
  );

  const fakeReq = new Readable();
  fakeReq.push(bodyBuffer);
  fakeReq.push(null);

  fakeReq.headers = {
    ...(event.headers || {}),
    "content-length": bodyBuffer.length
  };

  fakeReq.method = event.httpMethod;
  fakeReq.url = "/";

  const form = formidable({
    multiples: false
  });

  return await new Promise(
    (resolve, reject) => {
      form.parse(
        fakeReq,
        (err, fields, files) => {
          if (err) {
            reject(err);
          } else {
            resolve({
              fields: fields || {},
              files: files || {}
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
  const value = fields?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }

  return value ?? fallback;
}

function imageData(files) {
  const value = files?.image;
  if (!value) return null;

  const f =
    Array.isArray(value)
      ? value[0]
      : value;

  if (!f?.filepath) return null;

  const buffer =
    fs.readFileSync(f.filepath);

  return (
    `data:${f.mimetype || "image/jpeg"};base64,` +
    buffer.toString("base64")
  );
}

/* =========================================================
   MAIN
========================================================= */

function jsonResponse(
  statusCode,
  body
) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async event => {
  try {
    const products =
      await loadProducts();

    const {
      fields,
      files
    } = await parseMultipartEvent(event);

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
          reply: "Pesan kosong.",
          image: null
        }
      );
    }

    const route =
      classify(message);

    if (route.type === "smalltalk") {
      return jsonResponse(
        200,
        {
          reply:
            smalltalkReply(message),
          image: null,
          route: "smalltalk",
          usedAI: false,
          usedWeb: false
        }
      );
    }

    if (route.type === "local_time") {
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
            route: "local_time",
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

    // Exact product from CURRENT message always wins.
    const explicitProduct =
      resolveExactProduct(
        products,
        message
      );

    const activeProduct =
      findActiveProduct(
        products,
        state
      );

    const product =
      explicitProduct ||
      activeProduct;

    if (explicitProduct) {
      state.activeProduct = {
        name:
          productName(
            explicitProduct
          ),
        sku:
          productSku(
            explicitProduct
          )
      };
    }

    const fastRoutes =
      new Set([
        "product_price",
        "product_stock",
        "product_photo",
        "product_photo_spec",
        "product_variant",
        "product_spec",
        "catalog_page"
      ]);

    if (
      fastRoutes.has(route.type) &&
      product
    ) {
      const reply =
        directReply(
          route.type,
          product
        );

      return jsonResponse(
        200,
        {
          reply,
          image: null,
          route: route.type,
          usedAI: false,
          usedWeb: false,
          product:
            productPayload(product),
          state: {
            activeProduct: {
              name:
                productName(product),
              nama:
                productName(product),
              sku:
                productSku(product),
              gambar:
                productImage(product)
            },
            vehicle:
              state.vehicle
          }
        }
      );
    }

    // If user explicitly asked a product fact but exact product wasn't found:
    // never let AI invent a product.
    if (
      fastRoutes.has(route.type) &&
      !product
    ) {
      return jsonResponse(
        200,
        {
          reply:
            "Produk Nine yang dimaksud belum berhasil saya identifikasi. Sebutkan nama atau SKU produknya, misalnya R9, Z2, V9, atau Q2 Pro.",
          image: null,
          route: "product_not_identified",
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
        product
      });

    let generatedImage = null;

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
        reply: ai.reply,
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
                    productName(product),
                  nama:
                    productName(product),
                  sku:
                    productSku(product),
                  gambar:
                    productImage(product)
                }
              : state.activeProduct,
          vehicle:
            state.vehicle
        }
      }
    );
  } catch (error) {
    console.error(
      "NEXAI V9 ERROR:",
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
