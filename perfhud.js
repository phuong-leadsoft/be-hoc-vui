/* Bảng đo hiệu năng: mở trang với ?perf (ví dụ https://…/be-hoc-vui/?perf).
   Hiện ở góc trên bên trái: số hình/giây, số lần khựng, thông tin máy (chip đồ họa, độ phân giải),
   trạng thái hiệu ứng và âm thanh, nhật ký phát giọng đọc. Chụp ảnh bảng này gửi lại để tìm chỗ chậm trên tivi.
   Viết ES5 để chạy được trên tivi đời cũ. */
(function () {
  'use strict';

  var I = window.BHV_INTERNAL || {};
  var box = document.createElement('div');
  box.id = 'perfhud';
  box.style.cssText = 'position:fixed;left:4px;top:4px;z-index:9999;max-width:46vw;padding:6px 8px;border-radius:8px;' +
    'background:rgba(15,23,42,.82);color:#e2e8f0;font:12px/1.35 monospace;white-space:pre-wrap;pointer-events:none';
  document.body.appendChild(box);

  function gpu() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return 'không có WebGL';
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch (e) {
      return 'lỗi: ' + e.message;
    }
  }
  var info = 'GPU: ' + gpu() + '\nMàn: ' + innerWidth + 'x' + innerHeight + ' @' + (window.devicePixelRatio || 1) +
    '\nUA: ' + navigator.userAgent.replace(/Mozilla\/5\.0 /, '').slice(0, 110);

  // Đo khung hình: số hình/giây trung bình mỗi giây, khung chậm nhất trong 10 giây, số lần khựng (> 50 ms).
  var frames = [];
  var last = performance.now();
  var jank = 0;
  var worst = 0;
  var worstAt = 0;
  function frame(t) {
    var d = t - last;
    last = t;
    frames.push(t);
    if (d > 50) jank++;
    if (d > worst || t - worstAt > 10000) {
      worst = d;
      worstAt = t;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function render() {
    var now = performance.now();
    while (frames.length && frames[0] < now - 1000) frames.shift();
    var Fx = I.Fx;
    var Sfx = I.Sfx;
    var lines = [
      'Hình/giây: ' + frames.length + '   khựng >50ms: ' + jank + '   chậm nhất (10s): ' + Math.round(worst) + ' ms',
      Fx ? 'Hiệu ứng: ' + (Fx.lite ? 'nhẹ' : 'đầy đủ') + ' · mảnh ' + Fx.parts.length + ' · chất lượng ' + Fx.quality.toFixed(2) +
        ' · khung vẽ x' + Fx.dpr : '',
      Sfx ? 'Âm thanh: ' + (Sfx.ctx ? Sfx.ctx.state + ' ' + Sfx.ctx.sampleRate + 'Hz · tạo sẵn ' + Object.keys(Sfx.baked).length + ' tiếng' +
        (Sfx.ctx.baseLatency !== undefined ? ' · trễ ' + Math.round(Sfx.ctx.baseLatency * 1000) + 'ms' : '') : 'chưa bật') : '',
      'Bộ nhớ đệm: ' + (navigator.serviceWorker && navigator.serviceWorker.controller ? 'đang dùng' : 'chưa'),
      (performance.memory ? 'JS heap: ' + Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : ''),
      info,
    ];
    var log = I.audioLog || [];
    if (log.length) {
      lines.push('Giọng đọc (mới nhất ở dưới):');
      for (var i = Math.max(0, log.length - 8); i < log.length; i++) {
        lines.push('  ' + (log[i].t / 1000).toFixed(1) + 's ' + log[i].ev + ' · ' + log[i].text);
      }
    }
    box.textContent = lines.filter(Boolean).join('\n');
  }
  setInterval(render, 500);
  render();
})();
