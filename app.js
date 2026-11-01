/* Bé Học Vui: hồ sơ của bé, trò chơi leo tháp, âm thanh và điều khiển bằng remote.
   Câu hỏi nằm trong content.js. */
(function () {
  'use strict';

  const C = window.CONTENT;
  const { pick, shuffle } = C.util;
  const app = document.getElementById('app');

  const FLOORS = 100;
  const SEGMENT = 10;           // mỗi 10 tầng là một mốc an toàn có quà
  const HEARTS = 3;
  const DAILY_GOAL = 15;        // số câu đúng ngay mỗi ngày để xong nhiệm vụ
  const COOLDOWN_STEPS = [3, 6, 10, 15];   // giây chờ khi sai liên tiếp: lần 1, 2, 3, 4+ (giới hạn theo cài đặt của bố mẹ)
  const RUSH_MS = 2500;         // chốt sai trong 2,5 giây sau khi được bấm = bấm vội
  const BREAK_WINDOW = 10 * 60 * 1000;   // hết tim 2 lần trong 10 phút thì nghỉ giải lao
  const BREAK_AFTER = 2;
  const RETRY_AFTER = 2;        // câu phải dạy lại sẽ quay lại sau 2 câu
  const CONFIRM_TIMES = 3;      // nhắc "bấm chốt" ở 3 câu đầu mỗi tháp
  const LEVEL_UP = { last: 6, need: 5 };    // đúng ngay 5/6 câu gần nhất thì lên cấp
  const LEVEL_DOWN = { last: 6, max: 2 };   // chỉ đúng ngay 2/6 câu thì xuống cấp

  /* ================= Hồ sơ: lưu trong trình duyệt và (nếu có) máy chủ serve.py ================= */

  const LOCAL_KEY = 'be-hoc-vui:profiles';
  const LAST_KEY = 'be-hoc-vui:last';
  const MUSIC_KEY = 'be-hoc-vui:music';
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
    p.climbs = p.climbs || {};     // tiến độ từng tháp: { floor, hearts, owl, swap }
    p.hats = p.hats || [];
    p.hat = p.hat || null;
    p.pets = p.pets || [];
    p.pet = p.pet || null;
    p.themes = p.themes || [];
    p.theme = p.theme || null;
    p.golden = p.golden || [];
    // Cài đặt của bố mẹ: nghỉ giải lao (bật/tắt, số phút) và thời gian chờ tối đa khi sai liên tiếp (giây).
    p.settings = Object.assign({ breakOn: true, breakMin: 2, maxCooldown: 10 }, p.settings);
    p.rushes = p.rushes || 0;          // số lần bấm vội rồi sai
    p.breakCount = p.breakCount || 0;  // số lần phải nghỉ giải lao
    p.outs = p.outs || [];             // thời điểm các lần hết tim gần đây
    p.breakUntil = p.breakUntil || 0;
    p.qhist = p.qhist || {};           // các câu đã hỏi của từng kỹ năng, để tránh lặp lại
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

  // Cấp khởi đầu của một kỹ năng theo tuổi của bé (chưa chọn tuổi thì coi như 5 tuổi).
  function startLevel(p, id) {
    const a = C.ages.find(x => x.age === p.age) || C.ages.find(x => x.age === 5);
    return Math.min(a.level, C.skills[id].maxLevel || 1);
  }
  function skillState(id) {
    return profile.skills[id] || (profile.skills[id] = { level: startLevel(profile, id), recent: [], total: 0, firstTry: 0 });
  }
  // Đổi tuổi: đặt lại cấp mọi kỹ năng theo tuổi mới, rồi độ khó lại tự điều chỉnh theo kết quả.
  function setAge(p, age) {
    p.age = age;
    for (const id in p.skills) {
      p.skills[id].level = startLevel(p, id);
      p.skills[id].recent = [];
    }
    Store.save(p);
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

  const mf = m => 440 * Math.pow(2, (m - 69) / 12);   // số nốt MIDI → tần số

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
      Music.duck(true);
      return new Promise(resolve => {
        let done = false;
        let fellBack = false;
        const end = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (this.finish === end) this.finish = null;
          Music.duck(false);
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
    tone(freq, start, dur, type, vol, slideTo, dest) {
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
      g.connect(dest || c.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    // Tạo sẵn các đoạn tiếng ồn dùng cho tiếng nổ, để lần ăn mừng đầu tiên không bị khựng.
    warm() {
      const c = this.ctx;
      if (!c) return;
      if (!this.noise) {
        const len = Math.floor(c.sampleRate * 0.6);
        this.noise = c.createBuffer(1, len, c.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      }
      if (!this.white) {
        const len = c.sampleRate * 2;
        this.white = c.createBuffer(1, len, c.sampleRate);
        const d = this.white.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
    },
    // Một tiếng ồn ngắn qua bộ lọc: trống, chũm chọe, tiếng xì.
    noiseHit(start, dur, freq, ftype, vol, dest) {
      const c = this.ctx;
      if (!c) return;
      if (!this.white) {
        const len = c.sampleRate * 2;
        this.white = c.createBuffer(1, len, c.sampleRate);
        const d = this.white.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      const t = c.currentTime + start;
      const src = c.createBufferSource();
      const f = c.createBiquadFilter();
      const g = c.createGain();
      src.buffer = this.white;
      src.loop = dur > 1.4;
      f.type = ftype;
      f.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(dest || c.destination);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.05);
    },
    // Kèn đồng: hai sóng răng cưa lệch nhau qua lọc thông thấp mở dần.
    brass(midi, start, dur, vol) {
      const c = this.ctx;
      if (!c) return;
      const t = c.currentTime + start;
      const f = c.createBiquadFilter();
      const g = c.createGain();
      f.type = 'lowpass';
      f.Q.value = 2;
      f.frequency.setValueAtTime(500, t);
      f.frequency.exponentialRampToValueAtTime(3200, t + 0.08);
      f.frequency.exponentialRampToValueAtTime(1300, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.04);
      g.gain.setValueAtTime(vol, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      [-7, 7].forEach(det => {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mf(midi);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.05);
      });
      f.connect(g);
      g.connect(c.destination);
    },
    // Nhạc thưởng (~2,5 giây): trống dồn, chũm chọe, kèn đồng đi lên, hợp âm Đô trưởng ngân dài, lấp lánh.
    fanfare() {
      if (!this.ctx) return;
      for (let i = 0; i < 16; i++) {
        const t = 0.75 * (1 - Math.pow(1 - i / 16, 1.5));
        this.noiseHit(t, 0.07, 1900, 'bandpass', 0.1 + i * 0.012);
        if (i % 4 === 0) this.tone(110, t, 0.12, 'triangle', 0.15, 70);
      }
      this.tone(80, 0.76, 0.4, 'sine', 0.5, 40);
      this.noiseHit(0.78, 1.5, 6500, 'highpass', 0.25);
      [67, 72, 76, 79].forEach((m, i) => this.brass(m, 0.8 + i * 0.14, 0.2, 0.09));
      [60, 64, 67, 72, 76].forEach(m => this.brass(m, 1.38, 1.15, 0.055));
      this.tone(mf(36), 1.38, 1.1, 'triangle', 0.25);
      this.noiseHit(1.38, 1.2, 7000, 'highpass', 0.15);
      for (let i = 0; i < 12; i++) this.tone(mf(84 + [0, 4, 7, 12][i % 4]), 1.55 + i * 0.075, 0.25, 'sine', 0.05);
    },
    // Nhạc nhảy cho lễ hội tầng 50 (128 BPM): trống, vỗ tay, bass nảy, hợp âm và giai điệu.
    dance(sec) {
      if (!this.ctx) return;
      const e = 60 / 128 / 2;
      const roots = [36, 33, 41, 43];
      const chords = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
      const lead = [72, 76, 79, 81, 79, 76, 74, 76];
      for (let i = 0, t = 0; t < sec; i++, t += e) {
        const bar = Math.floor(i / 8) % 4;
        if (i % 2 === 0) this.tone(150, t, 0.2, 'sine', 0.45, 42);
        else this.noiseHit(t, 0.05, 8000, 'highpass', 0.07);
        if (i % 4 === 2) this.noiseHit(t, 0.14, 1500, 'bandpass', 0.2);
        this.tone(mf(roots[bar] + (i % 2 ? 12 : 0)), t, e * 0.9, 'triangle', 0.16);
        if (i % 4 === 1) chords[bar].forEach(m => this.tone(mf(m + 12), t, e * 1.2, 'square', 0.018));
        if (i % 2 === 0) this.tone(mf(lead[(i / 2) % 8] + (bar === 3 ? 2 : 0)), t, e * 1.6, 'triangle', 0.06);
      }
    },
    // Tiếng nổ lớn ở mốc: tiếng trầm rung sàn, tiếng ầm và tiếng lách tách.
    boom() {
      if (!this.ctx) return;
      this.tone(70, 0, 0.9, 'sine', 0.7, 28);
      this.tone(140, 0, 0.3, 'triangle', 0.3, 50);
      this.noiseHit(0, 1.4, 500, 'lowpass', 0.6);
      this.noiseHit(0, 0.25, 3000, 'bandpass', 0.3);
      this.crackle(0.35, 20);
    },
    // Pháo hoa bay lên: tiếng rít cao dần.
    whistle() {
      if (!this.ctx) return;
      const f = 500 + Math.random() * 300;
      this.tone(f, 0, 0.75, 'sine', 0.035, f * 3);
      this.noiseHit(0, 0.7, 4000, 'highpass', 0.04);
    },
    // Sấm: tiếng nứt chói rồi tiếng ầm ì kéo dài.
    thunder() {
      if (!this.ctx) return;
      this.noiseHit(0, 0.18, 3500, 'highpass', 0.45);
      this.noiseHit(0.04, 2.4, 200, 'lowpass', 0.9);
      this.tone(55, 0.04, 1.8, 'sine', 0.5, 30);
    },
    // Đàn hạc lướt lên (cầu vồng).
    harp() {
      for (let i = 0; i < 16; i++) this.tone(mf(60 + [0, 2, 4, 7, 9][i % 5] + 12 * Math.floor(i / 5)), i * 0.05, 0.7, 'triangle', 0.07);
    },
    // Tiếng xì kéo dài (núi lửa, đài phun).
    hiss(sec) { this.noiseHit(0, sec, 5000, 'highpass', 0.12); },
    // Tiếng vút của sao băng.
    zing() { const f = 1200 + Math.random() * 600; this.tone(f, 0, 0.45, 'sine', 0.04, f * 2.2); },
    // Tiếng xoáy đi lên (dải ngân hà).
    whirl() { for (let i = 0; i < 18; i++) this.tone(300 + i * 70, i * 0.07, 0.15, 'triangle', 0.05); },
    crackle(start, n) {
      for (let i = 0; i < n; i++) this.tone(1800 + Math.random() * 4000, start + Math.random() * 0.7, 0.03, 'square', 0.025);
    },
    // Tiếng tên lửa phóng: tiếng xì mạnh dần rồi bay xa.
    whoosh() {
      const c = this.ctx;
      if (!c) return;
      this.noiseHit(0, 2.2, 900, 'lowpass', 0.35);
      this.tone(120, 0, 2, 'sawtooth', 0.05, 900);
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

  // Nhạc nền khi leo tháp: vòng lặp 116 BPM, hợp âm C–Am–F–G, giai điệu ngũ cung, âm lượng nhỏ.
  const Music = {
    on: readLocal(MUSIC_KEY, true) !== false,
    bus: null,
    playing: false,
    paused: false,
    ducked: false,
    timer: null,
    next: 0,
    step: 0,
    CHORDS: [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]],
    MELODY: [
      [76, 0, 79, 76, 72, 0, 74, 76], [81, 0, 79, 76, 79, 0, 76, 74], [72, 74, 76, 0, 81, 79, 76, 0], [74, 0, 79, 0, 74, 76, 79, 0],
      [79, 0, 81, 79, 76, 0, 72, 74], [76, 0, 72, 69, 72, 0, 74, 76], [77, 0, 76, 74, 72, 0, 69, 72], [74, 76, 79, 81, 79, 0, 0, 0],
    ],

    start() {
      if (!this.on || this.playing || !Sfx.ctx) return;
      const c = Sfx.ctx;
      if (!this.bus) {
        this.bus = c.createGain();
        this.bus.gain.value = 0;
        this.bus.connect(c.destination);
      }
      this.playing = true;
      this.paused = false;
      this.step = 0;
      this.next = c.currentTime + 0.15;
      this.timer = setInterval(() => this.schedule(), 100);
      this.fade();
    },
    stop() {
      clearInterval(this.timer);
      this.timer = null;
      this.playing = false;
      this.paused = false;
      this.fade();
    },
    pause() { this.paused = true; this.fade(); },
    resume() { this.paused = false; this.fade(); },
    // Hạ nhỏ khi cú đang đọc.
    duck(on) { this.ducked = on; this.fade(); },
    toggle() {
      this.on = !this.on;
      writeLocal(MUSIC_KEY, this.on);
      if (this.on) this.start();
      else this.stop();
    },
    fade() {
      if (!this.bus) return;
      const c = Sfx.ctx;
      const v = !this.playing || this.paused ? 0 : this.ducked ? 0.3 : 1;
      this.bus.gain.cancelScheduledValues(c.currentTime);
      this.bus.gain.setTargetAtTime(v, c.currentTime, 0.12);
    },
    schedule() {
      const c = Sfx.ctx;
      const e = 60 / 116 / 2;   // một móc đơn
      while (this.next < c.currentTime + 0.35) {
        if (!this.paused) this.play(this.step, this.next - c.currentTime);
        this.next += e;
        this.step = (this.step + 1) % 64;
      }
    },
    play(s, t) {
      const bus = this.bus;
      const e = 60 / 116 / 2;
      const beat = s % 8;
      const chord = this.CHORDS[Math.floor(s / 8) % 4];
      if (beat === 0 || beat === 4) Sfx.tone(mf(chord[0] - 12), t, e * 1.8, 'triangle', 0.09, null, bus);
      if (beat === 6) Sfx.tone(mf(chord[2] - 12), t, e * 0.9, 'triangle', 0.07, null, bus);
      if (beat === 2 || beat === 6) chord.forEach(m => Sfx.tone(mf(m + 12), t, e * 0.8, 'triangle', 0.018, null, bus));
      if (beat % 2 === 1) Sfx.noiseHit(t, 0.03, 9000, 'highpass', 0.025, bus);
      if (beat === 0) Sfx.tone(120, t, 0.12, 'sine', 0.12, 50, bus);
      const m = this.MELODY[Math.floor(s / 8)][beat];
      if (m) Sfx.tone(mf(m), t, e * 1.5, 'sine', 0.045, null, bus);
    },
  };

  /* ================= Tiện ích giao diện ================= */

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const $ = sel => app.querySelector(sel);
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const emo = (ch, cls) => `<img class="emo ${cls || ''}" src="img/${C.emojiFile(ch)}.svg" alt="${ch}" draggable="false">`;
  const title = cls => `<h1 class="title ${cls || ''}">${['Bé', 'Học', 'Vui'].map((w, i) => `<span style="--i:${i}">${w}</span>`).join(' ')}</h1>`;
  const corner = () => '<div class="corner"><div class="owl-slot"></div><div class="bubble"></div></div>';
  const themeById = id => C.themes.find(t => t.id === id);

  // Bạn thú của bé, đội mũ đang chọn; withPet thì có thú cưng đi cạnh. Cỡ theo font-size của chỗ đặt.
  function avatarHtml(p, withPet) {
    return `<span class="ava">${emo(p.avatar)}${p.hat ? emo(p.hat, 'ava-hat') : ''}${withPet && p.pet ? emo(p.pet, 'ava-pet') : ''}</span>`;
  }

  // Khung cảnh (nền trời) của bé đang chơi; không có hồ sơ thì về bầu trời mặc định.
  function applyTheme() {
    const t = profile && profile.theme;
    if (t) document.body.setAttribute('data-theme', t);
    else document.body.removeAttribute('data-theme');
  }

  function mountOwl() {
    const slot = $('.owl-slot');
    if (slot) slot.appendChild(document.getElementById('owl-tpl').content.firstElementChild.cloneNode(true));
  }

  function mood(name) {
    const o = $('.owl');
    if (!o) return;
    o.classList.remove('happy', 'think', 'sleep');
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
    Music.stop();
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

  // Chế độ hiệu ứng của máy này (lưu riêng từng máy, không theo hồ sơ): 'auto' tự chọn, 'full' đầy đủ, 'lite' nhẹ.
  // Tivi (webOS…) có chip đồ họa yếu: 'auto' dùng bản nhẹ ngay, máy khác thì chuyển sang nhẹ khi đo thấy vẽ chậm.
  const FX_MODE_KEY = 'be-hoc-vui:fxmode';
  const FX_SLOW_KEY = 'be-hoc-vui:fxslow';
  const IS_TV = /Web0S|webOS|SmartTV|SMART-TV|NetCast|Tizen|HbbTV|BRAVIA/i.test(navigator.userAgent);

  const FX_COLORS = ['#f43f5e', '#f59e0b', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];

  // Hình cho pháo hoa nổ thành hình: mỗi hàm trả về n điểm (x, y) cỡ khoảng -1..1.
  const SHAPES = {
    heart: n => C.util.range(0, n - 1).map(i => {
      const t = (i / n) * Math.PI * 2;
      return [Math.pow(Math.sin(t), 3), -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16];
    }),
    star5: n => C.util.range(0, n - 1).map(i => {
      const k = (i / n) * 10;
      const j = Math.floor(k);
      const f = k - j;
      const pt = m => {
        const r = m % 2 ? 0.45 : 1;
        const a = (m * Math.PI) / 5 - Math.PI / 2;
        return [Math.cos(a) * r, Math.sin(a) * r];
      };
      const [a, b] = [pt(j), pt(j + 1)];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }),
    smile: n => {
      const out = [];
      const ring = Math.round(n * 0.6);
      for (let i = 0; i < ring; i++) {
        const t = (i / ring) * Math.PI * 2;
        out.push([Math.cos(t), Math.sin(t)]);
      }
      const mouth = n - ring - 8;
      for (let i = 0; i < mouth; i++) {
        const t = Math.PI * (0.15 + 0.7 * (i / mouth));
        out.push([Math.cos(t) * 0.6, Math.sin(t) * 0.6]);
      }
      for (let i = 0; i < 8; i++) out.push([(i < 4 ? -0.35 : 0.35) + (Math.random() - 0.5) * 0.08, -0.3 + (Math.random() - 0.5) * 0.08]);
      return out;
    },
    flower: n => C.util.range(0, n - 1).map(i => {
      const t = (i / n) * Math.PI * 2;
      const r = 0.35 + 0.65 * Math.abs(Math.cos(2.5 * t));
      return [Math.cos(t) * r, Math.sin(t) * r];
    }),
  };

  const Fx = {
    canvas: null,
    ctx: null,
    dpr: 1,
    parts: [],
    running: false,
    last: 0,
    // Tự giảm số mảnh nếu máy (tivi) vẽ không kịp, và nhớ mức đó cho lần sau.
    quality: Math.max(0.35, Math.min(1, +readLocal('be-hoc-vui:fxq', 1) || 1)),
    emitters: [],     // nguồn phun liên tục trong một khoảng thời gian (dải ngân hà, núi lửa)
    ema: 1 / 60,
    lite: false,

    // Hệ số số mảnh: chất lượng tự điều chỉnh, bản nhẹ còn khoảng 40%.
    k() { return this.quality * (this.lite ? 0.4 : 1); },

    // Bật/tắt bản nhẹ: khung vẽ độ phân giải thấp, ít mảnh, bỏ các lớp CSS tốn sức vẽ (body.lite).
    setLite(on) {
      this.lite = !!on;
      document.body.classList.toggle('lite', this.lite);
      if (this.fit) this.fit();
    },
    applyMode() {
      const mode = readLocal(FX_MODE_KEY, 'auto');
      this.setLite(mode === 'lite' || (mode === 'auto' && (IS_TV || readLocal(FX_SLOW_KEY, false) === true)));
    },

    ensure() {
      if (this.canvas) return;
      const c = document.createElement('canvas');
      c.className = 'fx';
      document.body.appendChild(c);
      this.canvas = c;
      this.ctx = c.getContext('2d');
      const fit = () => {
        this.dpr = this.lite ? 0.6 : Math.min(window.devicePixelRatio || 1, 2);
        c.width = Math.round(innerWidth * this.dpr);
        c.height = Math.round(innerHeight * this.dpr);
      };
      this.fit = fit;
      fit();
      window.addEventListener('resize', fit);
    },

    add(p, force) {
      if (force || this.parts.length < (this.lite ? 280 : 900) * this.quality) this.parts.push(p);
    },

    // Pháo giấy bắn từ (x, y) theo góc a0..a1 độ (-90 = thẳng lên), tốc độ s0..s1 rem/giây.
    confetti(x, y, n, a0, a1, s0, s1) {
      this.ensure();
      const u = rem();
      n = Math.max(3, Math.round(n * (this.lite ? 0.35 : 1)));
      for (let i = 0; i < n; i++) {
        const a = ((a0 + Math.random() * (a1 - a0)) * Math.PI) / 180;
        const s = (s0 + Math.random() * (s1 - s0)) * u;
        const r = Math.random();
        this.add({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 30 * u, drag: 0.985,
          size: (0.4 + Math.random() * 0.5) * u, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16,
          color: pick(FX_COLORS), shape: this.lite ? (r < 0.6 ? 'rect' : 'dot') : r < 0.15 ? 'star' : r < 0.65 ? 'rect' : 'dot',
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

    // Một quả pháo hoa nổ: peony (vòng tia nhiều màu), willow (liễu vàng rủ xuống), ring (vòng tròn đều),
    // crackle (nổ xong còn lách tách).
    firework(x, y, n, type) {
      this.ensure();
      const u = rem();
      const color = pick(FX_COLORS);
      n = Math.round(n * this.k());
      if (type === 'willow') {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = (4 + Math.random() * 6) * u;
          this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 3.5 * u, drag: 0.965, size: 0.18 * u, rot: 0, vr: 0,
            color: Math.random() < 0.3 ? '#fff7ed' : '#fbbf24', shape: 'spark', twinkle: true, life: 2 + Math.random() * 1.2, fade: 1 });
        }
      } else if (type === 'ring') {
        const c2 = pick(FX_COLORS);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const inner = i % 3 === 0;
          const s = (inner ? 5 : 10) * u;
          this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 4 * u, drag: 0.95, size: 0.24 * u, rot: 0, vr: 0,
            color: inner ? c2 : color, shape: 'spark', life: 1.3 + Math.random() * 0.3, fade: 0.5 });
        }
      } else if (type === 'crackle') {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = (5 + Math.random() * 7) * u;
          this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 6 * u, drag: 0.95, size: 0.2 * u, rot: 0, vr: 0,
            color: '#fef9c3', shape: 'spark', life: 0.6 + Math.random() * 0.4, fade: 0.2,
            onDie: i % 2 ? null : p => this.sparkle(p.x, p.y, 3) });
        }
        Sfx.crackle(0.6, 14);
      } else if (SHAPES[type]) {
        // Pháo hoa nổ thành hình: trái tim, ngôi sao, mặt cười, bông hoa.
        const pts = SHAPES[type](Math.max(this.lite ? 36 : 60, Math.round(90 * this.k())));
        const c = type === 'heart' ? '#f43f5e' : color;
        const k = (14 + Math.random() * 3) * u;
        for (const [px, py] of pts) {
          this.add({ x, y, vx: px * k, vy: py * k, g: 1.2 * u, drag: 0.94, size: 0.32 * u, rot: 0, vr: 0,
            color: Math.random() < 0.15 ? '#fff' : c, shape: 'spark', life: 1.5 + Math.random() * 0.3, fade: 0.6 });
        }
      }
      if (type && type !== 'peony') {
        this.ring(x, y, color);
        this.start();
        return;
      }
      this.ring(x, y, color);
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

    // Vài tia lấp lánh nhỏ (dùng cho pháo lách tách).
    sparkle(x, y, n) {
      const u = rem();
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        this.add({ x, y, vx: Math.cos(a) * 3 * u, vy: Math.sin(a) * 3 * u, g: 2 * u, drag: 0.9, size: 0.14 * u, rot: 0, vr: 0,
          color: '#fff', shape: 'spark', twinkle: true, life: 0.3 + Math.random() * 0.3, fade: 0.3 });
      }
    },

    // Chạy fn(dt, t) mỗi khung hình trong dur giây.
    emit(dur, fn) {
      this.ensure();
      this.emitters.push({ t: 0, dur, fn });
      this.start();
    },

    // Mưa pháo giấy rơi từ mép trên màn hình.
    confettiRain(n) {
      this.ensure();
      const u = rem();
      n = Math.round(n * this.k());
      for (let i = 0; i < n; i++) {
        const r = Math.random();
        this.add({
          x: Math.random() * innerWidth, y: -u * (1 + Math.random() * 10), vx: (Math.random() - 0.5) * 6 * u, vy: (2 + Math.random() * 5) * u,
          g: 9 * u, drag: 0.985, size: (0.5 + Math.random() * 0.6) * u, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14,
          color: pick(FX_COLORS), shape: r < 0.2 ? 'star' : r < 0.75 ? 'rect' : 'dot', life: 3 + Math.random() * 1.5, fade: 0.6,
        });
      }
      this.start();
    },

    // Bóng bay bay lên, lắc lư, rồi nổ bụp thành pháo giấy.
    balloon(x, delay) {
      const u = rem();
      this.add({
        x, y: innerHeight + 3 * u, vx: 0, vy: -(9 + Math.random() * 6) * u, g: -1.5 * u, drag: 0.995, size: (2.2 + Math.random()) * u,
        rot: 0, vr: 0, ph: Math.random() * 6, wobble: true, color: pick(FX_COLORS), shape: 'balloon', life: 1.4 + (delay || 0) + Math.random() * 1.1, fade: 0.01,
        onDie: p => {
          this.confetti(p.x, p.y, 22, -180, 0, 6, 16);
          this.ring(p.x, p.y, p.color, 14, 0.3);
          Sfx.pop();
        },
      }, true);
      this.start();
    },

    // Sao băng vụt chéo màn hình, để lại vệt sáng.
    shootingStar() {
      const u = rem();
      this.add({
        x: -2 * u + Math.random() * innerWidth * 0.45, y: Math.random() * innerHeight * 0.35, vx: (38 + Math.random() * 14) * u, vy: (12 + Math.random() * 8) * u,
        g: 0, drag: 1, size: 2.2 * u, rot: 0, vr: 3, color: Math.random() < 0.5 ? '#fde047' : '#fff', shape: 'star', trail: ['#fff', '#fde68a', '#93c5fd'], trailSize: 0.4,
        twinkle: true, life: 0.7 + Math.random() * 0.4, fade: 0.2, onDie: p => this.sparkle(p.x, p.y, 8),
      }, true);
      Sfx.zing();
      this.start();
    },

    // Tia sét gấp khúc từ mép trên xuống.
    bolt(x) {
      const u = rem();
      const pts = [[x, 0]];
      let px = x;
      for (let y = 0; y < innerHeight * 0.75;) {
        y += (2 + Math.random() * 3) * u;
        px += (Math.random() - 0.5) * 6 * u;
        pts.push([px, y]);
      }
      this.add({ x, y: 0, vx: 0, vy: 0, g: 0, drag: 1, size: 0.5 * u, rot: 0, vr: 0, pts, color: '#fff', shape: 'bolt', life: 0.45, fade: 0.45 }, true);
      this.start();
      return pts[pts.length - 1];
    },

    // Thiên thạch rực lửa lao xuống, chạm đất thì nổ.
    meteor() {
      const u = rem();
      const g = 8 * u;
      const y0 = -2 * u;
      const vy = (20 + Math.random() * 10) * u;
      const ground = innerHeight * (0.78 + Math.random() * 0.12);
      const t = (-vy + Math.sqrt(vy * vy + 2 * g * (ground - y0))) / g;
      this.add({
        x: innerWidth * (0.45 + Math.random() * 0.65), y: y0, vx: -(12 + Math.random() * 10) * u, vy, g, drag: 1, size: 0.9 * u, rot: 0, vr: 0,
        color: '#fff7ed', shape: 'dot', trail: ['#ef4444', '#f97316', '#facc15', '#fde68a'], trailSize: 0.55, life: t, fade: 0.01,
        onDie: p => {
          this.glow(p.x, p.y, '#f97316');
          this.firework(p.x, p.y, 45, 'crackle');
          this.confetti(p.x, p.y, 12, -150, -30, 8, 18);
          Sfx.bang();
          shake(0.5);
        },
      }, true);
      Sfx.whistle();
      this.start();
    },

    // Đài phun lửa ở đáy màn hình, phun tia sáng lên trong sec giây.
    fountain(x, sec, power) {
      const u = rem();
      this.emit(sec, dt => {
        const n = Math.round((90 + power * 12) * dt * this.k() * 3);
        for (let i = 0; i < n; i++) {
          const a = (-90 + (Math.random() - 0.5) * 26) * Math.PI / 180;
          const sp = (16 + Math.random() * (8 + power)) * u;
          this.add({ x, y: innerHeight, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 16 * u, drag: 0.985, size: 0.3 * u, rot: 0, vr: 0,
            color: pick(['#fde047', '#fb923c', '#fff7ed', '#f97316']), shape: 'spark', twinkle: Math.random() < 0.3, life: 1.2 + Math.random() * 0.6, fade: 0.4 });
        }
      });
    },

    // Dải ngân hà: 3 cánh tay xoắn tỏa ra từ (x, y).
    galaxy(x, y, sec) {
      const u = rem();
      this.emit(sec, (dt, t) => {
        const n = Math.max(1, Math.round(5 * this.k()));
        for (let arm = 0; arm < 3; arm++) {
          for (let i = 0; i < n; i++) {
            const a = t * 7 + arm * (Math.PI * 2 / 3) + (Math.random() - 0.5) * 0.3;
            const sp = (13 + Math.random() * 7) * u;
            this.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0, drag: 0.975, size: 0.28 * u, rot: 0, vr: 0,
              color: pick(['#a855f7', '#22d3ee', '#fff', '#f0abfc', '#818cf8']), shape: 'spark', twinkle: true, life: 1.3 + Math.random() * 0.6, fade: 0.6 });
          }
        }
      });
    },

    // Quầng sáng lớn lóe lên chỗ pháo nổ (để nhìn rõ cả trên nền trời sáng).
    glow(x, y, color) {
      const u = rem();
      this.add({ x, y, vx: 0, vy: 0, g: 0, drag: 1, r: 2 * u, grow: 16 * u, size: 0, rot: 0, vr: 0,
        color, shape: 'glow', life: 0.35, max: 0.35, fade: 0.35 }, true);
    },

    // Vòng sóng nổ lan ra.
    ring(x, y, color, grow, width) {
      this.ensure();
      const u = rem();
      this.add({ x, y, vx: 0, vy: 0, g: 0, drag: 1, r: u, grow: (grow || 22) * u, size: (width || 0.5) * u, rot: 0, vr: 0,
        color: color || '#fff', shape: 'ring', life: 0.6, max: 0.6, fade: 0.6 }, true);
      this.start();
    },

    // Quả pháo bay từ dưới đáy màn hình lên độ cao y rồi nổ.
    rocket(x, y, type) {
      this.ensure();
      const u = rem();
      const g = 14 * u;
      const v = Math.sqrt(2 * g * Math.max(u, innerHeight - y));
      this.add({
        x, y: innerHeight, vx: (Math.random() - 0.5) * 3 * u, vy: -v, g, drag: 1, size: 0.4 * u, rot: 0, vr: 0,
        color: '#fff7ed', shape: 'dot', trail: true, life: v / g, fade: 0.01,
        onDie: p => {
          this.glow(p.x, p.y, type === 'willow' ? '#fde68a' : pick(FX_COLORS));
          this.firework(p.x, p.y, type === 'willow' ? 80 : 70, type);
          Sfx.bang();
        },
      }, true);
      Sfx.whistle();
      this.start();
    },

    // Mưa tiền vàng xoay lật rơi từ trên xuống.
    coins(n) {
      this.ensure();
      const u = rem();
      n = Math.round(n * this.k());
      for (let i = 0; i < n; i++) {
        this.add({
          x: Math.random() * innerWidth, y: -u * (1 + Math.random() * 8), vx: (Math.random() - 0.5) * 4 * u, vy: (4 + Math.random() * 6) * u,
          g: 18 * u, drag: 0.99, size: (0.9 + Math.random() * 0.5) * u, rot: Math.random() * 6, vr: 6 + Math.random() * 8,
          color: '#facc15', shape: 'coin', life: 2.6 + Math.random(), fade: 0.4,
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
      // Đo tốc độ vẽ: chậm quá (dưới ~33 hình/giây khi đang nhiều mảnh) thì giảm dần số mảnh.
      this.ema = this.ema * 0.92 + dt * 0.08;
      // Chế độ tự động: đang vẽ hơn 80 mảnh mà dưới ~30 hình/giây thì chuyển hẳn sang bản nhẹ và nhớ cho lần sau.
      if (!this.lite && this.parts.length > 80 && this.ema > 0.033 && readLocal(FX_MODE_KEY, 'auto') === 'auto') {
        this.setLite(true);
        writeLocal(FX_SLOW_KEY, true);
      }
      if (this.parts.length > 200 && this.ema > 0.03 && this.quality > 0.35) {
        this.quality = Math.max(0.35, this.quality - 0.01);
        writeLocal('be-hoc-vui:fxq', this.quality);
      } else if (this.parts.length > 200 && this.ema < 0.019 && this.quality < 1) {
        this.quality = Math.min(1, this.quality + 0.002);   // vẽ mượt trở lại thì tăng dần
      }
      this.emitters = this.emitters.filter(e => {
        e.t += dt;
        e.fn(dt, e.t);
        return e.t < e.dur;
      });
      const dead = [];
      this.parts = this.parts.filter(p => {
        if ((p.life -= dt) > 0) return true;
        if (p.onDie) dead.push(p);
        return false;
      });
      dead.forEach(p => p.onDie(p));
      const trail = [];
      const u = rem();
      for (const p of this.parts) {
        if (p.trail && (!this.lite || Math.random() < 0.4)) {
          trail.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * u, vy: Math.random() * 2 * u, g: 4 * u, drag: 0.9, size: (p.trailSize || 0.22) * u,
            rot: 0, vr: 0, color: Array.isArray(p.trail) ? pick(p.trail) : Math.random() < 0.5 ? '#fde68a' : '#fb923c', shape: 'dot',
            life: 0.3 + Math.random() * 0.25, fade: 0.3 });
        }
        if (p.wobble) p.vx = Math.sin(p.life * 3 + p.ph) * 2 * u;
        const k = Math.pow(p.drag, dt * 60);
        p.vx *= k;
        p.vy = p.vy * k + p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.globalAlpha = Math.min(1, p.life / p.fade) * (p.twinkle ? 0.35 + Math.random() * 0.65 : 1);
        ctx.fillStyle = ctx.strokeStyle = p.color;
        if (p.shape === 'ring') {
          p.r += p.grow * dt;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.lineWidth = Math.max(0.5, p.size * (p.life / p.max));
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.stroke();
          continue;
        }
        if (p.shape === 'balloon') {
          const r = p.size;
          ctx.setTransform(dpr, 0, 0, dpr, dpr * p.x, dpr * p.y);
          ctx.lineWidth = r * 0.04;
          ctx.strokeStyle = '#64748b';
          ctx.beginPath();
          ctx.moveTo(0, r * 0.6);
          ctx.quadraticCurveTo(r * 0.25, r * 1.1, -r * 0.05, r * 1.6);
          ctx.stroke();
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, r * 0.45, r * 0.56, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(-r * 0.08, r * 0.62);
          ctx.lineTo(r * 0.08, r * 0.62);
          ctx.lineTo(0, r * 0.52);
          ctx.fill();
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.ellipse(-r * 0.15, -r * 0.22, r * 0.09, r * 0.16, -0.5, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        if (p.shape === 'bolt') {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.lineJoin = 'round';
          ctx.globalAlpha = Math.random() < 0.25 ? 0.2 : Math.min(1, p.life / p.fade);
          [[p.size * 4, 'rgba(147, 197, 253, .45)'], [p.size, '#fff']].forEach(([w, c]) => {
            ctx.lineWidth = w;
            ctx.strokeStyle = c;
            ctx.beginPath();
            p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.stroke();
          });
          continue;
        }
        if (p.shape === 'glow') {
          p.r += p.grow * dt;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.globalAlpha = 0.55 * (p.life / p.max);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.9 * (p.life / p.max);
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 0.4, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        if (p.shape === 'coin') {
          const w = Math.cos(p.rot);
          ctx.setTransform(dpr * w, 0, 0, dpr, dpr * p.x, dpr * p.y);
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = w > 0 ? '#facc15' : '#eab308';
          ctx.fill();
          ctx.lineWidth = p.size * 0.1;
          ctx.strokeStyle = '#a16207';
          ctx.stroke();
          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.arc(-p.size * 0.12, -p.size * 0.12, p.size * 0.18, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
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
      trail.forEach(p => this.add(p));
      if (this.parts.length || this.emitters.length) {
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
    if (!Fx.lite) fxEl('flash', `--x:${x}px;--y:${y}px`, 700);
    Fx.cannons(power >= 3 ? 70 : 40);
    const shells = Fx.lite ? (power >= 3 ? 2 : 1) : power >= 3 ? 5 : 2;
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

  // Rung màn hình, biên độ theo k (0.3 nhẹ … 2 rất mạnh).
  function shake(k) {
    const body = document.body;
    body.style.setProperty('--quake', (0.3 + k * 0.6) + 'rem');
    body.style.setProperty('--quake-n', String(2 + Math.round(k * 3)));
    body.classList.remove('quake');
    body.getBoundingClientRect();
    body.classList.add('quake');
    clearTimeout(shake.timer);
    shake.timer = setTimeout(() => body.classList.remove('quake'), 400 + k * 400);
  }

  const later = (ms, fn) => setTimeout(fn, ms);
  const rx = (a, b) => innerWidth * (a + Math.random() * (b - a));
  const ry = (a, b) => innerHeight * (a + Math.random() * (b - a));

  // Mỗi mốc một màn hiệu ứng riêng, mốc sau hoành tráng hơn mốc trước. pw = độ mạnh 1–10.
  const BURSTS = {
    1: { name: 'Bão pháo giấy!', run(pw) {
      Fx.cannons(Math.round(80 * Fx.k()));
      Fx.confettiRain(90 + pw * 10);
      later(700, () => Fx.confettiRain(70 + pw * 10));
      later(300, () => Fx.rocket(rx(0.2, 0.4), ry(0.15, 0.3), 'peony'));
      later(700, () => Fx.rocket(rx(0.6, 0.8), ry(0.15, 0.3), 'peony'));
    } },
    2: { name: 'Bóng bay!', run(pw) {
      const n = 14 + pw * 2;
      for (let i = 0; i < n; i++) Fx.balloon(rx(0.05, 0.95), i * 0.06);
      Fx.cannons(Math.round(40 * Fx.k()));
      later(1600, () => Fx.rocket(innerWidth / 2, ry(0.15, 0.25), 'ring'));
    } },
    3: { name: 'Sao băng!', run(pw) {
      fxEl('darken', '--ms:3600ms;--dark:.45', 3600);
      const n = 14 + pw * 2;
      for (let i = 0; i < n; i++) later(i * 140, () => Fx.shootingStar());
      later(n * 140, () => {
        Fx.rocket(rx(0.2, 0.4), ry(0.15, 0.3), 'willow');
        Fx.rocket(rx(0.6, 0.8), ry(0.15, 0.3), 'willow');
      });
    } },
    4: { name: 'Pháo hoa hình thù!', run(pw) {
      const shapes = C.util.shuffle(['heart', 'star5', 'smile', 'flower']);
      const n = 4 + Math.floor(pw / 2);
      for (let i = 0; i < n; i++) later(i * 380, () => Fx.rocket(innerWidth * (0.15 + (0.7 * i) / Math.max(1, n - 1)), ry(0.15, 0.32), shapes[i % 4]));
      Fx.cannons(Math.round(40 * Fx.k()));
    } },
    5: { name: 'Cầu vồng!', run(pw) {
      fxEl('rainbow', '', 3400);
      Sfx.harp();
      const colors = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7'];
      for (let i = 0; i < 7; i++) {
        const t = Math.PI * (1 - i / 6);
        later(500 + i * 170, () => Fx.rocket(innerWidth / 2 + Math.cos(t) * innerWidth * 0.36, innerHeight * 0.9 - Math.sin(t) * innerHeight * 0.62, i % 2 ? 'ring' : 'peony'));
      }
      later(400, () => colors.forEach((c, i) => later(i * 90, () => Fx.ring(innerWidth / 2, innerHeight, c, 40 + i * 4, 0.6))));
      later(1900, () => Fx.coins(30 + pw * 6));
    } },
    6: { name: 'Dải ngân hà!', run(pw) {
      const cx = innerWidth / 2;
      const cy = innerHeight * 0.42;
      fxEl('darken', '--ms:4200ms;--dark:.5', 4200);
      Sfx.whirl();
      Fx.galaxy(cx, cy, 1.6 + pw * 0.1);
      later(1900, () => {
        Fx.glow(cx, cy, '#a855f7');
        Fx.firework(cx, cy, 120, 'peony');
        Fx.ring(cx, cy, '#22d3ee', 40, 1);
        Sfx.boom();
        shake(1);
      });
      later(2300, () => ['star5', 'ring', 'star5'].forEach((t, i) => later(i * 200, () => Fx.rocket(rx(0.15, 0.85), ry(0.12, 0.3), t))));
    } },
    7: { name: 'Sấm sét!', run(pw) {
      fxEl('darken', '--ms:3600ms', 3600);
      const n = 3 + Math.floor(pw / 3);
      for (let i = 0; i < n; i++) {
        later(300 + i * 450, () => {
          const end = Fx.bolt(rx(0.15, 0.85));
          fxEl('whiteout', 'opacity:.6', 300);
          Fx.glow(end[0], end[1], '#93c5fd');
          Fx.sparkle(end[0], end[1], 12);
          Sfx.thunder();
          shake(1.2);
        });
      }
      later(400 + n * 450, () => {
        for (let i = 0; i < 4 + Math.floor(pw / 2); i++) later(i * 160, () => Fx.rocket(rx(0.1, 0.9), ry(0.1, 0.3), 'willow'));
      });
    } },
    8: { name: 'Mưa thiên thạch!', run(pw) {
      fxEl('darken', '--ms:3000ms;--dark:.35', 3000);
      const n = 7 + pw;
      for (let i = 0; i < n; i++) later(i * 200, () => Fx.meteor());
      later(n * 200 + 500, () => Fx.coins(40 + pw * 6));
    } },
    9: { name: 'Núi lửa pháo hoa!', run(pw) {
      [0.18, 0.5, 0.82].forEach((x, i) => later(i * 250, () => Fx.fountain(innerWidth * x, 2.6, pw)));
      Sfx.hiss(3);
      shake(0.8);
      later(1200, () => shake(1));
      later(2900, () => {
        Sfx.boom();
        shake(1.6);
        ['crackle', 'heart', 'willow', 'ring', 'star5', 'peony'].forEach((t, i) => later(i * 90, () => Fx.rocket(rx(0.1, 0.9), ry(0.1, 0.3), t)));
        Fx.coins(50 + pw * 6);
      });
    } },
    10: { name: 'Siêu pháo hoa!', run(pw) {
      fxEl('darken', '--ms:6500ms;--dark:.55', 6500);
      BURSTS[6].run(pw);
      later(1400, () => BURSTS[3].run(pw));
      later(2400, () => BURSTS[5].run(pw));
      later(3200, () => BURSTS[8].run(pw));
      later(4200, () => BURSTS[9].run(pw));
      later(5200, () => BURSTS[4].run(pw));
    } },
  };

  // Nổ lớn ở một mốc: phần chung (rung, chớp trắng, sóng nổ, chữ lớn đập xuống) mạnh dần theo power,
  // rồi tới màn hiệu ứng riêng của theme (mặc định là màn của mốc đó).
  function megaBurst(title, power, theme) {
    const pw = Math.max(1, Math.min(10, power || 1));
    const th = BURSTS[theme] ? theme : pw;
    const cx = innerWidth / 2;
    const cy = innerHeight * 0.42;
    shake(0.4 + pw * 0.15);
    if (pw >= 2) fxEl('whiteout', '', 600);
    Sfx.boom();
    const rings = 1 + Math.ceil(pw / 3);
    for (let i = 0; i < rings; i++) {
      later(i * 130, () => Fx.ring(cx, cy, ['#fff', '#fde047', '#f97316', '#ec4899', '#22d3ee'][i % 5], 26 + i * 6 + pw, 0.9 - i * 0.12));
    }
    Fx.firework(cx, cy, 50 + pw * 8, 'peony');
    if (title) {
      const tier = pw >= 8 ? 'rainbow' : pw >= 5 ? 'gold' : '';
      fxEl('slam ' + tier, `--pw:${pw}`, 1800, `<div class="slam-rays"></div><span class="slam-text">${esc(title)}</span>` +
        `<span class="slam-sub">${esc(BURSTS[th].name)}</span>`);
    }
    // Để chữ lớn hiện rõ một chút rồi mới vào màn hiệu ứng riêng.
    later(title ? 650 : 0, () => BURSTS[th].run(pw));
  }

  // Độ dữ dội của quà theo mốc hiện tại.
  const giftPower = () => (game ? Math.max(1, Math.min(10, Math.round(game.floor / SEGMENT))) : 1);
  // Mở quà: nổ ngẫu nhiên một màn bé đã mở khóa (không lặp lại màn vừa xem) cho bất ngờ.
  function surpriseTheme() {
    const opts = C.util.range(1, giftPower()).filter(t => t !== surpriseTheme.last);
    surpriseTheme.last = opts.length ? pick(opts) : 1;
    return surpriseTheme.last;
  }

  /* ================= Màn hình mở đầu, chọn bé, tạo hồ sơ ================= */

  // Danh sách câu đã có giọng đọc (audio/list.json, do bước đưa lên GitHub Pages tạo ra). Không có danh sách
  // (chạy bằng serve.py, bản cài tivi) thì coi như câu nào cũng có giọng.
  let voiced = null;
  const voicedReady = (window.fetch ? fetch('audio/list.json', { cache: 'no-store' }) : Promise.reject())
    .then(r => (r.ok ? r.json() : null))
    .then(list => { if (Array.isArray(list) && list.length) voiced = new Set(list); })
    .catch(() => {});
  const hasVoice = text => !voiced || voiced.has(C.hash(text));

  const ready = Promise.all([Store.init(), voicedReady.then(() => {}, () => {})]).then(() => {});

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
      Sfx.warm();
      Fx.ensure();
      showProfiles(true);
    };
  }

  function showProfiles(greet) {
    const list = Store.list();
    profile = null;
    applyTheme();
    if (!list.length) return showNewProfile(true);
    screen('profiles', `
      <h2 class="screen-title">Ai đang chơi?</h2>
      <div class="profile-list">
        ${list.map((p, i) => `
          <button class="profile-card nav" data-id="${esc(p.id)}" style="--i:${i}">
            <span class="avatar">${avatarHtml(p, true)}</span>
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

  const ageButtons = (cur, cls) => C.ages.map((a, i) => `
    <button class="age-opt nav${a.age === cur ? ' chosen' : ''} ${cls || ''}" data-age="${a.age}" style="--i:${i}">
      <b>${a.age} tuổi</b><small>${esc(a.label)}</small>
    </button>`).join('');

  function showNewProfile(first) {
    let chosen = C.avatars[0];
    let age = 5;
    screen('newprofile', `
      <div class="panel newprofile">
        <h2 class="screen-title">Chọn bạn thú của con</h2>
        <div class="avatar-grid">
          ${C.avatars.map((a, i) => `<button class="avatar-opt nav${i === 0 ? ' chosen' : ''}" data-a="${a}" style="--i:${i}">${emo(a)}</button>`).join('')}
        </div>
        <div class="age-row">${ageButtons(age)}</div>
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
    app.querySelectorAll('.age-opt').forEach(b => {
      b.onclick = () => {
        age = +b.dataset.age;
        app.querySelectorAll('.age-opt').forEach(x => x.classList.toggle('chosen', x === b));
        Sfx.pop();
      };
    });
    if (!first) $('#cancel').onclick = () => showProfiles(false);
    $('#create').onclick = () => {
      const p = newProfile($('#pname').value.trim(), chosen);
      p.age = age;
      Store.add(p);
      selectProfile(p);
    };
    focusFirst('.avatar-opt');
    Voice.say(C.phrases.newProfile);
  }

  // Hồ sơ tạo từ trước khi có chọn tuổi: hỏi tuổi một lần.
  function showAgePicker(p) {
    screen('age', `
      <div class="panel newprofile">
        <div class="age-who">${avatarHtml(p, true)}<b>${esc(p.name || 'Bé')}</b></div>
        <h2 class="screen-title">Con mấy tuổi rồi?</h2>
        <div class="age-row big">${ageButtons(p.age)}</div>
        <p class="hint">Tuổi giúp chọn câu hỏi vừa sức. Bố mẹ đổi lại được trong trang "Bố mẹ xem".</p>
      </div>
      ${corner()}`);
    app.querySelectorAll('.age-opt').forEach(b => {
      b.onclick = () => {
        setAge(p, +b.dataset.age);
        Sfx.pop();
        showHome(true);
      };
    });
    focusFirst('.age-opt[data-age="5"]');
    Voice.say(C.phrases.askAge);
  }

  function selectProfile(p) {
    profile = p;
    writeLocal(LAST_KEY, p.id);
    applyTheme();
    if (!p.age) showAgePicker(p);
    else showHome(true);
  }

  /* ================= Trang chủ của bé ================= */

  const climbOf = (p, id) => p.climbs[id] || { floor: 0, hearts: HEARTS, owl: 1, swap: 1 };
  // Món tiếp theo trong danh sách [không có, ...món đã có] để bé bấm đổi vòng tròn.
  const cycle = (list, cur) => {
    const opts = [null].concat(list);
    return opts[(opts.indexOf(cur) + 1) % opts.length];
  };

  async function showHome(greet, focusSel) {
    const p = profile;
    const n = todayCount(p);
    const streak = streakOf(p);
    const theme = themeById(p.theme);
    const ep = screen('home', `
      <header class="home-top">
        <button class="who nav" id="switch">${avatarHtml(p, true)}<span>${esc(p.name || 'Bé')}</span></button>
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
          const floor = climbOf(p, s.id).floor;
          const wins = (p.towers[s.id] || {}).wins || 0;
          return `
          <button class="tower-card nav" data-id="${s.id}" data-say="${esc(s.name)}" style="--c:${s.color};--i:${i}">
            ${emo(s.icon, 'tower-icon')}
            <span class="tower-name">${esc(s.name)}</span>
            <span class="segs">${Array.from({ length: FLOORS / SEGMENT }, (_, k) =>
              `<i style="--p:${Math.max(0, Math.min(1, (floor - k * SEGMENT) / SEGMENT))}"></i>`).join('')}</span>
            <span class="tower-best">${wins ? emo('👑', 'tiny') : ''}Tầng <b>${floor}</b>/${FLOORS}</span>
          </button>`;
        }).join('')}
      </div>
      <footer class="home-foot">
        <button class="pill nav" id="album">${emo('📒', 'tiny')} Bộ sưu tập ${collectionCount(p)}</button>
        ${p.hats.length ? `<button class="pill nav" id="hat">${emo(p.hat || p.hats[0], 'tiny')} Đổi mũ</button>` : ''}
        ${p.pets.length ? `<button class="pill nav" id="pet">${emo(p.pet || p.pets[0], 'tiny')} Thú cưng</button>` : ''}
        ${p.themes.length ? `<button class="pill nav" id="theme">${emo(theme ? theme.icon : '🎨', 'tiny')} Khung cảnh</button>` : ''}
        <button class="pill nav" id="parents">Bố mẹ xem</button>
      </footer>
      ${corner()}`);
    app.querySelectorAll('.tower-card').forEach(b => { b.onclick = () => startTower(b.dataset.id); });
    $('#switch').onclick = () => showProfiles(true);
    $('#album').onclick = showAlbum;
    $('#parents').onclick = showParents;
    const change = (id, key, list) => {
      const b = $('#' + id);
      if (!b) return;
      b.onclick = () => {
        p[key] = cycle(list, p[key]);
        Store.save(p);
        applyTheme();
        Sfx.pop();
        showHome(false, '#' + id);
      };
    };
    change('hat', 'hat', p.hats);
    change('pet', 'pet', p.pets);
    change('theme', 'theme', p.themes);
    focusFirst(focusSel || '.tower-card');
    if (!greet) return;
    await Voice.say(p.plays ? C.phrases.welcomeBack : C.phrases.welcomeNew);
    if (ep === epoch && streak >= 2) Voice.say(C.phrases.streak(Math.min(streak, 20)));
  }

  // Các ngăn trong bộ sưu tập: [tiêu đề, mọi món, món bé đã có].
  function collection(p) {
    return [
      ['Hình dán', C.stickers, p.stickers],
      ['Hình dán vàng', C.golden, p.golden],
      ['Mũ', C.hats.concat('👑'), p.hats],
      ['Thú cưng', C.pets.common.concat(C.pets.rare), p.pets],
      ['Khung cảnh', C.themes.map(t => t.icon), p.themes.map(id => themeById(id).icon)],
    ];
  }
  function collectionCount(p) {
    const parts = collection(p);
    return sum(parts.map(c => c[2].length)) + '/' + sum(parts.map(c => c[1].length));
  }

  function showAlbum() {
    const p = profile;
    let k = 0;
    screen('album', `
      <div class="panel album">
        <h2 class="screen-title">${emo('📒', 'tiny')} Bộ sưu tập <small>${collectionCount(p)}</small></h2>
        ${collection(p).map(([name, all, have]) => `
          <section class="shelf${name === 'Hình dán vàng' ? ' gold' : ''}">
            <h3>${esc(name)} <small>${have.length}/${all.length}</small></h3>
            <div class="sticker-grid">
              ${all.map(s => (have.includes(s)
                ? `<span class="slot on" style="--i:${k++}">${emo(s)}</span>`
                : '<span class="slot">?</span>')).join('')}
            </div>
          </section>`).join('')}
        <p class="hint">Cứ leo được 10 tầng là tới một mốc có quà bí mật. Làm xong nhiệm vụ hôm nay cũng được hình dán mới.</p>
        <button class="btn-big nav" id="back">← Về nhà</button>
      </div>`);
    $('#back').onclick = () => showHome(false);
    focusFirst('#back');
  }

  const setRow = (label, key, opts, cur) => `
    <div class="set-row"><span class="meta">${esc(label)}:</span>
      ${opts.map(([v, t]) => `<button class="set-opt nav${v === cur ? ' chosen' : ''}" data-key="${key}" data-val="${v}">${esc(t)}</button>`).join('')}
    </div>`;

  function showParents() {
    const p = profile;
    const days = Object.keys(p.days).sort().slice(-14);
    screen('parents', `
      <div class="panel parents">
        <h2 class="screen-title">Bố mẹ xem: ${esc(p.name || 'Bé')} ${emo(p.avatar, 'tiny')}</h2>
        <p class="meta">
          ⭐ ${p.stars} sao · 🔥 ${streakOf(p)} ngày liên tiếp · ${p.plays} lượt leo tháp · bộ sưu tập ${collectionCount(p)}<br>
          Lưu tiến độ: ${Store.server ? 'máy chủ trong nhà (serve.py) và trình duyệt này' : 'chỉ trong trình duyệt này'}
        </p>
        <div class="age-row small"><span class="meta">Tuổi:</span>${ageButtons(p.age)}</div>
        <div class="settings">
          ${setRow('Nghỉ giải lao khi hết tim 2 lần trong 10 phút', 'breakOn', [[true, 'Bật'], [false, 'Tắt']], p.settings.breakOn)}
          ${setRow('Thời gian nghỉ', 'breakMin', [[1, '1 phút'], [2, '2 phút'], [3, '3 phút']], p.settings.breakMin)}
          ${setRow('Chờ tối đa khi sai liên tiếp', 'maxCooldown', [3, 6, 10, 15].map(n => [n, n + ' giây']), p.settings.maxCooldown)}
          ${setRow('Hiệu ứng trên máy này', 'fxmode', [['auto', 'Tự động'], ['full', 'Đầy đủ'], ['lite', 'Nhẹ (cho tivi)']], readLocal(FX_MODE_KEY, 'auto'))}
          <p class="meta muted">Đang dùng: ${Fx.lite ? 'bản nhẹ' : 'bản đầy đủ'}${IS_TV ? ' (máy này là tivi)' : ''}. Pháo hoa bị giật thì chọn "Nhẹ".</p>
          <p class="meta">Bấm vội rồi sai: <b>${p.rushes}</b> lần · Đã nghỉ giải lao: <b>${p.breakCount}</b> lần
            ${p.breakUntil > Date.now() ? ' · <b>đang trong giờ nghỉ</b> <button class="pill nav" id="endbreak">Kết thúc giờ nghỉ ngay</button>' : ''}</p>
        </div>
        <p class="meta muted">Đổi tuổi sẽ đặt lại cấp độ của mọi kỹ năng theo tuổi mới; sau đó độ khó tự tăng giảm theo kết quả của bé.</p>
        <div class="row">
          <button class="btn-big nav" id="back">← Về nhà</button>
          <button class="btn-big danger nav" id="delete">Xóa hồ sơ này</button>
        </div>
        <table>
          <thead><tr><th>Kỹ năng</th><th>Cấp</th><th>Đúng ngay (tổng)</th><th>10 câu gần nhất</th></tr></thead>
          <tbody>
            ${C.subjects.map(s => {
              const t = p.towers[s.id] || {};
              const head = `<tr class="group-row"><th colspan="4">${emo(s.icon, 'tiny')} ${esc(s.name)} · đang ở tầng ${climbOf(p, s.id).floor}/${FLOORS}` +
                ` · cao nhất ${t.best || 0}/${FLOORS}${t.wins ? ` · về đích ${t.wins} lần` : ''}</th></tr>`;
              if (s.id === 'mix') return head;
              return head + s.skills.map(id => {
                const st = p.skills[id] || { level: startLevel(p, id), recent: [], total: 0, firstTry: 0 };
                const pct = st.total ? Math.round((st.firstTry / st.total) * 100) : 0;
                return `<tr>
                  <td>${esc(C.skills[id].name)}</td>
                  <td>${st.level}/${C.skills[id].maxLevel || 1}</td>
                  <td>${st.total ? `<span class="bar"><i style="width:${pct}%"></i></span> ${pct}% (${st.firstTry}/${st.total})` : '<span class="muted">chưa học</span>'}</td>
                  <td class="recent">${st.recent.slice(-10).map(r => `<i class="${r ? 'ok' : 'no'}"></i>`).join('')}</td>
                </tr>`;
              }).join('');
            }).join('')}
          </tbody>
        </table>
        <p class="meta">Câu đúng ngay theo ngày: ${days.length ? days.map(d => `${d.slice(8)}/${d.slice(5, 7)}: <b>${p.days[d]}</b>`).join(' · ') : 'chưa có'}</p>
        <p class="credits">Hình minh họa: Twemoji (CC-BY 4.0). Giọng đọc: Linh (macOS).</p>
      </div>`);
    $('#back').onclick = () => showHome(false);
    app.querySelectorAll('.set-opt').forEach(b => {
      b.onclick = () => {
        const v = b.dataset.val;
        if (b.dataset.key === 'fxmode') {
          writeLocal(FX_MODE_KEY, v);
          writeLocal(FX_SLOW_KEY, false);
          Fx.applyMode();
        } else {
          p.settings[b.dataset.key] = v === 'true' ? true : v === 'false' ? false : +v;
          Store.save(p);
        }
        showParents();
        focusFirst(`.set-opt[data-key="${b.dataset.key}"][data-val="${v}"]`);
      };
    });
    if ($('#endbreak')) {
      $('#endbreak').onclick = () => {
        p.breakUntil = 0;
        Store.save(p);
        showParents();
      };
    }
    app.querySelectorAll('.age-opt').forEach(b => {
      b.onclick = () => {
        if (+b.dataset.age === p.age) return;
        setAge(p, +b.dataset.age);
        showParents();
      };
    });
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

  const segOf = f => Math.floor(f / SEGMENT) * SEGMENT;

  // Vào tháp: leo tiếp đúng tầng, số tim và quyền trợ giúp đã lưu (thoát giữa chừng không được nạp lại tim).
  function startTower(subjectId) {
    if (profile.breakUntil > Date.now()) return showBreak(subjectId);
    const subject = C.subjects.find(s => s.id === subjectId);
    const c = climbOf(profile, subjectId);
    const resumed = c.floor > 0 || c.hearts < HEARTS;
    game = {
      subject, floor: c.floor, seg: segOf(c.floor), hearts: Math.max(1, Math.min(HEARTS, c.hearts)), owl: c.owl, swap: c.swap,
      stars: 0, combo: 0, asked: 0, confirmSaid: 0, retry: [], recent: [], gifts: [],
      q: null, tries: 0, taught: false, helped: false, selected: null, locked: true, teaching: false,
      wrongRun: 0, slowNext: false, unlockedAt: 0,
    };
    towerState(subjectId).plays++;
    profile.plays++;
    Store.save(profile);
    showTower();
    nextQuestion(resumed ? C.phrases.resume : null);
  }

  function saveClimb() {
    const g = game;
    profile.climbs[g.subject.id] = { floor: g.floor, hearts: g.hearts, owl: g.owl, swap: g.swap };
    const t = towerState(g.subject.id);
    t.best = Math.max(t.best, g.floor);
    Store.save(profile);
  }

  // Tầng 1–10 (khởi động) dễ hơn cấp của bé một bậc, 11–60 đúng cấp, 61–100 khó hơn một bậc.
  function levelFor(skill, floor) {
    const base = skillState(skill).level;
    const max = C.skills[skill].maxLevel || 1;
    if (floor <= 10) return Math.max(1, base - 1);
    if (floor > 60) return Math.min(max, base + 1);
    return base;
  }

  // Số câu khác nhau của một kỹ năng ở một cấp (ước lượng bằng cách tạo thử, nhớ lại để dùng tiếp).
  const poolCache = {};
  function poolSize(skill, level) {
    const id = skill + '@' + level;
    if (!poolCache[id]) {
      const keys = new Set();
      for (let i = 0; i < 160; i++) {
        const q = C.skills[skill].gen(level);
        keys.add(q.say + '|' + q.answer);
      }
      poolCache[id] = keys.size;
    }
    return poolCache[id];
  }

  // Chọn câu hỏi ít lặp lại nhất:
  // - Mỗi hồ sơ nhớ các câu đã hỏi của từng kỹ năng (profile.qhist, lưu mã ngắn của câu, mới nhất ở cuối),
  //   không xóa khi qua mốc hay vào lại tháp. Chỉ hỏi lại khi đã hỏi hết các câu khác, câu cũ nhất quay lại trước.
  // - Kỹ năng có ít câu (ví dụ Nghề nghiệp) được chọn ít hơn kỹ năng có nhiều câu (trọng số theo căn bậc hai).
  // - Câu phải dạy lại vẫn cố ý quay lại sau 2 câu (g.retry).
  const QHIST_MAX = 150;
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
    const weights = skills.map(sk => Math.sqrt(poolSize(sk, levelFor(sk, g.floor + 1))));
    let best = null;
    let skill = null;
    // Câu chưa có giọng đọc thì bỏ qua; kỹ năng nào chưa có câu nào có giọng thì thử kỹ năng khác.
    for (let attempt = 0; attempt < 6 && !best; attempt++) {
      let r = Math.random() * sum(weights);
      skill = skills[skills.length - 1];
      for (let i = 0; i < skills.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          skill = skills[i];
          break;
        }
      }
      const level = levelFor(skill, g.floor + 1);
      const hist = profile.qhist[skill] || (profile.qhist[skill] = []);
      let bestAge = Infinity;
      for (let i = 0; i < 40; i++) {
        const q = C.skills[skill].gen(level);
        if (!hasVoice(q.say) || !hasVoice(q.explain)) continue;
        q.skill = skill;
        q.key = q.say + '|' + q.answer;
        const age = hist.indexOf(C.hash(q.key));   // -1 = chưa hỏi bao giờ; số nhỏ = hỏi từ lâu
        if (age < bestAge) {
          best = q;
          bestAge = age;
          if (age === -1) break;
        }
      }
    }
    const q = best || C.skills[skill].gen(levelFor(skill, g.floor + 1));
    if (!best) {
      q.skill = skill;
      q.key = q.say + '|' + q.answer;
    }
    const hist = profile.qhist[skill] || (profile.qhist[skill] = []);
    const h = C.hash(q.key);
    const at = hist.indexOf(h);
    if (at >= 0) hist.splice(at, 1);
    hist.push(h);
    if (hist.length > QHIST_MAX) hist.splice(0, hist.length - QHIST_MAX);
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
        <button class="icon-btn nav${Music.on ? '' : ' off'}" id="music" aria-label="Nhạc">${emo('🎵')}</button>
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
        <div class="progress"><div class="progress-bar"><i></i></div><b class="progress-num"></b></div>
        <div class="floors"></div>
      </aside>
      ${corner()}
      <div class="overlay"></div>`);
    renderLadder();
    $('#home').onclick = askQuit;
    $('#replay').onclick = () => { if (game && game.q && !game.teaching) Voice.say(game.q.say); };
    $('#lock').onclick = confirmAnswer;
    $('#h-owl').onclick = useOwl;
    $('#h-swap').onclick = useSwap;
    $('#music').onclick = () => {
      Music.toggle();
      $('#music').classList.toggle('off', !Music.on);
    };
    Music.start();
  }

  // Thang bên phải chỉ hiện đoạn 10 tầng đang leo: trên cùng là mốc 🎁 bí ẩn (tầng 100 là 🏆), dưới cùng là mốc đã qua.
  function renderLadder() {
    const g = game;
    const top = g.seg + SEGMENT;
    let html = '';
    for (let f = top; f > g.seg; f--) {
      const goal = f === top;
      html += `<div class="floor${goal ? ' milestone' : ''}" data-f="${f}"><span class="fnum">${f}</span>` +
        `${emo(goal ? (f === FLOORS ? '🏆' : '🎁') : '⭐', 'prize')}</div>`;
    }
    html += g.seg ? `<div class="floor base"><span class="fnum">${g.seg}</span>${emo('⛳', 'prize')}</div>` : '<div class="ground"></div>';
    html += `<div class="climber">${avatarHtml(profile, true)}</div>`;
    $('.floors').innerHTML = html;
  }

  function renderStatus() {
    const g = game;
    app.querySelectorAll('.floor[data-f]').forEach(el => {
      const f = +el.dataset.f;
      el.classList.toggle('done', f <= g.floor);
      el.classList.toggle('next', f === g.floor + 1);
    });
    $('.floors').style.setProperty('--f', g.floor - g.seg);
    $('.progress-num').textContent = g.floor + '/' + FLOORS;
    $('.progress-bar i').style.width = (g.floor / FLOORS) * 100 + '%';
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

  function nextQuestion(intro) {
    game.asked++;
    showQuestion(makeQuestion(), intro);
  }

  async function showQuestion(q, intro) {
    const g = game;
    const ep = newEpoch();
    Object.assign(g, { q, tries: 0, taught: false, helped: false, selected: null, locked: true, teaching: false });
    renderStatus();
    renderScene(q);
    $('.ask-text').textContent = q.show || q.say;
    $('.ask-text').classList.toggle('long', !!q.long);
    renderOptions(q);
    setAction(null);
    mood('idle');
    if (intro || q.isRetry) {
      await Voice.say(intro || C.phrases.retryIntro);
      if (ep !== epoch) return;
    }
    await Voice.say(q.say);
    if (ep !== epoch) return;
    // Câu trước bé bấm vội rồi sai: đếm 3-2-1 cho bé nhìn kỹ rồi mới được bấm.
    if (g.slowNext) {
      g.slowNext = false;
      await thinkPause();
      if (ep !== epoch) return;
    }
    unlock();
  }

  async function thinkPause() {
    const ep = epoch;
    const box = $('.options');
    box.classList.add('thinking');
    box.insertAdjacentHTML('beforeend', `<div class="think-count">${emo('⏳')}</div>`);
    const el = box.querySelector('.think-count');
    await Voice.say(C.phrases.lookCarefully);
    for (const n of [3, 2, 1]) {
      if (ep !== epoch) return;
      el.textContent = n;
      el.classList.remove('tick');
      el.getBoundingClientRect();
      el.classList.add('tick');
      Sfx.tick();
      await Promise.all([Voice.say(C.NUM[n]), wait(900)]);
    }
    if (ep !== epoch) return;
    el.remove();
    box.classList.remove('thinking');
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
      el.innerHTML = group(s.e, s.n, undefined, s.n > 10 ? 'many' : s.n > 5 ? 'wide' : '');
    } else if (s.type === 'add') {
      el.innerHTML = `<div class="badged" data-n="${s.a}">${group(s.e, s.a)}</div><span class="op">+</span>` +
        `<div class="badged" data-n="${s.b}">${group(s.e, s.b)}</div><span class="op">=</span><span class="op q">?</span>`;
    } else if (s.type === 'sub') {
      el.innerHTML = `<div class="badged" data-n="${s.a}">${group(s.e, s.a, s.a - s.b, s.a > 5 ? 'wide' : '')}</div>` +
        `<span class="op small">bớt ${s.b}</span><span class="op">=</span><span class="op q">?</span>`;
    } else if (s.type === 'sum') {
      // Phép tính bằng chữ số cho bé lớn: 12 + 5 = ?, 3 + ? = 7.
      el.innerHTML = s.parts.map(x => (typeof x === 'number' ? `<span class="op num-big">${x}</span>`
        : x === '?' ? '<span class="op q">?</span>' : `<span class="op">${x}</span>`)).join('');
    } else if (s.type === 'seq') {
      el.innerHTML = `<div class="seq">${s.items.map((it, i) => `<span class="seq-item" style="--i:${i}">${it.e ? emo(it.e) : `<b>${it.num}</b>`}</span>`).join('')}` +
        '<span class="seq-item q">?</span></div>';
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
      case 'num': return `<span class="num${o.value >= 100 ? ' small' : ''}">${o.value}</span>`;
      case 'letter': return `<span class="letter${o.value.length > 1 ? ' pair' : ''}"><span>${esc(o.value.charAt(0).toUpperCase() + o.value.slice(1))}</span><span>${esc(o.value)}</span></span>`;
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
    g.unlockedAt = Date.now();
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
    // Bấm vội (chốt rất nhanh sau khi được bấm) mà sai: câu sau phải đếm 3-2-1 mới được chọn.
    if (!ok && Date.now() - g.unlockedAt < RUSH_MS + 1100) {
      g.slowNext = true;
      profile.rushes++;
    }
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
    if (first) g.wrongRun = 0;
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
      if (g.floor % SEGMENT === 0) {
        // Giữ đoạn thang cũ (bé đứng trên đỉnh) tới khi mở quà xong.
        await milestone(g.floor);
        if (ep !== epoch) return;
        if (g.floor >= FLOORS) {
          crownTower();
        } else {
          // Mốc an toàn: tim đầy, trợ giúp mới cho đoạn 10 tầng tiếp theo.
          Object.assign(g, { seg: g.floor, hearts: HEARTS, owl: 1, swap: 1 });
          renderLadder();
          renderStatus();
        }
      }
    } else if (!q.isRetry) {
      g.retry.push({ q, due: g.asked + RETRY_AFTER });
      await Voice.say(C.phrases.later);
      if (ep !== epoch) return;
    }
    if (g.floor < FLOORS) saveClimb();
    if (res.missionDone) {
      await reward('mission');
      if (ep !== epoch) return;
    }
    if (g.floor >= FLOORS) endTower();
    else nextQuestion();
  }

  async function onWrong(btn, ep) {
    const g = game;
    const q = g.q;
    g.tries++;
    g.combo = 0;
    g.wrongRun++;
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
      outOfHearts();
      return;
    }
    saveClimb();
    if (g.tries === 1) {
      if (q.countAlong) hintPulse();
      const hint = g.hearts === 1 ? C.phrases.lastHeart : q.countAlong ? C.phrases.countHint : pick(C.phrases.wrong);
      await Promise.all([Voice.say(hint), cooldown(cooldownMs())]);
      if (ep !== epoch) return;
      reshuffle(q);
      unlock();
    } else if (!g.taught) {
      await teach(q, C.phrases.teach);
      if (ep !== epoch) return;
      g.taught = true;
      unlock();
    } else {
      await Promise.all([Voice.say(C.phrases.teachDone), cooldown(cooldownMs())]);
      if (ep !== epoch) return;
      unlock();
    }
  }

  // Sai liên tiếp thì chờ lâu dần: 3, 6, 10 giây… (tối đa theo cài đặt), đúng ngay một câu là về lại 3 giây.
  function cooldownMs() {
    const max = profile.settings.maxCooldown;
    const step = COOLDOWN_STEPS[Math.min(game.wrongRun, COOLDOWN_STEPS.length) - 1] || COOLDOWN_STEPS[0];
    return Math.min(step, max) * 1000;
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

  // Hỏi Cú: không chỉ đáp án, chỉ loại bớt đáp án sai (còn lại đáp án đúng và một vài đáp án sai) để bé tự chọn.
  // Câu chỉ có 2 đáp án thì không loại được gì nên không tốn lượt.
  function useOwl() {
    const g = game;
    if (!g || g.owl <= 0 || g.locked || g.teaching) {
      wiggle($('#h-owl'));
      return;
    }
    const right = String(g.q.answer);
    const open = optionButtons().filter(b => !b.disabled);
    const wrong = open.filter(b => b.dataset.val !== right);
    const keep = g.q.mode === 'pad' ? 2 : 1;           // bàn phím số: chừa 2 số sai; ô hình: chừa 1 ô sai
    if (open.length <= 2 || wrong.length <= keep) {
      wiggle($('#h-owl'));
      return;
    }
    g.owl--;
    g.helped = true;
    saveClimb();
    renderStatus();
    clearSelection();
    shuffle(wrong).slice(keep).forEach((b, i) => {
      setTimeout(() => {
        b.classList.add('owl-out');
        b.disabled = true;
        Sfx.pop();
      }, i * 120);
    });
    mood('happy');
    Voice.say(C.phrases.owlRemoved);
    if (keyMode) {
      setTimeout(() => { const f = optionButtons().find(b => !b.disabled); if (f) f.focus(); }, 400);
    }
  }


  function useSwap() {
    const g = game;
    if (!g || g.swap <= 0 || g.locked || g.teaching) {
      wiggle($('#h-swap'));
      return;
    }
    g.swap--;
    saveClimb();
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

  /* ---------- Quà ---------- */

  // Tặng một món; đã có hết thì đổi sang hình dán vàng, hết nữa thì +3 sao. Mũ, thú cưng, khung cảnh mới được dùng luôn.
  function grant(kind, rare) {
    const p = profile;
    const pools = {
      sticker: [C.stickers, p.stickers], golden: [C.golden, p.golden], hat: [C.hats, p.hats],
      pet: [rare ? C.pets.rare : C.pets.common, p.pets], theme: [C.themes.map(t => t.id), p.themes],
    };
    const [pool, have] = pools[kind] || [[], []];
    const left = pool.filter(x => !have.includes(x));
    if (!left.length) {
      if (kind !== 'golden') return grant('golden');
      p.stars += 3;
      Store.save(p);
      return { kind: 'stars' };
    }
    const item = kind === 'theme' ? left[0] : pick(left);
    have.push(item);
    if (kind === 'hat') p.hat = item;
    if (kind === 'pet') p.pet = item;
    if (kind === 'theme') p.theme = item;
    Store.save(p);
    if (game) game.gifts.push(kind === 'theme' ? themeById(item).icon : item);
    return { kind, item };
  }

  // Phần thưởng nhiệm vụ ngày vẫn là hình dán thường như trước.
  function grantSticker() {
    const left = C.stickers.filter(s => !profile.stickers.includes(s));
    if (!left.length) {
      profile.stars += 3;
      Store.save(profile);
      return null;
    }
    const s = pick(left);
    profile.stickers.push(s);
    game.gifts.push(s);
    Store.save(profile);
    return s;
  }

  const overlay = () => $('.overlay');
  const GRANT_INFO = {
    sticker: ['Hình dán mới!', 'sticker'], golden: ['Hình dán vàng siêu hiếm!', 'golden'], hat: ['Mũ mới!', 'hat'],
    pet: ['Thú cưng mới!', 'pet'], theme: ['Khung cảnh mới!', 'theme'], stars: ['+3 sao', 'bonus'],
  };

  // Mở hộp quà và khoe món vừa nhận. Trả về false nếu bé đã rời màn hình.
  async function reveal(gr, heading) {
    const ep = epoch;
    const ov = overlay();
    const theme = gr.kind === 'theme' && themeById(gr.item);
    const shown = gr.kind === 'hat' ? avatarHtml(profile) : emo(gr.kind === 'stars' ? '⭐' : theme ? theme.icon : gr.item);
    ov.innerHTML = `
      <div class="reward-card gift-${gr.kind}">
        <h2>${esc(heading)}</h2>
        <div class="prize-box">
          <div class="gift">${emo('🎁')}</div>
          <div class="sticker">${shown}</div>
        </div>
        <p class="reward-note">${esc(theme ? theme.name : GRANT_INFO[gr.kind][0])}</p>
      </div>`;
    await wait(900);
    if (ep !== epoch) return false;
    ov.querySelector('.reward-card').classList.add('open');
    if (theme) applyTheme();
    Sfx.fanfare();
    celebrate(ov.querySelector('.prize-box'), 3);
    megaBurst(null, giftPower(), surpriseTheme());
    await Voice.say(C.phrases[GRANT_INFO[gr.kind][1]]);
    return ep === epoch;
  }

  // Thêm nút "Tiếp tục" vào thẻ đang hiện và chờ bé bấm.
  function tapToContinue() {
    const card = overlay().querySelector('.reward-card');
    card.insertAdjacentHTML('beforeend', '<button class="btn-big nav" id="reward-ok">Tiếp tục ▶</button>');
    const ok = card.querySelector('#reward-ok');
    ok.focus();
    return new Promise(resolve => { ok.onclick = resolve; });
  }

  // Quà ở mỗi mốc: càng lên cao càng bất ngờ.
  const GIFT_PLAN = {
    10: [() => reveal(grant('sticker'), 'Quà tầng 10')],
    20: [() => reveal(grant('hat'), 'Quà tầng 20')],
    30: [() => eggGame(false)],
    40: [() => reveal(grant('theme'), 'Quà tầng 40')],
    50: [partyGift],
    60: [() => eggGame(true)],
    70: [() => reveal(grant('theme'), 'Quà tầng 70'), () => reveal(grant('hat'), 'Quà tầng 70')],
    80: [starRain],
    90: [rocketGift],
    100: [championGift],
  };

  async function milestone(floor) {
    const ep = epoch;
    const ov = overlay();
    Music.pause();
    mood('happy');
    ov.innerHTML = `
      <div class="reward-card">
        <h2>Tầng ${floor}!</h2>
        <div class="prize-box"><div class="gift">${emo(floor === FLOORS ? '🏆' : '🎁')}</div></div>
      </div>`;
    ov.classList.add('show');
    megaBurst(floor === FLOORS ? 'VÔ ĐỊCH!' : `TẦNG ${floor}!`, floor / SEGMENT);
    await wait(900);
    if (ep !== epoch) return;
    await Voice.say(C.phrases.floorReached(floor));
    if (ep !== epoch) return;
    for (const step of GIFT_PLAN[floor]) {
      const ok = await step();
      if (!ok || ep !== epoch) return;
      await tapToContinue();
      if (ep !== epoch) return;
    }
    ov.classList.remove('show');
    ov.innerHTML = '';
    Music.resume();
  }

  // Trứng thần kỳ: bấm liên tục, trứng lắc và nứt dần rồi nở ra thú cưng.
  async function eggGame(rare) {
    const ep = epoch;
    const ov = overlay();
    const need = rare ? 16 : 12;
    ov.innerHTML = `
      <div class="reward-card egg-card${rare ? ' rare' : ''}">
        <h2>${rare ? 'Trứng hiếm!' : 'Trứng thần kỳ!'}</h2>
        <button class="egg nav" id="egg">
          ${emo('🥚')}
          <svg class="cracks" viewBox="0 0 100 100"><path pathLength="1" d="M50 22 L43 34 L54 42 L41 53 L57 61 L46 74 M54 42 L67 47 M41 53 L30 50 M57 61 L68 66"/></svg>
        </button>
        <div class="egg-meter"><i></i></div>
        <p class="reward-note">Bấm thật nhanh nào!</p>
      </div>`;
    const egg = ov.querySelector('#egg');
    egg.focus();
    Voice.say(C.phrases.eggIntro);
    let taps = 0;
    await new Promise(resolve => {
      egg.onclick = () => {
        if (taps >= need) return;
        taps++;
        const k = taps / need;
        egg.style.setProperty('--p', k);
        ov.querySelector('.egg-meter i').style.width = k * 100 + '%';
        egg.classList.remove('knock');
        egg.getBoundingClientRect();
        egg.classList.add('knock');
        Sfx.tone(300 + taps * 45, 0, 0.09, 'triangle', 0.16);
        if (taps >= need) resolve();
      };
    });
    if (ep !== epoch) return false;
    egg.classList.add('hatch');
    egg.querySelector('.emo').src = 'img/' + C.emojiFile('🐣') + '.svg';
    Sfx.bang();
    celebrate(egg, 2);
    await wait(1300);
    if (ep !== epoch) return false;
    return reveal(grant('pet', rare), rare ? 'Thú cưng hiếm!' : 'Thú cưng mới!');
  }

  // Lễ hội nửa đường: sàn nhảy disco vài giây, rồi chọn 1 trong 3 hộp bí mật để nhận hình dán vàng.
  async function partyGift() {
    const ep = epoch;
    const ov = overlay();
    const p = profile;
    ov.innerHTML = `
      <div class="disco">
        <div class="disco-lights"></div>
        <div class="disco-ball">${emo('🪩')}</div>
        <h2 class="disco-title">Lễ hội nửa đường!</h2>
        <div class="dancers">
          <span class="dancer">${avatarHtml(p)}</span>
          <span class="dancer owl-dancer"></span>
          ${p.pet ? `<span class="dancer">${emo(p.pet)}</span>` : ''}
        </div>
      </div>`;
    ov.querySelector('.owl-dancer').appendChild(document.getElementById('owl-tpl').content.firstElementChild.cloneNode(true));
    Sfx.dance(5.6);
    Voice.say(C.phrases.party);
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        if (ep !== epoch) return;
        Fx.firework(innerWidth * (0.1 + Math.random() * 0.8), innerHeight * (0.1 + Math.random() * 0.3), 50);
      }, 400 + i * 850);
    }
    await wait(5800);
    if (ep !== epoch) return false;
    ov.innerHTML = `
      <div class="reward-card pick">
        <h2>Chọn một hộp!</h2>
        <div class="boxes">${[0, 1, 2].map(i => `<button class="box nav" style="--i:${i}">${emo('🎁')}</button>`).join('')}</div>
      </div>`;
    const boxes = [...ov.querySelectorAll('.box')];
    boxes[1].focus();
    Voice.say(C.phrases.pickIntro);
    const chosen = await new Promise(resolve => boxes.forEach(b => { b.onclick = () => resolve(b); }));
    if (ep !== epoch) return false;
    boxes.forEach(b => b.classList.add(b === chosen ? 'chosen' : 'other'));
    Sfx.pop();
    await wait(700);
    if (ep !== epoch) return false;
    return reveal(grant('golden'), 'Hộp bí mật');
  }

  // Mưa sao: bấm liên tục trong 8 giây, mỗi lần +1 sao (tối đa 30).
  async function starRain() {
    const ep = epoch;
    const ov = overlay();
    const MAX = 30;
    const SECONDS = 8;
    ov.innerHTML = `
      <div class="rain"></div>
      <div class="reward-card rain-card">
        <h2>Mưa sao!</h2>
        <button class="catch nav" id="catch">${emo('⭐')}</button>
        <b class="catch-count">0</b>
        <div class="rain-meter"><i></i></div>
      </div>`;
    const sky = ov.querySelector('.rain');
    const drops = setInterval(() => {
      if (ep !== epoch) return clearInterval(drops);
      const d = document.createElement('div');
      d.className = 'drop';
      d.style.cssText = `left:${Math.random() * 100}%;--dur:${1.8 + Math.random() * 1.6}s;--s:${0.6 + Math.random() * 0.9}`;
      d.innerHTML = emo(Math.random() < 0.85 ? '⭐' : '🌟');
      sky.appendChild(d);
      setTimeout(() => d.remove(), 3500);
    }, 160);
    const btn = ov.querySelector('#catch');
    btn.focus();
    let open = false;
    let n = 0;
    btn.onclick = () => {
      if (!open || n >= MAX) {
        wiggle(btn);
        return;
      }
      n++;
      ov.querySelector('.catch-count').textContent = n;
      btn.classList.remove('bump');
      btn.getBoundingClientRect();
      btn.classList.add('bump');
      Sfx.tone(700 + n * 30, 0, 0.1, 'sine', 0.12);
      const r = btn.getBoundingClientRect();
      Fx.confetti(r.left + r.width / 2, r.top + r.height / 2, 6, -160, -20, 6, 14);
    };
    await Voice.say(C.phrases.starRainIntro);
    if (ep !== epoch) return false;
    open = true;
    ov.querySelector('.rain-card').classList.add('running');
    ov.querySelector('.rain-meter').style.setProperty('--ms', SECONDS * 1000 + 'ms');
    await wait(SECONDS * 1000);
    if (ep !== epoch) return false;
    open = false;
    clearInterval(drops);
    profile.stars += n;
    Store.save(profile);
    if (game) game.gifts.push('⭐');
    const card = ov.querySelector('.rain-card');
    card.classList.remove('running');
    card.insertAdjacentHTML('beforeend', `<p class="reward-note">+${n} sao</p>`);
    Sfx.fanfare();
    celebrate(btn, 3);
    megaBurst(null, giftPower(), surpriseTheme());
    await Voice.say(C.phrases.starRainDone);
    return ep === epoch;
  }

  // Tên lửa: đếm ngược, bạn thú cưỡi tên lửa bay chéo màn hình, rồi mở khung cảnh tiếp theo.
  async function rocketGift() {
    const ep = epoch;
    const ov = overlay();
    ov.innerHTML = `
      <div class="launch">
        <div class="countdown"></div>
        <div class="rocket-ride">${emo('🚀', 'rocket')}<span class="rider">${avatarHtml(profile)}</span></div>
      </div>`;
    const cd = ov.querySelector('.countdown');
    const show = text => {
      cd.textContent = text;
      cd.classList.remove('tick');
      cd.getBoundingClientRect();
      cd.classList.add('tick');
      Sfx.tick();
    };
    const said = Voice.say(C.phrases.rocket);
    ['3', '2', '1'].forEach((t, i) => setTimeout(() => { if (ep === epoch) show(t); }, 1300 + i * 650));
    await said;
    if (ep !== epoch) return false;
    show('Phóng!');
    ov.querySelector('.launch').classList.add('go');
    Sfx.whoosh();
    const trail = setInterval(() => {
      const r = ov.querySelector('.rocket-ride');
      if (ep !== epoch || !r) return clearInterval(trail);
      const b = r.getBoundingClientRect();
      Fx.confetti(b.left + b.width * 0.2, b.top + b.height * 0.8, 8, 90, 180, 4, 10);
    }, 90);
    await wait(2600);
    clearInterval(trail);
    if (ep !== epoch) return false;
    return reveal(grant('theme'), 'Quà tầng 90');
  }

  // Tầng 100: cúp, vương miện đội luôn, giấy khen có tên bé, môn và ngày; pháo hoa lớn nhất.
  async function championGift() {
    const ep = epoch;
    const ov = overlay();
    const p = profile;
    if (!p.hats.includes('👑')) p.hats.push('👑');
    p.hat = '👑';
    Store.save(p);
    game.gifts.push('👑');
    const d = new Date();
    const date = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    ov.innerHTML = `
      <div class="reward-card champion">
        <div class="trophy">${emo('🏆')}</div>
        <div class="certificate">
          <p class="cert-title">Giấy khen</p>
          <p>Tặng bé <b>${esc(p.name || 'Bé')}</b></p>
          <div class="cert-ava">${avatarHtml(p, true)}</div>
          <p>đã leo hết <b>100 tầng</b> tháp <b>${esc(game.subject.name)}</b></p>
          <p class="cert-date">Ngày ${date}</p>
        </div>
      </div>`;
    Sfx.fanfare();
    const card = ov.querySelector('.reward-card');
    const finale = [4, 7, 8, 9];
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        if (ep !== epoch) return;
        celebrate(card, 3);
        megaBurst(null, 10, finale[i]);
        if (i) Sfx.fanfare();
      }, i * 2600);
    }
    await Voice.say(C.phrases.champion);
    if (ep !== epoch) return false;
    await wait(1500);
    return ep === epoch;
  }

  // Hộp quà khi xong nhiệm vụ hôm nay; chờ bé bấm "Tiếp tục".
  async function reward(kind) {
    const ep = epoch;
    const sticker = grantSticker();
    const ov = overlay();
    Music.pause();
    ov.innerHTML = `
      <div class="reward-card ${kind}">
        <h2>Xong nhiệm vụ hôm nay!</h2>
        <div class="prize-box">
          <div class="gift">${emo('🎁')}</div>
          <div class="sticker">${emo(sticker || '⭐')}</div>
        </div>
        <p class="reward-note">${sticker ? 'Hình dán mới!' : '+3 sao'}</p>
      </div>`;
    ov.classList.add('show');
    mood('happy');
    await Voice.say(C.phrases[kind]);
    if (ep !== epoch) return;
    ov.querySelector('.reward-card').classList.add('open');
    Sfx.fanfare();
    celebrate(ov.querySelector('.prize-box'), 3);
    await Voice.say(sticker ? C.phrases.sticker : C.phrases.bonus);
    if (ep !== epoch) return;
    await tapToContinue();
    ov.classList.remove('show');
    ov.innerHTML = '';
    Music.resume();
  }

  // Hết tim: không kết thúc tháp mà quay về mốc an toàn gần nhất, tim đầy lại.
  function outOfHearts() {
    const g = game;
    const back = segOf(g.floor);
    Object.assign(g, { floor: back, seg: back, hearts: HEARTS, owl: 1, swap: 1, combo: 0, retry: [], locked: true });
    saveClimb();
    // Hết tim 2 lần trong 10 phút: bé đang mệt hoặc mất tập trung, cho nghỉ giải lao.
    const p = profile;
    const now = Date.now();
    p.outs = p.outs.filter(t => now - t < BREAK_WINDOW).concat(now);
    if (p.settings.breakOn && p.outs.length >= BREAK_AFTER) {
      p.outs = [];
      p.breakUntil = now + p.settings.breakMin * 60000;
      p.breakCount++;
      Store.save(p);
      showBreak(g.subject.id);
      return;
    }
    Store.save(p);
    Music.pause();
    const ov = overlay();
    ov.innerHTML = `
      <div class="reward-card fall">
        <div class="end-hero">${emo('💔')}</div>
        <h2>Hết tim rồi!</h2>
        <p class="reward-note">${back ? `Quay về mốc ${emo('⛳', 'tiny')} tầng ${back}, tim đầy lại rồi!` : 'Mình leo lại từ tầng 1 nhé.'}</p>
        <div class="row">
          <button class="btn-big alt nav" id="stay">Leo tiếp</button>
          <button class="btn-big danger nav" id="leave">Về nhà</button>
        </div>
      </div>`;
    ov.classList.add('show');
    mood('think');
    renderLadder();
    renderStatus();
    Voice.say(back ? C.phrases.backToCheckpoint : C.phrases.backToStart);
    ov.querySelector('#stay').onclick = () => {
      ov.classList.remove('show');
      ov.innerHTML = '';
      Music.resume();
      nextQuestion();
    };
    ov.querySelector('#leave').onclick = () => showHome(false);
    ov.querySelector('#stay').focus();
  }

  // Nghỉ giải lao: cú ngủ, đồng hồ cát đếm ngược, quả bóng thở to nhỏ hướng dẫn hít thở.
  // Giờ nghỉ lưu trong hồ sơ, nên về nhà rồi vào lại tháp vẫn phải nghỉ cho hết giờ.
  function showBreak(subjectId) {
    const p = profile;
    game = null;
    const ep = screen('break', `
      <div class="panel break-card">
        <div class="break-owl"><div class="owl-slot"></div><span class="zzz"><i>z</i><i>z</i><i>z</i></span></div>
        <h2 class="screen-title">Cú mệt rồi, mình nghỉ một chút nhé!</h2>
        <div class="breath"><div class="breath-ball"></div><b class="breath-text">Hít vào…</b></div>
        <div class="hourglass">${emo('⏳')}<b class="break-time"></b></div>
        <div class="row">
          <button class="btn-big alt nav" id="go" disabled>Leo tiếp ▶</button>
          <button class="btn-big nav" id="home">${emo('🏠', 'tiny')} Về nhà</button>
        </div>
      </div>`);
    mood('sleep');
    $('#home').onclick = () => showHome(false);
    $('#go').onclick = () => startTower(subjectId);
    focusFirst('#home');
    const timeEl = $('.break-time');
    const breathEl = $('.breath-text');
    let cycle = -1;
    const start = Date.now();
    const tick = () => {
      if (ep !== epoch) return clearInterval(timer);
      const left = Math.max(0, p.breakUntil - Date.now());
      const sec = Math.ceil(left / 1000);
      timeEl.textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
      // Mỗi nhịp 4 giây đổi hít vào / thở ra; cú nhắc bằng giọng ở 3 nhịp thở đầu.
      const c = Math.floor((Date.now() - start) / 4000);
      if (c !== cycle && left > 0) {
        cycle = c;
        const inhale = c % 2 === 0;
        breathEl.textContent = inhale ? 'Hít vào…' : 'Thở ra…';
        if (c >= 2 && c <= 7) Voice.say(inhale ? C.phrases.breatheIn : C.phrases.breatheOut);
      }
      if (left <= 0) {
        clearInterval(timer);
        p.breakUntil = 0;
        Store.save(p);
        breathEl.textContent = 'Xong rồi!';
        $('.break-card').classList.add('done');
        $('.break-card .screen-title').textContent = 'Hết giờ nghỉ rồi! Leo tiếp nào!';
        mood('happy');
        Sfx.chest();
        const go = $('#go');
        go.disabled = false;
        go.focus();
        Voice.say(C.phrases.breakDone);
      }
    };
    const timer = setInterval(tick, 250);
    tick();
    Voice.say(C.phrases.tired);
  }

  function askQuit() {
    const g = game;
    const ov = overlay();
    if (!g || ov.classList.contains('show')) return;
    const wasLocked = g.locked;
    g.locked = true;
    ov.innerHTML = `
      <div class="reward-card quit">
        <h2>Dừng leo tháp?</h2>
        <p class="reward-note">Lần sau con leo tiếp từ tầng ${g.floor + 1}.</p>
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
    ov.querySelector('#leave').onclick = () => {
      saveClimb();
      showHome(false);
    };
    ov.querySelector('#stay').focus();
  }

  // Về đích tầng 100: ghi kỷ lục và cho tháp đó leo lại từ đầu.
  function crownTower() {
    const g = game;
    const t = towerState(g.subject.id);
    t.best = FLOORS;
    t.wins++;
    delete profile.climbs[g.subject.id];
    Store.save(profile);
  }

  async function endTower() {
    const g = game;
    const ep = screen('end', `
      <div class="panel end-card won">
        <div class="end-hero">${emo('👑')}</div>
        <h2 class="screen-title">Con là nhà vô địch tháp ${esc(g.subject.name)}!</h2>
        <div class="end-stats">
          <span class="chip">${emo('🪜')}<b>${FLOORS}/${FLOORS}</b> tầng</span>
          <span class="chip">${emo('⭐')}<b>${g.stars}</b> sao</span>
        </div>
        ${g.gifts.length ? `<div class="end-stickers">${g.gifts.slice(-10).map((s, i) => `<span style="--i:${i}">${emo(s)}</span>`).join('')}</div>` : ''}
        <div class="row">
          <button class="btn-big nav" id="again">↻ Leo lại từ đầu</button>
          <button class="btn-big alt nav" id="home">${emo('🏠', 'tiny')} Về nhà</button>
        </div>
      </div>
      ${corner()}`);
    $('#again').onclick = () => startTower(g.subject.id);
    $('#home').onclick = () => showHome(false);
    focusFirst('#again');
    game = null;
    mood('happy');
    celebrate($('.end-hero'), 3);
    await Voice.say(C.phrases.top);
    if (ep === epoch) mood('happy');
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
    } else if (s === 'screen-end' || s === 'screen-album' || s === 'screen-parents' || s === 'screen-break') {
      showHome(false);
    } else if (s === 'screen-home' || s === 'screen-newprofile' || s === 'screen-age') {
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

  /* Nút Back trên trình duyệt tivi: trình duyệt hiểu là "lùi trang" nên thoát mất app.
     Giữ sẵn một mục lịch sử "bẫy" (pushState): bấm Back chỉ lùi về mục đó, app bắt sự kiện popstate,
     làm như lùi một bước trong app rồi đặt lại bẫy. Chrome bỏ qua mục lịch sử tạo ra khi người dùng chưa
     bấm gì, nên bẫy được đặt lại sau mỗi lần bé bấm phím hoặc chạm màn hình.
     Ở màn hình mở đầu thì không đặt lại bẫy: bấm Back lần nữa là thoát app như bình thường. */
  let trapFresh = false;     // bẫy hiện tại được đặt sau một lần bấm của người dùng
  let lastKeyBack = 0;
  function armBack(withGesture) {
    if (withGesture && trapFresh) return;
    try {
      history.pushState({ bhv: Date.now() }, '');
      trapFresh = !!withGesture;
    } catch (e) { /* trình duyệt chặn lịch sử: bỏ qua */ }
  }
  window.addEventListener('popstate', () => {
    trapFresh = false;
    if (app.className === 'screen-splash') return;
    armBack(false);
    // Một số tivi gửi cả phím 461 lẫn popstate cho cùng một lần bấm: chỉ lùi một lần.
    if (Date.now() - lastKeyBack > 700) goBack();
  });

  document.addEventListener('keydown', e => {
    const k = e.keyCode;
    const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (!keyMode) {
      keyMode = true;
      document.body.classList.add('keys');
    }
    if (k === 461 || k === 27 || (k === 8 && !typing)) {   // 461 = nút Back của remote LG
      e.preventDefault();
      lastKeyBack = Date.now();
      goBack();
      return;
    }
    armBack(true);
    const dir = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' }[k];
    if (!dir || (typing && (dir === 'left' || dir === 'right'))) return;
    e.preventDefault();
    moveFocus(dir);
  });

  document.addEventListener('pointerdown', () => {
    armBack(true);
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
      game: () => game, profile: () => profile, Store, Fx, Music, Sfx,
      // Đặt tầng hiện tại khi đang trong tháp, ví dụ BHV.setFloor(39) rồi trả lời đúng để tới mốc 40.
      setFloor(n) {
        Object.assign(game, { floor: n, seg: segOf(n) });
        renderLadder();
        renderStatus();
        saveClimb();
      },
      // Xem riêng màn nổ của một mốc: BHV.burst(7) là màn sấm sét của tầng 70.
      burst(n) { megaBurst(`TẦNG ${n * 10}!`, n); },
      // Mô phỏng chọn n câu liên tiếp (để đếm lặp lại), không hiện lên màn hình.
      sampleQuestions(n) {
        const out = [];
        for (let i = 0; i < n; i++) { game.asked++; out.push(makeQuestion().key); }
        return out;
      },
      // Đo hiệu ứng câu đúng: giả lập một câu đúng ngay với chuỗi 3 câu.
      celebrateTest() {
        const btn = document.querySelector('.options button');
        celebrate(btn, 3);
        showPraise('Giỏi quá!', '3 câu liên tiếp!');
      },
      // Thử nghỉ giải lao: BHV.rest(5) nghỉ 5 giây.
      rest(sec) { profile.breakUntil = Date.now() + (sec || 5) * 1000; showBreak((game && game.subject.id) || 'math'); },
      // Mở thẳng quà của một mốc (10, 20, …, 100) khi đang trong tháp.
      gift(floor) {
        game.locked = true;
        return milestone(floor);
      },
      ask(skill, level) {
        const q = C.skills[skill].gen(level || 1);
        q.skill = skill;
        showQuestion(q);
      },
    };
  }

  Fx.applyMode();
  showSplash();
})();
