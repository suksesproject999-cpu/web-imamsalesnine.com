(()=>{'use strict';
/* Pesan untuk pelanggan selalu netral; detail teknis hanya ditulis ke console. */
const trim=v=>String(v??'').trim();
function validateSavedAddress(a){
 const issues=[];
 if(!a)return ['Pilih atau tambahkan alamat pengiriman terlebih dahulu.'];
 const name=trim(a.name||a.nama),phone=trim(a.phone||a.wa),province=trim(a.province||a.provinsi),city=trim(a.city||a.kota),postal=trim(a.postal||a.kodepos),full=trim(a.full||a.alamat),email=trim(a.email);
 const digits=phone.replace(/\D/g,'');
 if(!name)issues.push('Isi nama lengkap penerima.');else if(name.length>160)issues.push('Nama penerima terlalu panjang (maksimal 160 karakter).');
 if(!/^(?:62|0)?8\d{8,12}$/.test(digits)||phone.length<8||phone.length>30)issues.push('Periksa nomor WhatsApp penerima. Gunakan nomor aktif yang diawali 08 atau 628.');
 if(!province)issues.push('Isi provinsi tujuan.');else if(province.length>150)issues.push('Nama provinsi terlalu panjang.');
 if(!city)issues.push('Isi kota atau kabupaten tujuan.');else if(city.length>150)issues.push('Nama kota atau kabupaten terlalu panjang.');
 if(!/^\d{5}$/.test(postal))issues.push('Kode pos wajib 5 angka, tanpa huruf atau spasi.');
 if(!full)issues.push('Isi alamat lengkap, termasuk jalan dan nomor rumah.');else if(full.length>1600)issues.push('Alamat terlalu panjang. Singkatkan hingga maksimal 1.600 karakter.');
 if(email.length>160)issues.push('Alamat email terlalu panjang.');
 return issues;
}
function validateDraftAddress(d){
 const data={...d,full:[d.street,d.district,d.city,d.province,d.postal].map(trim).filter(Boolean).join(', ')};
 const issues=validateSavedAddress(data);
 if(!trim(d.district))issues.push('Isi kecamatan tujuan.');
 if(!trim(d.street))issues.push('Isi jalan dan nomor rumah secara lengkap.');
 return [...new Set(issues)];
}
function describeOrderIssues(issues){
 const messages=[];
 for(const raw of issues){const m=String(raw||'');let friendly='';
  if(/nama penerima/i.test(m))friendly='Periksa nama lengkap penerima pada alamat pengiriman.';
  else if(/nomor whatsapp/i.test(m))friendly='Periksa nomor WhatsApp pada alamat pengiriman.';
  else if(/email/i.test(m))friendly='Periksa email pada alamat pengiriman.';
  else if(/provinsi/i.test(m))friendly='Periksa provinsi pada alamat pengiriman.';
  else if(/kota/i.test(m))friendly='Periksa kota/kabupaten pada alamat pengiriman.';
  else if(/kode pos/i.test(m))friendly='Isi kode pos dengan 5 angka.';
  else if(/alamat lengkap|struktur alamat/i.test(m))friendly='Periksa kembali informasi alamat pengiriman.';
  else if(/ekspedisi/i.test(m))friendly='Pilih layanan pengiriman yang tersedia.';
  else if(/nama produk|nama varian|ID produk|struktur item|jumlah jenis produk|Produk baris/i.test(m))friendly='Ada detail produk yang perlu diperbarui. Kembali ke keranjang dan periksa produk, varian, serta jumlahnya.';
  else if(/voucher|diskon/i.test(m))friendly='Periksa voucher atau promo yang dipilih, lalu hitung ulang pesanan.';
  else if(/subtotal|total bayar|total jumlah item|struktur total/i.test(m))friendly='Rincian harga berubah. Periksa kembali total belanja sebelum melanjutkan.';
  else if(/login|sesi|UID/i.test(m))friendly='Sesi akun perlu diperbarui. Silakan masuk kembali.';
  else if(/catatan/i.test(m))friendly='Catatan pesanan terlalu panjang. Singkatkan catatan lalu coba lagi.';
  else friendly='Informasi pesanan belum lengkap atau sudah berubah. Periksa kembali dan coba lagi.';
  if(!messages.includes(friendly))messages.push(friendly);
 }
 return messages;
}
function serviceError(err){
 const code=String(err?.code||'').toLowerCase();
 if(/network|offline|deadline-exceeded/.test(code))return {title:'Koneksi terputus',text:'Pesanan belum terkirim. Periksa koneksi internet, lalu coba lagi. Produk di keranjang tetap tersimpan.'};
 if(/unauthenticated|auth\/|invalid-credential/.test(code))return {title:'Silakan masuk kembali',text:'Sesi akun Anda perlu diperbarui sebelum membuat pesanan. Masuk kembali, lalu coba lagi. Keranjang tetap tersimpan.'};
 if(/resource-exhausted/.test(code))return {title:'Terlalu banyak permintaan',text:'Mohon tunggu sebentar sebelum mencoba membuat pesanan kembali. Keranjang tetap tersimpan.'};
 if(/imamstore\/security-verification-failed/.test(code))return {title:'Verifikasi belum berhasil',text:'Kami belum dapat memverifikasi permintaan pesanan Anda. Periksa koneksi dan coba lagi. Bila terus berulang, hubungi layanan pelanggan. Keranjang tetap tersimpan.'};
 if(/permission-denied|failed-precondition/.test(code))return {title:'Pesanan belum dapat diproses',text:'Permintaan pesanan belum dapat diselesaikan saat ini. Data alamat yang telah Anda isi tidak perlu diubah apabila sudah benar. Silakan hubungi layanan pelanggan bila masalah berulang. Keranjang tetap tersimpan.'};
 return {title:'Pesanan belum berhasil dikirim',text:'Kami belum dapat menyelesaikan permintaan pesanan Anda. Silakan coba lagi beberapa saat. Produk di keranjang tetap tersimpan.'};
}
async function promptAddress(issues){
 const list=[...new Set(issues||[])].slice(0,6);
 const text=list.join('\n');
 const alert=window.Swal?.fire;
 if(alert){
  const html='<div style="text-align:left;line-height:1.7;font-size:14px">'+list.map(m=>'<div style="margin-bottom:7px">• '+m.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'</div>').join('')+'</div>';
  const res=await window.Swal.fire({icon:'warning',title:'Periksa alamat pengiriman',html,showCancelButton:true,confirmButtonText:'Perbaiki Alamat',cancelButtonText:'Nanti',confirmButtonColor:'#8cc63f',width:'min(92vw,430px)'});
  if(res.isConfirmed){if(typeof window.imamstoreOpenAddressEditorR7==='function')window.imamstoreOpenAddressEditorR7();else document.getElementById('refAddressOpen')?.click()}
 }else{
  window.alert('Periksa alamat pengiriman:\n'+text);
  document.getElementById('refAddressOpen')?.click();
 }
}
window.imamstoreCustomerCheckoutR7=Object.freeze({validateSavedAddress,validateDraftAddress,describeOrderIssues,serviceError,promptAddress});
})();