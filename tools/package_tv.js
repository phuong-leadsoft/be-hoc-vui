#!/usr/bin/env node
// Đóng gói Bé Học Vui thành app webOS (.ipk) để cài lên tivi LG qua Developer Mode.
// App chứa sẵn toàn bộ hình và giọng đọc, và đồng bộ hồ sơ với serve.py khi máy Mac bật.
//
//   node tools/package_tv.js [địa chỉ máy chủ]    # mặc định http://<IP máy này>:8080/
//
// Kết quả: dist/<id>_<version>_all.ipk. Cài bằng: ares-install -d tv dist/<file>.ipk
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const STAGE = path.join(OUT, 'tv');
const APP_ID = 'vn.behocvui.tv';
const VERSION = '1.0.0';
const FILES = ['style.css', 'app.js', 'content.js', 'audio', 'img'];
const ICONS = { 'icon.png': 80, 'largeIcon.png': 130 };

function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal && /^(192\.168|10\.|172\.)/.test(a.address)) return a.address;
    }
  }
  return 'localhost';
}

function aresPackage() {
  const local = path.join(ROOT, '..', 'webos-cli', 'node_modules', '.bin', 'ares-package');
  return fs.existsSync(local) ? local : 'ares-package';
}

// Vẽ tools/icon.svg ra PNG bằng Quick Look của macOS.
function renderIcons() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bhv-icon-'));
  for (const [name, size] of Object.entries(ICONS)) {
    execFileSync('qlmanage', ['-t', '-s', String(size), '-o', tmp, path.join(__dirname, 'icon.svg')], { stdio: 'ignore' });
    fs.renameSync(path.join(tmp, 'icon.svg.png'), path.join(STAGE, name));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

const server = process.argv[2] || `http://${lanIp()}:8080/`;

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
for (const f of FILES) fs.cpSync(path.join(ROOT, f), path.join(STAGE, f), { recursive: true });

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace('<script src="content.js">', `<script>window.BHV_SERVER = ${JSON.stringify(server.replace(/\/?$/, '/'))};</script>\n<script src="content.js">`);
fs.writeFileSync(path.join(STAGE, 'index.html'), html);

fs.writeFileSync(path.join(STAGE, 'appinfo.json'), JSON.stringify({
  id: APP_ID,
  version: VERSION,
  vendor: 'Bé Học Vui',
  type: 'web',
  main: 'index.html',
  title: 'Bé Học Vui',
  icon: 'icon.png',
  largeIcon: 'largeIcon.png',
  bgColor: '#5bc2f5',
  resolution: '1920x1080',
  disableBackHistoryAPI: true,
  requiredACG: [],
}, null, 2));

renderIcons();
execFileSync(aresPackage(), [STAGE, '-o', OUT], { stdio: 'inherit' });
console.log(`Máy chủ đồng bộ: ${server}`);
