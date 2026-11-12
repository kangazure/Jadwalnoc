process.env.NOC_DEV_MEMORY = '1';
process.env.NOC_PINS = 'Sandi=1111,Yanto=2222,Rizky=3333,Rufli=4444';
process.env.NOC_ADMIN_PIN = '9999';
const test = require('node:test');
const assert = require('node:assert');
const api = require('../api/absen.js');

function panggil(method, body, qs = '', now) {
  if (now) process.env.NOC_DEV_NOW = now; // 'YYYY-MM-DDTHH:MM:00+07:00'
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { resolve({ kode: this.statusCode, j: JSON.parse(s) }); } };
    api({ method, url: '/api/absen' + qs, body }, res);
  });
}

test('alur masuk -> pulang cepat -> pulang, PIN salah, kunci', async () => {
  let r = await panggil('POST', { aksi: 'masuk', nama: 'Yanto', pin: '0000' }, '', '2026-11-12T16:10:00+07:00');
  assert.equal(r.kode, 403);
  r = await panggil('POST', { aksi: 'masuk', nama: 'Yanto', pin: '2222' }, '', '2026-11-12T16:10:00+07:00');
  assert.equal(r.kode, 200); assert.match(r.j.pesan, /tepat waktu/);
  r = await panggil('POST', { aksi: 'masuk', nama: 'Yanto', pin: '2222' }, '', '2026-11-12T16:11:00+07:00');
  assert.equal(r.kode, 409); assert.match(r.j.pesan, /Sudah absen/);
  r = await panggil('POST', { aksi: 'pulang', nama: 'Yanto', pin: '2222' }, '', '2026-11-12T20:00:00+07:00');
  assert.ok(r.j.perluKonfirmasi);
  r = await panggil('POST', { aksi: 'pulang', nama: 'Yanto', pin: '2222', konfirmasi: true }, '', '2026-11-12T20:00:00+07:00');
  assert.equal(r.kode, 200);
  r = await panggil('GET', null, '?bulan=2026-11');
  assert.equal(r.j.records.length, 1); assert.equal(r.j.records[0].nama, 'Yanto');
});
test('petugas libur ditolak; PIN salah 5x dikunci', async () => {
  let r = await panggil('POST', { aksi: 'masuk', nama: 'Rufli', pin: '4444' }, '', '2026-11-12T10:00:00+07:00');
  assert.equal(r.kode, 409);
  for (let i = 0; i < 5; i++) await panggil('POST', { aksi: 'masuk', nama: 'Sandi', pin: 'x' });
  r = await panggil('POST', { aksi: 'masuk', nama: 'Sandi', pin: '1111' }, '', '2026-11-12T07:30:00+07:00');
  assert.equal(r.kode, 429);
});
test('koreksi admin butuh PIN admin', async () => {
  const b = { aksi: 'koreksi', nama: 'Rizky', tgl: '2026-11-10', shift: 'pagi', status: 'sakit', catatan: 'surat dokter' };
  let r = await panggil('POST', { ...b, admin: '0' });
  assert.equal(r.kode, 403);
  r = await panggil('POST', { ...b, admin: '9999' });
  assert.equal(r.kode, 200); assert.equal(r.j.rec.status, 'sakit');
  r = await panggil('POST', { aksi: 'hapus', nama: 'Rizky', tgl: '2026-11-10', admin: '9999' });
  assert.equal(r.kode, 200);
});
