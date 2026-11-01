#!/usr/bin/env node
// Tạo tài nguyên cho Bé Học Vui: tải hình Twemoji còn thiếu vào img/ và đọc mọi câu nói
// thành file âm thanh trong audio/ bằng giọng Linh của macOS.
//
//   node tools/build.js
//
// Chạy lại sau mỗi lần sửa content.js: chỉ tạo phần còn thiếu và xóa âm thanh không còn dùng.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFile } = require('child_process');
const { promisify } = require('util');

const run = promisify(execFile);
const ROOT = path.join(__dirname, '..');
const TWEMOJI = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/';
const VOICE = 'Linh';
const RATE = '150';   // chậm hơn mặc định một chút cho bé dễ nghe
const WORKERS = 6;

function loadContent() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8'), ctx);
  return ctx.CONTENT;
}

async function fetchEmoji(C) {
  const dir = path.join(ROOT, 'img');
  fs.mkdirSync(dir, { recursive: true });
  const names = [...new Set(C.allEmoji().map(C.emojiFile))];
  let added = 0;
  for (const name of names) {
    const file = path.join(dir, name + '.svg');
    if (fs.existsSync(file)) continue;
    const res = await fetch(TWEMOJI + name + '.svg');
    const svg = res.ok ? await res.text() : '';
    if (!svg.startsWith('<svg')) {
      console.warn(`  Không tải được hình ${name} (${res.status})`);
      continue;
    }
    fs.writeFileSync(file, svg);
    added++;
  }
  console.log(`Hình: ${names.length} cái, tải mới ${added}.`);
}

async function makeAudio(C) {
  const dir = path.join(ROOT, 'audio');
  fs.mkdirSync(dir, { recursive: true });
  const phrases = C.allPhrases();
  const want = new Map(phrases.map(t => [C.hash(t) + '.m4a', t]));
  if (want.size !== phrases.length) throw new Error('Hai câu nói khác nhau trùng mã hash');

  const todo = [...want].filter(([file]) => !fs.existsSync(path.join(dir, file)));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'be-hoc-vui-'));
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const [file, text] = todo[next++];
      const aiff = path.join(tmp, file + '.aiff');
      await run('say', ['-v', VOICE, '-r', RATE, '-o', aiff, text]);
      await run('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '32000', aiff, path.join(dir, file)]);
      fs.unlinkSync(aiff);
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));
  fs.rmSync(tmp, { recursive: true, force: true });

  let removed = 0;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.m4a') && !want.has(f)) {
      fs.unlinkSync(path.join(dir, f));
      removed++;
    }
  }
  console.log(`Âm thanh: ${want.size} câu, tạo mới ${todo.length}, xóa ${removed}.`);
}

(async () => {
  const C = loadContent();
  await fetchEmoji(C);
  await makeAudio(C);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
