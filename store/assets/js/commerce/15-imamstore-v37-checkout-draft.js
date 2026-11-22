(()=>{'use strict';
const $=id=>document.getElementById(id),ids=['imamstoreCheckoutName','imamstoreCheckoutPhone','imamstoreCheckoutAddress'];
const key='imamstore_checkout_draft_v37';
try{const x=JSON.parse(localStorage.getItem(key)||'{}');for(const id of ids)if(typeof x[id]==='string')$(id).value=x[id]}catch(e){console.warn('Draft checkout unavailable',e)}
$('imamstoreSaveDraft')?.addEventListener('click',()=>{
 const data={};for(const id of ids)data[id]=$(id).value.trim();
 const msg=$('imamstoreCheckoutValidation');
 if(!data.imamstoreCheckoutName||!/^0[0-9+ -]{7,17}$/.test(data.imamstoreCheckoutPhone)||data.imamstoreCheckoutAddress.length<12){msg.textContent='Isi nama, nomor HP Indonesia, dan alamat lengkap minimal 12 karakter.';return}
 try{localStorage.setItem(key,JSON.stringify(data));msg.textContent='Data checkout tersimpan di perangkat ini. Belum ada pesanan atau pembayaran yang dikirim.'}catch(e){msg.textContent='Gagal menyimpan. Periksa izin penyimpanan browser.'}
});
})();