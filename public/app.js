(function () {
  'use strict';
  var C = window.Core;
  var J = null; // jadwal.json
  var S = {
    mode: 'lokal',      // 'server' | 'lokal'
    offset: 0,          // selisih jam server - jam perangkat
    recs: {},           // 'tgl|nama' -> catatan
    nama: null,         // petugas terpilih di tab Absen
    tab: 'absen',
    sorot: '',          // filter nama di tab Jadwal
    rNama: '', rBulan: '',
    offline: false, sibuk: false
  };

  var $ = function (s) { return document.querySelector(s); };
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function now() { return Date.now() + S.offset; }
  function recOf(t, n) { return S.recs[C.kunci(t, n)]; }

  /* ---------- penyimpanan peramban (aman bila diblokir) ---------- */
  var memLS = {};
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return memLS[k] || null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { memLS[k] = v; } }

  /* ---------- tampilan jam gaya jadwal (24:30 = lewat tengah malam) ---------- */
  function jamJadwal(min) {
    if (min >= 1440 + 360) min -= 1440;
    return p2(Math.floor(min / 60)) + ':' + p2(min % 60);
  }
  function rentang(po) { return jamJadwal(po.mulai) + '<span>–</span>' + jamJadwal(po.selesai); }
  function judulTag(sh) { return '<span class="tag ' + sh + '">' + sh + '</span>'; }
  function jamDenganTgl(ms, tgl) {
    var t = C.fmtJam(ms);
    var d = C.tglDari(ms);
    return d === tgl ? t : t + ' <span class="sub">' + C.fmtTglPendek(d) + '</span>';
  }

  /* ---------- data ---------- */
  function loadLokal() {
    try { S.recs = JSON.parse(lsGet('noc-absen:v1') || '{}') || {}; } catch (e) { S.recs = {}; }
  }
  function saveLokal() { lsSet('noc-absen:v1', JSON.stringify(S.recs)); }

  function ambilServer() {
    var bulan = Object.keys(J.bulan);
    return Promise.all(bulan.map(function (b) {
      return fetch('/api/absen?bulan=' + b, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      });
    })).then(function (hasil) {
      var recs = {};
      hasil.forEach(function (h) {
        if (!h.storage) throw new Error('tanpa penyimpanan');
        (h.records || []).forEach(function (r) { recs[C.kunci(r.tgl, r.nama)] = r; });
      });
      S.recs = recs;
      S.offset = hasil[0].now - Date.now();
      S.offline = false;
    });
  }
  function segarkan() {
    if (S.mode !== 'server') return Promise.resolve();
    return ambilServer().then(function () { semua(); }, function () { S.offline = true; banner(); });
  }

  /* ---------- aksi absen ---------- */
  function pesan(teks, nada) {
    var el = $('#pesan');
    el.textContent = teks || '';
    el.className = 'pesan' + (nada ? ' ' + nada : '');
  }
  function kunciUI(b) {
    S.sibuk = b;
    renderPanel();
  }

  function kirimAksi(aksi, konfirmasi) {
    if (!S.nama || S.sibuk) return;
    var nama = S.nama;
    if (S.mode === 'lokal') {
      var h = C.proses(J, aksi, nama, now(), recOf, !!konfirmasi);
      return selesaiAksi(h, aksi);
    }
    var pin = $('#pin').value.trim();
    if (!pin) { pesan('Masukkan PIN dulu.', 'bad'); $('#pin').focus(); return; }
    kunciUI(true);
    return fetch('/api/absen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aksi: aksi, nama: nama, pin: pin, konfirmasi: !!konfirmasi })
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, pesan: 'Respon server tidak terbaca.' }; });
    }).then(function (j) {
      if (j.now) S.offset = j.now - Date.now();
      S.sibuk = false;
      selesaiAksi(j, aksi);
    }, function () {
      S.sibuk = false;
      pesan('Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.', 'bad');
      renderPanel();
    });
  }
  function selesaiAksi(h, aksi) {
    if (h.perluKonfirmasi) {
      S.sibuk = false;
      $('#konfirm-teks').textContent = h.pesan;
      $('#dlg-konfirm').returnValue = '';
      $('#dlg-konfirm').showModal();
      renderPanel();
      return;
    }
    if (h.ok && h.rec) {
      S.recs[C.kunci(h.rec.tgl, h.rec.nama)] = h.rec;
      if (S.mode === 'lokal') saveLokal();
      $('#pin').value = '';
    } else if (S.mode === 'server') {
      $('#pin').value = '';
    }
    pesan(h.pesan, h.ok ? 'ok' : 'bad');
    semua();
    if (S.mode === 'server') segarkan();
  }

  /* ---------- render: kop ---------- */
  function renderJam() {
    var t = now();
    $('#jam-hm').textContent = C.fmtJam(t);
    $('#jam-s').textContent = ':' + C.fmtJamDetik(t).slice(6);
    $('#tgl-ket').textContent = C.fmtTglPanjang(t);
  }
  function banner() {
    var el = $('#banner');
    if (S.offline) {
      el.hidden = false;
      el.textContent = 'Tidak terhubung ke server. Menampilkan data terakhir; absen baru belum bisa dicatat.';
    } else if (S.mode === 'lokal') {
      el.hidden = false;
      el.textContent = 'Mode lokal: catatan absen hanya tersimpan di browser perangkat ini dan memakai jam perangkat. Untuk absen bersama, sambungkan database (lihat README).';
    } else el.hidden = true;
    $('#kaki-mode').textContent = S.mode === 'server'
      ? 'Waktu absen diambil dari server · data tersimpan bersama'
      : 'Mode lokal · data di perangkat ini';
  }

  /* ---------- render: absen ---------- */
  function teksStatus(r) {
    var t = now();
    if (r.k === 'libur') return { teks: 'Libur', nada: 'diam' };
    var n = C.nilai(r.s, r.rec, t);
    switch (r.k) {
      case 'bertugas': return { teks: 'Bertugas sejak ' + C.fmtJam(r.rec.masuk) + (n.telat ? ' · telat ' + C.fmtMenit(n.telat) : ''), nada: n.telat ? 'warn' : 'ok' };
      case 'buka': return t > r.s.batas
        ? { teks: 'Belum absen · lewat batas', nada: 'warn' }
        : { teks: 'Silakan absen', nada: 'aksen' };
      case 'belum': return { teks: 'Absen dibuka ' + C.fmtJam(r.s.buka), nada: 'diam' };
      case 'selesai': return { teks: n.label + ' · ' + C.fmtJam(r.rec.masuk) + '–' + C.fmtJam(r.rec.pulang), nada: n.nada };
      default: return { teks: n.label, nada: n.nada };
    }
  }
  function renderRoster() {
    var t = now();
    $('#roster').innerHTML = J.petugas.map(function (n) {
      var r = C.ringkas(J, n, t, recOf);
      var st = teksStatus(r), sub;
      if (r.s) {
        sub = judulTag(r.s.shift) + '<span>' + jamJadwal(r.s.pola.mulai) + '–' + jamJadwal(r.s.pola.selesai) + '</span>';
        if (r.s.tgl !== C.tglDari(t)) sub += '<span>· mulai ' + C.fmtTglPendek(r.s.tgl) + '</span>';
      } else if (r.berikut) {
        sub = '<span>Berikut: ' + r.berikut.shift.toUpperCase() + ' ' + C.fmtTglPendek(r.berikut.tgl) + '</span>';
      } else sub = '<span>Tidak ada jadwal</span>';
      return '<li><button type="button" data-nama="' + esc(n) + '" aria-pressed="' + (S.nama === n) + '">' +
        '<span class="nm">' + esc(n) + '</span><span class="st n-' + st.nada + '">' + esc(st.teks) + '</span>' +
        '<span class="sub">' + sub + '</span></button></li>';
    }).join('');
  }
  function renderPanel() {
    var elNama = $('#p-nama'), elShift = $('#p-shift'), bm = $('#b-masuk'), bp = $('#b-pulang');
    $('#pin-wrap').hidden = S.mode !== 'server';
    if (!S.nama) {
      elNama.textContent = 'Pilih nama'; elNama.className = 'p-nama kosong';
      elShift.innerHTML = '<p class="catatan">Pilih nama Anda dari daftar petugas, lalu tekan tombol absen saat tiba dan saat pulang.</p>';
      bm.disabled = bp.disabled = true;
      return;
    }
    elNama.textContent = S.nama; elNama.className = 'p-nama';
    var t = now(), r = C.ringkas(J, S.nama, t, recOf), st = teksStatus(r), h = '';
    if (r.s) {
      var s = r.s, po = s.pola;
      h = '<div class="shift-kepala">' + judulTag(s.shift) + '<span>' + C.namaHari(s.tgl).charAt(0) + C.namaHari(s.tgl).slice(1).toLowerCase() + ' ' + C.fmtTglPendek(s.tgl) + '</span></div>' +
        '<div class="shift-jam">' + rentang(po) + '</div>' +
        '<dl class="rincian-s">' +
        '<dt>Status</dt><dd class="n-' + st.nada + '">' + esc(st.teks) + '</dd>' +
        '<dt>Batas absen</dt><dd class="mono">' + jamJadwal(po.mulai - J.aturan.absenAwalMenit) + '</dd>' +
        '<dt>Istirahat</dt><dd class="mono">' + (po.ist && po.ist !== '-' ? esc(po.ist.replace('-', ' – ')) : 'tidak ada') + '</dd>' +
        '<dt>Kerja efektif</dt><dd>' + esc(String(po.total).replace('.', ',')) + ' jam</dd>' +
        '</dl>';
    } else {
      h = '<div class="libur-besar">' + (r.libur ? 'Libur hari ini' : 'Tidak ada shift') + '</div>';
      if (r.berikut) {
        var b = r.berikut;
        h += '<dl class="rincian-s"><dt>Shift berikut</dt><dd>' + judulTag(b.shift) + ' &nbsp;' + C.fmtTglPendek(b.tgl) + ', ' + jamJadwal(b.pola.mulai) + '–' + jamJadwal(b.pola.selesai) + '</dd>' +
          '<dt>Absen dibuka</dt><dd class="mono">' + C.fmtJam(b.buka) + ' · ' + C.fmtTglPendek(C.tglDari(b.buka)) + '</dd></dl>';
      }
    }
    elShift.innerHTML = h;
    bm.disabled = S.sibuk || S.offline || r.k !== 'buka';
    bp.disabled = S.sibuk || S.offline || r.k !== 'bertugas';
  }
  function renderAbsen() { renderRoster(); renderPanel(); }

  /* ---------- render: jadwal ---------- */
  function bulanTerpilih() {
    var ks = Object.keys(J.bulan).sort();
    if (S.rBulan && J.bulan[S.rBulan]) return S.rBulan;
    var skr = C.tglDari(now()).slice(0, 7);
    return J.bulan[skr] ? skr : ks[ks.length - 1];
  }
  function labelBulan(k) { var a = k.split('-'); return C.BULAN[+a[1] - 1] + ' ' + a[0]; }

  function runHari(daftar) { // ['SENIN','SELASA','KAMIS'] -> 'Sen–Sel, Kam'
    var urut = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU', 'MINGGU'];
    var pend = { SENIN: 'Sen', SELASA: 'Sel', RABU: 'Rab', KAMIS: 'Kam', JUMAT: 'Jum', SABTU: 'Sab', MINGGU: 'Min' };
    var idx = daftar.map(function (d) { return urut.indexOf(d); }).sort(function (a, b) { return a - b; });
    var out = [], i = 0;
    while (i < idx.length) {
      var j = i;
      while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
      out.push(j > i ? pend[urut[idx[i]]] + '–' + pend[urut[idx[j]]] : pend[urut[idx[i]]]);
      i = j + 1;
    }
    return out.join(', ');
  }
  function renderJadwal() {
    var bk = bulanTerpilih(), hari = J.bulan[bk], hariIni = C.tglDari(now());
    $('#f-jadwal').innerHTML = ['<button type="button" data-n="" aria-pressed="' + (S.sorot === '') + '">Semua</button>']
      .concat(J.petugas.map(function (n) {
        return '<button type="button" data-n="' + esc(n) + '" aria-pressed="' + (S.sorot === n) + '">' + esc(n) + '</button>';
      })).join('');
    var tb = $('#tb-jadwal');
    tb.className = 'tabel jadwal' + (S.sorot ? ' sorot' : '');
    var cell = function (arr, cls) {
      if (!arr.length) return '<td class="' + cls + ' kosong">–</td>';
      return '<td class="' + cls + '">' + arr.map(function (n) {
        return '<span class="nm' + (n === S.sorot ? ' on' : '') + '">' + esc(n) + '</span>';
      }).join('') + '</td>';
    };
    var rows = Object.keys(hari).map(Number).sort(function (a, b) { return a - b; }).map(function (d) {
      var tgl = bk + '-' + p2(d), dow = C.dowTgl(tgl), v = hari[String(d)];
      return '<tr class="' + ((dow === 0 || dow === 6) ? 'pekan ' : '') + (tgl === hariIni ? 'kini' : '') + '">' +
        '<td class="tgl">' + d + '</td><td class="hr">' + C.HARI_PENDEK[dow] + '</td>' +
        cell(v.pagi, 'pagi') + cell(v.sore, 'sore') + cell(v.malam, 'malam') + cell(v.libur, 'libur') + '</tr>';
    }).join('');
    tb.innerHTML = '<thead><tr><th>Tgl</th><th>Hari</th><th>Pagi</th><th>Sore</th><th>Malam</th><th>Libur</th></tr></thead><tbody>' + rows + '</tbody>';

    // pola jam kerja
    var baris = [];
    C.SHIFTS.forEach(function (sh) {
      var grup = {}, order = [];
      Object.keys(J.pola[sh]).forEach(function (hr) {
        var p = J.pola[sh][hr], key = JSON.stringify(p);
        if (!grup[key]) { grup[key] = { p: p, hari: [] }; order.push(key); }
        grup[key].hari.push(hr);
      });
      order.forEach(function (k, i) {
        var g = grup[k], p = g.p;
        baris.push('<tr><td>' + (i === 0 ? judulTag(sh) : '') + '</td><td>' + runHari(g.hari) + '</td>' +
          '<td class="mono">' + esc(p.j1.replace('-', ' – ')) + '</td>' +
          '<td class="mono">' + (p.ist === '-' ? '–' : esc(p.ist.replace('-', ' – '))) + '</td>' +
          '<td class="mono">' + (p.j2 === '-' ? '–' : esc(p.j2.replace('-', ' – '))) + '</td>' +
          '<td class="mono num">' + String(p.total).replace('.', ',') + ' j</td></tr>');
      });
    });
    $('#tb-pola').innerHTML = '<thead><tr><th>Shift</th><th>Hari</th><th>Kerja 1</th><th>Istirahat</th><th>Kerja 2</th><th class="num">Efektif</th></tr></thead><tbody>' + baris.join('') + '</tbody>';
  }

  /* ---------- render: rekap ---------- */
  function barisRekap(bk) {
    var t = now(), out = [], hari = J.bulan[bk];
    Object.keys(hari).map(Number).sort(function (a, b) { return a - b; }).forEach(function (d) {
      var tgl = bk + '-' + p2(d);
      C.shiftDi(J, tgl).forEach(function (s) {
        if (s.buka > t) return; // belum dimulai
        var rec = recOf(tgl, s.nama);
        var n = C.nilai(s, rec, t);
        if (!rec && J.aturan.mulaiAbsensi && tgl < J.aturan.mulaiAbsensi) n = { kode: 'tanpa', label: 'Sebelum absensi dipakai', nada: 'diam', telat: 0, cepat: 0, durasi: null };
        out.push({ s: s, rec: rec, n: n });
      });
    });
    out.sort(function (a, b) { return b.s.mulai - a.s.mulai; });
    return out;
  }
  function renderRekap() {
    var bk = bulanTerpilih();
    var selB = $('#r-bulan'), selN = $('#r-nama');
    selB.innerHTML = Object.keys(J.bulan).sort().map(function (k) { return '<option value="' + k + '"' + (k === bk ? ' selected' : '') + '>' + labelBulan(k) + '</option>'; }).join('');
    selN.innerHTML = '<option value="">Semua</option>' + J.petugas.map(function (n) { return '<option' + (n === S.rNama ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');

    var semuaBaris = barisRekap(bk);
    // ringkasan per petugas
    var sum = {};
    J.petugas.forEach(function (n) { sum[n] = { jad: 0, hadir: 0, telat: 0, cepat: 0, absen: 0, cuti: 0, ms: 0 }; });
    semuaBaris.forEach(function (b) {
      var k = b.n.kode, x = sum[b.s.nama];
      if (k === 'belum' || k === 'buka' || k === 'tanpa') return;
      x.jad++;
      if (k === 'selesai' || k === 'bertugas' || k === 'lupa') x.hadir++;
      if (b.n.telat) x.telat++;
      if (b.n.cepat) x.cepat++;
      if (k === 'absen') x.absen++;
      if (k === 'izin' || k === 'sakit' || k === 'cuti') x.cuti++;
      if (b.n.durasi) x.ms += b.n.durasi;
    });
    var z = function (v) { return '<td class="num mono' + (v ? '' : ' nol') + '">' + v + '</td>'; };
    $('#tb-ringkasan').innerHTML = '<thead><tr><th>Petugas</th><th class="num">Shift</th><th class="num">Hadir</th><th class="num">Terlambat</th><th class="num">Pulang cepat</th><th class="num">Tidak hadir</th><th class="num">Izin/sakit/cuti</th><th class="num">Total jam</th></tr></thead><tbody>' +
      J.petugas.filter(function (n) { return !S.rNama || n === S.rNama; }).map(function (n) {
        var x = sum[n];
        return '<tr><td class="nm">' + esc(n) + '</td>' + z(x.jad) + z(x.hadir) + z(x.telat) + z(x.cepat) + z(x.absen) + z(x.cuti) +
          '<td class="num mono">' + C.fmtDurasi(x.ms) + '</td></tr>';
      }).join('') + '</tbody>';

    var rows = semuaBaris.filter(function (b) { return !S.rNama || b.s.nama === S.rNama; });
    $('#tb-rekap').innerHTML = '<thead><tr><th>Tgl</th><th class="hide-s">Hari</th><th>Petugas</th><th>Shift</th><th class="hide-s">Jadwal</th><th>Masuk</th><th>Pulang</th><th class="hide-s">Durasi</th><th>Status</th><th></th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (b) {
        var s = b.s, rec = b.rec, dow = C.dowTgl(s.tgl);
        return '<tr><td class="mono">' + C.fmtTglPendek(s.tgl) + '</td><td class="hide-s mono">' + C.HARI_PENDEK[dow] + '</td>' +
          '<td>' + esc(s.nama) + '</td><td>' + judulTag(s.shift) + '</td>' +
          '<td class="hide-s mono">' + jamJadwal(s.pola.mulai) + '–' + jamJadwal(s.pola.selesai) + '</td>' +
          '<td class="mono">' + (rec && rec.masuk ? jamDenganTgl(rec.masuk, s.tgl) : '–') + '</td>' +
          '<td class="mono">' + (rec && rec.pulang ? jamDenganTgl(rec.pulang, s.tgl) : '–') + '</td>' +
          '<td class="hide-s mono">' + (b.n.durasi ? C.fmtDurasi(b.n.durasi) : '–') + '</td>' +
          '<td class="n-' + b.n.nada + '">' + esc(b.n.label) + (rec && rec.catatan ? '<span class="sub">' + esc(rec.catatan) + '</span>' : '') + '</td>' +
          '<td class="act"><button class="link" type="button" data-koreksi="' + esc(s.tgl + '|' + s.nama + '|' + s.shift) + '">Koreksi</button></td></tr>';
      }).join('') : '<tr><td colspan="10" class="kosong-teks">Belum ada shift yang dimulai pada bulan ini.</td></tr>') + '</tbody>';
  }

  function csv() {
    var bk = bulanTerpilih();
    var rows = barisRekap(bk).filter(function (b) { return !S.rNama || b.s.nama === S.rNama; }).reverse();
    var tg = function (ms) { return ms ? C.tglDari(ms) + ' ' + C.fmtJam(ms) : ''; };
    var q = function (v) { v = String(v == null ? '' : v); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var out = [['tanggal', 'hari', 'petugas', 'shift', 'jadwal_mulai', 'jadwal_selesai', 'masuk', 'pulang', 'durasi_menit', 'telat_menit', 'pulang_cepat_menit', 'status', 'catatan']];
    rows.forEach(function (b) {
      out.push([b.s.tgl, C.namaHari(b.s.tgl), b.s.nama, b.s.shift, tg(b.s.mulai), tg(b.s.selesai),
        tg(b.rec && b.rec.masuk), tg(b.rec && b.rec.pulang), b.n.durasi ? Math.round(b.n.durasi / 60000) : '',
        b.n.telat || 0, b.n.cepat || 0, b.n.label, b.rec && b.rec.catatan || '']);
    });
    var blob = new Blob(['﻿' + out.map(function (r) { return r.map(q).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rekap-absen-noc-' + bk + (S.rNama ? '-' + S.rNama.toLowerCase() : '') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ---------- koreksi admin ---------- */
  var K = null; // {tgl,nama,shift}
  function dtLokal(ms) { // epoch -> 'YYYY-MM-DDTHH:MM' (WIB)
    if (!ms) return '';
    var w = C.wib(ms);
    return C.tglKey(w.y, w.m, w.d) + 'T' + p2(w.h) + ':' + p2(w.mi);
  }
  function dtKeMs(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - C.WIB : null;
  }
  function bukaKoreksi(kode) {
    var a = kode.split('|');
    K = { tgl: a[0], nama: a[1], shift: a[2] };
    var rec = recOf(K.tgl, K.nama) || {};
    var s = C.buatShift(J, K.tgl, K.shift, K.nama);
    $('#k-info').textContent = K.nama + ' · ' + K.shift.toUpperCase() + ' · ' + C.fmtTglPendek(K.tgl) + ' · jadwal ' + jamJadwal(s.pola.mulai) + '–' + jamJadwal(s.pola.selesai);
    $('#k-status').value = ['izin', 'sakit', 'cuti'].indexOf(rec.status) >= 0 ? rec.status : 'hadir';
    $('#k-masuk').value = rec.masuk ? dtLokal(rec.masuk) : '';
    $('#k-pulang').value = rec.pulang ? dtLokal(rec.pulang) : '';
    $('#k-catatan').value = rec.catatan || '';
    $('#k-pin').value = '';
    $('#k-pin-wrap').hidden = S.mode !== 'server';
    $('#k-hapus').hidden = !recOf(K.tgl, K.nama);
    $('#k-pesan').textContent = '';
    toggleWaktu();
    $('#dlg-koreksi').showModal();
  }
  function toggleWaktu() {
    var h = $('#k-status').value === 'hadir';
    $('#k-masuk').disabled = $('#k-pulang').disabled = !h;
  }
  function kirimKoreksi(aksi) {
    if (!K) return;
    var status = $('#k-status').value;
    var body = {
      aksi: aksi, nama: K.nama, tgl: K.tgl, shift: K.shift, status: status,
      masuk: status === 'hadir' ? dtKeMs($('#k-masuk').value) : null,
      pulang: status === 'hadir' ? dtKeMs($('#k-pulang').value) : null,
      catatan: $('#k-catatan').value.trim()
    };
    var km = $('#k-pesan');
    if (aksi === 'koreksi' && status === 'hadir' && !body.masuk) { km.textContent = 'Isi jam masuk (atau pilih status izin/sakit/cuti).'; km.className = 'pesan bad'; return; }
    if (body.masuk && body.pulang && body.pulang < body.masuk) { km.textContent = 'Jam pulang tidak boleh lebih awal dari jam masuk.'; km.className = 'pesan bad'; return; }
    if (S.mode === 'lokal') {
      var key = C.kunci(K.tgl, K.nama);
      if (aksi === 'hapus') delete S.recs[key];
      else S.recs[key] = { tgl: K.tgl, nama: K.nama, shift: K.shift, status: status, masuk: body.masuk, pulang: body.pulang, catatan: body.catatan, koreksi: true };
      saveLokal(); $('#dlg-koreksi').close(); semua();
      return;
    }
    body.admin = $('#k-pin').value.trim();
    if (!body.admin) { km.textContent = 'Masukkan PIN admin.'; km.className = 'pesan bad'; return; }
    fetch('/api/absen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) { km.textContent = j.pesan || 'Gagal menyimpan.'; km.className = 'pesan bad'; return; }
        $('#dlg-koreksi').close();
        return segarkan();
      }, function () { km.textContent = 'Tidak bisa menghubungi server.'; km.className = 'pesan bad'; });
  }

  /* ---------- tab & render semua ---------- */
  function pilihTab(t) {
    S.tab = t;
    ['absen', 'jadwal', 'rekap'].forEach(function (k) {
      $('#v-' + k).hidden = k !== t;
      $('#t-' + k).setAttribute('aria-selected', String(k === t));
    });
    semua();
    try { history.replaceState(null, '', '#' + t); } catch (e) { /* abaikan */ }
  }
  function semua() {
    banner();
    renderJam();
    $('#bulan-label').textContent = labelBulan(bulanTerpilih());
    if (S.tab === 'absen') renderAbsen();
    else if (S.tab === 'jadwal') renderJadwal();
    else renderRekap();
  }

  /* ---------- pasang event ---------- */
  function pasang() {
    ['absen', 'jadwal', 'rekap'].forEach(function (k) {
      $('#t-' + k).addEventListener('click', function () { pilihTab(k); });
    });
    $('#roster').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-nama]');
      if (!b) return;
      S.nama = b.getAttribute('data-nama');
      lsSet('noc-nama', S.nama);
      pesan('');
      renderAbsen();
      if (S.mode === 'server') $('#pin').focus();
    });
    $('#b-masuk').addEventListener('click', function () { kirimAksi('masuk'); });
    $('#b-pulang').addEventListener('click', function () { kirimAksi('pulang'); });
    $('#pin').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      if (!$('#b-masuk').disabled) kirimAksi('masuk'); else if (!$('#b-pulang').disabled) kirimAksi('pulang');
    });
    $('#dlg-konfirm').addEventListener('close', function () {
      if (this.returnValue === 'ya') kirimAksi('pulang', true);
    });
    $('#f-jadwal').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-n]');
      if (!b) return;
      S.sorot = b.getAttribute('data-n'); renderJadwal();
    });
    $('#r-bulan').addEventListener('change', function () { S.rBulan = this.value; semua(); });
    $('#r-nama').addEventListener('change', function () { S.rNama = this.value; renderRekap(); });
    $('#r-csv').addEventListener('click', csv);
    $('#tb-rekap').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-koreksi]');
      if (b) bukaKoreksi(b.getAttribute('data-koreksi'));
    });
    $('#k-status').addEventListener('change', toggleWaktu);
    $('#k-batal').addEventListener('click', function () { $('#dlg-koreksi').close(); });
    $('#f-koreksi').addEventListener('submit', function (e) { e.preventDefault(); kirimKoreksi('koreksi'); });
    $('#k-hapus').addEventListener('click', function () {
      if (window.confirm('Hapus catatan absen ini?')) kirimKoreksi('hapus');
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { segarkan(); semua(); } });
  }

  /* ---------- mulai ---------- */
  function mulai() {
    pasang();
    var awal = (location.hash || '').replace('#', '');
    var simpan = lsGet('noc-nama');
    if (simpan && J.petugas.indexOf(simpan) >= 0) S.nama = simpan;

    ambilServer().then(function () { S.mode = 'server'; }, function () { S.mode = 'lokal'; loadLokal(); })
      .then(function () {
        pilihTab(['absen', 'jadwal', 'rekap'].indexOf(awal) >= 0 ? awal : 'absen');
        var n = 0;
        setInterval(function () {
          renderJam(); n++;
          if (n % 10 === 0 && S.tab === 'absen') renderAbsen();
          if (n % 30 === 0) segarkan();
        }, 1000);
      });
  }

  fetch('/jadwal.json').then(function (r) { return r.json(); }).then(function (d) { J = d; mulai(); }, function () {
    document.body.insertAdjacentHTML('afterbegin', '<p style="padding:24px">Gagal memuat jadwal.json</p>');
  });
})();
