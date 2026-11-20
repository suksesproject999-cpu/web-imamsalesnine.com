/**
 * ImamStore R39.3 — same-origin proxy for Admin V5 video moderation.
 * Deploy NEXT TO the existing main-site `verify-token` Netlify Function.
 * No keys or credentials in this source. The Store Function still verifies:
 * - Firebase ID token and allowlisted admin UID
 * - Netlify Admin JWT through the existing verify-token endpoint
 * - Firebase App Check token
 *
 * The proxy does not grant access itself. It only removes browser -> Store CORS.
 */
const STORE_ENDPOINT='https://store.imamsales.com/.netlify/functions/video-social';
const ADMIN_ORIGIN='https://imamsalesnine.com';
const ACTIONS=new Set(['moderatorStatus','listPending','listReported','moderate']);
const JSON_HEADERS={
 'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff'
};
const respond=(statusCode,message)=>({statusCode,headers:JSON_HEADERS,body:JSON.stringify({success:false,message})});
const getHeader=(obj,key)=>{
  const h=obj||{};
  return typeof h[key]==='string'?h[key]:typeof h[key.toLowerCase()]==='string'?h[key.toLowerCase()]:typeof h[key.toUpperCase()]==='string'?h[key.toUpperCase()]:'';
};

export async function handler(event){
 if(event.httpMethod!=='POST')return respond(405,'Gunakan metode POST.');
 const origin=getHeader(event.headers,'origin');
 if(origin && origin!==ADMIN_ORIGIN)return respond(403,'Origin tidak diizinkan untuk moderator.');
 const raw=String(event.body||'');
 if(raw.length>12000)return respond(413,'Permintaan terlalu besar.');
 let data;
 try{data=JSON.parse(raw);}catch{return respond(400,'Format JSON salah.');}
 if(!data||typeof data!=='object'||Array.isArray(data)||!ACTIONS.has(data.action))return respond(400,'Aksi moderasi tidak valid.');
 const firebaseToken=getHeader(event.headers,'authorization');
 const appCheckToken=getHeader(event.headers,'x-firebase-appcheck');
 const netlifySession=getHeader(event.headers,'x-imam-admin-session');
 // We never log or store the three secret tokens. The Store backend verifies them all.
 if(!/^Bearer\s+\S{15,8192}$/i.test(firebaseToken)||!appCheckToken||!netlifySession){
  return respond(401,'Sesi Firebase, App Check, atau sesi Admin V5 belum tersedia.');
 }
 if(firebaseToken.length>8200||appCheckToken.length>8192||netlifySession.length>8192)
  return respond(413,'Header autentikasi terlalu besar.');
 try{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),16000);
  try{
   const upstream=await fetch(STORE_ENDPOINT,{
    method:'POST',redirect:'error',cache:'no-store',signal:controller.signal,
    headers:{
     Origin:ADMIN_ORIGIN,
     'Content-Type':'application/json',
     Authorization:firebaseToken,
     'X-Firebase-AppCheck':appCheckToken,
     'X-Imam-Admin-Session':netlifySession
    },
    body:raw
   });
   const text=await upstream.text();
   if(text.length>500000)return respond(502,'Respons moderasi terlalu besar.');
   let parsed;
   try{parsed=JSON.parse(text)}catch{return respond(502,'Respons Store tidak berupa JSON.');}
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return respond(502,'Respons Store tidak valid.');
   return {statusCode:upstream.status,headers:JSON_HEADERS,body:JSON.stringify(parsed)};
  }finally{clearTimeout(timeout);}
 }catch{return respond(503,'Penghubung Admin V5 gagal menghubungi Function Store. Periksa log Netlify kedua project.');}
}
