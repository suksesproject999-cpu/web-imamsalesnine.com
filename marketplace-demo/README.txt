IMAMMARKET | PROTOTYPE MARKETPLACE 3 TOKO (AMAN UNTUK TEST)
========================================================

STRUKTUR
marketplace-demo/
  index.html                 -> halaman utama marketplace
  toko-a/index.html          -> Toko A (oranye)
  toko-b/index.html          -> Toko B (biru)
  toko-c/index.html          -> Toko C (hijau)
  assets/style.css           -> tampilan bersama
  assets/app.js              -> data demo dan fitur belanja

URL SETELAH DI-UPLOAD KE ROOT REPOSITORY GITHUB:
https://imamsalesnine.com/marketplace-demo/
https://imamsalesnine.com/marketplace-demo/toko-a/
https://imamsalesnine.com/marketplace-demo/toko-b/
https://imamsalesnine.com/marketplace-demo/toko-c/

PENTING:
- JANGAN menimpa index.html utama atau store/index.html produksi.
- Unggah SELURUH folder marketplace-demo ke root repository GitHub.
- Netlify website utama biasanya menerbitkan isi root repository.
- Netlify project ImamStore menerbitkan folder store saja, sehingga demo tidak ikut ke subdomain toko production.
- Tidak ada Firebase, pembayaran, login, atau server admin terhubung.
- Produk, foto, toko, cart, favorit, dan order hanya DATA DEMO.
- Cart, favorit, perubahan nama toko, dan order demo disimpan via localStorage browser.
- 'Pendaftaran toko' saat ini hanya form simulasi 3 slot, BELUM ada multi-tenant auth dan database.
- Setiap halaman memiliki meta robots noindex,nofollow agar tidak mengganggu SEO website utama.

LANGKAH DEPLOY AMAN:
1. Ekstrak ZIP.
2. Salin folder marketplace-demo (beserta isinya) ke root folder GitHub lokal.
3. cd ke root repository lokal, jalankan git status lalu git add marketplace-demo
4. git commit -m "Add marketplace demo 3 toko"
5. git push origin main
6. Pastikan deploy Netlify website utama Published.
7. Akses 4 URL demo di atas.

FITUR DEMO:
- 3 toko (identitas & warna berbeda dengan layout sama)
- Tema toko bisa diubah di menu Seller; disimpan di browser penguji
- Katalog 15 produk ilustrasi, pencarian, filter, sort, favorit
- Detail produk modal/bottom sheet, varian, quantity
- Keranjang multi-store; pembagian subtotal tiap seller
- Checkout dan riwayat pesanan simulasi, TANPA transaksi ke Firebase
- Responsive ponsel dan desktop

KETERBATASAN:
- Belum marketplace production; untuk seller nyata perlu Firebase project terpisah,
  autentikasi seller dan buyer, security rules, backend pembayaran, dashboard,
  stok terverifikasi, ongkir per penjual, serta audit keamanan dan beban.
- Ilustrasi emoji produk bukan foto asli dan harga dummy.
- Ongkir Rp15.000 per toko hanya angka contoh.
