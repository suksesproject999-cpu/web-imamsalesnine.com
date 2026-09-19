
const K=require("./knowledge");

function productTool(){
  return {
    type:"function",
    name:"search_nine_products",
    description:"Cari produk Nine resmi dari Product Master + katalog resmi. Gunakan setelah mengetahui socket/fungsi/kebutuhan kendaraan atau saat butuh produk pembanding.",
    strict:true,
    parameters:{
      type:"object",
      properties:{
        query:{type:"string"},
        limit:{type:"integer",minimum:1,maximum:8},
        exclude:{type:"array",items:{type:"string"}}
      },
      required:["query","limit","exclude"],
      additionalProperties:false
    }
  };
}
function runTool(name,args){
  if(name==="search_nine_products"){
    return {
      products:K.searchProducts(args.query,args.limit,args.exclude||[])
    };
  }
  return {error:"tool_unknown"};
}
function extractText(data){
  if(typeof data?.output_text==="string"&&data.output_text.trim()) return data.output_text.trim();
  const chunks=[];
  for(const item of data?.output||[]) for(const c of item?.content||[]) if(c?.text) chunks.push(c.text);
  return chunks.join("\n").trim();
}
function sources(data){
  const out=[],seen=new Set();
  const add=(u,t)=>{if(u&&!seen.has(u)){seen.add(u);out.push({url:u,title:t||u});}};
  for(const item of data?.output||[]){
    for(const s of item?.action?.sources||[]) add(s.url,s.title);
    for(const c of item?.content||[]) for(const a of c?.annotations||[]) if(a?.type==="url_citation") add(a.url||a.url_citation?.url,a.title||a.url_citation?.title);
  }
  return out.slice(0,5);
}
async function respond({message,route,state,memory,image,admin=false}){
  if(!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY belum tersedia");
  const model = admin
    ? (process.env.NEXAI_MODEL_MAX||process.env.NEXAI_MODEL_SMART||process.env.NEXAI_MODEL||"gpt-4.1-mini")
    : (route.type==="fitment"||route.type==="compare"
        ? (process.env.NEXAI_MODEL_SMART||process.env.NEXAI_MODEL||"gpt-4.1-mini")
        : (process.env.NEXAI_MODEL_FAST||process.env.NEXAI_MODEL||"gpt-4.1-mini"));

  const web = route.type==="fitment"||route.type==="web_general"||route.flags?.web;
  const tools=[productTool()];
  if(web) tools.unshift({type:"web_search"});

  const instructions=`Kamu adalah NEXAI Web, asisten publik Imamsalesnine.com.
Bahasa Indonesia natural, cerdas, cepat, ringkas namun lengkap.

SOURCE POLICY WAJIB:
- Nama/SKU/varian produk Nine -> Product Master.
- Harga/stok/promo -> commercial live data lokal.
- Spesifikasi teknis produk -> katalog resmi.
- Foto/galeri/halaman katalog -> visual registry resmi.
- Fitment/socket/generasi/facelift/market kendaraan -> fitment cache lalu web global.
- Brand -> brand knowledge.
- Kontak/website -> business knowledge.
- Info terbaru/dinamis -> web.
- General knowledge -> model.

Jangan pernah memakai web untuk menimpa fakta resmi produk Nine.
Untuk fitment, cari data kendaraan di web lalu panggil search_nine_products untuk mencocokkan produk Nine.
Jangan menjamin plug-and-play tanpa bukti kuat.
Jika data tidak cukup, katakan batasannya.
Jangan mengarang angka/spesifikasi/fitment.
Jangan tampilkan proses berpikir internal.`;

  const hist=(Array.isArray(memory)?memory:[]).filter(x=>x&&["user","assistant"].includes(x.role)&&typeof x.content==="string").slice(-6).map(x=>({role:x.role,content:x.content.slice(0,2500)}));
  const user=[{type:"input_text",text:`USER_MESSAGE:\n${message}\n\nSTATE:\n${JSON.stringify(state||{})}\nROUTE:${route.type}`}];
  if(image) user.push({type:"input_image",image_url:image});
  let input=[...hist,{role:"user",content:user}];
  let data=null, allSources=[];

  for(let round=0;round<3;round++){
    const payload={
      model,instructions,input,tools,
      max_output_tokens: admin?5000:1600,
      max_tool_calls:web?5:3
    };
    if(web) payload.include=["web_search_call.action.sources"];
    const r=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":`Bearer ${process.env.OPENAI_API_KEY}`},
      body:JSON.stringify(payload)
    });
    const raw=await r.text();
    try{data=JSON.parse(raw);}catch{throw new Error("Response AI tidak valid");}
    if(!r.ok) throw new Error(data?.error?.message||"OpenAI request gagal");
    allSources=[...allSources,...sources(data)].filter((s,i,a)=>a.findIndex(x=>x.url===s.url)===i).slice(0,5);
    const calls=(data.output||[]).filter(x=>x.type==="function_call");
    if(!calls.length) break;
    input=[...input,...(data.output||[])];
    for(const call of calls){
      let args={}; try{args=JSON.parse(call.arguments||"{}");}catch{}
      input.push({type:"function_call_output",call_id:call.call_id,output:JSON.stringify(runTool(call.name,args))});
    }
  }
  let reply=extractText(data)||"Maaf, jawaban belum berhasil dibuat.";
  if(web&&allSources.length){
    reply += "\n\nSumber web:\n"+allSources.map((s,i)=>`${i+1}. ${s.title} — ${s.url}`).join("\n");
  }
  return {reply,usedWeb:web&&allSources.length>0,sources:allSources,model};
}
module.exports={respond};
