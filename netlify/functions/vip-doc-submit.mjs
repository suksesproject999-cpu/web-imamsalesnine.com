/**
 * R28 VIP document commit: one global, atomic and idempotent sequence per document kind.
 * 5 digits per generation, lifetime counters across years/months.
 * SO.2026.11.00001 -> SO.2026.12.99999 -> SO2.2027.01.00001.
 * This Function runs on MAIN Netlify project (same Firebase project as VIP dashboards).
 */
import jwt from 'jsonwebtoken';
import admin from 'firebase-admin';
import { createHash } from 'node:crypto';

const PROJECT_ID = 'apin-web';
const RESPONSE_HEADERS = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store, max-age=0', 'X-Content-Type-Options':'nosniff' };
const respond = (status, payload) => new Response(JSON.stringify(payload), { status, headers: RESPONSE_HEADERS });
const error = (status, code, message) => respond(status, {success:false,code,message});
const sha256 = s => createHash('sha256').update(s).digest('hex');
const validDate = s => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y,m,d] = s.split('-').map(Number);
  return y >= 2020 && y <= 2100 && m>=1 && m<=12 &&
    new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)===s;
};

// Pure helper: tested independently against boundary transitions.
export function nextVipSerial(state, kind, when = new Date()) {
  if (kind !== 'order' && kind !== 'klaim') throw new Error('INVALID_KIND');
  let generation = state?.generation === undefined ? 1 : state.generation;
  let sequence = state?.sequence === undefined ? 0 : state.sequence;
  if (!Number.isSafeInteger(generation) || generation < 1 || generation > 999999 ||
      !Number.isSafeInteger(sequence) || sequence < 0 || sequence > 99999)
    throw new Error('INVALID_COUNTER');
  if (sequence === 99999) { generation += 1; sequence = 1; }
  else { sequence += 1; }
  const fields = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone:'Asia/Jakarta', year:'numeric', month:'2-digit'
  }).formatToParts(when).filter(p=>p.type==='year'||p.type==='month').map(p=>[p.type,p.value]));
  const base = kind === 'order' ? 'SO' : 'KLM';
  const prefix = generation===1 ? base : base + generation;
  return {generation, sequence, invoice:`${prefix}.${fields.year}.${fields.month}.${String(sequence).padStart(5,'0')}`};
}

function firestoreAdmin() {
  const existing = admin.apps.find(x => x.name === 'imam-vip-serial-r28');
  if (existing) return existing.firestore();
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let credentials;
  if (projectId && clientEmail && privateKey) {
    if (projectId !== PROJECT_ID) throw new Error('PROJECT_MISMATCH');
    credentials = { projectId, clientEmail, privateKey:privateKey.replace(/\\n/g,'\n') };
  } else if (raw) {
    const item = JSON.parse(raw);
    if (item.project_id !== PROJECT_ID || !item.client_email || !item.private_key) throw new Error('PROJECT_MISMATCH');
    credentials = item;
  } else { throw new Error('SERVICE_NOT_CONFIGURED'); }
  const app = admin.initializeApp({credential:admin.credential.cert(credentials),projectId:PROJECT_ID},'imam-vip-serial-r28');
  return app.firestore();
}

function authorize(request) {
  const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get('authorization')||'');
  if (!match || !process.env.JWT_SECRET) return null;
  let user;
  try { user = jwt.verify(match[1], process.env.JWT_SECRET, {algorithms:['HS256']}); }
  catch { return null; }
  if (user?.role !== 'vip' || typeof user.folder !== 'string' ||
      !/^[a-z0-9][a-z0-9-]{1,64}$/.test(user.folder) ||
      typeof user.nama !== 'string' || !user.nama.trim() || user.nama.trim().length>100 ||
      !Number.isFinite(Number(user.exp)) || user.exp*1000<=Date.now()) return null;
  let accounts;
  try { accounts = JSON.parse(process.env.VIP_ACCOUNTS||'[]'); }
  catch { return null; }
  if (!Array.isArray(accounts) || !accounts.some(x => x && x.username===user.username &&
      x.folder===user.folder && x.nama===user.nama)) return null;
  return {folder:user.folder,name:user.nama.trim(),username:user.username};
}

function normalize(requestBody) {
  if (!requestBody || typeof requestBody!=='object' || Array.isArray(requestBody)) return null;
  const {kind,requestId,documentDate,createdTime,description='',items} = requestBody;
  if (!['order','klaim'].includes(kind) ||
      typeof requestId!=='string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(requestId) ||
      !validDate(documentDate) || typeof createdTime!=='string' || createdTime.length>100 ||
      typeof description!=='string' || description.length>1500 ||
      (kind==='klaim'&&!description.trim()) ||
      !Array.isArray(items) || items.length<1 || items.length>400) return null;
  let gross=0, discount=0, total=0;
  const cleanItems=[];
  for (const item of items) {
    if (!item || typeof item!=='object' || Array.isArray(item)) return null;
    const {nama,qty,satuan,harga} = item;
    const diskon = item.diskon??0;
    if (typeof nama!=='string' || !nama.trim() || nama.length>180 ||
        !Number.isSafeInteger(qty) || qty<1 || qty>1000000 ||
        !['pcs','set'].includes(satuan) || !Number.isSafeInteger(harga) || harga<0 || harga>10000000000 ||
        (kind==='order'&&harga===0) ||
        typeof diskon!=='number' || !Number.isFinite(diskon) || diskon<0 || diskon>100) return null;
    const sub=qty*harga, disc=Math.round(sub*diskon/100), result=sub-disc;
    if (![sub,disc,result].every(Number.isSafeInteger) || result<0) return null;
    gross+=sub;discount+=disc;total+=result;
    if (![gross,discount,total].every(Number.isSafeInteger)) return null;
    cleanItems.push({nama:nama.trim(),qty,satuan,harga,diskon,subtotal:sub,total:result,discount:disc});
  }
  return {kind,requestId,documentDate,createdTime:createdTime.trim(),description:description.trim(),items:cleanItems,gross,discount,total};
}

const money = value => 'Rp '+Number(value).toLocaleString('id-ID');
export default async function handler(request) {
  if (request.method!=='POST') return error(405,'METHOD_NOT_ALLOWED','Metode permintaan tidak didukung.');
  if (!(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))
    return error(415,'INVALID_CONTENT','Format permintaan tidak sesuai.');
  const user=authorize(request);
  if (!user) return error(401,'SESSION_EXPIRED','Sesi berakhir. Silakan masuk kembali.');
  let raw;
  try {
    const bodyText=await request.text();
    if (bodyText.length>380000) return error(413,'TOO_LARGE','Jumlah data terlalu besar.');
    raw=JSON.parse(bodyText);
  } catch {return error(400,'BAD_REQUEST','Periksa data dan coba kembali.');}
  const data=normalize(raw);
  if(!data) return error(422,'INVALID_DOCUMENT','Periksa tanggal, produk, jumlah, harga, dan keterangan.');
  let db;
  try { db=firestoreAdmin(); }
  catch (err) {
    console.error('[vip-doc-submit] service unavailable:',err?.code||err?.name||'UNKNOWN');
    return error(503,'SERVICE_UNAVAILABLE','Layanan penyimpanan sedang tidak tersedia.');
  }
  const submissionId=sha256(`r28:${user.folder}:${data.kind}:${data.requestId}`);
  const payloadHash=sha256(JSON.stringify({user:user.name,kind:data.kind,date:data.documentDate,time:data.createdTime,
    description:data.description,items:data.items}));
  const idemRef=db.collection('vip_serial_submissions').doc(submissionId);
  const counterRef=db.collection('vip_serial_counters').doc(data.kind);
  const now=new Date();
  try {
    const out=await db.runTransaction(async tx => {
      const idemSnap=await tx.get(idemRef);
      if (idemSnap.exists) {
        const recorded=idemSnap.data();
        if(recorded?.request_hash!==payloadHash || recorded?.folder!==user.folder) throw new Error('IDEMPOTENCY_CONFLICT');
        return {invoice:recorded.invoice,alreadySaved:true};
      }
      const counterSnap=await tx.get(counterRef);
      const serial=nextVipSerial(counterSnap.exists?counterSnap.data():null,data.kind,now);
      const headerRef=db.collection('invoice').doc(serial.invoice);
      const existingInvoice=await tx.get(headerRef);
      if(existingInvoice.exists) throw new Error('SERIAL_CONFLICT');
      const stamp=admin.firestore.FieldValue.serverTimestamp();
      const ts=now.getTime();
      const header={invoice:serial.invoice,nama:user.name,type:data.kind,status:'pending',
        total_item:data.items.length,total:data.total,subtotal:data.gross,total_diskon:data.discount,
        tanggal_dokumen:data.documentDate,waktu_mulai:data.createdTime,waktu:stamp,created_at:ts,
        vip_folder:user.folder,serial_generation:serial.generation,serial_sequence:serial.sequence};
      if (data.kind==='klaim') header.keterangan=data.description;
      tx.set(counterRef,{generation:serial.generation,sequence:serial.sequence,updated_at:stamp},{merge:true});
      tx.create(headerRef,header);
      data.items.forEach((x,i)=>{
        const orderText=`${x.nama} (${x.qty} ${x.satuan}) | Harga ${money(x.harga)} | Diskon ${x.diskon}% | Total ${money(x.total)}`;
        tx.create(db.collection('pesanan').doc(serial.invoice+'__'+String(i+1).padStart(4,'0')),
          {nama:user.name,produk:x.nama,qty:x.qty,satuan:x.satuan,harga:x.harga,
           diskon:x.diskon,subtotal:x.subtotal,total:x.total,order:orderText,
           status:'pending',type:data.kind,invoice:serial.invoice,
           tanggal_dokumen:data.documentDate,waktu:stamp,created_at:ts});
      });
      tx.create(idemRef,{folder:user.folder,type:data.kind,request_hash:payloadHash,
        invoice:serial.invoice,created_at:stamp});
      return {invoice:serial.invoice,alreadySaved:false};
    },{maxAttempts:5});
    return respond(200,{success:true,invoice:out.invoice,alreadySaved:out.alreadySaved});
  } catch (err) {
    const code=String(err?.message||'');
    if (code==='SERIAL_CONFLICT' || code==='INVALID_COUNTER') {
      console.error('[vip-doc-submit] counter requires review:',code);
      return error(409,'COUNTER_REVIEW','Penomoran perlu diperiksa oleh Admin. Dokumen belum tersimpan.');
    }
    if (code==='IDEMPOTENCY_CONFLICT') return error(409,'REQUEST_CHANGED','Data dokumen berubah. Periksa kembali sebelum mengirim.');
    console.error('[vip-doc-submit] transaction failed:',err?.code||err?.name||'UNKNOWN');
    return error(503,'SAVE_UNAVAILABLE','Dokumen belum tersimpan. Silakan coba kembali.');
  }
}
