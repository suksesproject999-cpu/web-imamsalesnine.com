
document.addEventListener('DOMContentLoaded',function(){
'use strict';
const box=document.getElementById('imamstoreAdminOrders');
const list=document.getElementById('r12AdminList'),info=document.getElementById('r12AdminMessage');
if(!box||!list||!info)return;
const statuses=[['checkout_created','Menunggu konfirmasi'],['confirmed','Dikonfirmasi'],['processing','Diproses'],['packed','Dikemas'],['shipped','Dikirim'],['delivered','Terkirim'],['completed','Selesai'],['cancelled','Dibatalkan']];
let adminAllowed=false,loadEpoch=0,button=null;
// R14: statistik penjualan hanya dihitung setelah admin memverifikasi pesanan.
// Satu transaksi atomik mencatat status + ledger + setiap produk; aman dari klik ganda.
const soldStatuses=new Set(['confirmed','processing','packed','shipped','delivered','completed']);
function orderQuantities(items){
 if(!Array.isArray(items)||!items.length||items.length>10)throw Error('Rincian pesanan tidak valid untuk perhitungan penjualan.');
 const units=new Map();
 for(const item of items){
  const id=String(item?.productId??'').trim(),qty=Number(item?.qty);
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(id)||!Number.isSafeInteger(qty)||qty<1||qty>999)
   throw Error('ID produk atau jumlah pada pesanan tidak valid.');
  units.set(id,(units.get(id)||0)+qty);
 }
 return units;
}
function catalogSoldBaseline(id){
 const rows=window.imamstoreV29?.products?.();
 const product=Array.isArray(rows)?rows.find(x=>String(x.id)===id):null;
 const sold=Number(product?.terjual);
 return Number.isSafeInteger(sold)&&sold>=0?sold:0;
}
async function saveStatusWithSales(orderDocumentId,newStatus,resa){
 if(!statuses.some(([s])=>s===newStatus))throw Error('Status pesanan tidak dikenal.');
 const store=firebase.firestore(),FV=firebase.firestore.FieldValue;
 const orderRef=store.collection('orders').doc(orderDocumentId);
 const ledgerRef=store.collection('order_sale_ledger').doc(orderDocumentId);
 return await store.runTransaction(async tx=>{
  // SELURUH pembacaan transaksi harus dilakukan sebelum menulis.
  const [orderSnap,ledgerSnap]=await Promise.all([tx.get(orderRef),tx.get(ledgerRef)]);
  if(!orderSnap.exists)throw Error('Pesanan tidak ditemukan.');
  const order=orderSnap.data()||{};
  const units=orderQuantities(order.items);
  const counted=ledgerSnap.exists&&ledgerSnap.data()?.counted===true;
  const shouldCount=soldStatuses.has(newStatus);
  const delta=(shouldCount?1:0)-(counted?1:0);
  const stats=[];
  if(delta!==0){
   for(const [productId,qty] of units){
    const ref=store.collection('statistik_produk').doc(productId);
    stats.push({productId,qty,ref,snap:await tx.get(ref)});
   }
  }
  // R11 hanya memperbolehkan field status, resi, dan updatedAt dari admin.
  const changes={status:newStatus,updatedAt:FV.serverTimestamp()};
  if(resa!==undefined && resa!==String(order.resi||order.awb||''))changes.resi=resa;
  tx.update(orderRef,changes);
  let changedUnits=0;
  for(const {productId,qty,ref,snap} of stats){
   const value=snap.exists?snap.data()?.terjual:undefined;
   const current=value===undefined||value===null?catalogSoldBaseline(productId):Number(value);
   if(!Number.isSafeInteger(current)||current<0)throw Error('Statistik awal produk tidak valid.');
   const next=current+delta*qty;
   if(next<0)throw Error('Statistik penjualan lebih kecil daripada jumlah yang perlu dikoreksi.');
   tx.set(ref,{terjual:next,updatedAt:FV.serverTimestamp()},{merge:true});
   changedUnits+=qty;
  }
  // Ledger privat per order mencegah pencatatan ulang, termasuk bila status berganti.
  if(delta!==0){
   tx.set(ledgerRef,{orderId:orderDocumentId,counted:shouldCount,
    productQuantities:Object.fromEntries(units),updatedAt:FV.serverTimestamp()},{merge:true});
  }
  return {delta,changedUnits};
 });
}
window.imamstoreR14SalesAdmin=Object.freeze({saveStatusWithSales,orderQuantities});

const elt=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n};
const money=n=>'Rp'+Math.round(Number(n)||0).toLocaleString('id-ID');
async function verifyAdmin(force=false){
 try{const a=window.firebase?.auth?.(),u=a?.currentUser;
  if(!u||u.isAnonymous)return false;
  const t=await u.getIdTokenResult(force);
  return a.currentUser?.uid===u.uid && (t?.claims?.admin===true || u.uid==='U7XnPGpjjUNAYnwuoMh68I8guT33');
 }catch{return false}
}
function close(){loadEpoch++;box.hidden=true;document.body.style.removeProperty('overflow')}
async function load(){
 const ticket=++loadEpoch;list.replaceChildren();info.textContent='Memuat pesanan terbaru…';
 if(!(await verifyAdmin(true))){adminAllowed=false;close();button?.remove();button=null;return}
 try{
  // Batasi pembacaan: tidak ada onSnapshot dan hanya dijalankan ketika admin meminta.
  const snap=await firebase.firestore().collection('orders').orderBy('createdAt','desc').limit(25).get();
  if(ticket!==loadEpoch)return;
  if(snap.empty){info.textContent='Belum ada pesanan.';return}
  info.textContent='Menampilkan '+snap.docs.length+' pesanan terbaru. Gunakan Muat Ulang untuk melihat perubahan.';
  snap.docs.forEach(doc=>{
   const o=doc.data()||{},item=elt('article','r12-admin-order');
   item.append(elt('h3','',String(o.orderId||doc.id)));
   item.append(elt('p','','Penerima: '+String(o.customer?.nama||'-')));
   const summary=Array.isArray(o.items)?o.items.map(x=>String(x.nama||'Produk')+' ×'+Number(x.qty||0)).slice(0,4).join(' • '):'-';
   item.append(elt('p','',summary));
   item.append(elt('p','','Total sementara: '+money(o.totals?.totalBayar)));
   const statLabel=elt('label','','Status pesanan');
   const sel=elt('select');
   statuses.forEach(([value,label])=>{const opt=elt('option','',label);opt.value=value;sel.append(opt)});
   sel.value=statuses.some(([v])=>v===o.status)?o.status:'checkout_created';statLabel.append(sel);item.append(statLabel);
   const resiLabel=elt('label','','Nomor resi (opsional)');const resi=elt('input');
   resi.maxLength=120;resi.placeholder='Isi setelah dikirim';resi.value=String(o.resi||o.awb||'').slice(0,120);resiLabel.append(resi);item.append(resiLabel);
   const save=elt('button','r12-admin-save','Simpan Status');save.type='button';
   const feedback=elt('p','r12-admin-feedback','');feedback.setAttribute('aria-live','polite');
   save.addEventListener('click',async()=>{
    if(save.disabled)return;
    if(!(await verifyAdmin(true))){feedback.textContent='Sesi admin perlu diverifikasi ulang.';return}
    if(!statuses.some(([v])=>v===sel.value)){feedback.textContent='Status tidak dikenali.';return}
    save.disabled=true;feedback.textContent='Menyimpan perubahan…';
    try{
     const nextResi=resi.value.trim();
     const result=await saveStatusWithSales(doc.id,sel.value,nextResi);
     o.status=sel.value;o.resi=nextResi;
     const explanation=result.delta>0?' Statistik terjual bertambah '+result.changedUnits+' unit.':
       result.delta<0?' Statistik terjual dikoreksi -'+result.changedUnits+' unit.':
       ' Statistik terjual tidak berubah.';
     feedback.textContent='Status berhasil diperbarui. Pelanggan dapat melihatnya di Pesanan Saya.'+explanation;
    }catch(e){console.warn('[ImamStore R12 admin] Perubahan status gagal',String(e?.code||'unknown'));feedback.textContent='Perubahan belum berhasil disimpan. Periksa akses admin dan coba lagi.'}
    finally{save.disabled=false}
   });
   item.append(save,feedback);list.append(item);
  });
 }catch(e){if(ticket===loadEpoch){console.warn('[ImamStore R12 admin] Gagal memuat',String(e?.code||'unknown'));info.textContent='Pesanan belum bisa dimuat. Periksa izin akun admin atau coba lagi.'}}
}
async function open(){if(!adminAllowed||!(await verifyAdmin()))return;box.hidden=false;document.body.style.overflow='hidden';load()}
document.getElementById('r12AdminClose')?.addEventListener('click',close);
document.getElementById('r12AdminRefresh')?.addEventListener('click',load);
box.addEventListener('click',e=>{if(e.target===box)close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!box.hidden)close()});
const actions=document.querySelector('.hero-actions')||document.querySelector('.store-actions');
const auth=window.firebase?.auth?.();
if(auth?.onAuthStateChanged)auth.onAuthStateChanged(async u=>{
 const id=u?.uid||'';const allowed=!!u&&await verifyAdmin(false);
 if(auth.currentUser?.uid!==id)return;
 adminAllowed=allowed;
 if(!allowed){button?.remove();button=null;if(!box.hidden)close();return}
 if(!actions||button)return;
 button=elt('button','nexai-orders-open','Kelola Pesanan');button.id='r12AdminLauncher';button.type='button';
 button.addEventListener('click',open);actions.append(button);
});
});
