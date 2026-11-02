/* Service worker của Bé Học Vui: lưu sẵn app, hình và giọng đọc trên máy (tivi), để mở lại nhanh và chơi được
   khi mạng chập chờn.
   - Trang (index.html), danh sách giọng đọc: lấy mạng trước, mất mạng thì dùng bản đã lưu.
   - app.js, content.js, style.css, polyfills.js: có mã phiên bản (?v=…) thì dùng bản đã lưu; không có thì mạng trước.
   - Hình (img/) và giọng đọc (audio/): tên tệp không đổi nội dung, nên dùng bản đã lưu, chưa có mới tải.
   - api/ (đồng bộ hồ sơ): luôn đi mạng, không lưu.
   Gỡ service worker: mở trang với ?nosw. */
'use strict';

const SHELL = 'bhv-shell-v1';
const MEDIA = 'bhv-media-v1';
const MEDIA_MAX = 2500;   // số tệp hình + giọng tối đa (giọng ~15 KB/tệp)

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== MEDIA).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(req) {
  return fetch(req).then(res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(SHELL).then(c => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || Response.error()));
}

function cacheFirst(req, cacheName) {
  return caches.match(req).then(hit => {
    if (hit) return hit;
    return fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(cacheName).then(c => c.put(req, copy));
      }
      return res;
    });
  });
}

let trimTimer = null;
function trimMedia() {
  clearTimeout(trimTimer);
  trimTimer = setTimeout(() => {
    caches.open(MEDIA).then(c => c.keys().then(keys => {
      const extra = keys.length - MEDIA_MAX;
      for (let i = 0; i < extra; i++) c.delete(keys[i]);
    }));
  }, 5000);
}

// Giọng đọc: thẻ <audio> hay gửi yêu cầu theo đoạn (Range). Không lưu được câu trả lời một phần (206),
// nên tải cả tệp (200), lưu lại, rồi trả cả tệp cho thẻ <audio>.
function media(req) {
  const url = req.url.split('#')[0];
  return caches.match(url).then(hit => {
    if (hit) return hit;
    return fetch(url).then(res => {
      if (res && res.ok && res.status === 200) {
        const copy = res.clone();
        caches.open(MEDIA).then(c => c.put(url, copy)).then(trimMedia);
      }
      return res;
    }).catch(() => fetch(req));
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // phông chữ Google… để trình duyệt tự lo
  const path = url.pathname;
  if (/\/api\//.test(path)) return;                            // đồng bộ hồ sơ: luôn đi mạng
  if (/\/(img|audio)\/[^/]+\.(svg|m4a)$/.test(path)) {
    event.respondWith(media(req));
    return;
  }
  if (req.mode === 'navigate' || /\/(index\.html)?$/.test(path) || /list\.json$/.test(path)) {
    event.respondWith(networkFirst(req));
    return;
  }
  if (/\.(js|css)$/.test(path)) {
    event.respondWith(url.searchParams.has('v') ? cacheFirst(req, SHELL) : networkFirst(req));
  }
});
