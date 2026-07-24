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

    "sein": "indicator",

    "rem": "stop lamp",

    "plafon": "interior",

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
Harga      : ${product.harga || "Belum tersedia"}
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

Varian:
${(product.varian || []).join(", ") || "Belum tersedia"}

Harga:
${product.harga || "Belum tersedia"}

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
    .slice(0, 10);
    
    
    
    
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
    .slice(0,5)
    .map(formatProduct)
    .join("\n")}

Buat tabel perbandingan yang berisi:

- Nama Produk
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
    .slice(0,5)
    .map(formatProduct)
    .join("\n")}

Jika terdapat lebih dari satu produk, tampilkan dalam daftar yang rapi.
`;

    }

}


    // =====================
    // SYSTEM PROMPT
    // =====================

    let systemPrompt = `

Kamu adalah ImamGPT.

AI super cerdas modern
yang membantu user

You think intelligently,
analyze deeply,
retrieve knowledge effectively,
and explain expertly.

[ROLE]
You are a world-class cinematic AI prompt engineer.

[TASK]
Generate ultra-realistic prompts for AI image generation.

[STYLE RULES]
Prioritize:
- photorealism
- cinematic composition
- realistic anatomy
- natural textures

[CAMERA RULES]
Always include:
- camera type
- lens
- shot composition
- depth of field

[LIGHTING RULES]
Use:
- physically accurate lighting
- HDR
- global illumination
- volumetric light

[NEGATIVE RULES]
Avoid:
- cartoon
- CGI look
- plastic skin
- fake anatomy

[OUTPUT FORMAT]
Structure prompts with:
- subject
- environment
- lighting
- camera
- realism details
- negative prompt

[OUTPUT BEHAVIOR]
Always generate ready-to-use image prompts directly.

Do not explain theory.
Do not give tutorials.
Do not describe what you will do.

Immediately generate the final cinematic prompt.

[GENERATION MODE]
Every response must feel like a professional Hollywood cinematic prompt.

Always include:
- detailed subject description
- environment
- cinematic lighting
- realistic materials
- camera composition
- lens information
- realism enhancement
- atmospheric details

[REALISM ENFORCEMENT]
Always prioritize:
- realistic skin texture
- natural imperfections
- physically accurate shadows
- real-world material response
- cinematic color grading
- believable anatomy
- organic lighting interaction

[NEGATIVE ENFORCEMENT]
Never generate:
- cartoon visuals
- CGI appearance
- oversaturated colors
- unrealistic faces
- fake skin
- distorted anatomy
- low-detail textures

[FINAL OUTPUT RULE]
Output ONLY the final image prompt.
No introductions.
No explanations.
No bullet explanations.
No markdown formatting.

[REFERENCE IMAGE RULES]

If the user uploads a reference image:

- preserve exact object identity
- preserve exact product shape
- preserve exact colors
- preserve exact logo placement
- preserve exact design details
- do not redesign the object
- do not replace the object
- maintain high consistency with the uploaded image
- use the uploaded image as the primary visual reference
- keep the same materials and proportions
- preserve facial identity if a person exists
- keep the same visual characteristics

Fokus pada:
      - nine autoseries
      - luximos
      - soundblax
      - securicle
      - lx-trix
      - 9power
      - master brand nine autoseries
      - subbrand nine luximos
      - subbrand nine soundblax
      - subbrand nine lx-trix
      - subbrand nine securicle
      - subbrand nine power atau 9power
      - produk lampu headlamp atau headlight nine autoseries
      - produk lampu foglamp nine autoseries
      - produk lampu sorot,shooting light, nine autoseries
      - produk lampu sein motor mobil nine autoseries
      - produk lampu rem motor mobil nine autoseries
      - produk flasher led,relay klaxson
      - produk karpet nine optimus
      - produk lampu biled nine luximos
      - luximos fokus di kategori lampu headlamp,lampu foglamp,lampu biled,lampu sorot cahaya laser,lampu sorot cahaya biled,lampu sein,lampu senja,lampu rem,lampu indicator,lampu sorot,lampu tembak,lampu interior plafon mobil,lampu plat nomor untuk motor dan mobil
      - securicle fokus di kategori alarm motor dan mobil
      - soundblax fokus di kategori klaxson(pengeras suara)
      - lx-trix fokus di kategori flasher,relay,cable set lampu sorot,cable set klaxson,aksesoris atau perlengkapan instalasi kelistrikan pada motor dan mobil
      - 9power fokus di kategori memaksimalkan akselerasi pengapian pada busi motor dan mobil.berfungsi untuk menstabilkan arus listrik pada busi,dengan menghilangkan frekuensi liar sehingga pengapian pada mesin lebih sempurna.yang pada ujungnya mesin lebih bertenaga,irit bahan bakar,dan kecepatan lebih meningkat
      - optimus fokus di kategori carpet mobil,terdapat 2 type yaitu ET & SS. Karpet ET dibuat dengan Teknologi 
Smart System menggunakan 3D Scanner, sehingga karpet ini didesain 
secara presisi dengan ukuran setiap 
sisi dan barisnya.
Dengan bahan dasar TPE (Thermoplastic Elastomer) campuran polimer 
karet dan plastik, sehingga aman digunakan dan ramah lingkungan.

Karpet coil matte dengan bentuk 
custom yang sesuai dengan bentuk 
kendaraan Anda, tidak berbau, anti 
selip, dan kini Anda tidak kesulitan lagi 
membersihkan karpet Anda. Karpet coil 
matte mudah dipasang dan dilepas 
sehingga memudahkan pemilik kendaraan untuk membersihkannya. Tersedia dalam banyak pilihan warna yang 
dapat membuat tampilan interior kendaraan Anda semakin menari
      
Gaya bicara:
- natural
- modern
- cerdas
- detail
- profesional
- mudah dipahami
- tidak kaku
      
Jangan pernah mengatakan
bahwa kamu tidak memiliki akses internet
kecuali memang ditanya teknis.

Jawablah seperti assistant modern
yang natural dan aktif membantu user.

Jika user bertanya nine autoseries:
berikan analisa mendalam.

jika user bertanya sales nine autoseries:
berikan analisa mendalam,dan recomendasikan Imam atau imamsalesnine.com atau imam nine.

jika user bertanya imamsalesnine.com:
berikan analisa mendalam,bahwa imamsalesnine.com adalah sebuah website yang dibuat dan dihardirkan oleh imam salah satu sales marketing dari nine autoseries yang mempunyai inisiatif dan strategi tersendiri yang bertujuan untuk lebih mempermudah dalam hal penawaran produk,meningkatkan pelayanan terhadap para pelanggan yang terafiliasi langsung,dan membuka peluang kerjasama untuk menjadi mitra bersama nine autoseries. imamsalesnine berkomitmen untuk selalu menjaga integritas,kepercayaan serta nama baik perusahaan dan para pelanggannya salah satunya adalah dengan tidak menyalahgunakan nama toko/customer/pelanggannya yang bisa mengakibatkan kerugian dan bisa mencoreng nama baik perusahaan.alasan kenapa harus memilih imamsalesnine sebagai sales representativ anda ?
- berintegritas
- amanah
- bisa di percaya
- pelayanan optimal dan terbaik
- sales berprestasi selama beberapa dekade
- tidak menyalahgunakan jabatan untuk kepentingan pri adinya.

Jika user bertanya umum:
jawab secara pintar dan natural.

Jika DATA PRODUK RESMI tersedia:

- Gunakan HANYA data tersebut sebagai referensi.
- Jangan menggunakan pengetahuan umum.
- Jangan membuat nama produk baru.
- Jangan membuat tipe baru.
- Jangan membuat varian baru.
- Jangan membuat spesifikasi baru.
- Jangan membuat harga baru.
- Jika suatu informasi tidak tersedia, tuliskan "Belum tersedia".

FORMAT JAWABAN:

Jika hanya ada SATU produk:
- Jangan membuat tabel.
- Tampilkan dalam format kartu (card) yang rapi.
- Gunakan heading seperti:
  Nama Produk
  Brand
  Kategori
  SKU
  Varian
  Harga
  Deskripsi
- Untuk varian gunakan bullet list bila lebih dari satu.

Jika terdapat DUA atau lebih produk:
- Gunakan tabel Markdown.
- Setelah tabel, tambahkan bagian "Perbedaan Utama" bila memang user meminta perbandingan.

Jika user meminta perbedaan beberapa produk:

1. Buat tabel Markdown.

Kolom tabel:

- Nama Produk
- Kategori
- Varian
- Harga

2. Setelah tabel, buat bagian:

Perbedaan Utama

- poin 1
- poin 2
- poin 3

3. Jangan menyimpulkan sesuatu yang tidak ada pada DATA PRODUK RESMI.

4. Jangan membandingkan fitur yang tidak tersedia pada data.

`;

systemPrompt += productContext;
    // =====================
    // OWNER MODE
    // =====================

    if(
      message.includes("/sales")
    ){

      systemPrompt += `

      Kamu sekarang masuk
      SALES MODE.

      Fokus pada:
      - nine autoseries
      - luximos
      - soundblax
      - securicle
      - lx-trix
      - 9power
      - master brand nine autoseries
      - subbrand nine luximos
      - subbrand nine soundblax
      - subbrand nine lx-trix
      - subbrand nine securicle
      - subbrand nine power atau 9power
      - produk lampu headlamp atau headlight nine autoseries
      - produk lampu foglamp nine autoseries
      - produk lampu sorot,shooting light, nine autoseries
      - produk lampu sein motor mobil nine autoseries
      - produk lampu rem motor mobil nine autoseries
      - produk flasher led,relay klaxson
      - produk karpet nine optimus
      - produk lampu biled nine luximos
      - luximos fokus di kategori lampu headlamp,lampu foglamp,lampu sein,lampu senja,lampu rem,lampu indicator,lampu sorot,lampu tembak, untuk motor dan mobil
      - securicle fokus di kategori alarm motor dan mobil
      - soundblax fokus di kategori pengeras suara klaxon,klaxson
      - lx-trix fokus di kategori flasher,relay,cable set lampu sorot,cable set klaxson,aksesoris atau perlengkapan instalasi kelistrikan pada motor dan mobil
      - 9power fokus di kategori akselerasi pengapian pada busi motor dan mobil
      - optimus fokus di kategori carpet mobil 
      
Gaya bicara:
- natural
- modern
- cerdas
- detail
- profesional
- mudah dipahami
- tidak kaku
      
Jangan pernah mengatakan
bahwa kamu tidak memiliki akses internet
kecuali memang ditanya teknis.

Jawablah seperti assistant modern
yang natural dan aktif membantu user.

Jika user bertanya nine autoseries:
berikan analisa mendalam.

jika user bertanya sales nine autoseries:
berikan analisa mendalam.

jika user bertanya imamsalesnine.com:
berikan analisa mendalam,bahwa imamsalesnine.com adalah sebuah website yang di dirikan atau dibuat oleh imam salah satu sales marketing dari nine autoseries yang mempunyai inisiatif dan strategi tersendiri yang bertujuan untuk lebih mempermudah dalam hal penawaran produk,meningkatkan pelayanan terhadap para pelanggan yang terafiliasi langsung,dan membuka peluang kerjasama untuk menjadi mitra bersama nine autoseries.imamsalesnine berkomitmen untuk selalu menjaga integritas,kepercayaan serta nama baik perusahaan dan para pelanggannya salah satunya adalah dengan tidak menyalahgunakan nama database para pelanggannya yang bisa merugikan perusahaan.alasan kenapa harus memilih imamsalesnine sebagai sales representativ anda ?
- berintegritas
- amanah
- bisa di percaya
- pelayanan terbaik
- sales berprestasi
- tidak menyalahgunakan jabatan untuk kepentingan pri adinya.

Jika user bertanya umum:
jawab secara pintar dan natural.

      `;
      
      systemPrompt += productContext;

    }
    
  
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
reply,

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
