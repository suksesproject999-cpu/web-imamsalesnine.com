
  
const URL =
"https://script.google.com/macros/s/AKfycbwztdCQ87hwDrH0fJfxQe-w6JVUwwV5qETTGCe7TEhTXTLzWlbE0jHPZfAetClBTC5QJQ/exec";

const VIP_NAME = window.__VIP_CONTEXT.nama;

let invoiceNo = "";
let waktuOrder = "";

let allProduk = [];
let orderCart = [];
let klaimCart = [];
let cart = orderCart;
let mode = "order"; // 🔥 default mode
let openedTabs = [];

let activeTab = "";

const pageTitles = {

dashboard : "Dashboard",
info : "Informasi",
order : "Pesanan Penjualan",
klaim : "Klaim Barang",
pengiriman : "Pengiriman",
retur : "Retur",
ai : "Imam AI"

};


// 🔥 REALTIME PRODUK FIREBASE
db.collection("stok")
.onSnapshot(snapshot => {

  allProduk = [];

  snapshot.forEach(doc => {

    let data = doc.data();

    if(data.nama){

      allProduk.push(data.nama);

    }

  });

  console.log(
    "🔥 DROPDOWN PRODUK:",
    allProduk.length
  );

});

  
// ================= ORDER =================
function renderOrder(){
  
  setTabTitle(
    "Pesanan Penjualan"
  );
  
 generateOrderInfo(); 

mode = "order";

cart = orderCart;

const draft =
localStorage.getItem(
window.VIPStorage.key("draftOrder")
);

if(
  draft &&
  cart.length===0
){

  const lanjut =
  confirm(
    "Ditemukan draft order.\n\nLanjutkan draft?"
  );

  if(lanjut){

    try{

      orderCart =
      JSON.parse(draft);

      cart = orderCart;

    }catch(e){

      localStorage.removeItem(
        window.VIPStorage.key("draftOrder")
      );

    }

  }else{

    localStorage.removeItem(
      window.VIPStorage.key("draftOrder")
    );

  }

}


invoiceNo =
localStorage.getItem(window.VIPStorage.key("invoiceNo")) || invoiceNo;

waktuOrder =
localStorage.getItem(window.VIPStorage.key("waktuOrder")) || waktuOrder;
  
  const today =

new Date()
.toISOString()
.split("T")[0];

document.getElementById("main-content").innerHTML = `

<div class="erp-order">
<div class="erp-section">

<!-- FORM CUSTOMER -->

<div class="erp-form-row">

<div class="erp-form-group">

<label>Dipesan oleh</label>

<input
type="text"
value="${VIP_NAME}"
readonly
>

</div>

<div class="erp-form-group">

<label>Tanggal</label>

<input
type="date"
value="${today}"
>

</div>

<div class="erp-form-group">

<label>No Pesanan</label>

<input
type="text"
value="${invoiceNo}"
readonly
>

</div>

<div class="erp-form-group">

<label>Waktu Order</label>

<input
type="text"
value="${waktuOrder}"
readonly
>

</div>

</div>

</div>


<div class="erp-section">

<!-- PENCARIAN BARANG -->

<div class="search-box">

<input
type="text"
id="searchInput"
placeholder="Cari/Pilih Barang..."
onkeyup="showSearch(this.value)"
onclick="openSearch()"
>

<div
id="hasil"
class="dropdown"
></div>

</div>

<br><br>

<div class="erp-bottom">

<div class="erp-table-area">

<table class="erp-table">

<thead>
<tr>
<th style="width:40%">Nama Barang</th>
<th style="width:70px">Qty</th>
<th style="width:80px">Satuan</th>
<th style="width:120px">Harga</th>
<th style="width:80px">Diskon %</th>
<th style="width:120px">Total</th>
<th style="width:80px">Hapus</th>
</tr>
</thead>

<tbody id="erp-cart-body">

<tr>

<td colspan="6"
style="
height:450px;
text-align:center;
color:#999;
">

Belum ada data

</td>

</tr>

</tbody>

</table>

</div>

<div class="erp-footer-area">

<div class="erp-action">

<button 
class="btn-new"
onclick="orderBaru()"
>
➕ <span class="btn-label">
Data Baru
</span>
</button>

<button
class="btn-cancel"
onclick="batalOrder()"
>
<i class="fa-solid fa-xmark"></i>
<span class="btn-label">
Batal
</span>
</button>





<button
class="btn-draft"
onclick="simpanDraft()"
>
<i class="fa-solid fa-floppy-disk"></i>
<span class="btn-label">
Simpan Draft
</span>
</button>




<button
class="btn-order"
onclick="kirimWA()"
>
<i class="fa-solid fa-paper-plane"></i>
<span class="btn-label">
Kirim Order
</span>
</button>



</div>

<div class="erp-summary">

<div class="sum-row">
<span>Sub Total</span>
<b id="subTotal">Rp 0</b>
</div>

<div class="sum-row">
<span>Diskon</span>
<b id="totalDiskon">Rp 0</b>
</div>


<div class="sum-row total">
<span>Total</span>
<b id="grandTotal">Rp 0</b>
</div>

</div>

</div>

`;

renderCartERP();

}

// ================= KLAIM =================
function renderKlaim(){
  
setTabTitle(
    "Klaim Barang"
  );

generateKlaimInfo(); 

mode = "klaim";

cart = klaimCart;

const draft =
localStorage.getItem(
window.VIPStorage.key("draftKlaim")
);

if(
  draft &&
  klaimCart.length===0
){

  const lanjut =
  confirm(
    "Ditemukan draft klaim.\n\nLanjutkan draft?"
  );

  if(lanjut){
    
    try{

  klaimCart = JSON.parse(draft);
  cart = klaimCart;

}catch(e){

  localStorage.removeItem(
    window.VIPStorage.key("draftKlaim")
  );

}

  }else{

    localStorage.removeItem(
      window.VIPStorage.key("draftKlaim")
    );

  }

}


klaimNo =
localStorage.getItem(window.VIPStorage.key("klaimNo")) || klaimNo;

waktuKlaim =
localStorage.getItem(window.VIPStorage.key("waktuKlaim")) || waktuKlaim;
  
  const today =

new Date()
.toISOString()
.split("T")[0];

document.getElementById("main-content").innerHTML = `

<div class="erp-order">
<div class="erp-section">

<!-- FORM CUSTOMER -->

<div class="erp-form-row">

<div class="erp-form-group">

<label>Dipesan oleh</label>

<input
type="text"
value="${VIP_NAME}"
readonly
>

</div>

<div class="erp-form-group">

<label>Tanggal</label>

<input
type="date"
value="${today}"
>

</div>

<div class="erp-form-group">

<label>No Klaim</label>

<input
type="text"
value="${klaimNo}"
readonly
>

</div>

<div class="erp-form-group">

<label>Waktu Klaim</label>

<input
type="text"
value="${waktuKlaim}"
readonly
>

</div>

</div>

</div>


<div class="erp-section">

<!-- PENCARIAN BARANG -->

<div class="search-box">

<input
type="text"
id="searchInput"
placeholder="Cari/Pilih Barang..."
onkeyup="showSearch(this.value)"
onclick="openSearch()"
>

<div
id="hasil"
class="dropdown"
></div>

</div>

<br><br>

<div class="erp-bottom">

<div class="erp-table-area">

<table class="erp-table">

<thead>
<tr>
<th style="width:40%">Nama Barang</th>
<th style="width:70px">Qty</th>
<th style="width:80px">Satuan</th>
<th style="width:120px">Harga</th>
<th style="width:80px">Diskon %</th>
<th style="width:120px">Total</th>
<th style="width:80px">Hapus</th>
</tr>
</thead>

<tbody id="erp-cart-body">

<tr>

<td colspan="7"
style="
height:450px;
text-align:center;
color:#999;
">

Belum ada data

</td>

</tr>

</tbody>

</table>

</div>

<div
style="
padding:15px;
border-top:1px solid #eee;
"
>

<label
style="
display:block;
margin-bottom:8px;
font-weight:600;
"
>

Keterangan Klaim

</label>

<textarea
id="ket"
placeholder="Contoh: Barang pecah, lampu mati, warna tidak sesuai, unit kurang lengkap..."
style="
width:100%;
height:90px;
padding:10px;
border:1px solid #ddd;
border-radius:6px;
box-sizing:border-box;
resize:none;
"
></textarea>

</div>

<div class="erp-footer-area">

<div class="erp-action">


<button 
class="btn-new"
onclick="orderBaru()"
>
<i class="fa-solid fa-plus"></i>
<span class="btn-label">
Data Baru
</span>
</button>




<button
class="btn-cancel"
onclick="batalOrder()"
>
<i class="fa-solid fa-xmark"></i>
<span class="btn-label">
Batal
</span>
</button>





<button
class="btn-draft"
onclick="simpanDraft()"
>
<i class="fa-solid fa-floppy-disk"></i>
<span class="btn-label">
Simpan Draft
</span>
</button>




<button
class="btn-order btn-klaim"
onclick="kirimKlaim()"
>
<i class="fa-solid fa-rotate"></i>
Kirim Klaim
</button>



</div>

<div class="erp-summary">

<div class="sum-row">
<span>Sub Total</span>
<b id="subTotal">Rp 0</b>
</div>

<div class="sum-row">
<span>Diskon</span>
<b id="totalDiskon">Rp 0</b>
</div>


<div class="sum-row total">
<span>Total</span>
<b id="grandTotal">Rp 0</b>
</div>

</div>

</div>

`;

renderCartERP();

}

// ================= SEARCH =================
function openSearch(){
  document.getElementById("hasil").style.display = "block";
}

function showSearch(val){

  let el = document.getElementById("hasil");
  el.innerHTML = "";

  if(!val){
    el.style.display = "none";
    return;
  }

  let keyword =
val.toLowerCase().trim();

let hasil = allProduk.filter(p => {

  let nama =
  p.toLowerCase();

  return nama.includes(keyword);

});

// 🔥 PRIORITAS YANG PALING MIRIP
hasil.sort((a,b)=>{

  let aa =
  a.toLowerCase();

  let bb =
  b.toLowerCase();

  return (
    aa.indexOf(keyword)
    -
    bb.indexOf(keyword)
  );

});

  hasil.slice(0,20).forEach(item=>{

  let div = document.createElement("div");

  let kosong = false;

if(
  window.stokData &&
  window.stokData.length > 0
){
  kosong = window.isKosong(item);
}

  
div.innerHTML = kosong
    ? '<i class="fa-solid fa-circle-xmark"></i> ' + item + ' (Stok Habis)'
    : '<i class="fa-solid fa-circle-check"></i> ' + item;



  if(kosong){
    div.style.color = "#888";
    div.style.opacity = "0.6";
  }

  if(kosong && mode === "order"){
    div.style.cursor = "not-allowed";
  } else {
    div.style.cursor = "pointer";
  }

  div.onclick = () => {

  if(mode === "order" && kosong){
    alert("Stok produk ini lagi kosong bro 😏");
    return;
  }

  tambahItem(item);

  el.style.display = "none";

  document.getElementById("searchInput").value = "";

  document.getElementById("searchInput").blur();

};

  el.appendChild(div);
});

  el.style.display = "block";
}

// ================= CART =================
function tambahItem(nama){

  let existing = cart.find(x => x.nama === nama);

  if(existing){
    existing.qty++;
  } else {
    cart.push({

nama,

qty:1,

satuan:"pcs",

harga:0,

diskon:0

});

  }
  
  syncCart();

  autoSaveDraft();

  renderCart();
  
  renderCartERP();
}

function renderCartERP(){

const body =
document.getElementById(
"erp-cart-body"
);


if(!body) return;

body.innerHTML = "";

if(cart.length===0){

body.innerHTML = `
<tr>
<td colspan="7"
style="
text-align:center;
color:#999;
padding:100px 0;
">
Belum ada data
</td>
</tr>
`;

return;

}

cart.forEach((item,i)=>{

const subtotal =
(item.harga || 0) * item.qty;

const diskon =
subtotal *
((item.diskon || 0) / 100);

const total =
subtotal - diskon;

body.innerHTML += `

<tr>

<td>${item.nama}</td>

<td>

<input
type="number"
value="${item.qty}"
min="1"
onchange="updateQty(${i},this.value)"
style="
width:60px;
text-align:center;
"
>

</td>

<td>

<button
class="unit-btn"
onclick="toggleSatuan(${i})"
>

${item.satuan}

</button>

</td>

<td>

<input
type="text"
value="${item.harga ? formatInputRupiah(item.harga) : ''}"
oninput="handleHargaERP(this,${i})"
>

</td>

<td>

<input
type="number"
min="0"
max="100"
value="${item.diskon || 0}"
onchange="updateDiskon(${i},this.value)"
style="width:60px;text-align:center;"
>

</td>

<td id="rowTotal${i}">

${formatRupiah(total)}

</td>

<td>


<button
onclick="hapus(${i})"
class="btn-delete"
title="Hapus"
>

<i class="fa-solid fa-trash-can"></i>

</button>



</td>

</tr>

`;

});

let subtotal = 0;

cart.forEach(item=>{
  subtotal += (item.harga || 0) * item.qty;
});

updateTotalERP();

}

function renderCart(){

  let el = document.getElementById("cart-list");

  if(!el) return;

  el.innerHTML = "";

  cart.forEach((item,i)=>{

    let div = document.createElement("div");
    div.className = "cart-item";

    div.innerHTML = `
  <b>${item.nama}</b>

  <div class="cart-row">

    <button onclick="kurang(${i})">➖</button>

    <input type="number" value="${item.qty}" min="1"
      onchange="updateQty(${i}, this.value)">

    <button onclick="tambah(${i})">➕</button>

    <select onchange="updateSatuan(${i}, this.value)">
      <option ${item.satuan=="pcs"?"selected":""}>pcs</option>
      <option ${item.satuan=="set"?"selected":""}>set</option>
    </select>

    <input type="text" placeholder="Harga"
      value="${item.harga ? formatInputRupiah(item.harga) : ""}"
      oninput="handleHargaInput(this, ${i})">

    <button onclick="hapus(${i})">❌</button>

  </div>

  <div class="subtotal">
    💰 Subtotal: ${formatRupiah((item.harga || 0) * item.qty)}
  </div>
`;

    el.appendChild(div);
  });

let total = 0;

cart.forEach(item=>{
  total += (item.harga || 0) * item.qty;
});

let totalDiv = document.createElement("div");
totalDiv.innerHTML = `<b>💰 Total: ${formatRupiah(total)}</b>`;

el.appendChild(totalDiv);
}

function tambah(i){

cart[i].qty++;

syncCart();

autoSaveDraft();

renderCart();

renderCartERP();

}

function kurang(i){
  if(cart[i].qty>1){ cart[i].qty--; }
  else{ cart.splice(i,1); }
  
  syncCart();
  
  autoSaveDraft();
  
  renderCart();
  
  renderCartERP();
}

function hapus(i){
  cart.splice(i,1);
  
  syncCart();
  
  autoSaveDraft();

  renderCart();
  
  renderCartERP();

  updateTotalERP();
}

function updateSatuan(i,val){

  cart[i].satuan = val;

  renderCartERP();

}

function updateHarga(i,val){

  let v = parseInt(val) || 0;

  cart[i].harga = v;

}

function formatRupiah(angka){
  return "Rp " + (angka || 0).toLocaleString("id-ID");
}

function formatInputRupiah(angka){
  return angka.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function handleHargaInput(el, i){

  // ambil angka murni (hapus titik)
  let angka = el.value.replace(/\D/g, "");

  // simpan ke cart sebagai number
  cart[i].harga = parseInt(angka) || 0;

  // format tampilan
  el.value = formatInputRupiah(angka);
}

function updateQty(i,val){
  let v = parseInt(val);
  if(v>0){
    cart[i].qty = v;
    
    syncCart();
    
    autoSaveDraft();
    
    renderCart();
    renderCartERP();// 🔥 WAJIB
  }
}

function batalOrder(){

const ok = confirm(
"Data akan dibatalkan tanpa disimpan.\n\nLanjutkan?"
);

if(!ok) return;

if(mode==="order"){

orderCart = [];
cart = orderCart;

localStorage.removeItem(window.VIPStorage.key("invoiceNo"));
localStorage.removeItem(window.VIPStorage.key("waktuOrder"));
localStorage.removeItem(window.VIPStorage.key("draftOrder"));

invoiceNo = "";
waktuOrder = "";

generateOrderInfo();

renderOrder();

}else{

klaimCart = [];
cart = klaimCart;

localStorage.removeItem(window.VIPStorage.key("klaimNo"));
localStorage.removeItem(window.VIPStorage.key("waktuKlaim"));
localStorage.removeItem(window.VIPStorage.key("draftKlaim"));

klaimNo = "";
waktuKlaim = "";

generateKlaimInfo();

renderKlaim();

}

}

function orderBaru(){

const ok = confirm(
"Buat data baru?\n\nData yang belum disimpan akan hilang."
);

if(!ok) return;

if(mode==="order"){

orderCart = [];
cart = orderCart;

localStorage.removeItem(window.VIPStorage.key("invoiceNo"));
localStorage.removeItem(window.VIPStorage.key("waktuOrder"));
localStorage.removeItem(window.VIPStorage.key("draftOrder"));

invoiceNo = "";
waktuOrder = "";

generateOrderInfo();

renderOrder();

}else{

klaimCart = [];
cart = klaimCart;

localStorage.removeItem(window.VIPStorage.key("klaimNo"));
localStorage.removeItem(window.VIPStorage.key("waktuKlaim"));
localStorage.removeItem(window.VIPStorage.key("draftKlaim"));

klaimNo = "";
waktuKlaim = "";

generateKlaimInfo();

renderKlaim();

}

}

// ================= KIRIM =================
function kirimWA(){

  console.log("STOK:", window.stokData);

  if(
    !window.stokData ||
    window.stokData.length === 0
  ){
    alert("Stok belum siap bro 😏");
    return;
  }

  if(cart.length===0){
    alert("Belum ada item bro 😏");
    return;
  }

  let tersedia = [];
  let kosong = [];

  cart.forEach(item => {
    if(window.isKosong(item.nama)){
      kosong.push(item);
    } else {
      tersedia.push(item);
    }
  });

  // 🔥 kalau ada kosong
  if(kosong.length > 0){

    let pesanKosong = kosong.map(i => i.nama).join("\n");

    let confirmMsg =
      "⚠️ Produk tidak tersedia:\n\n" +
      pesanKosong +
      "\n\nLanjutkan tanpa produk tersebut?";

    if(!confirm(confirmMsg)){
      return;
    }
  }

   const invoiceId =
invoiceNo;
  // 🔥 kirim hanya yang tersedia
  let pesan =

`📋 ORDER ${window.__VIP_CONTEXT.nama}

Invoice : ${invoiceId}

====================

`;

  tersedia.forEach((item,index)=>{

  const subtotal =
  (item.harga || 0) * item.qty;

  const diskon =
  subtotal *
  ((item.diskon || 0)/100);

  const total =
  subtotal - diskon;

  pesan +=

`${index+1}. ${item.nama}

Qty      : ${item.qty} ${item.satuan}
Harga    : ${formatRupiah(item.harga)}
Diskon   : ${item.diskon || 0}%
Total    : ${formatRupiah(total)}

`;

});

  let gross = 0;
let totalDiskon = 0;
let grandTotal = 0;

tersedia.forEach(item=>{

  const subtotal =
  (item.harga || 0) * item.qty;

  const diskon =
  subtotal *
  ((item.diskon || 0)/100);

  gross += subtotal;
  totalDiskon += diskon;
  grandTotal += subtotal - diskon;

});

pesan +=

`====================

Sub Total : ${formatRupiah(gross)}
Diskon    : ${formatRupiah(totalDiskon)}
Grand Total : ${formatRupiah(grandTotal)}

`;

  fetch(URL, {
    method:"POST",
    mode:"no-cors",
    body: JSON.stringify({
      nama:window.__VIP_CONTEXT.nama,
      order: pesan,
      status:"order"
    })
  });
  
  // =====================
// SAVE HEADER INVOICE
// =====================

db.collection("invoice")
.doc(invoiceId)
.set({
  vipId: window.__VIP_CONTEXT.vipId,

  invoice: invoiceId,

  nama: window.__VIP_CONTEXT.nama,

  type: "order",

  status: "pending",

  total_item: tersedia.length,

  total: grandTotal,

  waktu:
  firebase.firestore
  .FieldValue
  .serverTimestamp(),

  created_at: Date.now()

});

  tersedia.forEach(item => {

  const subtotal =
(item.harga || 0) * item.qty;

const diskon =
subtotal *
((item.diskon || 0) / 100);

const total =
subtotal - diskon;

let itemText =

`${item.nama} ` +
`(${item.qty} ${item.satuan}) | ` +
`Harga ${formatRupiah(item.harga)} | ` +
`Diskon ${item.diskon || 0}% | ` +
`Total ${formatRupiah(total)}`;

  db.collection("pesanan").add({
  vipId: window.__VIP_CONTEXT.vipId,

  nama:window.__VIP_CONTEXT.nama,

  produk:item.nama,

  qty:item.qty,

  satuan:item.satuan,

  harga:item.harga || 0,

  diskon:item.diskon || 0,

  subtotal:subtotal,

  total:total,

  order:itemText,

  status:"pending",

  type:"order",

  invoice: invoiceId,

  created_at: Date.now(),

  waktu:
  firebase.firestore
  .FieldValue.serverTimestamp()

});

});

  window.open(
"https://wa.me/6282210109369?text=" +
encodeURIComponent(pesan)
);

localStorage.removeItem(
window.VIPStorage.key("invoiceNo")
);

localStorage.removeItem(
window.VIPStorage.key("waktuOrder")
);

localStorage.removeItem(
window.VIPStorage.key("draftOrder")
);

invoiceNo = "";
waktuOrder = "";

orderCart = [];
cart = [];

generateOrderInfo();

renderOrder();

}

function kirimKlaim(){

  let ket = document.getElementById("ket").value;

  if(!ket){
    alert("Isi keterangan dulu bro 😏");
    return;
  }

  if(cart.length===0){
    alert("Belum ada item bro 😏");
    return;
  }

  const invoiceId = klaimNo;

  let pesan =

`♻️ KLAIM ${window.__VIP_CONTEXT.nama}

Invoice : ${invoiceId}

====================

`;

  cart.forEach((item,index)=>{

  const subtotal =
  (item.harga || 0) * item.qty;

  const diskon =
  subtotal *
  ((item.diskon || 0) / 100);

  const total =
  subtotal - diskon;

  pesan +=

`${index+1}. ${item.nama}

Qty      : ${item.qty} ${item.satuan}
Harga    : ${formatRupiah(item.harga)}
Diskon   : ${item.diskon || 0}%
Total    : ${formatRupiah(total)}

`;

});

let total = cart.reduce((sum,item)=>{

  const subtotal =
  (item.harga || 0) * item.qty;

  const diskon =
  subtotal *
  ((item.diskon || 0) / 100);

  return sum + (subtotal - diskon);

},0);

pesan +=

`====================

Grand Total : ${formatRupiah(total)}

Keterangan:
${ket}

`;

  fetch("https://script.google.com/macros/s/AKfycbwztdCQ87hwDrH0fJfxQe-w6JVUwwV5qETTGCe7TEhTXTLzWlbE0jHPZfAetClBTC5QJQ/exec", {
    method:"POST",
    mode:"no-cors",
    body: JSON.stringify({
      nama:window.__VIP_CONTEXT.nama,
      order: pesan,
      status:"klaim"
    })
  });
  
// =====================
// SAVE HEADER KLAIM
// =====================

db.collection("invoice")
.doc(invoiceId)
.set({
  vipId: window.__VIP_CONTEXT.vipId,

  invoice: invoiceId,

  nama: window.__VIP_CONTEXT.nama,

  type: "klaim",

  status: "pending",

  total_item: cart.length,

  total: total,

  keterangan: ket,

  waktu:
  firebase.firestore
  .FieldValue
  .serverTimestamp(),

  created_at: Date.now()

});


  cart.forEach(item => {

  const subtotal =
(item.harga || 0) * item.qty;

const diskon =
subtotal *
((item.diskon || 0) / 100);

const total =
subtotal - diskon;

let itemText =

`${item.nama} ` +
`(${item.qty} ${item.satuan}) | ` +
`Harga ${formatRupiah(item.harga)} | ` +
`Diskon ${item.diskon || 0}% | ` +
`Total ${formatRupiah(total)}`;

  db.collection("pesanan").add({
  vipId: window.__VIP_CONTEXT.vipId,

  nama:window.__VIP_CONTEXT.nama,

  produk:item.nama,

  qty:item.qty,

  satuan:item.satuan,

  harga:item.harga || 0,

  diskon:item.diskon || 0,

  subtotal:subtotal,

  total:total,

  order:itemText,

  status:"pending",

  type:"klaim",

  invoice: invoiceId,

  created_at: Date.now(),

  waktu:
  firebase.firestore
  .FieldValue.serverTimestamp()

});

});

  window.open(
"https://wa.me/6282210109369?text=" +
encodeURIComponent(pesan)
);

localStorage.removeItem(window.VIPStorage.key("klaimNo"));
localStorage.removeItem(window.VIPStorage.key("waktuKlaim"));
localStorage.removeItem(window.VIPStorage.key("draftKlaim"));

klaimNo = "";
waktuKlaim = "";

klaimCart = [];
cart = [];

generateKlaimInfo();

renderKlaim();

}

// HISTORY
function goHistory(){
  window.location.href="/vip/history.html";
}

// AUTO LOAD
updateActivity();

setInterval(()=>{

  updateActivity();

},30000);

// JAM
function updateJam(){

const clock =
document.getElementById("live-clock");

if(!clock) return;


clock.innerHTML =
    '<i class="fa-solid fa-clock"></i> ' +
    new Date().toLocaleString("id-ID");


}


setInterval(updateJam,1000);
updateJam();

// CLOSE DROPDOWN
document.addEventListener("click", function(e){
  let box = document.querySelector(".search-box");
  if(box && !box.contains(e.target)){
    let d = document.getElementById("hasil");
    if(d) d.style.display="none";
  }
});

let memory = [];

let uploadedFile = null;

let uploadedBase64 = null;

async function tanyaAI(){

  const input =
  document.getElementById("imam-ai-input");

  const message =
  input.value.trim();
  
  const currentImage =
uploadedBase64;

  if(
  !message &&
  !uploadedFile
) return;

  const chatBox =
  document.getElementById("imam-chat-box");

  // USER MESSAGE

  chatBox.innerHTML += `

  <div class="imam-user-msg">

    ${message || ""}

    ${
      currentImage
      ?
      `
      <img
        src="${currentImage}"
        style="
          width:100%;
          margin-top:12px;
          border-radius:16px;
        "
      >
      `
      :
      ""
    }

  </div>

`;

  input.value = "";
  
  chatBox.scrollTop =
  chatBox.scrollHeight;

  memory.push({
    role:"user",
    content:message
  });

  // LOADING

  const loadingId =
  "loading-" + Date.now();

  chatBox.innerHTML += `

    <div
      class="imam-ai-msg"
      id="${loadingId}"
    >

      <div class="typing">

        <span></span>
        <span></span>
        <span></span>

      </div>

    </div>

  `;

  chatBox.scrollTop =
  chatBox.scrollHeight;

  try {

    const formData =
new FormData();

formData.append(
  "vip",
  window.__VIP_CONTEXT.nama
);

formData.append(
  "message",
  message
);

formData.append(
  "memory",
  JSON.stringify(memory)
);

formData.append(
  "orders",
  JSON.stringify(cart)
);

if(uploadedFile){

  formData.append(
    "image",
    uploadedFile
  );

}

const res = await fetch(

  "/.netlify/functions/chat",

  {

    method:"POST",

    headers:{

      Authorization:
      "Bearer " +
      localStorage.getItem("token")

    },

    body:formData

  }

);

    if(!res.ok){

      throw new Error(
        "HTTP ERROR " + res.status
      );

    }

    const data =
    await res.json();
    
    uploadedFile = null;
uploadedBase64 = null;

    document.getElementById(
"image-upload"
).value = "";

document.getElementById(
"preview-box"
).innerHTML = "";

    console.log(
      "AI RESPONSE:",
      data
    );

    let aiText =

      data.reply
      || "❌ AI gagal jawab";

    let imageHtml = "";

    if(data.image){

      imageHtml = `

        <div style="margin-top:15px;">

          <img
            src="${data.image}"
            style="
              width:100%;
              border-radius:18px;
              margin-top:10px;
              box-shadow:
              0 10px 25px rgba(0,0,0,.35);
            "
          >

        </div>

      `;

    }

    const loadingBubble =
    document.getElementById(
      loadingId
    );
    
if(loadingBubble){

  loadingBubble.outerHTML = `

<div class="imam-ai-msg">

  <div id="${loadingId}-text"></div>

  ${imageHtml}

  <div class="ai-action">

    
<button
    onclick="copyAI(this)"
    class="copy-btn"
>
    <i class="fa-solid fa-copy"></i> Copy
</button>



    ${
      data.image
      ?
      `
      
<button
    onclick="downloadImage('${data.image}')"
    class="download-btn"
>
    <i class="fa-solid fa-download"></i> Download
</button>

      `
      :
      ""
    }

  </div>

</div>

`;

  const streamTarget =

  document.getElementById(
    `${loadingId}-text`
  );

  await streamText(
    streamTarget,
    aiText
  );

}

memory.push({

  role:"assistant",

  content:aiText

});

chatBox.scrollTop =
chatBox.scrollHeight;

  } catch(err){

    console.log(
      "FRONTEND ERROR:",
      err
    );

    const loadingBubble =
    document.getElementById(
      loadingId
    );

    if(loadingBubble){

      loadingBubble.outerHTML = `

        <div class="imam-ai-msg">

          ❌ SERVER ERROR

          <br><br>

          ${err.message}

        </div>

      `;

    }

    chatBox.scrollTop =
    chatBox.scrollHeight;

  }

}

async function streamText(
  element,
  text
){

  let current = "";

  for(
    let i = 0;
    i < text.length;
    i++
  ){

    current += text[i];

    element.innerHTML =
    marked.parse(current);

    await new Promise(
      resolve =>
      setTimeout(resolve, 8)
    );

  }

}

function downloadImage(imageSrc){

  const link =
  document.createElement("a");

  link.href = imageSrc;

  link.download =
  "imamgpt-image.png";

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);

}

function copyAI(btn){

  const text =

  btn.parentElement
  .parentElement
  .innerText;

  navigator.clipboard.writeText(text);

  
btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';

setTimeout(() => {

    btn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy';

}, 2000);



}

window.renderOrder = renderOrder;
window.renderKlaim = renderKlaim;

window.kirimWA = kirimWA;
window.kirimKlaim = kirimKlaim;

window.goHistory = goHistory;

window.tanyaAI = tanyaAI;

window.tambah = tambah;
window.kurang = kurang;
window.hapus = hapus;

window.updateQty = updateQty;
window.updateSatuan = updateSatuan;
window.handleHargaInput = handleHargaInput;
window.updateHarga = updateHarga;
window.toggleSatuan = toggleSatuan;

window.copyAI = copyAI;
window.downloadImage = downloadImage;

function renderDashboard(){
  
 setTabTitle(
    "Dashboard"
  );

document.getElementById(
"main-content"
).innerHTML = `

<div class="card">

<div class="badge">
VIP CUSTOMER
</div>

<div id="live-clock"
style="
margin-top:10px;
font-size:14px;
opacity:.8;
">
</div>


<h1>
Selamat Datang, ${window.__VIP_CONTEXT.nama} <i class="fa-solid fa-lock"></i>
</h1>



<p>

Terima kasih atas kepercayaan dan kerja sama yang telah terjalin.

Halaman ini kami dedikasikan khusus untuk Anda sebagai mitra terpilih,dengan akses penawaran terbaik yang tidak tersedia secara umum.

</p>

<div class="announcement-bar">

<span id="announcement">
Loading...
</span>

</div>

</div>

`;

}

function goHistoryOrder(){
    window.location.href="/vip/history.html?type=order";
}

function goHistoryKlaim(){
    window.location.href="/vip/history.html?type=klaim";
}


function openTab(page){

const existing =
openedTabs.find(
t => t.id === page
);

if(!existing){

openedTabs.push({

id: page,

title:
pageTitles[page] || page

});

}

activeTab = page;

renderTabs();

showPage(page);

}

function closeTab(page){

openedTabs =
openedTabs.filter(
tab => tab.id !== page
);

if(activeTab === page){

activeTab =
openedTabs.length
? openedTabs[openedTabs.length - 1].id
: "dashboard";

showPage(activeTab);

}

renderTabs();

}


function renderTabs(){

const wrap =
document.getElementById(
"erp-tabs"
);

if(!wrap) return;

wrap.innerHTML = "";

openedTabs.forEach(tab=>{

wrap.innerHTML += `

<div
class="tab ${
activeTab===tab.id
? "active"
: ""
}"
>

<span
onclick="openTab('${tab.id}')"
style="
cursor:pointer;
"
>

${tab.title}

</span>

${
tab.id !== "dashboard"
?
`
<span
style="
margin-left:8px;
cursor:pointer;
font-weight:bold;
"
onclick="
event.stopPropagation();
closeTab('${tab.id}')
"
>
✕
</span>
`
:
""
}

</div>

`;

});

}


function showPage(page){

  activeTab = page;

  renderTabs();

  closeFloatingMenu();

  switch(page){

    case "dashboard":
      renderDashboard();
      break;

    case "info":
      renderInfo();
      break;

    case "order":
      renderOrder();
      break;

    case "klaim":
      renderKlaim();
      break;

    case "pengiriman":
      renderPengiriman();
      break;

    case "retur":
      renderRetur();
      break;

    case "ai":
      renderAI();
      break;

    case "pricelist":
      window.open(
        "/pricelist.pdf",
        "_blank"
      );
      break;

    case "katalog":
      window.open(
        "/katalog.pdf",
        "_blank"
      );
      break;

  }

}

function togglePenjualan(){

const menu =
document.getElementById(
"floating-menu"
);

menu.style.display =

menu.style.display==="block"
?
"none"
:
"block";

}

function renderInfo(){
  
  const VIP_NAME = window.__VIP_CONTEXT.nama;

  setTabTitle("Informasi");

  document.getElementById(
    "main-content"
  ).innerHTML = `

  
  
<div class="card">

    <h2><i class="fa-solid fa-circle-info"></i> Informasi</h2>

    <div id="info-list">
        Loading...
    </div>

</div>



  `;

  db.collection("info_distributor")
  .where("aktif","==",true)
  .orderBy("created_at","desc")
  .onSnapshot((snap)=>{

    let html="";

    if(snap.empty){

      document.getElementById(
        "info-list"
      ).innerHTML = `
      <div class="card">
        Belum ada informasi terbaru.
      </div>
      `;

      return;
    }

    snap.forEach(doc=>{

      const d = doc.data();
      
      if(
 d.target !== "all" &&
 d.target !== VIP_NAME
){
 return;
}

      const tanggal =
      d.created_at
      ?
      d.created_at
      .toDate()
      .toLocaleString("id-ID")
      :
      "-";

      html += `

<div class="
info-card
${d.prioritas==="high"
?"info-important"
:""}
">


<div class="info-title">

${
d.prioritas==="high"
?
'<i class="fa-solid fa-triangle-exclamation"></i> PENTING'
:
'<i class="fa-solid fa-circle-info"></i> INFORMASI'
}

</div>



<h3>
${d.title}
</h3>

<div class="info-date">
${tanggal}
</div>

<div class="info-content">
${d.isi}
</div>

${
d.gambar
?
`
<img
src="${d.gambar}"
class="info-image"
>
`
:
""
}

<div class="info-actions">

${
d.pdf
?
`
<a
href="${d.pdf}"
target="_blank"
class="info-btn"
>
📄 PDF
</a>
`
:
""
}

${
d.link
?
`
<a
href="${d.link}"
target="_blank"
class="info-btn"
>
🔗 Link
</a>
`
:
""
}

</div>

</div>

`;

    });

    document.getElementById(
      "info-list"
    ).innerHTML = html;

  });

}


function renderAI(){
  
setTabTitle(
    "AI"
  );

document.getElementById(
"main-content"
).innerHTML = `

<div class="imam-ai-container">


<div class="imam-ai-header">
<i class="fa-solid fa-wand-magic-sparkles"></i>
Imam AI Assistant
</div>



<div id="imam-chat-box"></div>

<div id="preview-box"></div>

<div class="imam-chat-input-wrap">


<label
for="image-upload"
class="upload-btn"
>
<i class="fa-solid fa-image"></i>
</label>



<input
type="file"
id="image-upload"
accept="image/*"
hidden
>


<textarea
id="imam-ai-input"
placeholder="Tanya Imam AI..."
></textarea>

<button onclick="tanyaAI()">
<i class="fa-solid fa-paper-plane"></i>
</button>

</div>

</div>



`;

const chatBox =
document.getElementById(
"imam-chat-box"
);

if(memory.length===0){


chatBox.innerHTML = `

<div class="imam-ai-msg">

👋 Halo Distributor.

Saya Imam AI .

Saya bisa membantu:

• Info tentang produk nine autoseries
• Info sales nine autoseries
• Info syarat menjadi mitra nine autoseries
• Informasi umum lainnya

Silakan ketik pertanyaan Anda.

</div>

`;

}

initAI();
initTextarea();

}


function openMenu(page){

const menu =
document.getElementById(
"floating-menu"
);

if(menu){
menu.style.display="none";
}

openTab(page);

}

function renderPengiriman(){
  
  setTabTitle(
    "Pengiriman"
  );
  
document.getElementById(
"main-content"
).innerHTML = `

<div class="card">


<h2><i class="fa-solid fa-truck-fast"></i> Pengiriman</h2>

<div id="pengiriman-list">
Loading...
</div>



</div>

`;

}

function renderRetur(){
  
setTabTitle(
    "Retur"
  );

document.getElementById(
"main-content"
).innerHTML = `

<div class="card">


<h2><i class="fa-solid fa-arrow-rotate-left"></i> Retur</h2>

<div id="retur-list">
Loading...
</div>



</div>

`;

}


function initAI(){

const imageUpload =
document.getElementById("image-upload");

if(!imageUpload) return;

imageUpload.addEventListener(
"change",
function(e){

uploadedFile = e.target.files[0];

if(!uploadedFile) return;

const reader = new FileReader();

reader.onload = function(event){

uploadedBase64 = event.target.result;

document.getElementById(
"preview-box"
).innerHTML = `

<div class="preview-card">

<img
src="${uploadedBase64}"
style="
width:70px;
height:70px;
object-fit:cover;
border-radius:12px;
">


<div style="flex:1;">
<i class="fa-solid fa-paperclip"></i> ${uploadedFile.name}
</div>



<button
onclick="removeUpload()"
style="
border:none;
background:#ef4444;
color:white;
width:28px;
height:28px;
border-radius:50%;
cursor:pointer;
">
✕
</button>

</div>

`;

};

reader.readAsDataURL(uploadedFile);

});

}

function removeUpload(){

uploadedFile = null;
uploadedBase64 = null;

const input =
document.getElementById("image-upload");

if(input){
input.value="";
}

const preview =
document.getElementById("preview-box");

if(preview){
preview.innerHTML="";
}

}

function setActive(el){

closeFloatingMenu();

document
.querySelectorAll(".sidebar-btn")
.forEach(btn=>{

btn.classList.remove(
"active"
);

});

el.classList.add(
"active"
);

}

function initTextarea(){

const imamInput =
document.getElementById(
"imam-ai-input"
);

if(!imamInput) return;

imamInput.addEventListener(
"input",
()=>{

imamInput.style.height="auto";

imamInput.style.height=
imamInput.scrollHeight+"px";

});

}

function toggleSatuan(i){

  cart[i].satuan =
  cart[i].satuan === "pcs"
  ? "set"
  : "pcs";
  
  syncCart();
  
  autoSaveDraft();

  renderCartERP();

}

function simpanDraft(){

 if(mode==="order"){

   localStorage.setItem(
     window.VIPStorage.key("draftOrder"),
     JSON.stringify(orderCart)
   );

 }else{

   localStorage.setItem(
     window.VIPStorage.key("draftKlaim"),
     JSON.stringify(klaimCart)
   );

 }

 alert("Draft tersimpan bro 😎");

}

function handleHargaERP(el,i){

let angka =
el.value.replace(/\D/g,"");

cart[i].harga =
parseInt(angka) || 0;

el.value =
formatInputRupiah(angka);

const subtotal =
cart[i].qty * cart[i].harga;

const diskon =
subtotal *
((cart[i].diskon || 0) / 100);

const total =
subtotal - diskon;

const row =
document.getElementById(
`rowTotal${i}`
);

if(row){

row.innerText =
formatRupiah(total);

}

syncCart();

updateTotalERP();

autoSaveDraft();

}

function getDraftKey(){

  return mode === "order"
  ? "draftOrder"
  : "draftKlaim";

}

function autoSaveDraft(){

 if(mode==="order"){

   localStorage.setItem(
     window.VIPStorage.key("draftOrder"),
     JSON.stringify(orderCart)
   );

 }else{

   localStorage.setItem(
     window.VIPStorage.key("draftKlaim"),
     JSON.stringify(klaimCart)
   );

 }

}

function syncCart(){

  if(mode==="order"){

    orderCart = cart;

  }else{

    klaimCart = cart;

  }

}


function updateTotalERP(){

let gross = 0;
let diskon = 0;
let total = 0;

cart.forEach(item=>{

  const hargaAwal =
  (item.harga || 0) * item.qty;

  const nilaiDiskon =
  hargaAwal *
  ((item.diskon || 0) / 100);

  const hargaAkhir =
  hargaAwal - nilaiDiskon;

  gross += hargaAwal;
  diskon += nilaiDiskon;
  total += hargaAkhir;

});

const subTotal =
document.getElementById(
"subTotal"
);

const totalDiskon =
document.getElementById(
"totalDiskon"
);

const grandTotal =
document.getElementById(
"grandTotal"
);

if(subTotal){

  subTotal.innerText =
  formatRupiah(gross);

}

if(totalDiskon){

  totalDiskon.innerText =
  formatRupiah(diskon);

}

if(grandTotal){

  grandTotal.innerText =
  formatRupiah(total);

}

}

function updateDiskon(i,val){

cart[i].diskon =
parseFloat(val) || 0;

syncCart();

autoSaveDraft();

renderCartERP();

}


function closeFloatingMenu(){

const menu =
document.getElementById(
"floating-menu"
);

if(menu){
menu.style.display="none";
}

}


function generateOrderInfo(){

  const savedInvoice =
  localStorage.getItem(window.VIPStorage.key("invoiceNo"));

  const savedWaktu =
  localStorage.getItem(window.VIPStorage.key("waktuOrder"));

  if(savedInvoice){

    invoiceNo = savedInvoice;
    waktuOrder = savedWaktu;

    return;
  }

  const now = new Date();

  invoiceNo =
    "SO-" +
    now.getFullYear() +
    String(now.getMonth()+1).padStart(2,"0") +
    String(now.getDate()).padStart(2,"0") +
    "-" +
    Date.now().toString().slice(-4);

  waktuOrder =
    now.toLocaleString("id-ID");

  localStorage.setItem(
    window.VIPStorage.key("invoiceNo"),
    invoiceNo
  );

  localStorage.setItem(
    window.VIPStorage.key("waktuOrder"),
    waktuOrder
  );

}

function generateKlaimInfo(){

  const now = new Date();

  klaimNo =
    "KLM-" +
    now.getFullYear() +
    String(now.getMonth()+1).padStart(2,"0") +
    String(now.getDate()).padStart(2,"0") +
    "-" +
    Date.now().toString().slice(-4);

  waktuKlaim =
    now.toLocaleString("id-ID");

  localStorage.setItem(
    window.VIPStorage.key("klaimNo"),
    klaimNo
  );

  localStorage.setItem(
    window.VIPStorage.key("waktuKlaim"),
    waktuKlaim
  );

}

function refreshPageMode(){

if(mode==="order"){

generateOrderInfo();
renderOrder();

}else{

generateKlaimInfo();
renderKlaim();

}

}


function setTabTitle(text){

}

openedTabs = [
{
  id:"dashboard",
  title:"Dashboard"
}
];

activeTab = "dashboard";

renderTabs();
showPage("dashboard");
  


