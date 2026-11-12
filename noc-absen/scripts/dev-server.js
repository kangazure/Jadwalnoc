// Server lokal: melayani public/ dan /api/absen tanpa Vercel CLI.
//   npm run dev          -> mode lokal (tanpa database, API menjawab storage:false)
//   npm run dev:memori   -> API aktif dengan penyimpanan memori (hilang saat server mati)
//                           PIN contoh: lihat bawah; NOC_DEV_NOW=ISO untuk memalsukan jam server.
const http = require('http');
const fs = require('fs');
const path = require('path');

if (process.env.NOC_DEV_MEMORY === '1') {
  process.env.NOC_PINS = process.env.NOC_PINS || 'Sandi=1111,Yanto=2222,Rizky=3333,Rufli=4444';
  process.env.NOC_ADMIN_PIN = process.env.NOC_ADMIN_PIN || '9999';
  console.log('Mode memori. PIN: Sandi=1111 Yanto=2222 Rizky=3333 Rufli=4444, admin=9999');
}
const api = require('../api/absen.js');
const ROOT = path.join(__dirname, '..', 'public');
const TIPE = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const port = process.env.PORT || 3000;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/absen') return api(req, res);
  let f = path.normalize(path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('404'); }
  res.setHeader('Content-Type', TIPE[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log('http://localhost:' + port));
