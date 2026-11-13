/* Fungsi tanggal & shift (WIB, dihitung manual agar tidak tergantung zona waktu perangkat). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var WIB = 7 * 3600e3, MENIT = 60e3;
  var HARI = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
  var HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var SHIFTS = ['pagi', 'sore', 'malam'];
  function p2(n) { return (n < 10 ? '0' : '') + n; }

  function wib(ms) {
    var d = new Date(ms + WIB);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() };
  }
  function tglKey(y, m, d) { return y + '-' + p2(m) + '-' + p2(d); }
  function tglDari(ms) { var w = wib(ms); return tglKey(w.y, w.m, w.d); }
  function parseTgl(t) { var a = t.split('-'); return { y: +a[0], m: +a[1], d: +a[2] }; }
  function tengahMalam(t) { var p = parseTgl(t); return Date.UTC(p.y, p.m - 1, p.d) - WIB; }
  function geserTgl(t, n) { return tglDari(tengahMalam(t) + n * 864e5 + 12 * 3600e3); }
  function dowTgl(t) { return wib(tengahMalam(t) + 12 * 3600e3).dow; }
  function namaHari(t) { return HARI[dowTgl(t)]; }
  function bulanKey(t) { return t.slice(0, 7); }

  function fmtJam(ms) { var w = wib(ms); return p2(w.h) + ':' + p2(w.mi); }
  function fmtJamDetik(ms) { return fmtJam(ms) + ':' + p2(new Date(ms + WIB).getUTCSeconds()); }
  function fmtTglPendek(t) { var p = parseTgl(t); return p.d + ' ' + BULAN[p.m - 1].slice(0, 3); }
  function fmtTglPanjang(t) {
    var p = parseTgl(t), h = namaHari(t);
    return h.charAt(0) + h.slice(1).toLowerCase() + ', ' + p.d + ' ' + BULAN[p.m - 1] + ' ' + p.y;
  }
  function parseHM(s) { var a = s.split(':'); return (+a[0]) * 60 + (+a[1]); }

  /* jam kerja shift pada tanggal tertentu: menit sejak 00:00 tanggal itu (24:30 = 1470) */
  function pola(jadwal, shift, tgl) {
    var p = jadwal.pola[shift] && jadwal.pola[shift][namaHari(tgl)];
    if (!p) return null;
    var r1 = p.j1.split('-');
    var akhir = (p.j2 && p.j2 !== '-') ? p.j2.split('-')[1] : r1[1];
    var s = parseHM(r1[0]), e = parseHM(akhir);
    if (e <= s) e += 1440;
    return { mulai: s, selesai: e, j1: p.j1, ist: p.ist, j2: p.j2, total: p.total };
  }
  function buatShift(jadwal, tgl, shift, nama) {
    var po = pola(jadwal, shift, tgl);
    if (!po) return null;
    var t0 = tengahMalam(tgl);
    return { tgl: tgl, shift: shift, nama: nama, pola: po, mulai: t0 + po.mulai * MENIT, selesai: t0 + po.selesai * MENIT };
  }
  function hariJadwal(jadwal, tgl) {
    var b = jadwal.bulan[bulanKey(tgl)];
    return (b && b[String(parseTgl(tgl).d)]) || null;
  }
  function shiftDi(jadwal, tgl) {
    var h = hariJadwal(jadwal, tgl), out = [];
    if (!h) return out;
    SHIFTS.forEach(function (sh) {
      (h[sh] || []).forEach(function (n) { var s = buatShift(jadwal, tgl, sh, n); if (s) out.push(s); });
    });
    return out;
  }
  function liburDi(jadwal, tgl) { var h = hariJadwal(jadwal, tgl); return h ? h.libur || [] : []; }

  return {
    HARI: HARI, HARI_PENDEK: HARI_PENDEK, BULAN: BULAN, SHIFTS: SHIFTS,
    wib: wib, tglDari: tglDari, parseTgl: parseTgl, geserTgl: geserTgl, dowTgl: dowTgl, namaHari: namaHari,
    fmtJam: fmtJam, fmtJamDetik: fmtJamDetik, fmtTglPendek: fmtTglPendek, fmtTglPanjang: fmtTglPanjang,
    pola: pola, buatShift: buatShift, hariJadwal: hariJadwal, shiftDi: shiftDi, liburDi: liburDi
  };
});
