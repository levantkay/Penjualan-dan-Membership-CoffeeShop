# Marwid Coffee and Space — Coffee Shop Sales + Membership System

Sistem informasi akuntansi mini untuk coffee shop yang memadukan **penjualan dasar (POS)** dan **membership berbasis nomor anonim**.
* **Demo aplikasi:** [Buka Marwid Coffee and Space](https://levantkay.github.io/Penjualan-dan-Membership-CoffeeShop/)

## Identitas tugas

| Keterangan | Detail |
|---|---|
| Nama | Marita Widya Ratnasari |
| NIM | 12030124130102 |
| Mata Kuliah | Pengkodean dan Pemrograman |
| Kelas | D |
| Dosen Pengampu | Dr. Totok Dewayanto, S.E., M.Si., Akt. |

**Disusun untuk memenuhi Tugas Project UTS Pengkodean dan Pemrograman.**

## Konsep utama
- Penjualan: pilih produk, masukkan membership (opsional), hitung diskon otomatis, pilih pembayaran, simpan transaksi.
- Membership: pelanggan diidentifikasi hanya dengan **membership number**; tidak ada nama, alamat, telepon, atau email pada desain database.
- Benefit bertingkat berdasarkan lama keanggotaan:
  - Bronze: 0–2 bulan dibayar → 5%
  - Silver: 3–5 bulan dibayar → 10%
  - Gold: ≥ 6 bulan dibayar → 15%
- Database: Supabase PostgreSQL.
- Entitas operasional POS dan Membership: **4 tabel** — members, products, sales, sale_items. Accounting menambahkan `chart_of_accounts`, `journal_entries`, dan `journal_lines`.

## Struktur folder
```text
coffee_membership_system/
├── index.html
├── frontend/
│   ├── styles.css
│   ├── app.js
│   ├── customer-display.html
│   └── customer-display.js
└── backend/
    ├── schema.sql
    ├── membership_tier_reactivation_migration.sql
    ├── accounting_migration.sql
    └── config.js
    
```

## Setup Supabase
1. Buat project di Supabase.
2. Buka SQL Editor dan jalankan `backend/schema.sql` untuk membuat schema, alur iuran membership, dan fungsi pengelolaan transaksi/produk.
3. Jalankan `backend/membership_tier_reactivation_migration.sql` untuk mencatat tenure dari periode pembayaran, memperbarui diskon di database, dan menambahkan dua pilihan reaktivasi. Migration ini aman dijalankan ulang dan mempertahankan seluruh riwayat.
4. Jalankan `backend/product_images_migration.sql` untuk menambahkan path gambar dan bucket Supabase Storage. Migration ini tidak menghapus produk yang ada.
5. Jalankan `backend/accounting_migration.sql` untuk menambahkan data akun internal dan jurnal otomatis dari transaksi penjualan serta membership. Tanggal jurnal memakai zona waktu bisnis `Asia/Jakarta`; migration dapat dijalankan ulang untuk menyelaraskan tanggal dan nomor jurnal lama tanpa mengubah timestamp sumber.
6. Isi `backend/config.js` dengan `SUPABASE_URL` dan `SUPABASE_ANON_KEY`.
7. Jalankan project dari root folder melalui static server, misalnya `python -m http.server 5500`.
8. Buka `http://localhost:5500/frontend/`.

Untuk project Supabase yang sudah berjalan, jalankan `backend/membership_tier_reactivation_migration.sql` beserta migration lain yang belum diterapkan. Migration membership menghitung bulan dibayar dari riwayat pembayaran yang tersimpan dan mempertahankan status, nomor, tanggal registrasi, serta transaksi historis. Member tanpa pembayaran tercatat tidak memperoleh tenure dari tanggal bergabung. Hindari menjalankan ulang seed `schema.sql` pada database produksi. Produk lama tetap dipertahankan dan produk katalog yang dikenal mendapat foto Unsplash bawaan.

Gambar produk baru wajib diunggah sebagai JPG, JPEG, PNG, atau WEBP (maksimal 5 MB). File disimpan di bucket `product-images`; path-nya tersimpan di produk agar gambar tetap tersedia setelah aplikasi dimuat ulang. Saat mengedit produk, gambar sebelumnya dipertahankan jika tidak memilih pengganti.

## Catatan keamanan
Anon key memang digunakan di browser. Untuk tugas/demo, RLS pada SQL diaktifkan agar struktur akses terlihat jelas. Untuk aplikasi produksi, tambahkan authentication dan perketat policy sesuai role pengguna.

## Alur transaksi
1. Kasir membuka menu **Penjualan**.
2. Memilih produk dan jumlah.
3. (Opsional) memasukkan Membership Number.
4. Sistem menampilkan tier dari bulan membership yang sudah dibayar; database menghitung ulang diskon saat transaksi disimpan.
5. Subtotal → diskon → total dihitung.
6. Kasir memilih metode pembayaran.
7. Sistem menyimpan satu baris `sales` dan beberapa baris `sale_items`.

## Perhitungan transaksi
- `subtotal = Σ(qty × unit_price)`
- `discount_amount = subtotal × discount_pct / 100`
- `total = subtotal − discount_amount`
- Harga pada `sale_items.unit_price` adalah snapshot saat transaksi, sehingga riwayat transaksi tidak berubah ketika harga menu diubah.

## 4 entitas operasional
| Entitas | Fungsi | Key penting |
|---|---|---|
| members | menyimpan identifier membership anonim dan tanggal join | id, membership_number |
| products | master menu dan harga | id, sku |
| sales | header transaksi, member, diskon, total, payment | id, receipt_no |
| sale_items | rincian produk tiap transaksi | id, sale_id, product_id |

## Kenapa hanya 4 entitas operasional?
Level membership tidak dibuat sebagai tabel sendiri. Jumlah periode dibayar dan tanggal siklus aktif disimpan pada `members`, sementara view `v_membership` menghitung tier dari jumlah bulan dibayar. Trigger database juga memvalidasi diskon POS dari tier tersebut saat transaksi dibuat atau dikoreksi.

## Modul UI
**Dashboard** menampilkan total penjualan hari ini, jumlah transaksi, member aktif, average ticket, grafik penjualan 7 hari, komposisi tier, dan transaksi terbaru.

**Penjualan** berfungsi sebagai POS sederhana dengan product cards, cart, membership checker, discount calculation, payment method, dan checkout.

**Customer Display** untuk Marwid Coffee and Space membuka layar pelanggan terpisah dari tombol di halaman Penjualan. Keranjang, diskon membership, total, dan metode pembayaran disinkronkan langsung antartab/jendela dengan `BroadcastChannel`; layar pelanggan menyediakan tampilan idle, konfirmasi transaksi, dan fullscreen. Buka jendela tersebut di monitor kedua dengan memindahkannya secara manual. Untuk transaksi tunai, POS saat ini tidak mencatat nominal uang yang diserahkan atau kembalian, jadi layar pelanggan menandai kedua nilai itu sebagai tidak tercatat.

**Membership** menampilkan directory anonim, pencarian membership number, tenure, tier, discount, dan form penambahan member.

Nomor membership dan tanggal bergabung dapat dikoreksi melalui tombol **Edit**. Tanggal bergabung adalah catatan historis dan tidak mengubah tenure/tier; catatan pembayaran yang sudah tersimpan juga tidak diubah. Membership tanpa transaksi atau pembayaran dapat dihapus; yang memiliki riwayat hanya dapat dinonaktifkan.

**Iuran membership**: member baru membayar satu periode; tiap pembayaran bulanan berhasil menambah satu bulan tenure. Member aktif dapat membayar satu bulan iuran. Saat reaktivasi, kasir memilih **Bayar Tunggakan** (seluruh periode sejak tanggal terakhir dibayar, ditambah biaya reaktivasi) atau **Mulai Ulang** (satu bulan ditambah biaya reaktivasi dan tier Bronze dengan tenure 0). Jika tidak ada tanggal pembayaran terakhir, pilihan bayar tunggakan tidak tersedia. Tanggal registrasi asli dan seluruh pembayaran sebelumnya tetap tersimpan. Periode, tenure, metode reaktivasi, total pembayaran, status, dan perhitungan diskon POS diproses/validasi oleh RPC dan trigger Supabase. Riwayat pembayaran otomatis membentuk jurnal; receipt jurnal unik mencegah duplikasi. Tarif dapat disesuaikan melalui fungsi SQL `get_membership_fees`.

Dashboard membaca entitas `sales` untuk ringkasan penjualan. Halaman **Transaction History** menggabungkan transaksi POS dari `sales` dengan pembayaran registrasi, perpanjangan, dan reaktivasi dari `members.membership_payments`. Riwayat ini read-only dan menyediakan filter Sales/Membership serta detail sesuai jenis transaksi.

**Produk** menampilkan master menu dan form penambahan produk, termasuk unggah gambar. SKU, nama, kategori, harga, dan gambar dapat dikoreksi. Perubahan harga berlaku untuk transaksi baru; harga historis pada transaksi yang sudah tersimpan tetap dipertahankan. Produk tanpa riwayat transaksi dapat dihapus; produk yang pernah terjual dapat ditandai non-available.

**Accounting & Finance** hanya menyediakan **General Journal** dan **Revenue Report**. Jurnal menampilkan posting read-only beserta nama akun yang disimpan pada data akun internal. Penjualan POS dan pembayaran membership membentuk jurnal double-entry secara otomatis, dengan pencegahan duplikasi dan validasi debit = kredit di database. Revenue Report menghitung Sales Revenue, Membership Revenue, dan Total Revenue langsung dari akun pendapatan pada jurnal yang berstatus POSTED. Laporan menyediakan filter tanggal khusus, bulanan, triwulanan, tahunan, serta kategori Sales/Membership, grafik, nilai IDR, cetak, dan ekspor CSV. Laporan tidak menghitung laba, COGS, atau biaya operasional. Tidak ada halaman Income Statement, General Ledger, Trial Balance, Balance Sheet, Cash Flow, atau Statement of Changes in Equity.

**Koreksi transaksi**: transaksi tersimpan dapat direvisi item, jumlah, membership, dan metode pembayaran. Total dan diskon dihitung ulang saat simpan; item yang sama mempertahankan harga historisnya. Transaksi dapat dihapus, dan item detailnya ikut terhapus. Produk dapat diubah statusnya menjadi available/non-available tanpa menghapus data produk.

## Prinsip privacy by design
Antarmuka hanya menampilkan `membership_number`. Data pelanggan pribadi tidak diperlukan untuk fungsi diskon. Hal ini membantu menjaga privasi dan sekaligus membuat sistem cukup sederhana untuk proyek akademik.
