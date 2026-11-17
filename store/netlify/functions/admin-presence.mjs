import {FieldValue} from 'firebase-admin/firestore';
import {getPresenceFirebase} from '../lib/firebase-admin.mjs';

// Only the original website dashboard may send cross-origin heartbeats.
// The Firebase ID token and server UID validation provide actual authorization.
const ALLOWED_ORIGINS=new Set([
  'https://imamsalesnine.com',
  'https://www.imamsalesnine.com',
  'https://imamsales.com',
  'https://www.imamsales.com',
  'https://imamsalesnineautoseries.netlify.app'
]);
const DOC_PATH='store_public/imamstore_status';
function response(status,body,origin){
  const headers=new Headers({
    'Cache-Control':'no-store, max-age=0',
    'Vary':'Origin',
    'Content-Type':'application/json; charset=utf-8',
    'X-Content-Type-Options':'nosniff'
  });
  if(origin&&ALLOWED_ORIGINS.has(origin)){
    headers.set('Access-Control-Allow-Origin',origin);
    headers.set('Access-Control-Allow-Methods','POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');
    headers.set('Access-Control-Max-Age','600');
  }
  return new Response(status===204?null:JSON.stringify(body),{status,headers});
}
export default async function handler(request){
  const origin=request.headers.get('origin')||'';
  if(!ALLOWED_ORIGINS.has(origin))
    return response(403,{success:false,message:'Origin tidak diizinkan'},origin);
  if(request.method==='OPTIONS')return response(204,null,origin);
  if(request.method!=='POST')return response(405,{success:false,message:'Method Not Allowed'},origin);
  const adminUid=process.env.FIREBASE_ADMIN_UID?.trim();
  if(!adminUid)return response(503,{success:false,message:'Presence belum dikonfigurasi'},origin);
  const bearer=request.headers.get('authorization')||'';
  const match=/^Bearer\s+([^\s]+)$/i.exec(bearer);
  if(!match)return response(401,{success:false,message:'Firebase ID Token diperlukan'},origin);
  try{
    const {auth,db}=getPresenceFirebase();
    let decoded;
    try{decoded=await auth.verifyIdToken(match[1],true);}
    catch{return response(401,{success:false,message:'Firebase ID Token tidak valid'},origin);}
    if(decoded.uid!==adminUid||decoded.firebase?.sign_in_provider==='anonymous')
      return response(403,{success:false,message:'Hak akses admin tidak sesuai'},origin);
    await db.doc(DOC_PATH).set({lastActiveAt:FieldValue.serverTimestamp()},{merge:true});
    return response(200,{success:true},origin);
  }catch(error){
    // Do not expose service account credentials or internal Firebase errors.
    console.error('[ImamStore Admin Presence] Server write/config error:',error?.code||error?.message||'server-error');
    return response(503,{success:false,message:'Layanan presence belum tersedia'},origin);
  }
}
