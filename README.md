# 🚆 KeretaKita — Portal Pemesanan Tiket Kereta Api Terintegrasi

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Web%20Full--Stack-blue?style=for-the-badge" alt="Platform" />
  <img src="https://img.shields.io/badge/Node.js-v24+-green?style=for-the-badge&logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/Database-SQLite%203%20Native-003B57?style=for-the-badge&logo=sqlite" alt="SQLite" />
  <img src="https://img.shields.io/badge/Excel-Auto%20Sync%20(.xlsx)-217346?style=for-the-badge&logo=microsoftexcel" alt="Excel" />
  <img src="https://img.shields.io/badge/UI-Light%20%26%20Dark%20Mode-orange?style=for-the-badge" alt="Theme" />
</p>

**KeretaKita** adalah aplikasi web pemesanan tiket kereta api antarkota modern dengan standar *production-ready*. Dirancang dengan antarmuka yang bersih, elegan, dan ramah pengguna (terinspirasi dari platform resmi transportasi nasional), aplikasi ini menyediakan alur reservasi tiket *end-to-end* yang terhubung langsung ke **Database Relasional SQLite** dan **tersinkronisasi secara otomatis ke file Microsoft Excel (`.xlsx`) & CSV**.

---

## 🌟 Fitur Utama

### 1. 🔍 Pencarian Tiket Cerdas & Kalender Tanggal 7 Hari
- Mendukung mode **Sekali Jalan** dan **Pulang-Pergi (PP)**.
- Pencarian berdasarkan Stasiun Asal, Stasiun Tujuan, Tanggal Keberangkatan, Kelas Layanan (*Eksekutif, Luxury/Sleeper, Bisnis, Ekonomi*), dan Jumlah Penumpang (1–4 orang).
- **Tombol Tukar Stasiun (Swap)** dan deretan jalan pintas **Rute Favorit** (*Jakarta ⇄ Bandung, Jakarta ⇄ Yogyakarta, Jakarta ⇄ Surabaya, dll.*).
- **Kalender Strip 7 Hari** interaktif untuk berpindah tanggal keberangkatan dengan sekali klik.
- **Filter & Urutkan Jadwal:** Filter waktu keberangkatan (*Pagi, Siang, Sore, Malam*) dan pengurutan berdasarkan *Harga Terendah/Tertinggi* atau *Waktu Berangkat*.

### 2. 💺 Denah Pemilihan Kursi Gerbong Interaktif (Seat Map)
- Visual denah kabin kereta dengan arah laju lokomotif, lorong jalan (*aisle*), dan konfigurasi kursi 2-2 (`A B | Lorong | C D`).
- Pengguna dapat memilih gerbong (Gerbong 1, 2, atau 3) dan menentukan nomor kursi yang masih tersedia untuk masing-masing penumpang secara *real-time*.
- Kursi yang sudah terisi otomatis terkunci secara atomik melalui transaksi database.

### 3. 🍱 Pre-Order Kuliner Restorasi & Perlindungan Perjalanan
- Pemesanan makanan khas perjalanan kereta api sejak awal (*Nasi Goreng Parahyangan, Chicken Bento KAI, Empal Gentong Khas Cirebon, Paket Kopi & Croissant*) yang diantar hangat ke kursi penumpang.
- Opsi tambahan **Perlindungan Asuransi Perjalanan** per penumpang.

### 4. 🎟️ Katalog Promo, Voucher Diskon & RailPoints
- Kode voucher resmi yang dapat langsung digunakan saat checkout:
  - `KERETAHEMAT` — Potongan langsung Rp 50.000
  - `RAILTRIP15` — Diskon 15% untuk kelas Eksekutif & Luxury
  - `WEEKENDKAI` — Potongan hemat Rp 35.000
  - `KELUARGA100` — Potongan rombongan keluarga Rp 100.000
- Setiap transaksi tiket memberikan bonus **RailPoints** bagi akun member.

### 5. 👥 Manajemen Member & Daftar Penumpang Tersimpan (1-Click Fill)
- Pendaftaran akun, login sesi persisten, serta **Fitur Lupa Kata Sandi (Reset Password)** dengan verifikasi NIK atau Nomor HP terdaftar.
- **Daftar Penumpang Tersimpan (Keluarga & Kerabat):** Mengisi identitas seluruh penumpang hanya dengan 1 klik dari data tersimpan.
- Kartu profil modern dengan dropdown menu navigasi cepat (*Profil, Tiket Saya, Ubah Kata Sandi, Keluar*).

### 6. 💳 Pembayaran & Boarding Pass Resmi (Gate QR Code)
- Simulasi pembayaran melalui **Virtual Account** (BCA, Mandiri, BRI, BNI) atau kode **QRIS** instan dengan opsi *Bayar Langsung* atau *Bayar Nanti*.
- Penerbitan **E-Ticket & Boarding Pass Resmi** lengkap dengan **QR Code Gate Stasiun**, detail gerbong & kursi, rincian add-ons, serta dukungan cetak dokumen (*Print-Ready*).
- Fitur **Ubah Jadwal (Reschedule)** tanggal perjalanan dan **Batalkan Tiket** yang secara otomatis mengembalikan kuota kursi ke sistem.

### 7. 🌓 Mode Gelap & Mode Terang (Dark / Light Theme)
- Tombol *toggle* tema di navbar dengan transisi visual yang halus.
- Kontras teks dan palet warna dioptimalkan agar tetap nyaman dibaca dalam kondisi minim cahaya.
- Preferensi tema tersimpan secara persisten di *Local Storage* peramban.

---

## 📊 Integrasi Otomatis Microsoft Excel (`.xlsx`) & CSV

Setiap kali terjadi transaksi (pendaftaran akun, pesanan baru, pemilihan kursi, pembayaran, *reschedule*, maupun pembatalan tiket), sistem secara otomatis menyinkronkan data ke file spreadsheet fisik tanpa memerlukan library eksternal berbayar:

- **File Excel Utama (Multi-Sheet):**
  📁 `data/Database_KeretaKita.xlsx`
  Tersusun rapi dengan *styling header Navy*, format angka ribuan, lebar kolom otomatis, dan terdiri dari 5 *worksheet*:
  1. `1_Pemesanan_Tiket` — Data transaksi, Kode Booking (PNR), status tiket, promo, total bayar, kontak pemesan.
  2. `2_Penumpang_Kursi` — Rincian penumpang, nomor E-Ticket, NIK, gerbong, nomor kursi, pesanan makanan, asuransi.
  3. `3_Data_Pelanggan` — Profil member terdaftar, nomor kontak, NIK, dan saldo RailPoints.
  4. `4_Jadwal_Kereta` — Direktori nomor KA, kelas layanan, rute stasiun, jam operasional, tarif, dan fasilitas.
  5. `5_Daftar_Stasiun` — Kode dan nama stasiun kereta api beserta Daerah Operasi (DAOP).

- **File CSV Pendamping:**
  📁 Folder `data/csv/` (`1_Pemesanan_Tiket.csv`, `2_Penumpang_Kursi.csv`, `3_Data_Pelanggan.csv`, dst.) berformat UTF-8 BOM yang dapat dibuka langsung di aplikasi spreadsheet apa pun.

---

## 🛠️ Arsitektur & Teknologi

- **Runtime & Back-End:** Node.js (v24+) menggunakan HTTP REST API modular.
- **Database Engine:** `node:sqlite` (driver bawaan native Node.js yang cepat dan bebas kompilasi C++ eksternal).
- **Excel Engine:** Generator OpenXML (`.xlsx`) native berbasis kompresi ZIP + XML tanpa dependensi npm tambahan (*Zero-Dependency Engine*).
- **Front-End:** Vanilla JavaScript ES6+, HTML5 Semantik, CSS3 Modern (CSS Grid & Flexbox, CSS Custom Properties untuk Dual Theme).
- **Keamanan:** Password hashing menggunakan algoritma `crypto.scryptSync` dengan salt acak dan `timingSafeEqual`.

---

## 📂 Struktur Direktori Proyek

```plaintext
project_2/
├── data/
│   ├── Database_KeretaKita.xlsx    # File Excel multi-sheet terintegrasi live
│   ├── keretakita.sqlite           # File database SQLite persisten
│   └── csv/                        # Ekspor CSV tiap tabel secara otomatis
│       ├── 1_Pemesanan_Tiket.csv
│       ├── 2_Penumpang_Kursi.csv
│       ├── 3_Data_Pelanggan.csv
│       ├── 4_Jadwal_Kereta.csv
│       └── 5_Daftar_Stasiun.csv
├── public/
│   ├── app.js                      # Logika Front-End, alur booking, dan tema
│   ├── index.html                  # Antarmuka web utama
│   └── styles.css                  # Desain antarmuka responsif & dark mode
├── scripts/
│   └── view-db.js                  # Utilitas CLI inspeksi isi database & Excel
├── src/
│   ├── db.js                       # Skema database SQLite & seed master rute
│   ├── excel-sync.js               # Generator & sinkronisasi otomatis XLSX/CSV
│   └── server.js                   # Back-End REST API & static web server
├── .gitignore                      # Konfigurasi pengabaian file Git
├── package.json                    # Konfigurasi proyek & scripts npm
├── PROMPT_SPESIFIKASI.md           # Master prompt & dokumen spesifikasi teknis
└── README.md                       # Dokumentasi resmi proyek
```

---

## 🚀 Panduan Menjalankan Aplikasi

### Prasyarat
- Pastikan komputer Anda telah terinstal **Node.js versi 22 ke atas** (disarankan Node.js v24 karena menggunakan modul bawaan `node:sqlite`).

### 1. Kloning Repositori
```bash
git clone https://github.com/surakhbilal/tiket_kereta.git
cd tiket_kereta
```

### 2. Menjalankan Server
Tidak memerlukan instalasi dependensi runtime eksternal yang rumit karena seluruh modul inti menggunakan kemampuan native Node.js:
```bash
npm start
```

Jika ingin menjalankan dalam mode pengembangan (*hot-reload* saat file diubah):
```bash
npm run dev
```

### 3. Membuka Aplikasi
Buka peramban (browser) Anda dan akses:
👉 **http://localhost:3000**

---

## 💻 Utilitas CLI (Terminal)

Untuk melihat seluruh isi tabel database dan status file Excel langsung melalui terminal tanpa membuka browser:

- **Inspeksi Data Live:**
  ```bash
  npm run db:view
  ```
- **Reset Database ke Kondisi Awal Bersih:**
  ```bash
  npm run db:reset
  ```

---

## 📄 Lisensi
Proyek ini dilisensikan di bawah [MIT License](LICENSE).
Dikembangkan untuk sistem reservasi transportasi kereta api yang modern, reliabel, dan mudah dipelihara.
