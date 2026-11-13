"use strict";
/* Server-only. Menghapus dokumen HANYA milik VIP terverifikasi.
   Firestore client VIP tidak memiliki izin hapus fisik. */
const { vipIdentity, firebaseAdminDb } = require('./utils/vip-identity');
const headers = { 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private, max-age=0','X-Content-Type-Options':'nosniff' };
const respond = (statusCode,data) => ({statusCode,headers,body:JSON.stringify(data)});
const validId = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(x);
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return respond(405,{success:false,code:'METHOD_NOT_ALLOWED'});
  let vip;
  try { vip=vipIdentity(event); }
  catch(e) {return respond(e.statusCode || 401,{success:false,code:e.message || 'INVALID_SESSION'});}
  let body;
  try { body=JSON.parse(event.body || '{}'); }
  catch(_) {return respond(400,{success:false,code:'BAD_JSON'});}
  if (!body || !validId(body.invoiceId) ||
      !['deleteInvoice','deleteItem'].includes(body.action) ||
      (body.action === 'deleteItem' && !validId(body.itemId))) {
    return respond(400,{success:false,code:'BAD_ARGUMENT'});
  }
  try {
    const db = firebaseAdminDb();
    const invoiceRef = db.collection('invoice').doc(body.invoiceId);
    const actionId = db.collection('vip_document_audit').doc();
    const result = await db.runTransaction(async tx => {
      const headerSnap = await tx.get(invoiceRef);
      if (!headerSnap.exists || headerSnap.data().nama !== vip.nama) {
        throw Object.assign(new Error('NOT_YOUR_INVOICE'),{statusCode:403});
      }
      const query = db.collection('pesanan').where('invoice','==',body.invoiceId).where('nama','==',vip.nama);
      const rows = await tx.get(query);
      if (rows.size > 390) throw Object.assign(new Error('TOO_MANY_ITEMS'),{statusCode:409});
      if (body.action === 'deleteInvoice') {
        rows.forEach(row => tx.delete(row.ref));
        tx.delete(invoiceRef);
        tx.set(actionId,{vip:vip.nama,folder:vip.folder,invoice:body.invoiceId,action:'deleteInvoice',count:rows.size,createdAt:new Date()});
        return {deleted:rows.size};
      }
      const item = rows.docs.find(row => row.id === body.itemId);
      if (!item) throw Object.assign(new Error('NOT_YOUR_ITEM'),{statusCode:403});
      tx.delete(item.ref);
      const remaining = rows.docs.filter(row=>row.id !== body.itemId);
      if (!remaining.length) tx.delete(invoiceRef);
      else {
        const total = remaining.reduce((sum,row)=>{
          const value=Number(row.data().total || 0);
          if (!Number.isFinite(value)) throw Object.assign(new Error('INVALID_TOTAL'),{statusCode:409});
          return sum+value;
        },0);
        tx.update(invoiceRef,{total_item:remaining.length,total});
      }
      tx.set(actionId,{vip:vip.nama,folder:vip.folder,invoice:body.invoiceId,itemId:body.itemId,action:'deleteItem',count:1,createdAt:new Date()});
      return {deleted:1,remaining:remaining.length};
    });
    return respond(200,{success:true,...result});
  } catch(e) {
    console.error('[vip-document-action]',e && e.code || e.message || 'ERROR');
    if (e.statusCode) return respond(e.statusCode,{success:false,code:e.message});
    return respond(503,{success:false,code:'SERVER_UNAVAILABLE'});
  }
};
