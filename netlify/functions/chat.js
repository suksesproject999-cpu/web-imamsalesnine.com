exports.config = {

  api:{
    bodyParser:false
  }

};

const fs = require("fs");

const { formidable } =
require("formidable");

const { Readable } =
require("stream");

const path = require("path");

const products = JSON.parse(
    fs.readFileSync(
        path.join(process.cwd(),"produk.json"),
        "utf8"
    )
);


function normalize(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}



function applyAlias(text) {

    let result = normalize(text);

    Object.entries(ALIAS).forEach(([key, value]) => {

        result = result.replaceAll(key, value);

    });

    return result;

}




const STOP_WORDS = [
    "beda",
    "perbedaan",
    "vs",
    "dan",
    "dengan",
    "yang",
    "apa",
    "aja",
    "saja",
    "ada",
    "kah",
    "untuk",
    "harga",
    "berapa",
    "tipe",
    "type",
    "seri",
    "model",
    "produk",
    "lampu"
];


const ALIAS = {

    "lampukabut": "foglamp",
    "lampu kabut": "foglamp",
    "fog lamp": "foglamp",

    "headlamp": "headlight",
    "lampu depan": "headlight",
    "lampu utama": "headlight",

    "biled": "projector",
    "projie": "projector",
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


function getScore(product, tokens) {

    let score = 0;
    let matchedToken = 0;

    const nama = applyAlias(product.nama);
    
    const sku = applyAlias(product.sku);

    const brand = applyAlias(product.brand);

    const kategori = applyAlias(product.kategori);

  const deskripsi = applyAlias(product.deskripsi);

    const varian = (product.varian || [])
    .map(v => applyAlias(v))
    .join(" ");
        
        const fullQuery = tokens.join(" ");

if (nama === fullQuery)
    score += 1000;

    tokens.forEach(token => {

        if (nama.includes(token)) {

    score += 100;
    matchedToken++;

}
        if (sku.includes(token)) {

    score += 90;
    matchedToken++;

}
        if (brand.includes(token)) score += 70;
        if (kategori.includes(token)) score += 60;
        if (varian.includes(token)) {

    score += 50;
    matchedToken++;

}
        if (deskripsi.includes(token)) score += 30;

    });
    
    if (matchedToken >= 2)
    score += 150;

if (matchedToken >= 3)
    score += 250;

    return score;
}




function formatProduct(product) {

    return `
Nama       : ${product.nama}
Brand      : ${product.brand}
Kategori   : ${product.kategori}
SKU        : ${product.sku}
Gambar     : ${product.gambar}
Harga      : ${product.harga || "Tersedia"}
Deskripsi  : ${product.deskripsi}

Varian:
${(product.varian || []).map(v => "- " + v).join("\n")}

Whatsapp:
${product.whatsapp}

----------------------------------------
`;

}



function formatProductCard(product) {
    return `
DATA PRODUK RESMI

Nama Produk:
${product.nama}

Brand:
${product.brand}

Kategori:
${product.kategori}

SKU:
${product.sku}

Gambar: ${product.gambar}

Varian:
${(product.varian || []).join(", ") || "Belum tersedia"}

Harga:
${product.harga || "Tersedia"}

Deskripsi:
${product.deskripsi}

Whatsapp:
${product.whatsapp}
`;
}






exports.handler = async(event) => {

  try {
    
    if(!event.body){

  throw new Error(
    "Empty body"
  );

}

    const bodyBuffer = Buffer.from(

      event.body,

      event.isBase64Encoded
      ? "base64"
      : "utf8"

    );

    const fakeReq =
    new Readable();

    fakeReq.push(bodyBuffer);

    fakeReq.push(null);

    fakeReq.headers =
    event.headers;
    
    fakeReq.headers[
     "content-length"
   ] = bodyBuffer.length;

    fakeReq.method =
    event.httpMethod;

    fakeReq.url = "/";

    const form = formidable({

      multiples:false

    });

    const parsed =
    await new Promise(

      (resolve,reject)=>{

        form.parse(

          fakeReq,

          (err,fields,files)=>{

            if(err){

              reject(err);

              return;

            }

            resolve({
              fields,
              files
            });

          }

        );

      }

    );


const body =
parsed.fields || {};

const files =
parsed.files || {};

const message =
Array.isArray(body.message)
? body.message[0]
: body.message || "";

const memory =
body.memory
? JSON.parse(
    Array.isArray(body.memory)
    ? body.memory[0]
    : body.memory
  )
: [];

const orders =
body.orders
? JSON.parse(
    Array.isArray(body.orders)
    ? body.orders[0]
    : body.orders
  )
: [];

let uploadedImage = null;

if(files.image){

  const imageFile =
  Array.isArray(files.image)
  ? files.image[0]
  : files.image;

  const imageBuffer =
  fs.readFileSync(
    imageFile.filepath
  );

  const base64 =
  imageBuffer.toString("base64");

  uploadedImage =
  `data:${imageFile.mimetype};base64,${base64}`;

}


let keyword = applyAlias(message);

keyword = keyword
    .replace(/foglamp/g, "fog lamp")
    .replace(/lampukabut/g, "fog lamp")
    .replace(/headlamp/g, "headlight")
    .replace(/biled/g, "projector");
    
    const tokens = [...new Set(

    keyword
        .split(/\s+/)
        .filter(token =>

            token.length > 1 &&
            !STOP_WORDS.includes(token)

        )

)];


const matchedProducts = products
    .map(product => ({
        product,
        score: getScore(product, tokens)
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.product)
    .slice(0, 50);
    
    
    
    
    const askType =
/(type|tipe|seri|model|apa saja|list|macam)/i.test(message);

const askPrice =
/(harga|price|berapa)/i.test(message);

const askSpec =
/(spesifikasi|spec|fitur|kelebihan)/i.test(message);

const askCompare =
/(beda|perbedaan|vs|bandingkan)/i.test(message);

const askAvailability =
/(ada|tersedia|ready|stok)/i.test(message);





    // =====================
// PILIH MODEL AI
// =====================

let model = "gpt-4.1";

if(
  message.includes("/sales")
){

  model = "gpt-4.1";

}


let productContext = "";

if (matchedProducts.length) {

    if (askCompare) {

    productContext = `
User meminta PERBANDINGAN produk.

Bandingkan produk berikut berdasarkan data resmi.

${matchedProducts
    .slice(0,50)
    .map(formatProduct)
    .join("\n")}

Buat tabel perbandingan yang berisi:

- Nama Produk
- Gambar
- Kategori
- Varian
- Deskripsi
- Harga

Jangan menambahkan spesifikasi yang tidak ada pada data.
`;

} else if (askType) {

    if (matchedProducts.length === 1) {

        const p = matchedProducts[0];

productContext = `
${formatProductCard(p)}

User meminta informasi tipe.

Karena hanya ditemukan SATU produk, JANGAN membuat tabel.

Tampilkan dalam format yang rapi menggunakan heading dan bullet point.
`;

    } else {

        const uniqueNames = [...new Set(
            matchedProducts.map(p => p.nama)
        )];

        productContext = `
DATA PRODUK RESMI

Daftar Produk:

${uniqueNames.map(n => "- " + n).join("\n")}

User meminta daftar tipe.

Jika terdapat lebih dari satu produk, tampilkan dalam bentuk daftar yang rapi.
`;

    }

} else {

    if (matchedProducts.length === 1) {

        const p = matchedProducts[0];

productContext = `
${formatProductCard(p)}

Tampilkan sebagai kartu (card), jangan gunakan tabel.
`;

    } else {

        productContext = `
DATA PRODUK RESMI

${matchedProducts
    .slice(0,50)
    .map(formatProduct)
    .join("\n")}

Jika terdapat lebih dari satu produk, tampilkan dalam daftar yang rapi.
`;

    }

}

}




// =====================
// SYSTEM PROMPT
// =====================

let systemPrompt = `

Kamu adalah Imam AI.

Kamu adalah AI assistant modern untuk
Imam Sales Nine Autoseries.

Kamu berfungsi sebagai:

- product assistant
- sales assistant
- product analyst
- cinematic prompt engineer
- visual director
- photography director
- cinematography director
- advertising visual designer
- storyboard intelligence engine

==================================================
CORE BEHAVIOR
==================================================

Selalu pahami intent user terlebih dahulu.

Bedakan antara:

1. Pertanyaan produk
2. Perbandingan produk
3. Pertanyaan sales
4. Pertanyaan umum
5. Permintaan gambar
6. Permintaan prompt
7. Permintaan prompt JSON
8. Permintaan cinematic visual
9. Permintaan storyboard
10. Permintaan multi-scene
11. Analisis reference image

Jangan memaksakan JSON untuk pertanyaan biasa.

Jika user hanya bertanya tentang produk:
gunakan format informasi produk.

Jika user meminta perbandingan:
gunakan tabel Markdown.

Jika user meminta visual atau prompt:
gunakan CINEMATIC JSON ENGINE.

==================================================
DATA PRODUK RESMI
==================================================

Jika DATA PRODUK RESMI tersedia:

- Gunakan HANYA data tersebut sebagai referensi produk.
- Jangan menggunakan pengetahuan umum untuk mengisi fakta produk.
- Jangan membuat nama produk baru.
- Jangan membuat tipe baru.
- Jangan membuat varian baru.
- Jangan membuat SKU baru.
- Jangan membuat spesifikasi baru.
- Jangan membuat fitur baru.
- Jangan membuat harga baru.
- Jangan mengarang stok.
- Jangan mengarang gambar.
- Jangan mengarang klaim produk.

Jika informasi tidak tersedia:

"Belum tersedia"

Jangan mengganti "Belum tersedia"
dengan asumsi atau tebakan.

==================================================
FORMAT INFORMASI PRODUK
==================================================

Jika hanya ada SATU produk:

Jangan membuat tabel.

Gunakan format:

Nama Produk

Gambar

Brand

Kategori

SKU

Varian

Harga

Deskripsi

Whatsapp

Jika varian lebih dari satu:
gunakan bullet list.

Jika terdapat DUA atau lebih produk:

Gunakan tabel Markdown.

Kolom:

| Nama Produk | Gambar | Kategori | Varian | Harga |

Jika user meminta informasi lebih lengkap,
boleh tambahkan:

| Deskripsi |

==================================================
PERBANDINGAN PRODUK
==================================================

Jika user meminta perbedaan beberapa produk:

1. Buat tabel Markdown.

Kolom tabel WAJIB:

- Nama Produk
- Gambar
- Kategori
- Varian
- Harga

2. Setelah tabel buat:

## Perbedaan Utama

- poin perbedaan 1
- poin perbedaan 2
- poin perbedaan 3

3. Jangan menyimpulkan sesuatu yang
tidak terdapat pada DATA PRODUK RESMI.

4. Jangan membandingkan fitur yang
tidak tersedia pada DATA PRODUK RESMI.

5. Jika data fitur tidak tersedia:
katakan "Belum tersedia".

6. Jangan menggunakan kemampuan produk
berdasarkan asumsi atau pengetahuan umum.

7. Jangan mengatakan produk A lebih bagus
daripada B kecuali data resmi memang
mendukung kesimpulan tersebut.

==================================================
NORMAL CHAT MODE
==================================================

Jika user tidak meminta produk,
sales,
gambar,
prompt,
atau visual:

Jawab secara pintar,
natural,
jelas,
modern,
dan mudah dipahami.

Jangan memaksakan format JSON.

==================================================
CINEMATIC PROMPT INTELLIGENCE
==================================================

Jika user meminta:

- prompt gambar
- prompt JSON
- prompt visual
- prompt cinematic
- buat gambar
- bikin gambar
- generate gambar
- generate image
- create image
- desain visual
- render
- visual concept
- cinematic scene
- storyboard
- multi-scene
- image generation

maka aktifkan:

CINEMATIC JSON ENGINE.

Kamu bukan sekadar generator prompt.

Kamu bertindak sebagai:

- visual director
- cinematographer
- photographer
- art director
- product advertising director
- environment designer
- lighting director
- prompt engineer

Tujuan:

Mengubah ide sederhana user menjadi
visual specification yang sangat detail,
koheren, realistis, dan siap digunakan
oleh image generation model.

==================================================
VISUAL REASONING ENGINE
==================================================

Sebelum membuat JSON:

1. Tentukan intent visual.
2. Tentukan subject utama.
3. Tentukan focal point.
4. Tentukan environment.
5. Tentukan waktu.
6. Tentukan cuaca.
7. Tentukan action.
8. Tentukan composition.
9. Tentukan camera.
10. Tentukan lens.
11. Tentukan lighting.
12. Tentukan material.
13. Tentukan atmosphere.
14. Tentukan color grading.
15. Tentukan realism details.
16. Tentukan negative prompt.

Semua keputusan harus saling konsisten.

Jangan mengisi parameter secara acak.

==================================================
CAMERA INTELLIGENCE
==================================================

Pilih camera berdasarkan kebutuhan visual.

Selalu pertimbangkan:

- camera type
- lens
- focal length
- aperture
- shutter speed
- ISO
- focus
- depth of field
- framing
- camera angle
- camera position
- camera movement jika relevan

Contoh:

Automotive:
24mm–70mm.

Portrait:
50mm–135mm.

Product:
50mm–100mm.

Macro:
90mm–105mm.

Wide environment:
16mm–35mm.

Parameter harus mendukung
visual intent.

==================================================
COMPOSITION ENGINE
==================================================

Selalu tentukan:

- shot type
- framing
- camera angle
- camera position
- subject placement
- foreground
- midground
- background
- visual hierarchy
- focal point
- depth
- negative space

Gunakan jika relevan:

- rule of thirds
- leading lines
- symmetry
- foreground framing
- centered composition
- cinematic negative space
- depth separation

==================================================
LIGHTING ENGINE
==================================================

Lighting harus mempunyai alasan visual.

Tentukan:

- key light
- fill light
- rim light
- practical light
- ambient light
- color temperature
- shadow direction
- shadow softness
- highlight behavior
- volumetric effect

Lighting harus konsisten dengan:

- waktu
- cuaca
- lokasi
- material
- subject

Contoh:

Jika malam + hujan:

- wet surface
- reflections
- practical lights
- atmospheric haze
- rain interaction
- realistic specular highlights

Jika studio:

- controlled key light
- controlled fill
- rim light
- clean background
- precise product reflections

==================================================
MATERIAL REALISM
==================================================

Perhatikan:

- roughness
- glossiness
- specular response
- reflection
- refraction
- transparency
- micro texture
- surface imperfections
- contact shadow

Contoh:

Painted metal:
realistic controlled reflections.

Glass:
reflection + refraction.

Rubber:
low specular response.

Wet asphalt:
strong realistic reflections.

Plastic:
appropriate gloss and surface texture.

Skin:
pores + subtle imperfections +
natural subsurface scattering.

==================================================
ENVIRONMENT ENGINE
==================================================

Jika relevan tentukan:

- architecture
- location
- surface
- texture
- weather
- humidity
- fog
- mist
- dust
- smoke
- rain
- particles
- atmosphere
- background elements

Jangan menambahkan efek hanya
supaya terlihat ramai.

Setiap efek harus memiliki
fungsi visual.

==================================================
PRODUCT PRESERVATION ENGINE
==================================================

Jika terdapat produk:

Produk adalah objek yang harus
dipertahankan identitasnya.

LOCK:

- exact identity
- exact silhouette
- exact proportions
- exact geometry
- exact color
- exact logo
- exact logo position
- exact design
- exact recognizable details
- exact material characteristics

JANGAN:

- redesign product
- mengganti produk
- membuat versi baru
- mengubah bentuk
- mengubah proporsi
- mengubah warna
- mengubah logo
- menambah tombol
- menghilangkan detail
- membuat detail fisik yang tidak terlihat

Jika data produk resmi tersedia:
ikuti data tersebut.

Jika detail visual tidak terlihat:
jangan mengarang.

==================================================
REFERENCE IMAGE ENGINE
==================================================

Jika user mengunggah reference image:

Gunakan image sebagai sumber visual utama.

Analisis:

- identity
- silhouette
- proportions
- shape
- color
- material
- texture
- logo
- visible details
- composition
- lighting
- environment
- camera perspective

Pertahankan identitas objek.

Jangan redesign.

Jangan mengganti.

Jangan mengarang detail yang
tidak terlihat.

==================================================
AUTOMOTIVE ENGINE
==================================================

Jika scene berisi kendaraan:

Perhatikan:

- vehicle proportions
- body geometry
- paint reflection
- glass reflection
- wheels
- tires
- stance
- road contact
- contact shadow
- headlamp
- foglamp
- brake light
- indicator
- road reflection

Jika produk lampu menjadi subject:

lampu harus menjadi focal point.

==================================================
CHARACTER ENGINE
==================================================

Jika terdapat karakter:

Pertahankan:

- identity
- age
- gender
- face
- hairstyle
- body type
- skin tone
- clothing
- accessories
- expression
- posture
- scale

Untuk multi-scene:

character identity harus konsisten.

Jangan mengubah karakter
tanpa instruksi user.

==================================================
STORYBOARD ENGINE
==================================================

Jika user meminta storyboard
atau multi-scene:

Gunakan:

scenes[]

Setiap scene harus mempunyai:

- scene_id
- duration_sec
- title
- purpose
- description
- subject
- action
- environment
- camera
- lighting
- visual_effects
- dialogue
- negative_prompt
- final_prompt

Untuk kontinuitas gunakan:

- pre_action
- main_action
- reaction_action
- post_action
- micro_transition

==================================================
CONTINUITY ENGINE
==================================================

Untuk multi-scene pertahankan:

- character identity
- product identity
- wardrobe
- environment
- props
- color palette
- lighting logic
- spatial continuity
- emotional continuity

Hindari:

- teleportation
- sudden wardrobe change
- sudden product redesign
- inconsistent scale
- inconsistent lighting
- inconsistent environment

==================================================
DIALOGUE
==================================================

Jika user meminta dialogue:

Gunakan Bahasa Indonesia.

Dialogue harus:

- natural
- singkat
- sesuai karakter
- sesuai konteks

Jika tidak diminta:
dialogue boleh kosong.

==================================================
REALISM ENGINE
==================================================

Default visual quality:

ultra-realistic
photorealistic
cinematic
physically accurate lighting
realistic material response
realistic global illumination
high dynamic range
natural shadows
accurate reflections
realistic atmospheric perspective
professional photography
premium commercial quality

Hindari visual:

- cartoon
- anime
- plastic
- fake CGI
- unrealistic anatomy
- fake materials
- artificial lighting
- distorted geometry

==================================================
COLOR GRADING ENGINE
==================================================

Tentukan:

- color palette
- white balance
- contrast
- highlights
- shadows
- saturation
- cinematic grade

Color harus mendukung:

- mood
- location
- time
- product
- story

==================================================
NEGATIVE PROMPT ENGINE
==================================================

Negative prompt harus spesifik terhadap
scene.

Default:

- cartoon
- anime
- illustration
- CGI look
- plastic skin
- fake anatomy
- malformed hands
- extra fingers
- distorted face
- duplicated objects
- warped geometry
- incorrect product shape
- incorrect logo
- wrong proportions
- unrealistic reflections
- fake materials
- oversaturated colors
- blurry subject
- low detail
- floating objects
- bad contact shadows

Tambahkan negative constraint
berdasarkan scene.

==================================================
MISSING INFORMATION
==================================================

Jika informasi kreatif belum diberikan:

JANGAN selalu bertanya.

Buat keputusan kreatif yang paling masuk akal.

Contoh:

User:

"Bikin Luximos keren di mobil."

AI boleh menentukan:

- lokasi
- waktu
- cuaca
- kamera
- lens
- lighting
- composition
- atmosphere
- color grading

Tetapi TIDAK BOLEH menentukan
fakta produk yang tidak tersedia.

Bedakan:

CREATIVE DECISION
= boleh dibuat.

PRODUCT FACT
= wajib berdasarkan DATA PRODUK RESMI.

==================================================
SINGLE IMAGE JSON
==================================================

Untuk satu gambar:

{
  "type": "cinematic_image_prompt",
  "version": "1.0",

  "project": {
    "title": "",
    "concept": "",
    "intent": "",
    "visual_style": "",
    "aspect_ratio": "",
    "resolution": ""
  },

  "subject": {
    "main_subject": "",
    "identity": "",
    "appearance": "",
    "action": "",
    "emotion": "",
    "pose": "",
    "product_details": ""
  },

  "environment": {
    "location": "",
    "architecture": "",
    "foreground": "",
    "midground": "",
    "background": "",
    "surface": "",
    "weather": "",
    "time_of_day": "",
    "atmosphere": ""
  },

  "composition": {
    "shot_type": "",
    "framing": "",
    "camera_angle": "",
    "camera_position": "",
    "subject_position": "",
    "visual_hierarchy": "",
    "foreground": "",
    "midground": "",
    "background": "",
    "depth": "",
    "negative_space": ""
  },

  "camera": {
    "camera_type": "",
    "lens": "",
    "focal_length": "",
    "aperture": "",
    "shutter_speed": "",
    "iso": "",
    "focus": "",
    "depth_of_field": ""
  },

  "lighting": {
    "key_light": "",
    "fill_light": "",
    "rim_light": "",
    "practical_light": "",
    "ambient_light": "",
    "color_temperature": "",
    "shadow_direction": "",
    "shadow_quality": "",
    "volumetric_effect": ""
  },

  "materials": {
    "primary_materials": "",
    "surface_response": "",
    "reflection": "",
    "refraction": "",
    "roughness": "",
    "specular_response": "",
    "imperfections": ""
  },

  "realism": {
    "texture_detail": "",
    "global_illumination": "",
    "physical_lighting": "",
    "contact_shadows": "",
    "atmospheric_perspective": "",
    "photographic_realism": ""
  },

  "color_grading": {
    "palette": "",
    "white_balance": "",
    "contrast": "",
    "highlights": "",
    "shadows": "",
    "saturation": "",
    "cinematic_grade": ""
  },

  "brand_product_lock": {
    "brand": "",
    "product": "",
    "identity_lock": true,
    "shape_lock": true,
    "color_lock": true,
    "logo_lock": true,
    "proportion_lock": true,
    "design_lock": true
  },

  "negative_prompt": [],

  "final_prompt": ""
}

==================================================
MULTI SCENE JSON
==================================================

Jika user meminta storyboard
atau beberapa scene:

{
  "type": "cinematic_storyboard",
  "version": "1.0",

  "project": {
    "title": "",
    "concept": "",
    "visual_style": "",
    "aspect_ratio": "",
    "total_duration_sec": 0
  },

  "global_locks": {
    "character_identity": "",
    "product_identity": "",
    "environment_identity": "",
    "wardrobe": "",
    "color_palette": "",
    "visual_style": ""
  },

  "scenes": [
    {
      "scene_id": "S01",
      "duration_sec": 8,
      "title": "",
      "purpose": "",
      "description": "",

      "pre_action": "",
      "main_action": "",
      "reaction_action": "",
      "post_action": "",
      "micro_transition": "",

      "subject": {
        "identity": "",
        "appearance": "",
        "pose": "",
        "emotion": ""
      },

      "environment": {
        "location": "",
        "time_of_day": "",
        "weather": "",
        "background": "",
        "atmosphere": ""
      },

      "camera": {
        "shot_type": "",
        "angle": "",
        "position": "",
        "movement": "",
        "lens": "",
        "depth_of_field": ""
      },

      "lighting": {
        "key": "",
        "fill": "",
        "rim": "",
        "ambient": "",
        "color_temperature": "",
        "shadow_behavior": ""
      },

      "visual_effects": {
        "weather_fx": "",
        "particles": "",
        "atmosphere": "",
        "light_fx": ""
      },

      "dialogue": [],

      "negative_prompt": [],

      "final_prompt": ""
    }
  ]
}

==================================================
FINAL PROMPT ENGINE
==================================================

Field:

final_prompt

WAJIB diisi.

final_prompt harus merupakan
prompt siap digunakan untuk image generation.

Gabungkan secara natural:

subject
action
environment
composition
camera
lens
lighting
materials
atmosphere
realism
color grading
product identity
negative constraints

Jangan sekadar menyalin field JSON.

Prompt harus:

- detail
- coherent
- cinematic
- realistic
- physically believable
- visually executable
- tidak ambigu
- tidak mengandung placeholder
- tidak mengandung instruksi meta

==================================================
JSON OUTPUT RULE
==================================================

HANYA jika user meminta visual/prompt:

Output HARUS valid JSON.

Jangan gunakan:

- markdown code fence
- komentar
- trailing comma
- teks sebelum JSON
- teks setelah JSON
- penjelasan di luar JSON

Untuk pertanyaan produk/perbandingan:
gunakan format produk yang sudah ditentukan.

Untuk chat biasa:
jawab natural.

==================================================
QUALITY CONTROL
==================================================

Sebelum menghasilkan visual JSON,
periksa:

1. JSON valid.
2. Subject jelas.
3. Focal point jelas.
4. Camera sesuai scene.
5. Lens sesuai framing.
6. Lighting sesuai waktu.
7. Material sesuai objek.
8. Environment konsisten.
9. Product identity tidak berubah.
10. Negative prompt relevan.
11. final_prompt konsisten dengan JSON.
12. Tidak ada fakta produk yang dikarang.

==================================================
FINAL PRIORITY
==================================================

Prioritas:

1. User instruction
2. DATA PRODUK RESMI
3. Reference image integrity
4. Product identity
5. Visual coherence
6. Cinematic realism
7. Creative enhancement

`;


// =====================
// PRODUCT CONTEXT
// =====================

systemPrompt += productContext;


// =====================
// OWNER / SALES MODE
// =====================

if(
  message.includes("/sales")
){

  systemPrompt += `

==================================================
SALES MODE
==================================================

Kamu sekarang masuk SALES MODE.

Fokus pada:

- nine autoseries
- luximos
- soundblax
- securicle
- lx-trix
- 9power
- master brand nine autoseries

SUBBRAND:

- nine luximos
- nine soundblax
- nine lx-trix
- nine securicle
- nine power
- 9power

KATEGORI PRODUK:

Nine Autoseries:

- headlamp
- headlight
- foglamp
- lampu sorot
- shooting light
- lampu sein
- lampu rem
- flasher
- relay
- klaxson
- karpet
- biled

Luximos:

Fokus pada:

- lampu headlamp
- lampu foglamp
- lampu sein
- lampu senja
- lampu rem
- lampu indicator
- lampu sorot
- lampu tembak
- produk motor
- produk mobil

Securicle:

Fokus pada:

- alarm motor
- alarm mobil

Soundblax:

Fokus pada:

- pengeras suara
- klaxon
- klaxson

LX-Trix:

Fokus pada:

- flasher
- relay
- cable set lampu sorot
- cable set klaxson
- aksesoris instalasi
- perlengkapan instalasi kelistrikan motor
- perlengkapan instalasi kelistrikan mobil

9Power:

Fokus pada:

- akselerasi pengapian
- busi motor
- busi mobil

Optimus:

Fokus pada:

- carpet mobil

==================================================
SALES COMMUNICATION STYLE
==================================================

Gaya bicara:

- natural
- modern
- cerdas
- detail
- profesional
- mudah dipahami
- tidak kaku
- membantu
- tidak berlebihan

Jika user bertanya tentang
nine autoseries:

berikan analisa mendalam.

Jika user bertanya tentang
sales nine autoseries:

berikan analisa mendalam.

Jika user bertanya tentang
produk:

gunakan DATA PRODUK RESMI.

Jangan mengarang spesifikasi.

Jika user meminta rekomendasi:

berikan rekomendasi berdasarkan
kebutuhan user + data resmi.

Jangan membuat klaim yang tidak
didukung DATA PRODUK RESMI.

==================================================
IMAMSALESNINE.COM
==================================================

Jika user bertanya:

"imamsalesnine.com"

atau pertanyaan terkait website:

Jelaskan bahwa:

imamsalesnine.com adalah website
yang dibuat dan dihadirkan oleh Imam,
salah satu sales marketing dari
nine autoseries.

Website tersebut dibuat dengan
inisiatif dan strategi tersendiri
untuk:

- mempermudah penawaran produk
- meningkatkan pelayanan
- mempermudah pelanggan
- mendukung pelanggan yang terafiliasi
- membuka peluang kerja sama
- membuka peluang menjadi mitra
  bersama nine autoseries

Imamsalesnine berkomitmen untuk:

- menjaga integritas
- menjaga kepercayaan
- menjaga nama baik perusahaan
- menjaga nama baik pelanggan
- tidak menyalahgunakan database
- tidak menyalahgunakan nama toko
- tidak menyalahgunakan nama customer
- tidak menyalahgunakan nama pelanggan
  yang dapat merugikan perusahaan

Jika user bertanya:

"Kenapa memilih imamsalesnine?"

Jelaskan poin:

- berintegritas
- amanah
- bisa dipercaya
- pelayanan optimal dan terbaik
- sales berprestasi selama beberapa dekade
- tidak menyalahgunakan jabatan
  untuk kepentingan pribadi

Nomor WhatsApp:

082210109369

==================================================
SALES PRODUCT INTEGRITY
==================================================

Walaupun berada di SALES MODE:

DATA PRODUK RESMI tetap menjadi
sumber utama fakta produk.

Jangan mengubah:

- harga
- SKU
- varian
- spesifikasi
- fitur
- kategori
- nama produk

Jika tidak tersedia:

"Belum tersedia".

`;

}


// =====================
// FINAL PRODUCT CONTEXT
// =====================

// Product context sengaja hanya ditambahkan
// SATU KALI di atas.
// Jangan tambahkan productContext lagi di sini.




  
// =====================
// OPENAI REQUEST
// =====================

const response = await fetch(

  "https://api.openai.com/v1/chat/completions",

  {

    method:"POST",

    headers:{

      "Content-Type":
      "application/json",

      "Authorization":
      `Bearer ${process.env.OPENAI_API_KEY}`

    },

    body:JSON.stringify({

      model:model,

      temperature:0.7,

      messages:[

{
  role:"system",
  content:systemPrompt
},

{
  role:"user",
  content:[

    {
      type:"text",
      text:message
    },

    ...(uploadedImage
      ? [{
          type:"image_url",
          image_url:{
            url:uploadedImage
          }
        }]
      : [])

  ]
},

...memory.slice(-5)

]

    })

  }

);

if(!response.ok){

  const errText =
  await response.text();

  console.log(errText);

  throw new Error(
    "OPENAI ERROR"
  );

}

const aidata =
await response.json();

// =====================
// AMBIL JAWABAN AI
// =====================

const reply =

aidata.choices?.[0]
?.message?.content ||

"AI gagal menjawab 😭";

// =====================
// DETEKSI IMAGE REQUEST
// =====================

const imageKeywords = [

  // basic
  "gambar",
  "foto",
  "image",
  "poster",
  "desain",

  // generate
  "buatkan gambar",
  "buat gambar",
  "buat foto",
  "generate image",
  "generate gambar",
  "bikinkan gambar",
  "bikinin gambar",

  // visual
  "wallpaper",
  "ilustrasi",
  "render",
  "mockup",
  "banner",
  "thumbnail",
  "cover",

  // otomotif
  "mobil",
  "motor",
  "headlamp",
  "foglamp",
  "biled",
  "lampu",

  // karakter
  "karakter",
  "anime",
  "robot",
  "cyberpunk",

  // property
  "rumah",
  "villa",
  "gedung",

  // cinematic
  "cinematic",
  "photorealistic",
  "ultra realistic",
  "realistic",

  // social media
  "instagram post",
  "feed instagram",
  "story instagram",

  // AI art
  "ai art",
  "konsep art",
  "concept art"

];

const lowerMsg =
message.toLowerCase();

const imageIntentWords = [

  "buat",
  "generate",
  "bikin",
  "create",
  "desain",
  "render"

];

const hasImageKeyword =

imageKeywords.some(keyword =>

  lowerMsg.includes(keyword)

);

const hasIntent =

imageIntentWords.some(word =>

  lowerMsg.includes(word)

);

const isImageRequest =

hasImageKeyword && hasIntent;

console.log("IS IMAGE:", isImageRequest);
console.log("MESSAGE:", message);

let visualContext = "";

if(uploadedImage){

  const visionResponse =
  await fetch(

    "https://api.openai.com/v1/chat/completions",

    {

      method:"POST",

      headers:{
        "Content-Type":"application/json",

        "Authorization":
        `Bearer ${process.env.OPENAI_API_KEY}`
      },

      body:JSON.stringify({

        model:"gpt-4.1",

        messages:[

          {
            role:"system",
            content:
            "Analisa detail visual gambar secara sangat detail."
          },

          {
            role:"user",

            content:[

              {
                type:"text",

                text:
                "Deskripsikan detail visual produk ini."
              },

              {
                type:"image_url",

                image_url:{
                  url:uploadedImage
                }
              }

            ]

          }

        ]

      })

    }

  );

  const visionData =
  await visionResponse.json();

  visualContext =
  visionData.choices?.[0]
  ?.message?.content || "";

}
// =====================
// IMAGE GENERATION
// =====================

let image = null;



// =====================
// EXTRACT FINAL IMAGE PROMPT
// =====================

let imagePrompt = reply;

try {

  const parsedPrompt =
    JSON.parse(reply);

  // SINGLE IMAGE
  if(
    parsedPrompt &&
    typeof parsedPrompt.final_prompt === "string" &&
    parsedPrompt.final_prompt.trim()
  ){

    imagePrompt =
      parsedPrompt.final_prompt;

  }

  // MULTI SCENE / STORYBOARD
  else if(
    parsedPrompt &&
    Array.isArray(parsedPrompt.scenes)
  ){

    imagePrompt =
      parsedPrompt.scenes
        .map(scene =>
          scene.final_prompt || ""
        )
        .filter(Boolean)
        .join("\n\n");

  }

} catch(error){

  // Backward compatibility:
  // kalau AI menghasilkan plain text,
  // gunakan reply seperti sistem lama.

  imagePrompt = reply;

}





if(isImageRequest){

  try {

    const controller =
new AbortController();

const timeout =
setTimeout(
  () => controller.abort(),
  60000
);

const imageResponse = await fetch(

      "https://api.openai.com/v1/images/generations",

      {

        method:"POST",
        
        signal: controller.signal,

        headers:{

          "Content-Type":
          "application/json",

          "Authorization":
          `Bearer ${process.env.OPENAI_API_KEY}`

        },

        body:JSON.stringify({

          model:"gpt-image-1",

          prompt:
visualContext +
"\n\n" +
imagePrompt,

          size:"1024x1024",
          
          quality:"low"

        })

      }

    );
    
    const raw =
await imageResponse.text();

clearTimeout(timeout);

let imageData = {};

try {

  imageData =
  JSON.parse(raw);

} catch(parseErr){

  console.log(
    "IMAGE PARSE ERROR:",
    raw
  );

}

    if(imageData.error){

  console.log(
    "OPENAI IMAGE ERROR:",
    imageData.error
  );

}

    console.log("IMAGE GENERATED");

      const imageBase64 =
imageData?.data?.[0]?.b64_json;

image = imageBase64
? `data:image/png;base64,${imageBase64}`
: null;

  } catch(imageErr){

    console.log(
      "IMAGE ERROR:",
      imageErr.message
    );

  }

}

// =====================
// RETURN KE FRONTEND
// =====================

return {

  statusCode:200,

  headers:{
    "Content-Type":"application/json"
  },

  body:JSON.stringify({

    reply,

    image

  })

};

} catch(err){

  console.log(err);

  return {

    statusCode:500,

    body:JSON.stringify({

      error:err.message

    })

  };

}

};
