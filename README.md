# Absensi NOC JTS

Website absensi + jadwal shift NOC JTS. HTML/CSS/JS biasa (tanpa build) + satu fungsi serverless `/api/absen`.
Jadwal diambil dari `JADWAL_NOC_JTS_NOVEMBER_2026_done.xlsx` (ada di `public/jadwal.json`).

## Deploy ke Vercel
1. Upload folder ini ke GitHub, lalu **Add New → Project** di Vercel dan pilih repo-nya
   (atau jalankan `npx vercel --prod` dari folder ini). Framework preset: **Other**, tanpa build command.
2. Langsung jalan dalam **mode lokal** (data absen hanya di browser perangkat).
3. Untuk **absen bersama** (disarankan), aktifkan database & PIN:
   - Vercel → Storage / Marketplace → **Upstash Redis** → hubungkan ke project
     (otomatis mengisi `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
   - Settings → Environment Variables, tambahkan:
     - `NOC_PINS` = `Sandi=1234,Yanto=2345,Rizky=3456,Rufli=4567` (ganti dengan PIN masing-masing)
     - `NOC_ADMIN_PIN` = PIN admin untuk koreksi absen
   - Redeploy. Banner "Mode lokal" hilang dan jam absen diambil dari server.

## Aturan yang dipakai (dari file jadwal)
- Absen paling lambat **15 menit sebelum** jam kerja efektif mulai (Jumat pagi: efektif 09:30 → batas 09:15). Lewat itu = terlambat.
- Absen dibuka 60 menit sebelum batas; absen pulang boleh sampai 4 jam setelah shift berakhir.
- Pulang sebelum shift berakhir = pulang cepat (ada konfirmasi).
- Shift malam dicatat pada tanggal mulai shift (malam tgl 11 berakhir pagi tgl 12).
- Semua angka (toleransi, jendela buka, `mulaiAbsensi`) ada di `public/jadwal.json` → `aturan`.

## Ganti bulan
```
pip install openpyxl
python3 scripts/convert_jadwal.py JADWAL_DESEMBER_2026.xlsx
```
Bulan baru ditambahkan ke `public/jadwal.json`; bulan lama tetap. Format xlsx harus sama dengan file November.

## Lokal
```
npm run dev          # mode lokal, http://localhost:3000
npm run dev:memori   # API aktif (memori), PIN contoh: Sandi=1111 ... admin=9999
npm test
```

## Catatan keamanan
- PIN diverifikasi di server; 5 kali salah dikunci 15 menit per petugas.
- Data rekap dapat dibaca siapa pun yang punya link situs (nama + jam absen). Jika perlu, aktifkan
  Vercel Deployment Protection / password.
- Mode lokal bisa dimanipulasi (memakai jam perangkat); pakai mode database untuk absensi resmi.
