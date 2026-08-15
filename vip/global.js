const STOK_URL = "https://script.google.com/macros/s/AKfycbwztdCQ87hwDrH0fJfxQe-w6JVUwwV5qETTGCe7TEhTXTLzWlbE0jHPZfAetClBTC5QJQ/exec";

window.stokData = [];

db.collection("stok")
.onSnapshot(snapshot => {

  let result = [];

  snapshot.forEach(doc => {

    result.push({

      id: doc.id,

      nama: doc.data().nama,

      kosong: doc.data().kosong

    });

  });

  window.stokData = result;

  console.log(
    "🔥 STOK REALTIME:",
    result.length
  );

});

function normalize(text){

  if(
    typeof text !== "string"
  ){
    return "";
  }

  return text
    .toLowerCase()
    .replace(/[-_]/g," ")
    .trim();

}

window.isKosong = function(nama){

  if(!window.stokData)
  return false;

  nama = normalize(nama);

  let item =
  window.stokData.find(x =>

    normalize(x.nama) === nama

  );

  return item
  ? item.kosong === true
  : false;

}

function submitOrder(){

  if(window.stokData.length === 0){

    Swal.fire({
        icon: "warning",
        title: "Mohon Tunggu",
        text: "Sistem sedang memuat data stok. Silakan coba lagi beberapa saat.",
        confirmButtonText: "Mengerti",
        confirmButtonColor: "#8CC63F",
        allowOutsideClick: false
    });

    return;
}

  let input =
    document.getElementById("orderInput").value;

  let items = input
    .split("\n")
    .map(i => i.trim())
    .filter(i => i !== "");

  let tersedia = [];
  let kosong = [];

  items.forEach(item => {

    if(window.isKosong(item)){

      kosong.push(item);

    } else {

      tersedia.push(item);

    }

  });

  if(kosong.length > 0){

    let pesan =
        "<b>❌ Tidak tersedia:</b><br>" +
        kosong.map(i => "• " + i).join("<br>") +
        "<br><br>" +
        "<b>✅ Akan diproses:</b><br>" +
        tersedia.map(i => "• " + i).join("<br>");


    Swal.fire({

        icon: "warning",

        title: "Ada Produk Stok Kosong",

        html: pesan,

        showCancelButton: true,

        confirmButtonText: "Lanjutkan",

        cancelButtonText: "Batal",

        confirmButtonColor: "#8CC63F",

        cancelButtonColor: "#f44336",

        reverseButtons: true,

        focusCancel: true,

        customClass: {
            popup: "swal-vip-popup",
            title: "swal-vip-title",
            confirmButton: "swal-vip-confirm",
            cancelButton: "swal-vip-cancel"
        }

    }).then((result) => {

        if(result.isConfirmed){

            kirimOrder(tersedia);

        }

    });

}

  } else {

    kirimOrder(items);

  }

}

function kirimOrder(data){

    data = data.filter(
        item => item && item.trim() !== ""
    );


    if(data.length === 0){

        Swal.fire({
            icon: "warning",
            title: "Produk Tidak Tersedia",
            text: "Semua produk kosong bro 😏",
            confirmButtonText: "Oke",
            confirmButtonColor: "#8CC63F"
        });

        return;
    }


    let finalOrder = data.join("\n");


    fetch(
        STOK_URL + "?order=" + encodeURIComponent(finalOrder)
    )
    .then(() => {

        Swal.fire({
            icon: "success",
            title: "Order Berhasil",
            text: "Order berhasil dikirim ✅",
            confirmButtonText: "Mantap",
            confirmButtonColor: "#8CC63F"
        });

        document.getElementById("orderInput").value = "";

    });

}