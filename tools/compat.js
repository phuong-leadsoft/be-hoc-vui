#!/usr/bin/env node
// Giữ cho app chạy được trên trình duyệt tivi đời cũ (Chromium 63+).
//
//   node tools/compat.js          kiểm tra; báo lỗi và thoát mã 1 nếu có vấn đề
//   node tools/compat.js --fix    tạo lại khối CSS dự phòng cho "gap" ở cuối style.css
//
// Kiểm tra:
//  - JS chỉ dùng cú pháp tới ES2018 (không ?. ?? catch{} …), không regex \p{…}, không API mới chưa có polyfill.
//  - CSS không dùng inset:, clamp()/min()/max() (trừ dòng cỡ chữ gốc đã có dự phòng bằng JS), :is()/:where().
//  - Mọi khối CSS dùng "gap" đều có quy tắc dự phòng .no-gap (polyfills.js gắn class này khi trình duyệt không hỗ trợ).
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const problems = [];

/* ---------- JS ---------- */

function stripStringsAndComments(src) {
  // Đủ dùng cho việc dò cú pháp: bỏ chú thích, giữ nguyên chuỗi (vì regex và template có thể nằm trong đó).
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const JS_RULES = [
  [/\?\.[\w([]/, 'optional chaining ?. (Chromium 80)'],
  [/[^?]\?\?[^?]/, 'nullish ?? (Chromium 80)'],
  [/catch\s*\{/, 'catch không có biến (Chromium 66)'],
  [/\/[^/\n]*\\p\{[^/\n]*\/\w*u/, 'regex \\p{…} (Chromium 64) — tạo bằng new RegExp lúc chạy'],
  [/\.matchAll\(/, 'String.matchAll (Chromium 73)'],
  [/\.replaceAll\(/, 'String.replaceAll (Chromium 85)'],
  [/Promise\.allSettled|Promise\.any/, 'Promise.allSettled/any (Chromium 76/85)'],
  [/structuredClone|\.at\(-?\d/, 'structuredClone / Array.at (Chromium 92+)'],
  [/\?\?=|\|\|=|&&=/, 'toán tử gán logic (Chromium 85)'],
  [/\.#\w|^\s*(static\s+)?#\w+\s*[=;(]/, 'trường private của class (Chromium 74+)'],
];

for (const f of ['app.js', 'content.js', 'polyfills.js', 'perfhud.js']) {
  const lines = stripStringsAndComments(read(f)).split('\n');
  lines.forEach((line, i) => {
    for (const [re, what] of JS_RULES) {
      if (re.test(line) && !/compat-ok/.test(line)) problems.push(`${f}:${i + 1}: ${what}\n    ${line.trim().slice(0, 120)}`);
    }
  });
}

// polyfills.js (chạy trước mọi thứ) và perfhud.js (để đo trên tivi đời cũ) phải là ES5 thuần.
for (const f of ['polyfills.js', 'perfhud.js']) {
  const src = stripStringsAndComments(read(f));
  [[/=>/, 'hàm mũi tên'], [/\b(let|const)\s/, 'let/const'], [/`/, 'template string'], [/\.\.\./, 'spread']].forEach(([re, what]) => {
    if (re.test(src)) problems.push(`${f}: phải viết ES5, đang dùng ${what}`);
  });
}

// Kiểm tra cú pháp: dịch thử từng tệp (Node hiểu mọi cú pháp mới, nên đây chỉ bắt lỗi gõ sai).
for (const f of ['app.js', 'content.js', 'polyfills.js', 'perfhud.js', 'sw.js']) {
  try {
    new Function(read(f)); // eslint-disable-line no-new-func
  } catch (e) {
    problems.push(`${f}: lỗi cú pháp: ${e.message}`);
  }
}

/* ---------- CSS ---------- */

const CSS_FILE = 'style.css';
const START = '/* ---------- Dự phòng "gap" cho trình duyệt cũ (tạo bởi tools/compat.js --fix) ---------- */';
const END = '/* ---------- Hết dự phòng "gap" ---------- */';
let css = read(CSS_FILE);
const body = css.includes(START) ? css.slice(0, css.indexOf(START)) + css.slice(css.indexOf(END) + END.length) : css;

body.split('\n').forEach((line, i) => {
  if (/(^|[\s;{])inset\s*:/.test(line)) problems.push(`${CSS_FILE}:${i + 1}: inset: (Chromium 87) — viết top/right/bottom/left`);
  if (/\b(clamp|min|max)\(/.test(line) && !/^\s*html\s*\{\s*font-size:\s*clamp/.test(line)) {
    problems.push(`${CSS_FILE}:${i + 1}: clamp()/min()/max() (Chromium 79)\n    ${line.trim().slice(0, 120)}`);
  }
  if (/:is\(|:where\(|:has\(/.test(line)) problems.push(`${CSS_FILE}:${i + 1}: :is()/:where()/:has()`);
});

// Gom các khối có "gap:" (không tính trong @keyframes); chỉ lấy khối cấp ngoài cùng và trong @media đơn giản.
function gapRules(src) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const decl = m[2];
    const g = /(^|[;\s])gap:\s*([^;]+)/.exec(decl);
    if (!g || sel.startsWith('@') || /^(from|to|\d+%)/.test(sel)) continue;
    const first = g[2].trim().split(/\s+/)[0];
    const sels = sel.split(',').map(s => s.trim()).filter(Boolean);
    out.push({ sels, half: `calc(${first} / 2)`, gap: first });
  }
  return out;
}

const rules = gapRules(body.replace(/@media[^{]+\{([\s\S]*?\})\s*\}/g, '$1'));
const block = [START,
  '/* Trình duyệt không hỗ trợ gap trong flexbox: mỗi phần tử con cách nhau bằng margin một nửa khoảng gap. */',
  ...rules.map(r => `${r.sels.map(s => `.no-gap ${s} > *`).join(', ')} { margin: ${r.half}; }`),
  END].join('\n');

if (process.argv.includes('--fix')) {
  css = body.replace(/\s*$/, '\n\n') + block + '\n';
  fs.writeFileSync(path.join(ROOT, CSS_FILE), css);
  console.log(`Đã ghi ${rules.length} quy tắc dự phòng gap vào ${CSS_FILE}.`);
} else if (!css.includes(block)) {
  problems.push(`${CSS_FILE}: khối dự phòng "gap" chưa khớp với CSS hiện tại — chạy: node tools/compat.js --fix`);
}

if (problems.length) {
  console.error(`Có ${problems.length} vấn đề tương thích:\n` + problems.map(p => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log('Tương thích trình duyệt cũ: OK');
