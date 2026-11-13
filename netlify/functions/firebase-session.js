"use strict";
const { vipIdentity, firebaseAdminAuth } = require('./utils/vip-identity');
const headers = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store, private, max-age=0', 'X-Content-Type-Options':'nosniff' };
const respond = (statusCode, data) => ({ statusCode, headers, body:JSON.stringify(data) });
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return respond(405,{success:false,code:'METHOD_NOT_ALLOWED'});
  let vip;
  try { vip = vipIdentity(event); }
  catch (e) { return respond(e.statusCode || 401,{success:false,code:e.message || 'INVALID_SESSION'}); }
  try {
    const expiresAt = vip.exp * 1000;
    const customToken = await firebaseAdminAuth().createCustomToken('netlify-vip:' + vip.folder, {
      legacyVip:true,
      loginSource:'netlify',
      vipName:vip.nama,
      vipFolder:vip.folder,
      legacySessionEndsAt:expiresAt
    });
    return respond(200,{success:true,token:customToken,folder:vip.folder,vipName:vip.nama,sessionEndsAt:expiresAt});
  } catch (e) {
    console.error('[firebase-session] gagal',e.code || 'SERVER_UNAVAILABLE');
    return respond(503,{success:false,code:'FIREBASE_SERVER_UNAVAILABLE'});
  }
};
