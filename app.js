/* Bé Học Vui: hồ sơ của bé, trò chơi leo tháp, âm thanh và điều khiển bằng remote.
   Câu hỏi nằm trong content.js. */
(function () {
  'use strict';

  const C = window.CONTENT;
  const { pick, shuffle } = C.util;
  const app = document.getElementById('app');

  const FLOORS = 10;
  const MILESTONES = [5, 10];
  const HEARTS = 3;
  const DAILY_GOAL = 15;        // số câu đúng ngay mỗi ngày để xong nhiệm vụ
  const COOLDOWN_MS = 3000;     // khóa đáp án sau mỗi lần sai
  const RETRY_AFTER = 2;        // câu phải dạy lại sẽ quay lại sau 2 câu
  const CONFIRM_TIMES = 3;      // nhắc "bấm chốt" ở 3 câu đầu mỗi tháp
  const LEVEL_UP = { last: 8, need: 7 };    // đúng ngay 7/8 câu gần nhất thì lên cấp
  const LEVEL_DOWN = { last: 6, max: 2 };   // chỉ đúng ngay 2/6 câu thì xuống cấp

  /* ================= Hồ sơ: lưu trong trình duyệt và (nếu có) máy chủ serve.py ================= */

  const LOCAL_KEY = 'be-hoc-vui:profiles';
  const LAST_KEY = 'be-hoc-vui:last';
  // Bản cài trên tivi chạy từ file:// nên cần địa chỉ máy chủ (tools/package_tv.js ghi vào); bản web dùng chính máy chủ đang mở.
  const API = (window.BHV_SERVER || '') + 'api/profiles';

  function readLocal(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  function writeLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* bộ nhớ bị chặn */ }
  }

  function normalizeProfile(p) {
    p.stars = p.stars || 0;
    p.stickers = p.stickers || [];
    p.skills = p.skills || {};
    p.towers = p.towers || {};
    p.days = p.days || {};
    p.streak = p.streak || { last: null, count: 0 };
    p.mission = p.mission || { date: null };
    p.plays = p.plays || 0;
    return p;
  }

  const Store = {
    all: [],          // gồm cả hồ sơ đã xóa (deleted: true) để máy khác biết mà xóa theo
    server: false,
    timers: {},

    async init() {
      const local = readLocal(LOCAL_KEY, []);
      let remote = [];
      try {
        // Máy Mac tắt thì đừng để bé chờ lâu.
        const ctrl = window.AbortController ? new AbortController() : null;
        if (ctrl) setTimeout(() => ctrl.abort(), 2500);
        const res = await fetch(API, { cache: 'no-store', signal: ctrl && ctrl.signal });
        if (res.ok) {
          remote = (await res.json()).profiles || [];
          this.server = true;
        }
      } catch (e) { /* không có máy chủ: chỉ lưu trong trình duyệt */ }

      const byId = {};
      for (const p of remote.concat(local)) {
        const cur = byId[p.id];
        if (!cur || (p.updatedAt || 0) > (cur.updatedAt || 0)) byId[p.id] = p;
      }
      this.all = Object.values(byId).map(p => (p.deleted ? p : normalizeProfile(p)));
      writeLocal(LOCAL_KEY, this.all);
      if (this.server) {
        for (const p of this.all) {
          const r = remote.find(x => x.id === p.id);
          if (!r || (r.updatedAt || 0) < (p.updatedAt || 0)) this.push(p);
        }
      }
    },

    list() {
      return this.all.filter(p => !p.deleted).sort((a, b) => a.createdAt - b.createdAt);
    },

    add(p) {
      this.all.push(p);
      this.save(p);
    },

    save(p) {
      p.updatedAt = Date.now();
      writeLocal(LOCAL_KEY, this.all);
      if (!this.server) return;
      clearTimeout(this.timers[p.id]);
      this.timers[p.id] = setTimeout(() => this.push(p), 600);
    },

    remove(p) {
      const i = this.all.indexOf(p);
      const tomb = { id: p.id, deleted: true, updatedAt: Date.now() };
      if (i >= 0) this.all[i] = tomb;
      writeLocal(LOCAL_KEY, this.all);
      if (this.server) this.push(tomb);
    },

    push(p) {
      fetch(API + '/' + encodeURIComponent(p.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      }).catch(() => { /* lần mở sau sẽ đẩy lại vì bản ở máy này mới hơn */ });
    },
  };

  let profile = null;

  function newProfile(name, avatar) {
    const now = Date.now();
    return normalizeProfile({ id: 'p' + now.toString(36) + Math.random().toString(36).slice(2, 6), name, avatar, createdAt: now, updatedAt: now });
  }

  function dayKey(daysAgo) {
    const d = new Date(Date.now() - (daysAgo || 0) * 864e5);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // Chuỗi ngày học còn giữ được nếu lần học cuối là hôm nay hoặc hôm qua.
  function streakOf(p) {
    return p.streak.last === dayKey() || p.streak.last === dayKey(1) ? p.streak.count : 0;
  }
  const todayCount = p => p.days[dayKey()] || 0;

  function skillState(id) {
    return profile.skills[id] || (profile.skills[id] = { level: 1, recent: [], total: 0, firstTry: 0 });
  }
  function towerState(id) {
    return profile.towers[id] || (profile.towers[id] = { best: 0, wins: 0, plays: 0 });
  }
  const sum = a => a.reduce((x, y) => x + y, 0);

  // Ghi lại lần chốt đầu tiên của một câu hỏi.
  function recordAttempt(skillId, firstTry, countSkill) {
    const p = profile;
    const out = { levelUp: false, missionDone: false };
    if (countSkill) {
      const st = skillState(skillId);
      const maxLevel = C.skills[skillId].maxLevel || 1;
      st.total++;
      if (firstTry) st.firstTry++;
      st.recent.push(firstTry ? 1 : 0);
      if (st.recent.length > 20) st.recent.shift();
      if (st.level < maxLevel && st.recent.length >= LEVEL_UP.last && sum(st.recent.slice(-LEVEL_UP.last)) >= LEVEL_UP.need) {
        st.level++;
        st.recent = [];
        out.levelUp = true;
      } else if (st.level > 1 && st.recent.length >= LEVEL_DOWN.last && sum(st.recent.slice(-LEVEL_DOWN.last)) <= LEVEL_DOWN.max) {
        st.level--;
        st.recent = [];
      }
    }
    if (firstTry) {
      const t = dayKey();
      p.days[t] = (p.days[t] || 0) + 1;
      const keys = Object.keys(p.days).sort();
      while (keys.length > 90) delete p.days[keys.shift()];
      if (p.streak.last !== t) {
        p.streak.count = p.streak.last === dayKey(1) ? p.streak.count + 1 : 1;
        p.streak.last = t;
      }
      if (p.days[t] >= DAILY_GOAL && p.mission.date !== t) {
        p.mission.date = t;
        out.missionDone = true;
      }
    }
    Store.save(p);
    return out;
  }

  /* ================= Âm thanh ================= */

  // Mỗi lần đổi màn hình hay câu hỏi, epoch tăng lên và các chuỗi async cũ tự dừng.
  let epoch = 0;
  function newEpoch() {
    epoch++;
    Voice.stop();
    return epoch;
  }

  const Voice = {
    audio: null,
    finish: null,

    // Đọc một câu từ file audio/<hash>.m4a; trả về Promise xong khi đọc hết (hoặc bị dừng).
    say(text) {
      this.stop();
      showBubble(text);
      return new Promise(resolve => {
        let done = false;
        let fellBack = false;
        const end = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (this.finish === end) this.finish = null;
          resolve();
        };
        const fallback = () => {
          if (done || fellBack) return;
          fellBack = true;
          speak(text, end);
        };
        const timer = setTimeout(end, 3000 + text.length * 120);
        this.finish = end;
        const a = new Audio('audio/' + C.hash(text) + '.m4a');
        this.audio = a;
        a.onended = end;
        a.onerror = fallback;
        const p = a.play();
        if (p && p.catch) p.catch(fallback);
      });
    },

    stop() {
      if (this.audio) {
        const a = this.audio;
        a.onended = a.onerror = null;
        a.pause();
        this.audio = null;
      }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (this.finish) this.finish();
    },
  };

  // Dự phòng khi thiếu file âm thanh: giọng tiếng Việt của trình duyệt, không có thì chờ bằng thời gian đọc.
  function speak(text, end) {
    const ss = window.speechSynthesis;
    const voice = ss && ss.getVoices().filter(v => /^vi/i.test(v.lang))[0];
    if (!voice || !window.SpeechSynthesisUtterance) {
      setTimeout(end, 600 + text.length * 60);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.9;
    u.onend = end;
    u.onerror = end;
    ss.speak(u);
  }

  // Hiệu ứng âm thanh tổng hợp bằng Web Audio, không cần file.
  const Sfx = {
    ctx: null,
    init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!this.ctx && AC) this.ctx = new AC();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone(freq, start, dur, type, vol, slideTo) {
      const c = this.ctx;
      if (!c) return;
      const t = c.currentTime + start;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    correct(power) {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.08, 0.28, 'triangle', 0.18));
      if (power < 2) return;
      // Kèn chiến thắng: thêm hợp âm sáng sau chuỗi nốt đi lên.
      [1047, 1319, 1568].forEach(f => this.tone(f, 0.36, 0.7, 'triangle', 0.1));
      [2093, 2637].forEach((f, i) => this.tone(f, 0.5 + i * 0.08, 0.25, 'sine', 0.06));
    },
    // Tiếng pháo nổ: tiếng ồn trắng tắt dần.
    bang() {
      const c = this.ctx;
      if (!c) return;
      if (!this.noise) {
        const len = Math.floor(c.sampleRate * 0.6);
        this.noise = c.createBuffer(1, len, c.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      }
      const src = c.createBufferSource();
      const filter = c.createBiquadFilter();
      const g = c.createGain();
      src.buffer = this.noise;
      filter.type = 'lowpass';
      filter.frequency.value = 1200 + Math.random() * 1500;
      g.gain.value = 0.3;
      src.connect(filter);
      filter.connect(g);
      g.connect(c.destination);
      src.start();
      for (let i = 0; i < 6; i++) this.tone(2500 + Math.random() * 3000, 0.15 + Math.random() * 0.5, 0.04, 'square', 0.02);
    },
    wrong() { this.tone(220, 0, 0.18, 'square', 0.05); this.tone(155, 0.16, 0.32, 'square', 0.05); },
    heart() { this.tone(440, 0, 0.5, 'sawtooth', 0.05, 180); },
    tick() { this.tone(880, 0, 0.06, 'sine', 0.08); },
    pop() { this.tone(700, 0, 0.08, 'sine', 0.12); this.tone(1200, 0.05, 0.08, 'sine', 0.08); },
    climb() { this.tone(392, 0, 0.35, 'triangle', 0.14, 784); },
    drum(sec) {
      for (let t = 0; t < sec; t += 0.07) this.tone(90 + t * 70, t, 0.06, 'triangle', 0.08 + t * 0.08);
    },
    chest() { [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone(f, i * 0.07, 0.3, 'sine', 0.12)); },
  };

  /* ================= Tiện ích giao diện ================= */

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const $ = sel => app.querySelector(sel);
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const emo = (ch, cls) => `<img class="emo ${cls || ''}" src="img/${C.emojiFile(ch)}.svg" alt="${ch}" draggable="false">`;
  const title = cls => `<h1 class="title ${cls || ''}">${['Bé', 'Học', 'Vui'].map((w, i) => `<span style="--i:${i}">${w}</span>`).join(' ')}</h1>`;
  const corner = () => '<div class="corner"><div class="owl-slot"></div><div class="bubble"></div></div>';

  function mountOwl() {
    const slot = $('.owl-slot');
    if (slot) slot.appendChild(document.getElementById('owl-tpl').content.firstElementChild.cloneNode(true));
  }

  function mood(name) {
    const o = $('.owl');
    if (!o) return;
    o.classList.remove('happy', 'think');
    if (name !== 'idle') {
      o.getBoundingClientRect();
      o.classList.add(name);
    }
  }

  function showBubble(text) {
    const b = $('.bubble');
    if (!b) return;
    b.textContent = text;
    b.classList.remove('show');
    b.getBoundingClientRect();
    b.classList.add('show');
  }

  // Hiện màn hình mới; trả về epoch của màn hình đó.
  function screen(name, html) {
    const ep = newEpoch();
    app.className = 'screen-' + name;
    app.innerHTML = html;
    mountOwl();
    return ep;
  }

  function focusFirst(sel) {
    const el = $(sel);
    if (el) el.focus();
  }

  function wiggle(el) {
    el.classList.remove('wiggle');
    el.getBoundingClientRect();
    el.classList.add('wiggle');
    Sfx.tick();
  }

  /* ================= Pháo hoa, pháo giấy (vẽ bằng canvas cho nhẹ trên tivi) ================= */

  const FX_COLORS = ['#f43f5e', '#f59e0b', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];

  const Fx = {
    canvas: null,
    ctx: null,
    dpr: 1,
    parts: [],
    running: false,
    last: 0,

    ensure() {
      if (this.canvas) return;
      const c = document.createElement('canvas');
      c.className = 'fx';
      document.body.appendChild(c);
      this.canvas = c;
      this.ctx = c.getContext('2d');
      const fit = () => {
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        c.width = Math.round(innerWidth * this.dpr);
        c.height = Math.round(innerHeight * this.dpr);
      };
      fit();
      window.addEventListener('resize', fit);
    },

    add(p) {
      if (this.parts.length < 700) this.parts.push(p);
    },

    // Pháo giấy bắn từ (x, y) theo góc a0..a1 độ (-90 = thẳng lên), tốc độ s0..s1 rem/giây.
    confetti(x, y, n, a0, a1, s0, s1) {
      this.ensure();
      const u = rem();
      for (let i = 0; i < n; i++) {
        const a = ((a0 + Math.random() * (a1 - a0)) * Math.PI) / 180;
        const s = (s0 + Math.random() * (s1 - s0)) * u;
        const r = Math.random();
        this.add({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 30 * u, drag: 0.985,
          size: (0.4 + Math.random() * 0.5) * u, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16,
          color: pick(FX_COLORS), shape: r < 0.15 ? 'star' : r < 0.65 ? 'rect' : 'dot',
          life: 1.8 + Math.random() * 1.4, fade: 0.6,
        });
      }
      this.start();
    },

    // Hai ống pháo giấy ở hai góc dưới màn hình.
    cannons(n) {
      this.confetti(0, innerHeight, n, -78, -42, 24, 38);
      this.confetti(innerWidth, innerHeight, n, -138, -102, 24, 38);
    },

    // Một quả pháo hoa nổ thành vòng tia sáng.
    firework(x, y, n) {
      this.ensure();
      const u = rem();
      const color = pick(FX_COLORS);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.12;
        const s = (8 + Math.random() * 4.5) * u;
        this.add({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 7 * u, drag: 0.94,
          size: (0.2 + Math.random() * 0.14) * u, rot: 0, vr: 0, color: Math.random() < 0.25 ? '#fff' : color,
          shape: 'spark', life: 1.1 + Math.random() * 0.7, fade: 0.5,
        });
      }
      this.start();
    },

    start() {
      if (this.running) return;
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(t => this.tick(t));
    },

    tick(t) {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      const ctx = this.ctx;
      const dpr = this.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.parts = this.parts.filter(p => (p.life -= dt) > 0);
      for (const p of this.parts) {
        const k = Math.pow(p.drag, dt * 60);
        p.vx *= k;
        p.vy = p.vy * k + p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.globalAlpha = Math.min(1, p.life / p.fade);
        ctx.fillStyle = ctx.strokeStyle = p.color;
        if (p.shape === 'spark') {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          continue;
        }
        // Xoay và lật như mảnh giấy đang bay.
        const c = Math.cos(p.rot);
        const s = Math.sin(p.rot);
        const flip = Math.cos(p.rot * 1.7);
        ctx.setTransform(dpr * c, dpr * s, -dpr * s * flip, dpr * c * flip, dpr * p.x, dpr * p.y);
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
        } else if (p.shape === 'dot') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.35, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const rr = i % 2 ? p.size * 0.28 : p.size * 0.7;
            const aa = (i * Math.PI) / 5 - Math.PI / 2;
            ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
          }
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (this.parts.length) {
        requestAnimationFrame(tt => this.tick(tt));
      } else {
        this.running = false;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    },
  };

  // Thêm một phần tử hiệu ứng tạm thời vào trang, tự xóa sau ms.
  function fxEl(cls, style, ms, html) {
    const el = document.createElement('div');
    el.className = cls;
    el.style.cssText = style;
    if (html) el.innerHTML = html;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  function showPraise(text, sub) {
    document.querySelectorAll('.praise').forEach(el => el.remove());
    fxEl('praise', '', 1800, `<span class="praise-main">${esc(text)}</span>${sub ? `<span class="praise-sub">${emo('🔥', 'tiny')} ${esc(sub)}</span>` : ''}`);
  }

  // Ăn mừng: power 1 = đúng sau khi đã sai, 2 = đúng ngay, 3 = chuỗi đúng ngay hoặc phần thưởng.
  function celebrate(from, power) {
    const r = from.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    fxEl('shock', `left:${x}px;top:${y}px`, 800);
    Fx.confetti(x, y, 25 + power * 25, -170, -10, 8, 22);
    if (power < 2) return;
    fxEl('flash', `--x:${x}px;--y:${y}px`, 700);
    Fx.cannons(power >= 3 ? 70 : 40);
    const shells = power >= 3 ? 5 : 2;
    for (let i = 0; i < shells; i++) {
      setTimeout(() => {
        Fx.firework(innerWidth * (0.15 + Math.random() * 0.6), innerHeight * (0.12 + Math.random() * 0.3), 60);
        Sfx.bang();
      }, 200 + i * 260);
    }
    const stage = $('.stage');
    const scene = $('.scene');
    [stage, scene].forEach(el => {
      if (!el) return;
      el.classList.remove(el === stage ? 'boom' : 'party');
      el.getBoundingClientRect();
      el.classList.add(el === stage ? 'boom' : 'party');
    });
  }

  /* ================= Màn hình mở đầu, chọn bé, tạo hồ sơ ================= */

  const ready = Store.init();

  function showSplash() {
    screen('splash', `
      <div class="splash">
        <div class="owl-slot big"></div>
        ${title()}
        <button class="btn-big nav" id="start" disabled>▶ Bắt đầu</button>
      </div>`);
    const btn = $('#start');
    let ok = false;
    const enable = () => {
      if (ok) return;
      ok = true;
      btn.disabled = false;
      btn.focus();
    };
    ready.then(enable, enable);
    setTimeout(enable, 3000);
    btn.onclick = () => {
      Sfx.init();
      showProfiles(true);
    };
  }

  function showProfiles(greet) {
    const list = Store.list();
    if (!list.length) return showNewProfile(true);
    screen('profiles', `
      <h2 class="screen-title">Ai đang chơi?</h2>
      <div class="profile-list">
        ${list.map((p, i) => `
          <button class="profile-card nav" data-id="${esc(p.id)}" style="--i:${i}">
            <span class="avatar">${emo(p.avatar)}</span>
            <span class="pname">${esc(p.name || 'Bé')}</span>
            <span class="pmeta">${emo('⭐', 'tiny')}${p.stars} ${emo('🔥', 'tiny')}${streakOf(p)}</span>
          </button>`).join('')}
        <button class="profile-card add nav" id="add" style="--i:${list.length}"><span class="plus">+</span><span class="pname">Thêm bé</span></button>
      </div>
      ${corner()}`);
    app.querySelectorAll('.profile-card[data-id]').forEach(b => {
      b.onclick = () => selectProfile(Store.list().find(p => p.id === b.dataset.id));
    });
    $('#add').onclick = () => showNewProfile(false);
    const last = readLocal(LAST_KEY, null);
    const lastBtn = [...app.querySelectorAll('.profile-card[data-id]')].find(b => b.dataset.id === last);
    (lastBtn || $('.profile-card')).focus();
    if (greet) Voice.say(C.phrases.whoPlays);
  }

  function showNewProfile(first) {
    let chosen = C.avatars[0];
    screen('newprofile', `
      <div class="panel newprofile">
        <h2 class="screen-title">Chọn bạn thú của con</h2>
        <div class="avatar-grid">
          ${C.avatars.map((a, i) => `<button class="avatar-opt nav${i === 0 ? ' chosen' : ''}" data-a="${a}" style="--i:${i}">${emo(a)}</button>`).join('')}
        </div>
        <input id="pname" class="name-input nav" maxlength="16" placeholder="Tên của bé (bố mẹ nhập)" autocomplete="off">
        <div class="row">
          ${first ? '' : '<button class="btn-big alt nav" id="cancel">Quay lại</button>'}
          <button class="btn-big nav" id="create">Xong ✓</button>
        </div>
      </div>
      ${corner()}`);
    app.querySelectorAll('.avatar-opt').forEach(b => {
      b.onclick = () => {
        chosen = b.dataset.a;
        app.querySelectorAll('.avatar-opt').forEach(x => x.classList.toggle('chosen', x === b));
        Sfx.pop();
      };
    });
    if (!first) $('#cancel').onclick = () => showProfiles(false);
    $('#create').onclick = () => {
      const p = newProfile($('#pname').value.trim(), chosen);
      Store.add(p);
      selectProfile(p);
    };
    focusFirst('.avatar-opt');
    Voice.say(C.phrases.newProfile);
  }

  function selectProfile(p) {
    profile = p;
    writeLocal(LAST_KEY, p.id);
    showHome(true);
  }

  /* ================= Trang chủ của bé ================= */

  async function showHome(greet) {
    const p = profile;
    const n = todayCount(p);
    const streak = streakOf(p);
    const ep = screen('home', `
      <header class="home-top">
        <button class="who nav" id="switch">${emo(p.avatar)}<span>${esc(p.name || 'Bé')}</span></button>
        <div class="chips">
          <span class="chip">${emo('⭐')}<b>${p.stars}</b></span>
          <span class="chip">${emo('🔥')}<b>${streak}</b> ngày</span>
        </div>
      </header>
      <section class="mission${p.mission.date === dayKey() ? ' done' : ''}">
        <span class="mission-label">${p.mission.date === dayKey() ? emo('✅', 'tiny') : '🎯'} Nhiệm vụ hôm nay: ${DAILY_GOAL} câu đúng ngay</span>
        <div class="mission-bar"><i style="width:${Math.min(100, (n / DAILY_GOAL) * 100)}%"></i></div>
        <b class="mission-count">${Math.min(n, DAILY_GOAL)}/${DAILY_GOAL}</b>
      </section>
      <div class="towers">
        ${C.subjects.map((s, i) => {
          const best = (p.towers[s.id] || {}).best || 0;
          return `
          <button class="tower-card nav" data-id="${s.id}" data-say="${esc(s.name)}" style="--c:${s.color};--i:${i}">
            ${emo(s.icon, 'tower-icon')}
            <span class="tower-name">${esc(s.name)}</span>
            <span class="segs">${Array.from({ length: FLOORS }, (_, f) => `<i class="${f < best ? 'on' : ''}"></i>`).join('')}</span>
            <span class="tower-best">${best >= FLOORS ? emo('👑', 'tiny') + ' Đã lên đỉnh' : 'Cao nhất: tầng ' + best}</span>
          </button>`;
        }).join('')}
      </div>
      <footer class="home-foot">
        <button class="pill nav" id="album">${emo('📒', 'tiny')} Bộ sưu tập ${p.stickers.length}/${C.stickers.length}</button>
        <button class="pill nav" id="parents">Bố mẹ xem</button>
      </footer>
      ${corner()}`);
    app.querySelectorAll('.tower-card').forEach(b => { b.onclick = () => startTower(b.dataset.id); });
    $('#switch').onclick = () => showProfiles(true);
    $('#album').onclick = showAlbum;
    $('#parents').onclick = showParents;
    focusFirst('.tower-card');
    if (!greet) return;
    await Voice.say(p.plays ? C.phrases.welcomeBack : C.phrases.welcomeNew);
    if (ep === epoch && streak >= 2) Voice.say(C.phrases.streak(Math.min(streak, 20)));
  }

  function showAlbum() {
    const p = profile;
    screen('album', `
      <div class="panel album">
        <h2 class="screen-title">${emo('📒', 'tiny')} Bộ sưu tập hình dán <small>${p.stickers.length}/${C.stickers.length}</small></h2>
        <div class="sticker-grid">
          ${C.stickers.map((s, i) => (p.stickers.includes(s)
            ? `<span class="slot on" style="--i:${i}">${emo(s)}</span>`
            : '<span class="slot">?</span>')).join('')}
        </div>
        <p class="hint">Leo tới tầng 5, tầng 10 hoặc làm xong nhiệm vụ hôm nay để nhận hình dán mới.</p>
        <button class="btn-big nav" id="back">← Về nhà</button>
      </div>`);
    $('#back').onclick = () => showHome(false);
    focusFirst('#back');
  }

  function showParents() {
    const p = profile;
    const days = Object.keys(p.days).sort().slice(-14);
    screen('parents', `
      <div class="panel parents">
        <h2 class="screen-title">Bố mẹ xem: ${esc(p.name || 'Bé')} ${emo(p.avatar, 'tiny')}</h2>
        <p class="meta">
          ⭐ ${p.stars} sao · 🔥 ${streakOf(p)} ngày liên tiếp · ${p.plays} lượt leo tháp · ${p.stickers.length} hình dán<br>
          Lưu tiến độ: ${Store.server ? 'máy chủ trong nhà (serve.py) và trình duyệt này' : 'chỉ trong trình duyệt này'}
        </p>
        <div class="row">
          <button class="btn-big nav" id="back">← Về nhà</button>
          <button class="btn-big danger nav" id="delete">Xóa hồ sơ này</button>
        </div>
        <table>
          <thead><tr><th>Kỹ năng</th><th>Cấp</th><th>Đúng ngay (tổng)</th><th>10 câu gần nhất</th></tr></thead>
          <tbody>
            ${C.subjects.filter(s => s.id !== 'mix').map(s => `
              <tr class="group-row"><th colspan="4">${emo(s.icon, 'tiny')} ${esc(s.name)} · tầng cao nhất ${(p.towers[s.id] || {}).best || 0}/${FLOORS}</th></tr>
              ${s.skills.map(id => {
                const st = p.skills[id] || { level: 1, recent: [], total: 0, firstTry: 0 };
                const pct = st.total ? Math.round((st.firstTry / st.total) * 100) : 0;
                return `<tr>
                  <td>${esc(C.skills[id].name)}</td>
                  <td>${st.level}/${C.skills[id].maxLevel || 1}</td>
                  <td>${st.total ? `<span class="bar"><i style="width:${pct}%"></i></span> ${pct}% (${st.firstTry}/${st.total})` : '<span class="muted">chưa học</span>'}</td>
                  <td class="recent">${st.recent.slice(-10).map(r => `<i class="${r ? 'ok' : 'no'}"></i>`).join('')}</td>
                </tr>`;
              }).join('')}`).join('')}
          </tbody>
        </table>
        <p class="meta">Câu đúng ngay theo ngày: ${days.length ? days.map(d => `${d.slice(8)}/${d.slice(5, 7)}: <b>${p.days[d]}</b>`).join(' · ') : 'chưa có'}</p>
        <p class="credits">Hình minh họa: Twemoji (CC-BY 4.0). Giọng đọc: Linh (macOS).</p>
      </div>`);
    $('#back').onclick = () => showHome(false);
    $('#delete').onclick = () => {
      if (!window.confirm(`Xóa toàn bộ tiến độ của ${p.name || 'bé'}? Không khôi phục được.`)) return;
      Store.remove(p);
      profile = null;
      showProfiles(false);
    };
    focusFirst('#back');
  }

  /* ================= Trò chơi leo tháp ================= */

  let game = null;

  function startTower(subjectId) {
    const subject = C.subjects.find(s => s.id === subjectId);
    game = {
      subject, floor: 0, hearts: HEARTS, stars: 0, owl: 1, swap: 1, combo: 0,
      asked: 0, confirmSaid: 0, retry: [], recent: [], seen: new Set(), stickers: [],
      q: null, tries: 0, taught: false, helped: false, selected: null, locked: true, teaching: false,
    };
    showTower();
    nextQuestion();
  }

  // Tầng thấp dễ hơn, tầng cao khó hơn cấp hiện tại của bé một chút.
  function levelFor(skill, step) {
    const base = skillState(skill).level;
    const max = C.skills[skill].maxLevel || 1;
    if (step <= 3) return Math.max(1, base - 1);
    if (step >= 8) return Math.min(max, base + 1);
    return base;
  }

  function makeQuestion(avoidSkill) {
    const g = game;
    const due = avoidSkill ? null : g.retry.find(r => r.due <= g.asked);
    if (due) {
      g.retry.splice(g.retry.indexOf(due), 1);
      return Object.assign({}, due.q, { isRetry: true });
    }
    let skills = g.subject.skills.filter(s => s !== avoidSkill);
    const last2 = g.recent.slice(-2);
    if (last2.length === 2 && last2[0] === last2[1] && skills.length > 1) skills = skills.filter(s => s !== last2[0]);
    let q = null;
    for (let i = 0; i < 30; i++) {
      const skill = pick(skills);
      q = C.skills[skill].gen(levelFor(skill, g.floor + 1));
      q.skill = skill;
      q.key = q.say + '|' + q.answer;
      if (!g.seen.has(q.key)) break;
    }
    g.seen.add(q.key);
    g.recent.push(q.skill);
    return q;
  }

  function showTower() {
    const g = game;
    screen('tower', `
      <header class="topbar">
        <button class="icon-btn nav" id="home" aria-label="Về nhà">${emo('🏠')}</button>
        <div class="hearts">${Array.from({ length: HEARTS }, () => `<span class="heart">${emo('❤️')}</span>`).join('')}</div>
        <div class="helpers">
          <button class="helper nav" id="h-owl">${emo('🦉')}<span>Hỏi Cú</span></button>
          <button class="helper nav" id="h-swap">${emo('🔄')}<span>Đổi câu</span></button>
        </div>
        <div class="combo">${emo('🔥')}<b>x0</b></div>
        <div class="score">${emo('⭐')}<b>0</b></div>
      </header>
      <section class="stage">
        <div class="scene"></div>
        <div class="ask"><button class="icon-btn small nav" id="replay" aria-label="Nghe lại">${emo('🔊')}</button><p class="ask-text"></p></div>
        <div class="options"></div>
        <div class="action-slot">
          <div class="cooldown">${emo('⏳')}<div class="cooldown-track"><div class="cooldown-bar"></div></div></div>
          <button class="lock-btn nav" id="lock">Chốt!</button>
        </div>
      </section>
      <aside class="ladder" style="--c:${g.subject.color}">
        <div class="ladder-title">${emo(g.subject.icon, 'tiny')} ${esc(g.subject.name)}</div>
        <div class="floors">
          ${Array.from({ length: FLOORS }, (_, i) => FLOORS - i).map(f => `
            <div class="floor${MILESTONES.includes(f) ? ' milestone' : ''}" data-f="${f}">
              <span class="fnum">${f}</span>${emo(f === FLOORS ? '👑' : MILESTONES.includes(f) ? '🎁' : '⭐', 'prize')}
            </div>`).join('')}
          <div class="ground"></div>
          <div class="climber">${emo(profile.avatar)}</div>
        </div>
      </aside>
      ${corner()}
      <div class="overlay"></div>`);
    $('#home').onclick = askQuit;
    $('#replay').onclick = () => { if (game && game.q && !game.teaching) Voice.say(game.q.say); };
    $('#lock').onclick = confirmAnswer;
    $('#h-owl').onclick = useOwl;
    $('#h-swap').onclick = useSwap;
  }

  function renderStatus() {
    const g = game;
    app.querySelectorAll('.floor').forEach(el => {
      const f = +el.dataset.f;
      el.classList.toggle('done', f <= g.floor);
      el.classList.toggle('next', f === g.floor + 1);
    });
    $('.floors').style.setProperty('--f', g.floor);
    app.querySelectorAll('.heart').forEach((h, i) => h.classList.toggle('lost', i >= g.hearts));
    $('#h-owl').classList.toggle('used', g.owl <= 0);
    $('#h-swap').classList.toggle('used', g.swap <= 0);
    $('.score b').textContent = g.stars;
    const combo = $('.combo');
    const label = 'x' + g.combo;
    if (combo.querySelector('b').textContent !== label) {
      combo.querySelector('b').textContent = label;
      combo.classList.remove('on');
      combo.getBoundingClientRect();
    }
    combo.classList.toggle('on', g.combo >= 2);
  }

  function nextQuestion() {
    if (game.floor >= FLOORS) return endTower(true);
    game.asked++;
    showQuestion(makeQuestion());
  }

  async function showQuestion(q, intro) {
    const g = game;
    const ep = newEpoch();
    Object.assign(g, { q, tries: 0, taught: false, helped: false, selected: null, locked: true, teaching: false });
    renderStatus();
    renderScene(q);
    $('.ask-text').textContent = q.show || q.say;
    renderOptions(q);
    setAction(null);
    mood('idle');
    if (intro || q.isRetry) {
      await Voice.say(intro || C.phrases.retryIntro);
      if (ep !== epoch) return;
    }
    await Voice.say(q.say);
    if (ep !== epoch) return;
    unlock();
  }

  function group(e, n, keep, cls) {
    let html = '';
    for (let i = 0; i < n; i++) {
      const gone = keep !== undefined && i >= keep;
      html += `<span class="item${gone ? ' gone' : ''}" style="--i:${i};--r:${Math.round(Math.random() * 24 - 12)}deg">${emo(e)}</span>`;
    }
    return `<div class="group ${cls || ''}">${html}</div>`;
  }

  function renderScene(q) {
    const el = $('.scene');
    const s = q.scene;
    el.className = 'scene scene-' + s.type;
    if (s.type === 'group') {
      el.innerHTML = group(s.e, s.n, undefined, s.n > 5 ? 'wide' : '');
    } else if (s.type === 'add') {
      el.innerHTML = `<div class="badged" data-n="${s.a}">${group(s.e, s.a)}</div><span class="op">+</span>` +
        `<div class="badged" data-n="${s.b}">${group(s.e, s.b)}</div><span class="op">=</span><span class="op q">?</span>`;
    } else if (s.type === 'sub') {
      el.innerHTML = `<div class="badged" data-n="${s.a}">${group(s.e, s.a, s.a - s.b, s.a > 5 ? 'wide' : '')}</div>` +
        `<span class="op small">bớt ${s.b}</span><span class="op">=</span><span class="op q">?</span>`;
    } else if (s.type === 'big') {
      el.innerHTML = emo(s.e, 'big');
    } else {
      el.innerHTML = '';
    }
  }

  function shapeSvg(shape, color) {
    const d = {
      circle: '<circle cx="50" cy="50" r="42"/>',
      square: '<rect x="12" y="12" width="76" height="76" rx="6"/>',
      rect: '<rect x="4" y="26" width="92" height="48" rx="6"/>',
      triangle: '<polygon points="50,8 94,90 6,90"/>',
      star: '<polygon points="50,5 61,38 96,38 68,59 79,93 50,72 21,93 32,59 4,38 39,38"/>',
      heart: '<path d="M50 88 C20 66 4 48 4 30 C4 16 15 6 28 6 C38 6 46 12 50 20 C54 12 62 6 72 6 C85 6 96 16 96 30 C96 48 80 66 50 88 Z"/>',
    }[shape];
    return `<svg viewBox="0 0 100 100" fill="${color}" stroke="rgba(0,0,0,.18)" stroke-width="4" stroke-linejoin="round">${d}</svg>`;
  }

  function blobSvg(color) {
    return `<svg viewBox="0 0 100 100"><path d="M50 6 C72 4 93 20 94 44 C95 68 80 93 53 94 C28 95 7 80 6 55 C5 30 26 8 50 6 Z" fill="${color}"/>` +
      '<ellipse cx="36" cy="32" rx="12" ry="7" fill="#fff" opacity=".45" transform="rotate(-30 36 32)"/></svg>';
  }

  function optionHtml(o) {
    switch (o.kind) {
      case 'emoji': return emo(o.value);
      case 'num': return `<span class="num">${o.value}</span>`;
      case 'letter': return `<span class="letter"><span>${esc(o.value.toUpperCase())}</span><span>${esc(o.value)}</span></span>`;
      case 'shape': return shapeSvg(o.value.shape, o.value.color);
      case 'color': return blobSvg(o.value);
      case 'group': return group(o.value.e, o.value.n);
      default: return `<span class="sym">${esc(o.value)}</span>`;
    }
  }

  function renderOptions(q) {
    const el = $('.options');
    el.className = 'options waiting ' + (q.mode === 'pad' ? 'pad' : 'choice') + (q.optionsClass ? ' ' + q.optionsClass : '');
    if (q.mode === 'pad') {
      const keys = C.util.range(0, q.padMax);
      const rows = q.padMax > 5 ? [keys.slice(0, 6), keys.slice(6)] : [keys];
      el.innerHTML = rows.map(r => `<div class="pad-row">${r.map(n =>
        `<button class="key nav" data-val="${n}" style="--h:${(n * 37) % 360};--i:${n}">${n}</button>`).join('')}</div>`).join('');
    } else {
      const opts = q.fixedOrder ? q.options : shuffle(q.options);
      el.innerHTML = opts.map((o, i) =>
        `<button class="opt opt-${o.kind} nav" data-val="${esc(o.id)}" style="--i:${i}">${optionHtml(o)}</button>`).join('');
    }
    el.querySelectorAll('button').forEach(b => { b.onclick = () => onOption(b); });
  }

  const optionButtons = () => [...app.querySelectorAll('.options button')];

  function setAction(which) {
    const slot = $('.action-slot');
    if (slot) slot.className = 'action-slot' + (which ? ' ' + which : '');
  }

  function unlock() {
    const g = game;
    g.locked = false;
    $('.options').classList.remove('waiting', 'cooling');
    if (keyMode && !$('.options').contains(document.activeElement)) {
      const first = $('.options .teach') || optionButtons()[0];
      if (first) first.focus();
    }
  }

  function clearSelection() {
    optionButtons().forEach(b => b.classList.remove('picked'));
    game.selected = null;
    setAction(null);
  }

  function onOption(btn) {
    const g = game;
    if (!g || g.locked) {
      wiggle(btn);
      return;
    }
    if (g.selected === btn) {
      confirmAnswer();
      return;
    }
    optionButtons().forEach(b => b.classList.toggle('picked', b === btn));
    g.selected = btn;
    Sfx.tick();
    setAction('lock');
    if (keyMode) $('#lock').focus();
    if (g.confirmSaid < CONFIRM_TIMES) {
      g.confirmSaid++;
      Voice.say(C.phrases.confirm);
    }
  }

  async function confirmAnswer() {
    const g = game;
    const btn = g && g.selected;
    if (!btn || g.locked) return;
    const ep = epoch;
    g.locked = true;
    setAction(null);
    Voice.stop();
    $('.options').classList.add('suspense');
    btn.classList.add('locking');
    Sfx.drum(1);
    await wait(1100);
    if (ep !== epoch) return;
    $('.options').classList.remove('suspense');
    btn.classList.remove('locking', 'picked');
    g.selected = null;
    const ok = btn.dataset.val === String(g.q.answer);
    if (g.tries === 0) g.result = recordAttempt(g.q.skill, ok && !g.helped, !g.q.isRetry);
    if (ok) onRight(btn, ep);
    else onWrong(btn, ep);
  }

  async function onRight(btn, ep) {
    const g = game;
    const q = g.q;
    const first = g.tries === 0 && !g.helped;
    const climb = !g.taught;
    const res = g.tries === 0 ? g.result : { levelUp: false, missionDone: false };
    g.combo = first ? g.combo + 1 : 0;
    const power = !first ? 1 : g.combo >= 3 ? 3 : 2;
    const praise = first ? pick(C.phrases.praise) : climb ? C.phrases.praiseAfter : C.phrases.praiseTaught;
    btn.classList.add('right');
    Sfx.correct(power);
    celebrate(btn, power);
    mood('happy');
    if (first) {
      g.stars++;
      profile.stars++;
      Store.save(profile);
      flyStar(btn);
      showPraise(praise, g.combo >= 2 ? `${g.combo} câu liên tiếp!` : '');
    }
    renderStatus();
    await Voice.say(praise);
    if (ep !== epoch) return;
    if (res.levelUp) {
      await Voice.say(C.phrases.levelUp);
      if (ep !== epoch) return;
    }
    if (climb) {
      g.floor++;
      Sfx.climb();
      renderStatus();
      await wait(800);
      if (ep !== epoch) return;
      if (MILESTONES.includes(g.floor)) {
        await reward(g.floor === FLOORS ? 'top' : 'milestone');
        if (ep !== epoch) return;
      }
    } else if (!q.isRetry) {
      g.retry.push({ q, due: g.asked + RETRY_AFTER });
      await Voice.say(C.phrases.later);
      if (ep !== epoch) return;
    }
    if (res.missionDone) {
      await reward('mission');
      if (ep !== epoch) return;
    }
    nextQuestion();
  }

  async function onWrong(btn, ep) {
    const g = game;
    const q = g.q;
    g.tries++;
    g.combo = 0;
    btn.classList.add('wrong');
    setTimeout(() => btn.classList.remove('wrong'), 700);
    Sfx.wrong();
    mood('think');
    // Sai khi đã được dạy thì không mất tim nữa, chỉ phải chờ.
    if (!g.taught) {
      g.hearts--;
      Sfx.heart();
      renderStatus();
    }
    if (g.hearts <= 0) {
      await Voice.say(C.phrases.gameOver);
      if (ep === epoch) endTower(false);
      return;
    }
    if (g.tries === 1) {
      if (q.countAlong) hintPulse();
      const hint = g.hearts === 1 ? C.phrases.lastHeart : q.countAlong ? C.phrases.countHint : pick(C.phrases.wrong);
      await Promise.all([Voice.say(hint), cooldown(COOLDOWN_MS)]);
      if (ep !== epoch) return;
      reshuffle(q);
      unlock();
    } else if (!g.taught) {
      await teach(q, C.phrases.teach);
      if (ep !== epoch) return;
      g.taught = true;
      unlock();
    } else {
      await Promise.all([Voice.say(C.phrases.teachDone), cooldown(COOLDOWN_MS)]);
      if (ep !== epoch) return;
      unlock();
    }
  }

  function cooldown(ms) {
    const cd = $('.cooldown');
    $('.options').classList.add('cooling');
    setAction('cool');
    cd.style.setProperty('--ms', ms + 'ms');
    cd.classList.remove('run');
    cd.getBoundingClientRect();
    cd.classList.add('run');
    return wait(ms).then(() => {
      cd.classList.remove('run');
      setAction(null);
    });
  }

  // Xáo lại vị trí đáp án sau khi sai, để bé không bấm lần lượt từng ô.
  function reshuffle(q) {
    if (q.mode !== 'choice' || q.fixedOrder) return;
    const box = $('.options');
    const btns = [...box.children];
    let order;
    do { order = shuffle(btns); } while (btns.length > 1 && order.every((b, i) => b === btns[i]));
    order.forEach((b, i) => {
      b.style.setProperty('--i', i);
      b.classList.remove('again');
      b.getBoundingClientRect();
      b.classList.add('again');
      box.appendChild(b);
    });
  }

  function hintPulse() {
    app.querySelectorAll('.scene .item:not(.gone)').forEach((it, i) => {
      setTimeout(() => {
        it.classList.remove('nudge');
        it.getBoundingClientRect();
        it.classList.add('nudge');
      }, i * 260);
    });
  }

  async function teach(q, intro) {
    const g = game;
    const ep = epoch;
    g.teaching = true;
    clearSelection();
    mood('idle');
    await Voice.say(intro);
    if (ep !== epoch) return;
    if (q.countAlong) {
      const items = [...app.querySelectorAll('.scene .item:not(.gone)')];
      items.forEach(it => { it.classList.remove('counted'); const b = it.querySelector('.badge'); if (b) b.remove(); });
      for (let i = 0; i < items.length; i++) {
        items[i].classList.add('counted');
        items[i].insertAdjacentHTML('beforeend', `<b class="badge">${i + 1}</b>`);
        Sfx.pop();
        await Voice.say(C.NUM[i + 1]);
        if (ep !== epoch) return;
      }
    }
    await Voice.say(q.explain);
    if (ep !== epoch) return;
    const right = optionButtons().find(b => b.dataset.val === String(q.answer));
    if (right) right.classList.add('teach');
    await Voice.say(C.phrases.teachDone);
    if (ep !== epoch) return;
    g.teaching = false;
  }

  async function useOwl() {
    const g = game;
    if (!g || g.owl <= 0 || g.locked || g.teaching) {
      wiggle($('#h-owl'));
      return;
    }
    const ep = epoch;
    g.owl--;
    g.helped = true;
    g.locked = true;
    renderStatus();
    await teach(g.q, C.phrases.owlHelp);
    if (ep !== epoch) return;
    unlock();
  }

  function useSwap() {
    const g = game;
    if (!g || g.swap <= 0 || g.locked || g.teaching) {
      wiggle($('#h-swap'));
      return;
    }
    g.swap--;
    showQuestion(makeQuestion(g.q.skill), C.phrases.swap);
  }

  function flyStar(from) {
    const target = $('.score .emo');
    const a = from.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const s = document.createElement('img');
    s.className = 'fly-star';
    s.src = 'img/' + C.emojiFile('⭐') + '.svg';
    s.style.left = a.left + a.width / 2 + 'px';
    s.style.top = a.top + a.height / 2 + 'px';
    document.body.appendChild(s);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      s.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.5)`;
    }));
    setTimeout(() => {
      s.remove();
      const sc = $('.score');
      if (!sc) return;
      sc.querySelector('b').textContent = game.stars;
      sc.classList.remove('bump');
      sc.getBoundingClientRect();
      sc.classList.add('bump');
      Sfx.pop();
    }, 850);
  }

  function grantSticker() {
    const left = C.stickers.filter(s => !profile.stickers.includes(s));
    if (!left.length) {
      profile.stars += 3;
      Store.save(profile);
      return null;
    }
    const s = pick(left);
    profile.stickers.push(s);
    game.stickers.push(s);
    Store.save(profile);
    return s;
  }

  // Hộp quà ở mốc an toàn, đỉnh tháp và khi xong nhiệm vụ; chờ bé bấm "Tiếp tục".
  async function reward(kind) {
    const ep = epoch;
    const sticker = grantSticker();
    const heading = { milestone: 'Mốc an toàn!', top: 'Đỉnh tháp!', mission: 'Xong nhiệm vụ hôm nay!' }[kind];
    const ov = $('.overlay');
    ov.innerHTML = `
      <div class="reward-card ${kind}">
        <h2>${heading}</h2>
        <div class="prize-box">
          <div class="gift">${emo('🎁')}</div>
          <div class="sticker">${emo(sticker || '⭐')}</div>
        </div>
        <p class="reward-note">${sticker ? 'Hình dán mới!' : '+3 sao'}</p>
        <button class="btn-big nav" id="reward-ok" disabled>Tiếp tục ▶</button>
      </div>`;
    ov.classList.add('show');
    mood('happy');
    await Voice.say(C.phrases[kind]);
    if (ep !== epoch) return;
    ov.querySelector('.reward-card').classList.add('open');
    Sfx.chest();
    celebrate(ov.querySelector('.prize-box'), 3);
    await Voice.say(sticker ? C.phrases.sticker : C.phrases.bonus);
    if (ep !== epoch) return;
    const ok = ov.querySelector('#reward-ok');
    ok.disabled = false;
    ok.focus();
    await new Promise(resolve => { ok.onclick = resolve; });
    ov.classList.remove('show');
    ov.innerHTML = '';
  }

  function askQuit() {
    const g = game;
    const ov = $('.overlay');
    if (!g || ov.classList.contains('show')) return;
    const wasLocked = g.locked;
    g.locked = true;
    ov.innerHTML = `
      <div class="reward-card quit">
        <h2>Dừng leo tháp?</h2>
        <p class="reward-note">Lần sau sẽ leo lại từ tầng 1.</p>
        <div class="row">
          <button class="btn-big alt nav" id="stay">Leo tiếp</button>
          <button class="btn-big danger nav" id="leave">Về nhà</button>
        </div>
      </div>`;
    ov.classList.add('show');
    Voice.say(C.phrases.quit);
    ov.querySelector('#stay').onclick = () => {
      ov.classList.remove('show');
      ov.innerHTML = '';
      g.locked = wasLocked;
      if (!g.locked) unlock();
    };
    ov.querySelector('#leave').onclick = () => showHome(false);
    ov.querySelector('#stay').focus();
  }

  async function endTower(won) {
    const g = game;
    const t = towerState(g.subject.id);
    t.plays++;
    if (won) t.wins++;
    t.best = Math.max(t.best, g.floor);
    profile.plays++;
    Store.save(profile);
    const ep = screen('end', `
      <div class="panel end-card ${won ? 'won' : 'lost'}">
        <div class="end-hero">${emo(won ? '👑' : '💔')}</div>
        <h2 class="screen-title">${won ? 'Con lên tới đỉnh tháp!' : 'Hết tim rồi!'}</h2>
        <div class="end-stats">
          <span class="chip">${emo('🪜')}<b>${g.floor}/${FLOORS}</b> tầng</span>
          <span class="chip">${emo('⭐')}<b>${g.stars}</b> sao</span>
        </div>
        ${g.stickers.length ? `<div class="end-stickers">${g.stickers.map((s, i) => `<span style="--i:${i}">${emo(s)}</span>`).join('')}</div>` : ''}
        <div class="row">
          <button class="btn-big nav" id="again">↻ Leo lại</button>
          <button class="btn-big alt nav" id="home">${emo('🏠', 'tiny')} Về nhà</button>
        </div>
      </div>
      ${corner()}`);
    $('#again').onclick = () => startTower(g.subject.id);
    $('#home').onclick = () => showHome(false);
    focusFirst('#again');
    game = null;
    if (won) {
      mood('happy');
      celebrate($('.end-hero'), 3);
    } else {
      mood('think');
    }
    await Voice.say(won ? C.phrases.endStars(g.stars) : C.phrases.endFloors(g.floor));
    if (ep === epoch && won && g.stars) mood('happy');
  }

  /* ================= Remote tivi và bàn phím ================= */

  let keyMode = false;

  function goBack() {
    const s = app.className;
    if (s === 'screen-tower') {
      const ov = $('.overlay');
      if (ov.classList.contains('show')) {
        const stay = ov.querySelector('#stay');
        if (stay) stay.click();
      } else {
        askQuit();
      }
    } else if (s === 'screen-end' || s === 'screen-album' || s === 'screen-parents') {
      showHome(false);
    } else if (s === 'screen-home' || s === 'screen-newprofile') {
      showProfiles(false);
    }
  }

  // Di chuyển tiêu điểm tới nút gần nhất theo hướng phím mũi tên.
  function moveFocus(dir) {
    const ov = $('.overlay.show');
    const scope = ov || app;
    const items = [...scope.querySelectorAll('.nav')].filter(el => !el.disabled && el.offsetParent !== null &&
      (ov || !el.closest('.overlay')));
    const cur = document.activeElement;
    if (!items.includes(cur)) {
      if (items[0]) items[0].focus();
      return;
    }
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const dx = b.left + b.width / 2 - cx;
      const dy = b.top + b.height / 2 - cy;
      const main = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      const cross = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (main <= 1) continue;
      const score = main + cross * 2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (!best) return;
    best.focus();
    if (best.dataset.say) Voice.say(best.dataset.say);
  }

  document.addEventListener('keydown', e => {
    const k = e.keyCode;
    const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (!keyMode) {
      keyMode = true;
      document.body.classList.add('keys');
    }
    if (k === 461 || k === 27 || (k === 8 && !typing)) {   // 461 = nút Back của remote LG
      e.preventDefault();
      goBack();
      return;
    }
    const dir = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' }[k];
    if (!dir || (typing && (dir === 'left' || dir === 'right'))) return;
    e.preventDefault();
    moveFocus(dir);
  });

  document.addEventListener('pointerdown', () => {
    keyMode = false;
    document.body.classList.remove('keys');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) Voice.stop();
  });

  // Thiếu file hình thì hiện emoji của hệ thống thay thế.
  document.addEventListener('error', e => {
    const img = e.target;
    if (img.tagName !== 'IMG' || !img.classList.contains('emo')) return;
    const span = document.createElement('span');
    span.className = img.className + ' emo-text';
    span.textContent = img.alt;
    img.replaceWith(span);
  }, true);

  // Chỉ để kiểm thử: mở index.html?debug để xem trạng thái trò chơi trong console.
  if (/[?&]debug\b/.test(location.search)) {
    window.BHV = {
      game: () => game, profile: () => profile, Store, Fx,
      ask(skill, level) {
        const q = C.skills[skill].gen(level || 1);
        q.skill = skill;
        showQuestion(q);
      },
    };
  }

  showSplash();
})();
