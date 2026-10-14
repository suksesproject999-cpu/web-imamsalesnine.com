

  const firebaseConfig = {
    apiKey: "AIzaSyBkyMCw47sYQb2BBkGMxgfsXppozWw4Cec",
    authDomain: "apin-web.firebaseapp.com",
    projectId: "apin-web",
    storageBucket: "apin-web.firebasestorage.app",
    messagingSenderId: "733140414417",
    appId: "1:733140414417:web:b6967fd053ac462b2ffaf0",
    measurementId: "G-6ZN6TQ1YVE"
  };

  if (!firebase.apps.length) {
    // Firebase app initialized in VIP bootstrap (named app).
  }

// Firebase App Check - reCAPTCHA Enterprise (sinkron dengan website utama)
const VIP_RECAPTCHA_ENTERPRISE_SITE_KEY = "6LdyvOktAAAAAPcWRB-_bmuw3Z6wVSzgX1kAG11M";
try {
  window.__VIP_FIREBASE_APP.appCheck().activate(
    new firebase.appCheck.ReCaptchaEnterpriseProvider(VIP_RECAPTCHA_ENTERPRISE_SITE_KEY),
    true
  );
  console.info("[VIP] Firebase App Check activated");
} catch (error) {
  console.error("[VIP] Firebase App Check initialization failed", error);
}

  const db = window.__VIP_FIREBASE_APP.firestore();

  const VIP_NAME = window.__VIP_CONTEXT.nama;

  function updateActivity() {

    console.log("UPDATE ACTIVITY JALAN");

    db.collection("aktivitas_vip")
    .doc(window.__VIP_CONTEXT.nama)
    .set({

      nama: window.__VIP_CONTEXT.nama,

      last_active:
      firebase.firestore.FieldValue.serverTimestamp()

    })
    .then(()=> {

      console.log("BERHASIL SAVE");

    })
    .catch(err => {

      console.error("GAGAL SAVE", err);

    });

  }

  let unsubscribe = null;
  let detailListener = null;
  let openedTabs = [];
  let activeTab = "";



  function isToday(dateString) {

    const today =
    new Date()
    .toISOString()
    .split("T")[0];

    return dateString === today;

  }


  // History: single-field invoice query, sorted locally to avoid composite-index dependency.
  // Keep VIP_NAME consistent with the dashboard's saved invoice.nama.
  let historyRequestId = 0;
  function historyMessage(message, color = "#64748b") {
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.style.cssText = "padding:18px;text-align:center;white-space:normal;color:" + color;
    cell.textContent = message;
    const tr = document.createElement("tr");
    tr.appendChild(cell);
    document.getElementById("historyBody").replaceChildren(tr);
  }

  function historyDate(value) {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value === "number") return new Date(value);
    return null;
  }

  async function loadData(useDateFilter = true) {
    const requestId = ++historyRequestId;
    const dateFilter = document.getElementById("filterDate").value;
    const statusFilter = document.getElementById("filterStatus").value;
    const typeFilter = document.getElementById("filterType").value;
    const keyword = document.getElementById("searchBox").value.toLowerCase().trim();

    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    historyMessage("Memuat history...");

    const updateTotals = (totals) => {
      for (const [key, value] of Object.entries(totals)) {
        document.getElementById("sum-" + key).textContent = value;
      }
    };
    updateTotals({total:0, pending:0, sebagian:0, proses:0, ready:0});

    // Avoid composite index (nama + waktu); Firestore still applies rules/App Check.
    unsubscribe = db.collection("invoice")
      .where("vipId", "==", window.__VIP_CONTEXT.vipId)
      .onSnapshot(async (snapshot) => {
        if (requestId !== historyRequestId) return;
        const docs = snapshot.docs.slice().sort((a,b) => {
          const da = a.data(), dbb = b.data();
          const ta = historyDate(da.waktu)?.getTime() || Number(da.created_at) || 0;
          const tb = historyDate(dbb.waktu)?.getTime() || Number(dbb.created_at) || 0;
          return tb - ta;
        });
        const rows = [];
        const totals = {total:0, pending:0, sebagian:0, proses:0, ready:0};
        let detailErrors = 0;
        for (const doc of docs) {
          if (requestId !== historyRequestId) return;
          const d = doc.data();
          const invoiceId = d.invoice || doc.id;
          if (typeFilter !== "all" && String(d.type || "").toLowerCase() !== typeFilter) continue;
          if (keyword && !String(invoiceId).toLowerCase().includes(keyword)) continue;
          const dt = historyDate(d.waktu) || historyDate(d.created_at);
          if (useDateFilter && dateFilter && !isToday(dateFilter)) {
            if (!dt || [dt.getFullYear(),String(dt.getMonth()+1).padStart(2,'0'),String(dt.getDate()).padStart(2,'0')].join('-') !== dateFilter) continue;
          }

          let finalStatus = String(d.status || "pending").toLowerCase();
          if (!["pending","proses","ready","sebagian"].includes(finalStatus)) finalStatus = "pending";
          try {
            // Use invoice AND VIP name to match invoice-detail access scope.
            const details = await db.collection("pesanan")
              .where("invoice", "==", invoiceId)
              .where("vipId", "==", window.__VIP_CONTEXT.vipId).get();
            if (requestId !== historyRequestId) return;
            if (!details.empty) {
              let pending=0, proses=0, ready=0;
              details.forEach(item => {
                const st = String(item.data().status || "pending").toLowerCase();
                if (st === "ready") ready++;
                else if (st === "proses") proses++;
                else pending++;
              });
              finalStatus = ready === details.size ? "ready" : pending === details.size ? "pending" : proses === details.size ? "proses" : "sebagian";
            }
          } catch (error) {
            // Do not hide invoice headers when a detail query fails.
            detailErrors++;
            console.error("[VIP History] Detail query failed", invoiceId, error);
          }
          if (statusFilter !== "all" && finalStatus !== statusFilter) continue;
          totals.total++;
          totals[finalStatus]++;
          const tr = document.createElement("tr");
          tr.className = "row-" + finalStatus;
          tr.style.cursor = "pointer";
          tr.addEventListener("click", () => openInvoiceTab(invoiceId));
          const cells = [invoiceId, dt ? dt.toLocaleDateString("id-ID") : "-", d.type || "-", d.total_item || 0, "Rp " + Number(d.total || 0).toLocaleString("id-ID")];
          for (const val of cells) {
            const td = document.createElement("td");
            td.textContent = String(val);
            tr.appendChild(td);
          }
          const td = document.createElement("td");
          const badge = document.createElement("span");
          badge.className = "badge badge-" + finalStatus;
          badge.textContent = d.request_delete ? "DELETE REQUEST" : finalStatus.toUpperCase();
          td.appendChild(badge);
          tr.appendChild(td);
          rows.push(tr);
        }
        if (requestId !== historyRequestId) return;
        updateTotals(totals);
        if (rows.length) {
          document.getElementById("historyBody").replaceChildren(...rows);
        } else {
          historyMessage(snapshot.empty ? "Tidak ada invoice untuk VIP ini." : "Tidak ada dokumen yang cocok dengan filter.");
        }
        if (detailErrors) {
          console.warn("[VIP History] " + detailErrors + " detail query(s) failed; showing invoice header status as fallback.");
          const warning = document.createElement("div");
          warning.style.cssText = "padding:10px 15px;color:#92400e;background:#fffbeb;font-size:13px";
          warning.textContent = "Sebagian status mungkin belum diperbarui karena detail pesanan gagal dimuat (" + detailErrors + "). Periksa izin/index Firestore.";
          const area = document.querySelector(".erp-table-area");
          area.querySelectorAll(".vip-history-warning").forEach(el=>el.remove());
          warning.className = "vip-history-warning";
          area.prepend(warning);
        } else {
          document.querySelectorAll(".vip-history-warning").forEach(el=>el.remove());
        }
      }, (err) => {
        if (requestId !== historyRequestId) return;
        console.error("[VIP History] Invoice query failed", err);
        const code = err && err.code ? err.code : "unknown";
        historyMessage("Gagal membaca invoice (" + code + "). Periksa App Check, Firestore Rules, atau index di Firebase Console.", "#b91c1c");
      });
  }


  // ================= FAKTUR =================

  async function lihatFaktur(invoiceId) {

    if (detailListener) {
      detailListener();
    }

    const invoiceDoc =
    await db
    .collection("invoice")
    .doc(invoiceId)
    .get();

    if (!invoiceDoc.exists) {

      alert("Invoice tidak ditemukan");
      return;

    }

    const inv =
    invoiceDoc.data();

    if (inv.vipId !== window.__VIP_CONTEXT.vipId) {

      alert("Akses ditolak");

      return;

    }

    detailListener =
    db.collection("pesanan")
    .where(
      "invoice",
      "==",
      invoiceId
    )
    .where("vipId", "==", window.__VIP_CONTEXT.vipId)
    .onSnapshot(async(detailSnap)=> {

      let total = 0;

      let ready = 0;
      let proses = 0;
      let pending = 0;

      let no = 0; // 🔥 DROP DI SINI

      let rows = "";

      detailSnap.forEach(doc => {

        const itemId = doc.id;

        const item = doc.data();

        const deleteRequest =
        item.request_delete === true;

        no++;

        const status =
        (item.status || "pending")
        .toLowerCase();

        let label = "PENDING";

        if (status === "ready") {

          label = "READY";
          ready++;

        } else if (status === "proses") {

          label = "PROSES";
          proses++;

        } else {

          pending++;

        }

        total += item.total || 0;

        rows += `
        <tr>

        <td>${no}</td>

        <td>${item.produk}</td>

        <td>${item.qty}</td>

        <td>${item.satuan}</td>

        <td>
        Rp ${(item.harga || 0).toLocaleString("id-ID")}
        </td>

        <td>
        ${item.diskon || 0}%
        </td>

        <td>
        Rp ${(item.total || 0).toLocaleString("id-ID")}
        </td>

        <td>

        ${
        deleteRequest
        ?
        '<span class="badge badge-delete">DELETE REQUEST</span>':
        label
        }

        </td>

        <td>
        
<button
    class="btn-delete-item"
    onclick="
    event.stopPropagation();
    requestDeleteItem(
    '${itemId}',
    '${invoiceId}'
    )
    "
>
    <i class="fa-solid fa-trash-can"></i>
</button>



        </td>

        </tr>

        `;

      });

      const waktu =

      inv.waktu
      ?
      inv.waktu
      .toDate()
      .toLocaleString("id-ID"):
      "-";

      document
      .getElementById("invoice-content")
      .innerHTML = `

      <div class="invoice-box modern-faktur">

      <div class="top-header-flex">

      <div style="
      width:100%;
      text-align:center;
      ">

      
<div class="brand-title">

    <i class="fa-solid fa-file-lines"></i> Detail Dokumen

</div>



      <div class="erp-doc-info">

      <div>
      <div class="info-label">No Dokumen</div>
      <div class="info-value">${invoiceId}</div>
      </div>

      <div>
      <div class="info-label">Customer</div>
      <div class="info-value">${inv.nama}</div>
      </div>

      <div>
      <div class="info-label">Tanggal</div>
      <div class="info-value">${waktu}</div>
      </div>

      <div>
      <div class="info-label">Jenis</div>
      <div class="info-value">${inv.type.toUpperCase()}</div>
      </div>

      </div>

      </div>

      </div>

      <div class="invoice-table-wrap">

      <table class="invoice-table">

      <thead>

      <tr>

      <th>No</th>
      <th>Nama Barang</th>
      <th>Qty</th>
      <th>Satuan</th>
      <th>Harga</th>
      <th>Diskon</th>
      <th>Total</th>
      <th>Status</th>
      <th>Aksi</th>

      </tr>

      </thead>

      <tbody>

      ${rows}

      </tbody>

      </table>

      </div>

      <div class="invoice-footer">

      
<div class="invoice-action">

    <button class="btn"
    onclick="window.print()">
        <i class="fa-solid fa-print"></i> Print
    </button>

    <button class="btn"
    onclick="downloadInvoice()">
        <i class="fa-solid fa-download"></i> Download
    </button>

    <button class="btn"
    onclick="closeInvoice()">
        <i class="fa-solid fa-xmark"></i> Tutup
    </button>

    <button
        class="btn btn-delete-doc"
        onclick="
        requestDeleteInvoice(
        '${invoiceId}'
        )
        "
    >
        <i class="fa-solid fa-trash-can"></i> Request Hapus
    </button>

</div>



      <div class="erp-total-box">

      <div class="total-item-box">

      <b>Total Item</b>
      <span>${detailSnap.size}</span>

      </div>

      <div class="grand-total-box">

      <b>Grand Total</b>
      <span>
      Rp ${total.toLocaleString("id-ID")}
      </span>

      </div>

      </div>

      </div>

      `;

      document
      .getElementById("main-content")
      .style.display = "none";

      document
      .getElementById("invoice-content")
      .style.display = "block";
    }); // tutup onSnapshot
  }
  
  




  function closeInvoice(){

if(detailListener){
detailListener();
detailListener = null;
}

activeTab = "history";

renderTabs();

document.getElementById("invoice-content").style.display = "none";
document.getElementById("main-content").style.display = "block";

}


  function downloadInvoice() {

    const invoice =
    document.querySelector(".invoice-box");

    if (!invoice) {

      alert("Invoice tidak ditemukan 😭");

      return;

    }

    // 🔥 clone biar bersih
    const clone =
invoice.cloneNode(true);

clone.querySelectorAll(".btn-delete-item")
.forEach(el => el.remove());

const aksiHeader =
clone.querySelector("th:last-child");

if(aksiHeader){
aksiHeader.remove();
}

clone.querySelectorAll("tr")
.forEach(row=>{

const lastCell =
row.querySelector("td:last-child");

if(lastCell){
lastCell.remove();
}

});

    // 🔥 buang tombol
    const actions =
    clone.querySelector(".invoice-action");

    if (actions) {

      actions.remove();

    }

    // 🔥 wrapper khusus PDF
    const wrapper =
    document.createElement("div");

    wrapper.style.padding = "20px";
    wrapper.style.background = "#ffffff";

    wrapper.appendChild(clone);

    document.body.appendChild(wrapper);

    const opt = {

      margin: 0.3,

      filename:
      "invoice-" + Date.now() + ".pdf",

      image: {
        type: "jpeg",
        quality: 1
      },

      html2canvas: {

scale: 2,

useCORS: true,

scrollX: 0,

scrollY: 0,

windowWidth: wrapper.scrollWidth,

windowHeight: wrapper.scrollHeight

},

      jsPDF: {

        unit: "in",

        format: "a4",

        orientation:"portrait"

      },

      pagebreak:{
mode:["css","legacy"]
}

    };

    html2pdf()
    .set(opt)
    .from(wrapper)
    .save()
    .then(() => {

      wrapper.remove();

    });

  }


  async function recalculateInvoice(
    invoiceId
  ) {

    const snap =
    await db
    .collection("pesanan")
    .where(
      "invoice",
      "==",
      invoiceId
    )
    .where("vipId", "==", window.__VIP_CONTEXT.vipId)
    .get();

    let totalItem = 0;
    let grandTotal = 0;

    snap.forEach(doc => {

      const item =
      doc.data();

      totalItem++;

      grandTotal +=
      item.total || 0;

    });

    if (totalItem === 0) {

      await db
      .collection("invoice")
      .doc(invoiceId)
      .delete();

      closeInvoice();

      loadData();

      return;

    }

    await db
    .collection("invoice")
    .doc(invoiceId)
    .update({

      total_item: totalItem,

      total: grandTotal

    });

  }

  async function requestDeleteInvoice(
    invoiceId
  ) {

    if (
      !confirm(
        "Kirim request hapus dokumen?"
      )
    ) {
      return;
    }

    try {

      console.log("STEP 1");

      await db
      .collection("invoice")
      .doc(invoiceId)
      .set({

        request_delete: true,

        request_delete_at:
        firebase.firestore
        .FieldValue
        .serverTimestamp(),

        request_delete_by: "VIP"

      }, {
        merge: true
      });

      console.log("STEP 2");

      const snap =
      await db
      .collection("pesanan")
      .where(
        "invoice",
        "==",
        invoiceId
      )
      .where("vipId", "==", window.__VIP_CONTEXT.vipId)
      .get();

      console.log(
        "STEP 3",
        snap.size
      );

      const batch =
      db.batch();

      snap.forEach(doc => {

        batch.update(doc.ref, {

          request_delete: true,

          request_delete_invoice: true,

          request_delete_at:
          firebase.firestore
          .FieldValue
          .serverTimestamp(),

          request_delete_by: "VIP"

        });

      });

      console.log("STEP 4");

      await batch.commit();

      console.log("STEP 5");

      alert(
        "Request hapus berhasil dikirim"
      );

    }
    catch(err) {

      console.error(
        "ERROR DELETE:",
        err
      );

      alert(
        "Gagal mengirim request"
      );

    }

  }

  async function requestDeleteItem(
    itemId,
    invoiceId
  ) {

    if (
      !confirm(
        "Kirim request hapus item ini?"
      )
    ) {
      return;
    }

    try {

      await db
      .collection("pesanan")
      .doc(itemId)
      .update({

        request_delete: true,

        request_delete_at:
        firebase.firestore
        .FieldValue
        .serverTimestamp(),

        request_delete_by: "VIP"

      });

      alert(
        "Request hapus item berhasil dikirim"
      );

      lihatFaktur(
        invoiceId
      );

    }
    catch(err) {

      console.error(err);

      alert(
        "Gagal kirim request"
      );

    }

  }


  async function hapusDokumen(
    invoiceId
  ) {

    if (
      !confirm(
        "Hapus seluruh dokumen ini?"
      )
    ) {
      return;
    }

    try {

      const snap =
      await db
      .collection("pesanan")
      .where(
        "invoice",
        "==",
        invoiceId
      )
      .get();

      const batch =
      db.batch();

      snap.forEach(doc => {

        batch.delete(
          doc.ref
        );

      });

      batch.delete(
        db.collection("invoice")
        .doc(invoiceId)
      );

      await batch.commit();

      alert(
        "Dokumen berhasil dihapus"
      );

      closeInvoice();

      loadData();

    }
    catch(err) {

      console.error(err);

      alert(
        "Gagal menghapus dokumen"
      );

    }

  }

  async function hapusItem(
    itemId,
    invoiceId
  ) {

    if (
      !confirm(
        "Hapus item ini?"
      )
    ) {
      return;
    }

    try {

      await db
      .collection("pesanan")
      .doc(itemId)
      .delete();

      await recalculateInvoice(
        invoiceId
      );

      alert(
        "Item berhasil dihapus"
      );

      lihatFaktur(
        invoiceId
      );

      loadData();

    }
    catch(err) {

      console.error(err);

      alert(
        "Gagal menghapus item"
      );

    }

  }


  async function manualRefresh(btn) {

    btn.classList.add("loading");

    btn.innerHTML = '<i class="fa-solid fa-spinner"></i> Refreshing...';
    
    try {

      await loadData();

    }

    catch(err) {

      console.log(err);

    }

    setTimeout(()=> {

      btn.classList.remove(
        "loading"
      );

      
btn.innerHTML =
    '<i class="fa-solid fa-rotate"></i> Refresh';



    }, 1000);

  }

  window.addEventListener(
    "load",
    ()=> {

      document
      .getElementById("searchBox")
      .focus();

    }
  );

  setTimeout(()=> {

    const search =
    document.getElementById(
      "searchBox"
    );

    if (search) {

      search.focus();

    }

  }, 300);


  window.addEventListener("load", ()=> {

    const today =
    new Date()
    .toISOString()
    .split("T")[0];

    document.getElementById(
      "filterDate"
    ).value = today;

    loadData(false);

  });

  setInterval(()=> {

    updateActivity();

  }, 30000);

  // FILTER AUTO CHANGE
  document.getElementById(
    "filterDate"
  ).addEventListener(
    "change",
    loadData
  );

  document.getElementById(
    "filterStatus"
  ).addEventListener(
    "change",
    loadData
  );

  document.getElementById(
    "filterType"
  ).addEventListener(
    "change",
    loadData
  );

  function openInvoiceTab(invoiceId) {

    const exist =
    openedTabs.find(
      t => t.id === invoiceId
    );

    if (!exist) {

      openedTabs.push({
        id: invoiceId,
        title: invoiceId
      });

    }

    activeTab = invoiceId;

    renderTabs();

    lihatFaktur(invoiceId);

  }




  function renderTabs() {

    const wrap =
    document.getElementById("erp-tabs");

    if (!wrap) return;

    wrap.innerHTML = "";

    openedTabs.forEach(tab => {

      wrap.innerHTML += `

      <div
      class="
      tab
      ${activeTab === tab.id ? "active": ""}
      "
      >

      <span
      onclick="
      switchTab('${tab.id}')
      "
      >

      ${tab.title}

      </span>

      ${
      tab.id !== "history"
      ?
      `
      <span
      style="
      margin-left:8px;
      cursor:pointer;
      color:white;
      font-weight:bold;
      "
      onclick="
      event.stopPropagation();
      closeTab('${tab.id}')
      "
      >
      ✕
      </span>
      `:
      ""
      }

      </div>

      `;

    });

  }

  function closeTab(tabId) {

    openedTabs =
    openedTabs.filter(
      t => t.id !== tabId
    );

    if (activeTab === tabId) {

      activeTab = "history";

      closeInvoice();

    }

    renderTabs();

  }

  function switchTab(tabId) {

    activeTab = tabId;

    renderTabs();

    if (tabId === "history") {

      document
      .getElementById("main-content")
      .style.display = "block";

      document
      .getElementById("invoice-content")
      .style.display = "none";

      return;

    }

    lihatFaktur(tabId);

  }
  
  openedTabs = [
{
id:"history",
title:"History Dokumen"
}
];

activeTab = "history";

renderTabs();


