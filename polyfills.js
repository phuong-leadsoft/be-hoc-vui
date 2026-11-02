/* Bổ sung cho trình duyệt tivi đời cũ (Chromium 63–79: LG webOS 4–5, Samsung Tizen 5–5.5…).
   Viết bằng ES5 để chạy được ở mọi nơi; nạp trước content.js và app.js. */
(function () {
  'use strict';

  if (typeof window.globalThis === 'undefined') window.globalThis = window;

  if (!Object.fromEntries) {
    Object.fromEntries = function (list) {
      var o = {};
      Array.prototype.forEach.call(Array.from(list), function (kv) { o[kv[0]] = kv[1]; });
      return o;
    };
  }

  if (!Array.prototype.flat) {
    Object.defineProperty(Array.prototype, 'flat', {
      configurable: true, writable: true,
      value: function (depth) {
        var d = depth === undefined ? 1 : Number(depth);
        return d < 1 ? Array.prototype.slice.call(this) : Array.prototype.reduce.call(this, function (acc, v) {
          return acc.concat(Array.isArray(v) ? v.flat(d - 1) : [v]);
        }, []);
      },
    });
  }
  if (!Array.prototype.flatMap) {
    Object.defineProperty(Array.prototype, 'flatMap', {
      configurable: true, writable: true,
      value: function (fn, thisArg) { return Array.prototype.map.call(this, fn, thisArg).flat(1); },
    });
  }

  if (window.Promise && !Promise.prototype.finally) {
    Promise.prototype.finally = function (fn) {
      return this.then(function (v) { return Promise.resolve(fn()).then(function () { return v; }); },
        function (e) { return Promise.resolve(fn()).then(function () { throw e; }); });
    };
  }

  if (window.Element && !Element.prototype.remove) {
    Element.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
  }

  var root = document.documentElement;

  // Cỡ chữ gốc (rem) co theo màn hình. CSS dùng clamp()/min() (Chromium 79+); trình duyệt cũ thì tính bằng JS.
  var cssOk = window.CSS && CSS.supports && CSS.supports('font-size', 'clamp(1px, 1px, 2px)');
  if (!cssOk) {
    var fit = function () {
      var w = window.innerWidth;
      var h = window.innerHeight;
      var portrait = h > w;
      var v = portrait ? Math.min(w * 0.024, h * 0.015) : Math.min(w * 0.016, h * 0.028);
      var px = portrait ? Math.max(8, Math.min(30, v)) : Math.max(9, Math.min(44, v));
      root.style.fontSize = px + 'px';
    };
    fit();
    window.addEventListener('resize', fit);
  }

  // Khoảng cách "gap" trong flexbox (Chromium 84+): thiếu thì gắn class no-gap để CSS dùng margin thay thế.
  var box = document.createElement('div');
  box.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
  box.appendChild(document.createElement('div'));
  box.appendChild(document.createElement('div'));
  root.appendChild(box);
  if (box.scrollHeight !== 1) root.className += ' no-gap';
  root.removeChild(box);
})();
