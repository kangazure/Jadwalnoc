/*
 * Logika jadwal & absensi NOC.
 * Dipakai di browser (window.Core) dan di server (require) supaya aturannya satu sumber.
 * Semua waktu = epoch ms (UTC); tampilan selalu WIB (UTC+7) dihitung manual,
 * jadi hasilnya tidak bergantung zona waktu perangkat.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var WIB = 7 * 3600e3;
  var MENIT = 60e3;
  var HARI = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
  var HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var SHIFTS = ['pagi', 'sore', 'malam'];

  function p2(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------- tanggal (WIB) ---------- */
  function wib(ms) {
    var d = new Date(ms + WIB);
    return {
      y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
      h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay()
    };
  }
  function tglKey(y, m, d) { return y + '-' + p2(m) + '-' + p2(d); }
  function tglDari(ms) { var w = wib(ms); return tglKey(w.y, w.m, w.d); }
  function parseTgl(t) {
    var a = t.split('-');
    return { y: +a[0], m: +a[1], d: +a[2] };
  }
  function tengahMalam(t) { // epoch ms 00:00 WIB pada tanggal t
    var p = parseTgl(t);
    return Date.UTC(p.y, p.m - 1, p.d) - WIB;
  }
  function geserTgl(t, n) { return tglDari(tengahMalam(t) + n * 864e5 + 12 * 3600e3); }
  function dowTgl(t) { return wib(tengahMalam(t) + 12 * 3600e3).dow; }
  function namaHari(t) { return HARI[dowTgl(t)]; }
  function bulanKey(t) { return t.slice(0, 7); }

  /* ---------- format ---------- */
  function fmtJam(ms) { var w = wib(ms); return p2(w.h) + ':' + p2(w.mi); }
  function fmtJamDetik(ms) {
    var w = wib(ms), s = new Date(ms + WIB).getUTCSeconds();
    return p2(w.h) + ':' + p2(w.mi) + ':' + p2(s);
  }
  function fmtTglPendek(t) { var p = parseTgl(t); return p.d + ' ' + BULAN[p.m - 1].slice(0, 3); }
  function fmtTglPanjang(ms) {
    var w = wib(ms);
    return HARI[w.dow].charAt(0) + HARI[w.dow].slice(1).toLowerCase() + ', ' + w.d + ' ' + BULAN[w.m - 1] + ' ' + w.y;
  }
  function fmtDurasi(ms) {
    if (ms == null || ms < 0) return '–';
    var m = Math.round(ms / MENIT);
    return Math.floor(m / 60) + 'j ' + p2(m % 60) + 'm';
  }
  function fmtMenit(m) { // 75 -> "1j 15m"
    if (m < 60) return m + ' mnt';
    return Math.floor(m / 60) + 'j' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
  }
  function dariMenitHari(min) { // 1470 -> "24:30" (gaya jadwal)
    return p2(Math.floor(min / 60)) + ':' + p2(min % 60);
  }
  function parseHM(s) { var a = s.split(':'); return (+a[0]) * 60 + (+a[1]); }

  /* ---------- pola jam kerja ---------- */
  function pola(jadwal, shift, tgl) {
    var p = jadwal.pola[shift] && jadwal.pola[shift][namaHari(tgl)];
    if (!p) return null;
    var r1 = p.j1.split('-');
    var akhir = (p.j2 && p.j2 !== '-') ? p.j2.split('-')[1] : r1[1];
    var s = parseHM(r1[0]), e = parseHM(akhir);
    if (e <= s) e += 1440;
    return { mulai: s, selesai: e, j1: p.j1, ist: p.ist, j2: p.j2, total: p.total };
  }

  /* ---------- instansi shift ---------- */
  function buatShift(jadwal, tgl, shift, nama) {
    var po = pola(jadwal, shift, tgl);
    if (!po) return null;
    var a = jadwal.aturan, t0 = tengahMalam(tgl);
    var mulai = t0 + po.mulai * MENIT;
    var batas = mulai - a.absenAwalMenit * MENIT;
    return {
      tgl: tgl, shift: shift, nama: nama, pola: po,
      mulai: mulai,
      selesai: t0 + po.selesai * MENIT,
      batas: batas + a.toleransiMenit * MENIT, // lewat ini = terlambat
      jamAbsen: batas,                         // jam absen yang diminta (mulai - 15 mnt)
      buka: batas - a.bukaMenit * MENIT,
      tutup: t0 + po.selesai * MENIT + a.graceKeluarMenit * MENIT
    };
  }
  function hariJadwal(jadwal, tgl) {
    var b = jadwal.bulan[bulanKey(tgl)];
    return b && b[String(parseTgl(tgl).d)] || null;
  }
  function shiftDi(jadwal, tgl) { // semua shift (semua petugas) pada tanggal
    var h = hariJadwal(jadwal, tgl), out = [];
    if (!h) return out;
    SHIFTS.forEach(function (sh) {
      (h[sh] || []).forEach(function (n) {
        var s = buatShift(jadwal, tgl, sh, n);
        if (s) out.push(s);
      });
    });
    return out;
  }
  function liburDi(jadwal, tgl) { var h = hariJadwal(jadwal, tgl); return h ? h.libur || [] : []; }
  function kandidat(jadwal, nama, now) { // shift yang mungkin sedang berjalan: kemarin-hari ini-besok
    var t = tglDari(now), out = [];
    [-1, 0, 1].forEach(function (g) {
      shiftDi(jadwal, geserTgl(t, g)).forEach(function (s) { if (s.nama === nama) out.push(s); });
    });
    return out;
  }
  function shiftBerikut(jadwal, nama, now, maks) {
    var t = tglDari(now), best = null;
    for (var g = -1; g <= (maks || 10); g++) {
      var l = shiftDi(jadwal, geserTgl(t, g));
      for (var i = 0; i < l.length; i++) {
        if (l[i].nama === nama && l[i].selesai > now && (!best || l[i].mulai < best.mulai)) best = l[i];
      }
    }
    return best;
  }
  function kunci(tgl, nama) { return tgl + '|' + nama; }

  /* ---------- keadaan satu shift terhadap waktu & catatan ---------- */
  function keadaan(s, rec, now) {
    if (rec && (rec.status === 'izin' || rec.status === 'sakit' || rec.status === 'cuti')) return rec.status;
    if (rec && rec.masuk) {
      if (rec.pulang) return 'selesai';
      return now <= s.tutup ? 'bertugas' : 'lupa';
    }
    if (now < s.buka) return 'belum';
    if (now <= s.selesai) return 'buka';
    return 'absen'; // lewat tanpa catatan
  }

  /* Penilaian akhir untuk rekap */
  function nilai(s, rec, now) {
    var k = keadaan(s, rec, now);
    var r = { kode: k, telat: 0, cepat: 0, durasi: null, label: '', nada: '' };
    if (rec && rec.masuk) {
      var tm = Math.floor(rec.masuk / MENIT), tb = Math.floor(s.batas / MENIT);
      if (tm > tb) r.telat = tm - tb;
      if (rec.pulang) {
        var tp = Math.floor(rec.pulang / MENIT), te = Math.floor(s.selesai / MENIT);
        if (tp < te) r.cepat = te - tp;
        r.durasi = rec.pulang - rec.masuk;
      }
    }
    switch (k) {
      case 'belum': r.label = 'Belum mulai'; r.nada = 'diam'; break;
      case 'buka': r.label = 'Menunggu absen'; r.nada = 'diam'; break;
      case 'bertugas': r.label = r.telat ? 'Bertugas · telat ' + fmtMenit(r.telat) : 'Bertugas'; r.nada = r.telat ? 'warn' : 'ok'; break;
      case 'selesai':
        if (r.telat && r.cepat) r.label = 'Telat + pulang cepat';
        else if (r.telat) r.label = 'Terlambat ' + fmtMenit(r.telat);
        else if (r.cepat) r.label = 'Pulang cepat ' + fmtMenit(r.cepat);
        else r.label = 'Tepat waktu';
        r.nada = (r.telat || r.cepat) ? 'warn' : 'ok';
        break;
      case 'lupa': r.label = 'Tanpa absen pulang'; r.nada = 'warn'; break;
      case 'absen': r.label = 'Tidak hadir'; r.nada = 'bad'; break;
      case 'izin': r.label = 'Izin'; r.nada = 'info'; break;
      case 'sakit': r.label = 'Sakit'; r.nada = 'info'; break;
      case 'cuti': r.label = 'Cuti'; r.nada = 'info'; break;
    }
    return r;
  }

  /* Pilih shift yang relevan untuk satu petugas saat ini.
     recOf(tgl, nama) -> catatan | undefined */
  function ringkas(jadwal, nama, now, recOf) {
    var ks = kandidat(jadwal, nama, now).map(function (s) {
      var rec = recOf(s.tgl, nama);
      return { s: s, rec: rec, k: keadaan(s, rec, now) };
    });
    var pilih = ks.filter(function (x) { return x.k === 'bertugas'; })[0] ||
      ks.filter(function (x) { return x.k === 'buka'; })[0];
    var hariIni = tglDari(now);
    if (!pilih) pilih = ks.filter(function (x) { return x.s.tgl === hariIni; })[0];
    if (pilih) {
      return { s: pilih.s, rec: pilih.rec, k: pilih.k, libur: false, berikut: null };
    }
    return {
      s: null, rec: null, k: 'libur', libur: liburDi(jadwal, hariIni).indexOf(nama) >= 0,
      berikut: shiftBerikut(jadwal, nama, now)
    };
  }

  /* ---------- proses absen (sama persis di server & mode lokal) ---------- */
  function proses(jadwal, aksi, nama, now, recOf, konfirmasi) {
    if (jadwal.petugas.indexOf(nama) < 0) return { ok: false, pesan: 'Petugas tidak dikenal.' };
    var ks = kandidat(jadwal, nama, now).map(function (s) {
      var rec = recOf(s.tgl, nama);
      return { s: s, rec: rec, k: keadaan(s, rec, now) };
    });
    var x;
    if (aksi === 'masuk') {
      if ((x = ks.filter(function (z) { return z.k === 'bertugas'; })[0]))
        return { ok: false, pesan: 'Sudah absen masuk pukul ' + fmtJam(x.rec.masuk) + '.' };
      x = ks.filter(function (z) { return z.k === 'buka'; })[0];
      if (!x) {
        var nx = shiftBerikut(jadwal, nama, now);
        return {
          ok: false, pesan: nx
            ? 'Belum ada shift yang bisa diabsen. Shift berikut: ' + nx.shift.toUpperCase() + ' ' + fmtTglPendek(nx.tgl) + ', absen dibuka ' + fmtJam(nx.buka) + '.'
            : 'Tidak ada shift terjadwal.'
        };
      }
      var rec = { tgl: x.s.tgl, nama: nama, shift: x.s.shift, masuk: now, pulang: null, status: 'hadir' };
      var n = nilai(x.s, rec, now);
      return {
        ok: true, rec: rec, s: x.s,
        pesan: 'Masuk tercatat ' + fmtJam(now) + (n.telat ? ' — terlambat ' + fmtMenit(n.telat) + '.' : ' — tepat waktu.')
      };
    }
    if (aksi === 'pulang') {
      x = ks.filter(function (z) { return z.k === 'bertugas'; })[0];
      if (!x) {
        if (ks.filter(function (z) { return z.k === 'lupa'; })[0])
          return { ok: false, pesan: 'Batas absen pulang sudah lewat. Minta admin mengoreksi.' };
        if (ks.filter(function (z) { return z.k === 'selesai' && z.s.tutup >= now; })[0])
          return { ok: false, pesan: 'Shift ini sudah ditutup (masuk & pulang tercatat).' };
        return { ok: false, pesan: 'Belum absen masuk, tidak bisa absen pulang.' };
      }
      var cepat = Math.floor(x.s.selesai / MENIT) - Math.floor(now / MENIT);
      if (cepat > 0 && !konfirmasi)
        return {
          ok: false, perluKonfirmasi: true,
          pesan: 'Shift baru berakhir pukul ' + fmtJam(x.s.selesai) + '. Pulang sekarang dicatat pulang cepat ' + fmtMenit(cepat) + '.'
        };
      var r2 = Object.assign({}, x.rec, { pulang: now });
      return {
        ok: true, rec: r2, s: x.s,
        pesan: 'Pulang tercatat ' + fmtJam(now) + ' — durasi ' + fmtDurasi(now - x.rec.masuk) + (cepat > 0 ? ' (pulang cepat).' : '.')
      };
    }
    return { ok: false, pesan: 'Aksi tidak dikenal.' };
  }

  return {
    WIB: WIB, MENIT: MENIT, HARI: HARI, HARI_PENDEK: HARI_PENDEK, BULAN: BULAN, SHIFTS: SHIFTS,
    wib: wib, tglKey: tglKey, tglDari: tglDari, parseTgl: parseTgl, tengahMalam: tengahMalam,
    geserTgl: geserTgl, dowTgl: dowTgl, namaHari: namaHari, bulanKey: bulanKey,
    fmtJam: fmtJam, fmtJamDetik: fmtJamDetik, fmtTglPendek: fmtTglPendek, fmtTglPanjang: fmtTglPanjang,
    fmtDurasi: fmtDurasi, fmtMenit: fmtMenit, dariMenitHari: dariMenitHari,
    pola: pola, buatShift: buatShift, hariJadwal: hariJadwal, shiftDi: shiftDi, liburDi: liburDi,
    kandidat: kandidat, shiftBerikut: shiftBerikut, kunci: kunci,
    keadaan: keadaan, nilai: nilai, ringkas: ringkas, proses: proses
  };
});
