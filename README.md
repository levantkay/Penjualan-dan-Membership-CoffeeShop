# Brew & Benefits — Coffee Shop Sales + Membership System

Sistem informasi akuntansi mini untuk coffee shop yang memadukan **penjualan dasar (POS)** dan **membership berbasis nomor anonim**.

## Konsep utama
- Penjualan: pilih produk, masukkan membership (opsional), hitung diskon otomatis, pilih pembayaran, simpan transaksi.
- Membership: pelanggan diidentifikasi hanya dengan **membership number**; tidak ada nama, alamat, telepon, atau email pada desain database.
- Benefit bertingkat berdasarkan lama keanggotaan:
  - Bronze: < 3 bulan → 5%
  - Silver: 3–< 6 bulan → 10%
  - Gold: ≥ 6 bulan → 15%
- Database: Supabase PostgreSQL.
- Entitas inti: **4 tabel** — members, products, sales, sale_items.

## Struktur folder
```text
coffee_membership_system/
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── backend/
    ├── schema.sql
    └── config.js
    
```

## Setup Supabase
1. Buat project di Supabase.
2. Buka SQL Editor dan jalankan `backend/schema.sql` untuk membuat schema, alur iuran membership, dan fungsi pengelolaan transaksi/produk.
3. Jalankan `backend/membership_product_edit_migration.sql` untuk mengaktifkan koreksi data membership dan produk.
4. Isi `backend/config.js` dengan `SUPABASE_URL` dan `SUPABASE_ANON_KEY`.
5. Jalankan project dari root folder melalui static server, misalnya `python -m http.server 5500`.
6. Buka `http://localhost:5500/frontend/`.

Untuk project Supabase yang sudah menjalankan `schema.sql`, cukup jalankan migration pada langkah 3. Member lama tetap memiliki status dan tanggal bergabung yang sama; kolom iuran sampai akan menampilkan **Belum tercatat** sampai pembayaran pertamanya dicatat.

## Catatan keamanan
Anon key memang digunakan di browser. Untuk tugas/demo, RLS pada SQL diaktifkan agar struktur akses terlihat jelas. Untuk aplikasi produksi, tambahkan authentication dan perketat policy sesuai role pengguna.

## Alur transaksi
1. Kasir membuka menu **Penjualan**.
2. Memilih produk dan jumlah.
3. (Opsional) memasukkan Membership Number.
4. Sistem mengecek masa membership dan menentukan tier + diskon.
5. Subtotal → diskon → total dihitung.
6. Kasir memilih metode pembayaran.
7. Sistem menyimpan satu baris `sales` dan beberapa baris `sale_items`.

## Logika akuntansi sederhana
- `subtotal = Σ(qty × unit_price)`
- `discount_amount = subtotal × discount_pct / 100`
- `total = subtotal − discount_amount`
- Harga pada `sale_items.unit_price` adalah harga saat transaksi, sehingga riwayat transaksi tidak berubah ketika harga menu diubah.

## 4 entitas
| Entitas | Fungsi | Key penting |
|---|---|---|
| members | menyimpan identifier membership anonim dan tanggal join | id, membership_number |
| products | master menu dan harga | id, sku |
| sales | header transaksi, member, diskon, total, payment | id, receipt_no |
| sale_items | rincian produk tiap transaksi | id, sale_id, product_id |

## Kenapa hanya 4 entitas?
Level membership tidak dibuat sebagai tabel sendiri. Tier dan discount dihitung dari `joined_at` melalui view `v_membership`/logika frontend. Ini membuat desain lebih ringan dan tetap menunjukkan konsep relasi, transaksi header-detail, serta perhitungan benefit.

## Modul UI
**Dashboard** menampilkan total penjualan hari ini, jumlah transaksi, member aktif, average ticket, grafik penjualan 7 hari, komposisi tier, dan transaksi terbaru.

**Penjualan** berfungsi sebagai POS sederhana dengan product cards, cart, membership checker, discount calculation, payment method, dan checkout.

**Membership** menampilkan directory anonim, pencarian membership number, tenure, tier, discount, dan form penambahan member.

Nomor membership dan tanggal bergabung dapat dikoreksi melalui tombol **Edit**. Perubahan tanggal akan menghitung ulang tenure dan tier; catatan pembayaran yang sudah tersimpan tidak diubah. Membership tanpa transaksi atau pembayaran dapat dihapus; yang memiliki riwayat hanya dapat dinonaktifkan.

**Iuran membership**: member baru membayar Rp35.000 untuk bulan pertama. Member aktif dapat membayar iuran satu bulan dari tabel Membership. Mengaktifkan kembali member INACTIVE menagih Rp35.000 iuran + Rp10.000 biaya reaktivasi. Tanggal bergabung tidak berubah sehingga masa membership dan tier tetap berlanjut. Status aktif/nonaktif, periode iuran, dan riwayat pembayaran tersimpan pada entitas `members` melalui RPC Supabase; perubahan status ke INACTIVE tidak mengenakan biaya. Riwayat menyimpan receipt, jenis pembayaran, nominal, metode, dan periode yang dibayar. Tarif dapat disesuaikan melalui fungsi SQL `get_membership_fees`.

Dashboard dan riwayat POS hanya membaca entitas `sales`, yang khusus menyimpan transaksi produk.

**Produk** menampilkan master menu dan form penambahan produk. SKU, nama, kategori, dan harga dapat dikoreksi. Perubahan harga berlaku untuk transaksi baru; harga historis pada transaksi yang sudah tersimpan tetap dipertahankan. Produk tanpa riwayat transaksi dapat dihapus; produk yang pernah terjual dapat ditandai non-available.

**Koreksi transaksi**: transaksi tersimpan dapat direvisi item, jumlah, membership, dan metode pembayaran. Total dan diskon dihitung ulang saat simpan; item yang sama mempertahankan harga historisnya. Transaksi dapat dihapus, dan item detailnya ikut terhapus. Produk dapat diubah statusnya menjadi available/non-available tanpa menghapus data produk.

## Prinsip privacy by design
Antarmuka hanya menampilkan `membership_number`. Data pelanggan pribadi tidak diperlukan untuk fungsi diskon. Hal ini membantu menjaga privasi dan sekaligus membuat sistem cukup sederhana untuk proyek akademik.
