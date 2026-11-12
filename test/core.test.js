const test = require('node:test');
const assert = require('node:assert');
const C = require('../public/lib/core.js');
const J = require('../public/jadwal.json');
// WIB helper: at('2026-11-12','06:36')
const at = (t, hm) => { const [h, m] = hm.split(':').map(Number); const p = C.parseTgl(t);
  return Date.UTC(p.y, p.m - 1, p.d, h, m) - C.WIB; };
const kosong = () => undefined;

test('hari & pola', () => {
  assert.equal(C.namaHari('2026-11-01'), 'MINGGU');
  assert.equal(C.namaHari('2026-11-12'), 'KAMIS');
  const sn = C.buatShift(J, '2026-11-02', 'malam', 'Rizky'); // Senin malam 24:30-08:00
  assert.equal(C.fmtJam(sn.mulai), '00:30'); assert.equal(C.tglDari(sn.mulai), '2026-11-03');
  assert.equal(C.fmtJam(sn.selesai), '08:00'); assert.equal(C.tglDari(sn.selesai), '2026-11-03');
  assert.equal(C.fmtJam(sn.jamAbsen), '00:15');
});
test('jumat pagi efektif 09:30, absen 09:15; sabtu sore 16:00', () => {
  const j = C.buatShift(J, '2026-11-06', 'pagi', 'Sandi');
  assert.equal(C.fmtJam(j.mulai), '09:30'); assert.equal(C.fmtJam(j.jamAbsen), '09:15');
  const s = C.buatShift(J, '2026-11-07', 'sore', 'Rizky');
  assert.equal(C.fmtJam(s.mulai), '16:00'); assert.equal(C.fmtJam(s.selesai), '23:00');
  const jm = C.buatShift(J, '2026-11-06', 'malam', 'Rufli'); // Jumat malam 22:00-08:00
  assert.equal(C.fmtJam(jm.mulai), '22:00'); assert.equal(C.tglDari(jm.selesai), '2026-11-07');
});
test('tepat waktu / terlambat / pulang cepat', () => {
  const s = C.buatShift(J, '2026-11-12', 'sore', 'Yanto'); // 16:30, batas 16:15
  let r = C.proses(J, 'masuk', 'Yanto', at('2026-11-12', '16:10'), kosong);
  assert.ok(r.ok); assert.match(r.pesan, /tepat waktu/);
  r = C.proses(J, 'masuk', 'Yanto', at('2026-11-12', '16:25'), kosong);
  assert.match(r.pesan, /terlambat 10 mnt/);
  const rec = r.rec;
  const recOf = (t, n) => (t === rec.tgl && n === rec.nama ? rec : undefined);
  let p = C.proses(J, 'pulang', 'Yanto', at('2026-11-12', '23:30'), recOf);
  assert.ok(p.perluKonfirmasi);
  p = C.proses(J, 'pulang', 'Yanto', at('2026-11-12', '23:30'), recOf, true);
  assert.ok(p.ok); assert.equal(C.nilai(s, p.rec, at('2026-11-13', '10:00')).cepat, 60);
  p = C.proses(J, 'pulang', 'Yanto', at('2026-11-13', '00:31'), recOf);
  assert.ok(p.ok); assert.equal(C.nilai(s, p.rec, at('2026-11-13', '10:00')).label, 'Terlambat 10 mnt');
});
test('malam lintas hari: 06:36 Rufli masih di shift malam tgl 11', () => {
  const k = C.ringkas(J, 'Rufli', at('2026-11-12', '06:36'), kosong);
  assert.equal(k.s.tgl, '2026-11-11'); assert.equal(k.s.shift, 'malam'); assert.equal(k.k, 'buka');
  let r = C.proses(J, 'masuk', 'Rufli', at('2026-11-12', '00:10'), kosong);
  assert.ok(r.ok); assert.equal(r.rec.tgl, '2026-11-11'); assert.match(r.pesan, /tepat waktu/);
  r = C.proses(J, 'masuk', 'Rufli', at('2026-11-12', '00:20'), kosong);
  assert.match(r.pesan, /terlambat 5 mnt/);
  // Rizky malam tgl 12 mulai 00:30 tgl 13: jendela buka 23:15 tgl 12
  assert.equal(C.ringkas(J, 'Rizky', at('2026-11-12', '22:00'), kosong).k, 'belum');
  assert.equal(C.ringkas(J, 'Rizky', at('2026-11-12', '23:20'), kosong).k, 'buka');
});
test('libur & tidak bisa absen di luar jendela', () => {
  const k = C.ringkas(J, 'Rufli', at('2026-11-12', '10:00'), kosong);
  assert.equal(k.k, 'libur'); assert.equal(k.libur, true); assert.equal(k.berikut.tgl, '2026-11-13');
  const r = C.proses(J, 'masuk', 'Rufli', at('2026-11-12', '10:00'), kosong);
  assert.equal(r.ok, false);
});
test('tidak hadir setelah shift lewat; lupa pulang', () => {
  const s = C.buatShift(J, '2026-11-10', 'pagi', 'Sandi');
  assert.equal(C.nilai(s, undefined, at('2026-11-11', '09:00')).kode, 'absen');
  const rec = { masuk: s.mulai - 20 * 60e3, pulang: null, status: 'hadir' };
  assert.equal(C.nilai(s, rec, at('2026-11-11', '09:00')).kode, 'lupa');
});
