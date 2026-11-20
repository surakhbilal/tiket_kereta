# Master Prompt & Spesifikasi Teknis: Website Pemesanan Tiket Kereta Api Production-Ready (Terintegrasi Otomatis ke Microsoft Excel)

Dokumen ini berisi **Master Prompt** yang dapat digunakan ulang (copy-paste) untuk membangun aplikasi web pemesanan tiket kereta api berstandar *production launching* (tanpa tampilan teknis/backend di antarmuka web) dan terintegrasi secara *real-time* dengan file **Microsoft Excel (`.xlsx`)** serta database relasional.

---

## 1. Master Prompt (Siap Copy-Paste)

> **Prompt:**
>
> Buatkan aplikasi web **Pemesanan Tiket Transportasi Kereta Api** (*Full-Stack Production-Ready Web Application*) dengan antarmuka pengguna yang sangat profesional, modern, bersih, dan ramah pengguna (setara platform produksi seperti Access by KAI / Traveloka / Tiket.com) tanpa menampilkan menu teknis/backend apa pun di halaman website.
>
> ### A. Integrasi Data Otomatis ke Microsoft Excel (`.xlsx`) & Database
> - Setiap kali pengguna melakukan pendaftaran akun, perubahan profil, pemesanan tiket, pemilihan kursi, pemakaian voucher promo, konfirmasi pembayaran, perubahan jadwal (*reschedule*), maupun pembatalan tiket, data wajib tersimpan ke database SQLite (`data/keretakita.sqlite`) **dan secara otomatis tersinkronisasi langsung ke file Microsoft Excel multi-sheet (`data/Database_KeretaKita.xlsx`) serta CSV (`data/csv/*.csv`)**.
> - File Excel `Database_KeretaKita.xlsx` harus memiliki *header* berwarna Navy dengan teks tebal, lebar kolom proporsional, format angka ribuan otomatis, dan terdiri dari 5 *Worksheet*:
>   1. `1_Pemesanan_Tiket` (ID Transaksi, Kode Booking/PNR, Status Tiket & Pembayaran, Info Kereta, Rute, Tanggal & Jam, Jumlah Penumpang, Kode Promo, Diskon, Add-ons, Total Bayar, Metode Pembayaran, Kontak Pemesan, Waktu Transaksi).
>   2. `2_Penumpang_Kursi` (Nomor E-Ticket, Kode Booking, Nama Penumpang, NIK, Kategori, Kereta, Tanggal, Nomor Gerbong, Nomor Kursi, Pre-Order Makanan, Asuransi).
>   3. `3_Data_Pelanggan` (ID User, Nama Lengkap, Email, No. Telepon, NIK, Saldo RailPoints, Tanggal Daftar).
>   4. `4_Jadwal_Kereta` (Kode KA, Nama Kereta, Kelas, Stasiun Asal & Tujuan, Jam Berangkat & Tiba, Durasi, Harga, Kapasitas, Fasilitas).
>   5. `5_Daftar_Stasiun` (Kode Stasiun, Nama Stasiun, Kota, Wilayah DAOP).
>
> ### B. Fitur Utama Website (Standar Production Launching)
> 1. **Pencarian Cerdas & Navigasi Tanggal 7 Hari:**
>    - Pilihan perjalanan **Sekali Jalan** atau **Pulang-Pergi (PP)**.
>    - Filter Stasiun Asal, Stasiun Tujuan, Tombol Tukar Stasiun, Tanggal Keberangkatan, Kelas Layanan (*Eksekutif, Luxury/Sleeper, Bisnis, Ekonomi*), Jumlah Penumpang, serta tombol Rute Favorit.
>    - **Kalender Strip 7 Hari** interaktif di atas hasil pencarian untuk berpindah tanggal dengan 1 klik.
>    - **Sidebar Filter & Urutkan:** Filter Waktu Keberangkatan (*Pagi, Siang, Sore, Malam*) dan pengurutan berdasarkan *Harga Terendah, Harga Tertinggi, Keberangkatan Terpagi, atau Termalam*.
>    - **Info Fasilitas & Kebijakan Kereta:** Setiap kartu jadwal menampilkan badge fasilitas (*AC Dingin, Kursi Reclining, Stopkontak & USB, Restorasi, Bagasi 20kg*) dan jaminan *Bisa Reschedule* & *Bisa Refund*.
> 2. **Member Area, RailPoints & Daftar Penumpang Tersimpan:**
>    - Fitur Daftar & Masuk akun member dengan bonus *RailPoints* setiap transaksi.
>    - Fitur **Daftar Penumpang Tersimpan (Keluarga & Kerabat)** sehingga saat memesan tiket pengguna cukup 1 klik untuk mengisi Nama & NIK penumpang.
> 3. **Denah Pemilihan Kursi Gerbong & Layanan Tambahan (Add-ons):**
>    - Denah gerbong interaktif (Gerbong 1–3, formasi 2-2 `A B | Lorong | C D`) yang mengunci kursi terisi secara *real-time*.
>    - Pilihan **Pre-Order Kuliner Restorasi** (*Nasi Goreng Parahyangan, Chicken Bento KAI, Empal Gentong, Paket Kopi & Croissant*) dan **Perlindungan Perjalanan (Asuransi)** untuk masing-masing penumpang.
> 4. **Katalog Promo, Voucher Diskon & Payment Gateway:**
>    - Halaman **Promo & Voucher** (`KERETAHEMAT`, `RAILTRIP15`, `WEEKENDKAI`, `KELUARGA100`) yang dapat dipasang saat checkout untuk memotong total tagihan secara otomatis.
>    - Halaman **Checkout Pembayaran Resmi** lengkap dengan Nomor Virtual Account atau kode visual **QRIS** beserta opsi *Saya Sudah Membayar* atau *Bayar Nanti*.
> 5. **Boarding Pass QR Code, Reschedule & Pembatalan:**
>    - Penerbitan **E-Ticket & Boarding Pass Resmi** lengkap dengan **QR Code Gate Stasiun**, rincian kursi & makanan, fitur **Cetak Boarding Pass**, **Ubah Jadwal (Reschedule)** tanggal perjalanan, dan **Batalkan Tiket**.
