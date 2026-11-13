(function () {
  'use strict';
  var C = window.Core;
  var J = null;
  var S = { tab: 'hari', tgl: null, sorot: '', bulan: '' };

  var $ = function (s) { return document.querySelector(s); };
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var now = function () { return Date.now(); };

  /* jam gaya jadwal: 24:30 = lewat tengah malam */
  function jamJadwal(min) {
    if (min >= 1440 + 360) min -= 1440;
    return p2(Math.floor(min / 60)) + ':' + p2(min % 60);
  }
  function tag(sh) { return '<span class="tag ' + sh + '">' + sh + '</span>'; }
  function labelBulan(k) { var a = k.split('-'); return C.BULAN[+a[1] - 1] + ' ' + a[0]; }
  function bulanTerpilih() {
    var ks = Object.keys(J.bulan).sort();
    if (S.bulan && J.bulan[S.bulan]) return S.bulan;
    var skr = C.tglDari(now()).slice(0, 7);
    return J.bulan[skr] ? skr : ks[ks.length - 1];
  }

  /* ---------- kop ---------- */
  function renderJam() {
    var t = now();
    $('#jam-hm').textContent = C.fmtJam(t);
    $('#jam-s').textContent = ':' + C.fmtJamDetik(t).slice(6);
    $('#tgl-ket').textContent = C.fmtTglPanjang(C.tglDari(t));
  }

  /* ---------- hari ini ---------- */
  function renderHari() {
    var hariIni = C.tglDari(now()), tgl = S.tgl || hariIni, t = now();
    var adalah = tgl === hariIni;
    $('#h-judul').textContent = adalah ? 'Jaga hari ini' : 'Jaga pada';
    $('#h-tgl').textContent = C.fmtTglPanjang(tgl);
    $('#h-kini').disabled = adalah;

    // shift malam kemarin yang masih berjalan pagi ini
    var lanjut = '';
    if (adalah) {
      C.shiftDi(J, C.geserTgl(tgl, -1)).forEach(function (s) {
        if (s.shift === 'malam' && s.mulai <= t && t < s.selesai)
          lanjut += '<div>Masih berjalan: <b>' + esc(s.nama) + '</b> (malam ' + C.fmtTglPendek(s.tgl) + '), sampai ' + C.fmtJam(s.selesai) + '.</div>';
      });
    }
    $('#h-lanjut').hidden = !lanjut;
    $('#h-lanjut').innerHTML = lanjut;

    var h = C.hariJadwal(J, tgl);
    if (!h) {
      $('#papan').innerHTML = '<li><span class="kosong-teks">Jadwal untuk tanggal ini belum tersedia.</span></li>';
      return;
    }
    var rows = C.SHIFTS.map(function (sh) {
      var po = C.pola(J, sh, tgl), s = (h[sh] || []).length ? C.buatShift(J, tgl, sh, h[sh][0]) : null;
      var jalan = adalah && s && s.mulai <= t && t < s.selesai;
      return '<li class="' + (jalan ? 'jalan' : '') + '"><div class="wkt">' + tag(sh) + '<span class="jam-s">' + jamJadwal(po.mulai) + ' – ' + jamJadwal(po.selesai) + '</span></div>' +
        '<div class="org">' + (h[sh] || []).map(esc).join('<i>·</i>') + '</div>' +
        '<div class="ket">' + (jalan ? 'Sedang jaga' : '') + '</div></li>';
    }).join('');
    var lib = h.libur || [];
    rows += '<li class="libur"><div class="wkt"><span class="tag">libur</span></div><div class="org">' +
      (lib.length ? lib.map(esc).join('<i>·</i>') : '–') + '</div><div class="ket"></div></li>';
    $('#papan').innerHTML = rows;
  }

  /* ---------- jadwal bulan ---------- */
  function runHari(daftar) {
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
    $('#j-bulan').innerHTML = Object.keys(J.bulan).sort().map(function (k) {
      return '<option value="' + k + '"' + (k === bk ? ' selected' : '') + '>' + labelBulan(k) + '</option>';
    }).join('');
    $('#j-bulan').hidden = Object.keys(J.bulan).length < 2;
    $('#f-jadwal').innerHTML = [''].concat(J.petugas).map(function (n) {
      return '<button type="button" data-n="' + esc(n) + '" aria-pressed="' + (S.sorot === n) + '">' + (n ? esc(n) : 'Semua') + '</button>';
    }).join('');
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
      return '<tr id="tgl-' + d + '" class="' + ((dow === 0 || dow === 6) ? 'pekan ' : '') + (tgl === hariIni ? 'kini' : '') + '">' +
        '<td class="tgl">' + d + '</td><td class="hr">' + C.HARI_PENDEK[dow] + '</td>' +
        cell(v.pagi, 'pagi') + cell(v.sore, 'sore') + cell(v.malam, 'malam') + cell(v.libur, 'libur') + '</tr>';
    }).join('');
    tb.innerHTML = '<thead><tr><th>Tgl</th><th>Hari</th><th>Pagi</th><th>Sore</th><th>Malam</th><th>Libur</th></tr></thead><tbody>' + rows + '</tbody>';

    var baris = [];
    C.SHIFTS.forEach(function (sh) {
      var grup = {}, order = [];
      Object.keys(J.pola[sh]).forEach(function (hr) {
        var p = J.pola[sh][hr], key = JSON.stringify(p);
        if (!grup[key]) { grup[key] = { p: p, hari: [] }; order.push(key); }
        grup[key].hari.push(hr);
      });
      order.forEach(function (k, i) {
        var g = grup[k], p = g.p, d = function (v) { return v === '-' ? '–' : esc(v.replace('-', ' – ')); };
        baris.push('<tr><td>' + (i === 0 ? tag(sh) : '') + '</td><td>' + runHari(g.hari) + '</td><td class="mono">' + d(p.j1) +
          '</td><td class="mono">' + d(p.ist) + '</td><td class="mono">' + d(p.j2) + '</td><td class="mono num">' + String(p.total).replace('.', ',') + ' j</td></tr>');
      });
    });
    $('#tb-pola').innerHTML = '<thead><tr><th>Shift</th><th>Hari</th><th>Kerja 1</th><th>Istirahat</th><th>Kerja 2</th><th class="num">Efektif</th></tr></thead><tbody>' + baris.join('') + '</tbody>';
  }

  /* ---------- tab & event ---------- */
  function pilihTab(t) {
    S.tab = t;
    ['hari', 'jadwal'].forEach(function (k) {
      $('#v-' + k).hidden = k !== t;
      $('#t-' + k).setAttribute('aria-selected', String(k === t));
    });
    semua();
    try { history.replaceState(null, '', '#' + t); } catch (e) { /* abaikan */ }
  }
  function semua() {
    renderJam();
    $('#bulan-label').textContent = labelBulan(bulanTerpilih());
    if (S.tab === 'hari') renderHari(); else renderJadwal();
  }
  function geser(n) { S.tgl = C.geserTgl(S.tgl || C.tglDari(now()), n); renderHari(); }

  function mulai() {
    ['hari', 'jadwal'].forEach(function (k) { $('#t-' + k).addEventListener('click', function () { pilihTab(k); }); });
    $('#h-prev').addEventListener('click', function () { geser(-1); });
    $('#h-next').addEventListener('click', function () { geser(1); });
    $('#h-kini').addEventListener('click', function () { S.tgl = null; renderHari(); });
    $('#f-jadwal').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-n]');
      if (b) { S.sorot = b.getAttribute('data-n'); renderJadwal(); }
    });
    $('#j-bulan').addEventListener('change', function () { S.bulan = this.value; semua(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) semua(); });
    pilihTab((location.hash || '').replace('#', '') === 'jadwal' ? 'jadwal' : 'hari');
    var n = 0;
    setInterval(function () { renderJam(); if (++n % 30 === 0 && S.tab === 'hari') renderHari(); }, 1000);
  }

  fetch('/jadwal.json').then(function (r) { return r.json(); }).then(function (d) { J = d; mulai(); }, function () {
    document.body.insertAdjacentHTML('afterbegin', '<p style="padding:24px">Gagal memuat jadwal.json</p>');
  });
})();
