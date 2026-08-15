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

    alert("Sistem sedang memuat stok, coba lagi...");

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
      "⚠️ Ada produk kosong bro 😏\n\n" +
      "❌ Tidak tersedia:\n" +
      kosong.map(i => "- " + i).join("\n") +
      "\n\n✅ Akan diproses:\n" +
      tersedia.map(i => "- " + i).join("\n") +
      "\n\nLanjutkan?";

    if(confirm(pesan)){

      kirimOrder(tersedia);

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

    alert("Semua produk kosong bro 😏");

    return;

  }

  let finalOrder = data.join("\n");

  fetch(
  STOK_URL + "?order=" + encodeURIComponent(finalOrder)
)
  .then(() => {

    alert("✅ Order berhasil dikirim");

    document.getElementById("orderInput").value = "";

  });

}