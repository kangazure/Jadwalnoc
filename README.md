# Jadwal NOC JTS

Website jadwal shift petugas NOC JTS. Situs statis (HTML/CSS/JS), tanpa build, tanpa database.

- **Hari ini**: siapa jaga pagi/sore/malam, shift yang sedang berjalan ditandai; bisa geser kemarin/besok.
- **Jadwal bulan**: tabel 1 bulan penuh, sorot satu petugas, plus tabel jam kerja per shift.

## Deploy ke Vercel
Import repo di Vercel (**Add New → Project**), Framework preset **Other**, kosongkan build command. Selesai.
Atau: `npx vercel --prod`.

## Ganti / tambah bulan
```
pip install openpyxl
python3 scripts/convert_jadwal.py JADWAL_DESEMBER_2026.xlsx
```
Bulan baru ditambahkan ke `public/jadwal.json` (bulan lama tetap), lalu commit & push; Vercel deploy ulang otomatis.
Format xlsx harus sama dengan jadwal November 2026.

## Lokal
`npm run dev` lalu buka http://localhost:3000
