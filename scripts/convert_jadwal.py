#!/usr/bin/env python3
"""Ubah file jadwal NOC (.xlsx) menjadi public/jadwal.json.

Pemakaian:
    python3 scripts/convert_jadwal.py JADWAL.xlsx            # gabung ke public/jadwal.json
    python3 scripts/convert_jadwal.py JADWAL.xlsx out.json   # tulis ke file lain

Format xlsx yang dibaca sama dengan jadwal November 2026:
  Sheet1  : baris 1 judul (mis. "... NOVEMBER 2026 ..."), baris 3 tanggal,
            baris 4-7 = PAGI / SORE / MALAM / LIBUR (beberapa nama dipisah enter),
            blok kiri tgl 1-15 (kolom B-P), blok kanan tgl 16-30/31 (kolom R-AF).
  Pola Waktu : baris 5-25 = jam kerja per shift & hari.
Bulan yang sudah ada di jadwal.json ditimpa, bulan lain dibiarkan.
"""
import json, re, sys, os
import openpyxl

BULAN = ["JANUARI","FEBRUARI","MARET","APRIL","MEI","JUNI","JULI","AGUSTUS",
         "SEPTEMBER","OKTOBER","NOVEMBER","DESEMBER"]
BARIS = {4: "pagi", 5: "sore", 6: "malam", 7: "libur"}

def nama_list(v):
    if v is None: return []
    out = []
    for p in re.split(r"[\n,/]+", str(v)):
        p = p.strip()
        if p and p != "-": out.append(p)
    return out

def main(src, dst):
    wb = openpyxl.load_workbook(src)
    ws = wb["Sheet1"]
    judul = str(ws["A1"].value).upper()
    m = next((i + 1 for i, b in enumerate(BULAN) if b in judul), None)
    y = re.search(r"(20\d\d)", judul)
    if not m or not y:
        sys.exit("Judul A1 harus memuat nama bulan dan tahun, mis. 'NOVEMBER 2026'")
    key = f"{y.group(1)}-{m:02d}"

    hari, petugas = {}, []
    for col in list(range(2, 17)) + list(range(18, 33)):
        tgl = ws.cell(3, col).value
        if not isinstance(tgl, int): continue
        d = {}
        for r, k in BARIS.items():
            d[k] = nama_list(ws.cell(r, col).value)
            for n in d[k]:
                if n not in petugas: petugas.append(n)
        hari[str(tgl)] = d

    pw = wb["Pola Waktu"]
    pola = {}
    for r in range(5, 26):
        sh, hr = pw.cell(r, 1).value, pw.cell(r, 2).value
        if not sh: continue
        pola.setdefault(sh.lower(), {})[hr.upper()] = {
            "j1": pw.cell(r, 3).value, "ist": pw.cell(r, 4).value,
            "j2": pw.cell(r, 5).value, "total": pw.cell(r, 6).value}

    data = {}
    if os.path.exists(dst):
        data = json.load(open(dst, encoding="utf-8"))
    data.setdefault("unit", "NOC JTS")
    data.setdefault("aturan", {"absenAwalMenit": 15, "bukaMenit": 60,
                               "toleransiMenit": 0, "graceKeluarMenit": 240,
                               "mulaiAbsensi": f"{y.group(1)}-{m:02d}-01"})
    data["petugas"] = sorted(set(data.get("petugas", [])) | set(petugas),
                             key=lambda n: (data.get("petugas", []) + petugas).index(n))
    data["pola"] = pola
    data.setdefault("bulan", {})[key] = hari
    json.dump(data, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"OK {key}: {len(hari)} hari, petugas {data['petugas']} -> {dst}")

if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit(__doc__)
    here = os.path.dirname(os.path.abspath(__file__))
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2
         else os.path.join(here, "..", "public", "jadwal.json"))
