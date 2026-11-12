/*
 * /api/absen  — Vercel Serverless Function (Node, CommonJS)
 *
 * GET  ?bulan=YYYY-MM          -> daftar catatan absen bulan itu
 * POST {aksi:'masuk'|'pulang', nama, pin, konfirmasi?}
 * POST {aksi:'koreksi', admin, nama, tgl, shift, status, masuk, pulang, catatan}
 * POST {aksi:'hapus',   admin, nama, tgl}
 *
 * Penyimpanan: Upstash Redis (REST). Tanpa env Redis, endpoint menjawab storage:false
 * dan website otomatis memakai mode lokal (data di browser).
 */
const crypto = require('crypto');
const Core = require('../public/lib/core.js');
const jadwal = require('../public/jadwal.json');

/* ---------- konfigurasi dari environment ---------- */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const DEV_MEM = process.env.NOC_DEV_MEMORY === '1'; // hanya untuk `npm run dev`

function bacaPin() { // "Sandi=1234,Rufli=2345"
  const out = {};
  (process.env.NOC_PINS || '').split(',').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}
const ADMIN_PIN = () => process.env.NOC_ADMIN_PIN || '';

function sama(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ---------- penyimpanan ---------- */
const mem = global.__nocMem || (global.__nocMem = { h: new Map(), c: new Map() });

async function redis(...cmd) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const store = {
  aktif() { return DEV_MEM || !!(REDIS_URL && REDIS_TOKEN); },
  async hgetall(key) {
    if (DEV_MEM) return Object.fromEntries(mem.h.get(key) || []);
    const arr = await redis('HGETALL', key) || [];
    const o = {};
    for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
    return o;
  },
  async hget(key, f) {
    if (DEV_MEM) return (mem.h.get(key) || new Map()).get(f) || null;
    return redis('HGET', key, f);
  },
  async hset(key, f, v) {
    if (DEV_MEM) { if (!mem.h.has(key)) mem.h.set(key, new Map()); mem.h.get(key).set(f, v); return; }
    await redis('HSET', key, f, v);
  },
  async hdel(key, f) {
    if (DEV_MEM) { (mem.h.get(key) || new Map()).delete(f); return; }
    await redis('HDEL', key, f);
  },
  async gagal(nama) { // hitung salah PIN, kedaluwarsa 15 menit
    const k = 'gagal:' + nama;
    if (DEV_MEM) {
      const n = (mem.c.get(k) || 0) + 1; mem.c.set(k, n); return n;
    }
    const n = await redis('INCR', k);
    if (n === 1) await redis('EXPIRE', k, 900);
    return n;
  },
  async jumlahGagal(nama) {
    const k = 'gagal:' + nama;
    if (DEV_MEM) return mem.c.get(k) || 0;
    return +(await redis('GET', k)) || 0;
  },
  async resetGagal(nama) {
    if (DEV_MEM) { mem.c.delete('gagal:' + nama); return; }
    await redis('DEL', 'gagal:' + nama);
  }
};

const kunciBulan = (tgl) => 'absen:' + Core.bulanKey(tgl);
const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

async function ambilRec(tgl, nama) {
  const s = await store.hget(kunciBulan(tgl), Core.kunci(tgl, nama));
  return s ? parse(s) : undefined;
}
async function simpanRec(rec) {
  await store.hset(kunciBulan(rec.tgl), Core.kunci(rec.tgl, rec.nama), JSON.stringify(rec));
}

/* ---------- util HTTP ---------- */
function kirim(res, kode, obj) {
  res.statusCode = kode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
async function bacaBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return parse(req.body) || {};
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return parse(Buffer.concat(chunks).toString('utf8')) || {};
}
function sekarang() {
  if (DEV_MEM && process.env.NOC_DEV_NOW) return Date.parse(process.env.NOC_DEV_NOW);
  return Date.now();
}

/* ---------- handler ---------- */
module.exports = async function handler(req, res) {
  const now = sekarang();
  try {
    if (!store.aktif()) return kirim(res, 200, { storage: false, now });

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://x');
      const bulan = /^\d{4}-\d{2}$/.test(url.searchParams.get('bulan') || '')
        ? url.searchParams.get('bulan') : Core.tglDari(now).slice(0, 7);
      const all = await store.hgetall('absen:' + bulan);
      const records = Object.values(all).map(parse).filter(Boolean);
      return kirim(res, 200, { storage: true, now, bulan, records, pinDiatur: Object.keys(bacaPin()).length > 0 });
    }
    if (req.method !== 'POST') return kirim(res, 405, { ok: false, pesan: 'Metode tidak didukung.' });

    const b = await bacaBody(req);
    const nama = String(b.nama || '');
    if (jadwal.petugas.indexOf(nama) < 0) return kirim(res, 400, { ok: false, pesan: 'Petugas tidak dikenal.' });

    /* ----- admin: koreksi / hapus ----- */
    if (b.aksi === 'koreksi' || b.aksi === 'hapus') {
      if (!ADMIN_PIN()) return kirim(res, 503, { ok: false, pesan: 'NOC_ADMIN_PIN belum diatur di Vercel.' });
      if (!sama(b.admin || '', ADMIN_PIN())) return kirim(res, 403, { ok: false, pesan: 'PIN admin salah.' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.tgl || '')) return kirim(res, 400, { ok: false, pesan: 'Tanggal tidak valid.' });
      if (b.aksi === 'hapus') {
        await store.hdel(kunciBulan(b.tgl), Core.kunci(b.tgl, nama));
        return kirim(res, 200, { ok: true, pesan: 'Catatan dihapus.' });
      }
      if (Core.SHIFTS.indexOf(b.shift) < 0) return kirim(res, 400, { ok: false, pesan: 'Shift tidak valid.' });
      const status = ['hadir', 'izin', 'sakit', 'cuti'].indexOf(b.status) >= 0 ? b.status : 'hadir';
      const num = (v) => (Number.isFinite(+v) && +v > 0 ? +v : null);
      const rec = {
        tgl: b.tgl, nama, shift: b.shift, status,
        masuk: status === 'hadir' ? num(b.masuk) : null,
        pulang: status === 'hadir' ? num(b.pulang) : null,
        catatan: String(b.catatan || '').slice(0, 200), koreksi: true
      };
      await simpanRec(rec);
      return kirim(res, 200, { ok: true, rec, pesan: 'Catatan disimpan.' });
    }

    /* ----- petugas: masuk / pulang ----- */
    const pins = bacaPin();
    if (!pins[nama]) return kirim(res, 503, { ok: false, pesan: 'PIN petugas belum diatur (NOC_PINS) di Vercel.' });
    if ((await store.jumlahGagal(nama)) >= 5)
      return kirim(res, 429, { ok: false, pesan: 'Terlalu banyak PIN salah. Coba lagi 15 menit lagi.' });
    if (!sama(b.pin || '', pins[nama])) {
      await store.gagal(nama);
      return kirim(res, 403, { ok: false, pesan: 'PIN salah.' });
    }
    await store.resetGagal(nama);

    const recs = {};
    for (const s of Core.kandidat(jadwal, nama, now)) recs[Core.kunci(s.tgl, nama)] = await ambilRec(s.tgl, nama);
    const hasil = Core.proses(jadwal, b.aksi, nama, now, (t, n) => recs[Core.kunci(t, n)], !!b.konfirmasi);
    if (hasil.ok) await simpanRec(hasil.rec);
    return kirim(res, hasil.ok ? 200 : 409, {
      ok: hasil.ok, pesan: hasil.pesan, perluKonfirmasi: !!hasil.perluKonfirmasi, rec: hasil.rec || null, now
    });
  } catch (e) {
    console.error(e);
    return kirim(res, 500, { ok: false, pesan: 'Terjadi kesalahan di server. Coba lagi.' });
  }
};
