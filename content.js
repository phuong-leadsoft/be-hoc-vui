/* Nội dung câu hỏi của Bé Học Vui.
   Dùng chung cho trình duyệt (window.CONTENT) và tools/build.js (tạo âm thanh, tải hình). */
(function () {
  'use strict';

  const NUM = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười',
    'mười một', 'mười hai', 'mười ba', 'mười bốn', 'mười lăm', 'mười sáu', 'mười bảy', 'mười tám', 'mười chín', 'hai mươi'];

  const rand = n => Math.floor(Math.random() * n);
  const pick = a => a[rand(a.length)];
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const sample = (a, k) => shuffle(a).slice(0, k);

  // Tên file âm thanh = FNV-1a của câu nói, giống nhau ở trình duyệt và node.
  function hash(text) {
    const s = text.normalize('NFC');
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  // Tên file Twemoji: mã Unicode viết thường nối bằng "-", bỏ FE0F khi không có ZWJ.
  function emojiFile(ch) {
    const cps = Array.from(ch).map(c => c.codePointAt(0).toString(16));
    return (cps.includes('200d') ? cps : cps.filter(c => c !== 'fe0f')).join('-');
  }

  const emojiOpt = e => ({ id: e, kind: 'emoji', value: e });

  /* ---------- Dữ liệu ---------- */

  const COUNTABLE = [
    ['🍎', 'quả táo'], ['🐟', 'con cá'], ['🌸', 'bông hoa'], ['⭐', 'ngôi sao'], ['🐤', 'con gà con'], ['🚗', 'chiếc xe'],
    ['⚽', 'quả bóng'], ['🦋', 'con bướm'], ['🍦', 'cây kem'], ['🦆', 'con vịt'], ['🍓', 'quả dâu'], ['🎈', 'quả bóng bay'],
  ].map(([e, name]) => ({ e, name }));

  const COMPARE_EXPLAIN = { left: 'Bên trái nhiều hơn.', right: 'Bên phải nhiều hơn.', equal: 'Hai bên bằng nhau, mình chọn dấu bằng.' };

  const SHAPES = { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', rect: 'hình chữ nhật', star: 'hình ngôi sao', heart: 'hình trái tim' };
  const SHAPE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899'];

  // Tên chữ cái theo cách đọc ở mẫu giáo.
  const LETTERS = [['a', 'a'], ['ă', 'á'], ['â', 'ớ'], ['b', 'bờ'], ['c', 'cờ'], ['d', 'dờ'], ['đ', 'đờ'], ['e', 'e'], ['ê', 'ê'],
    ['g', 'gờ'], ['h', 'hờ'], ['i', 'i'], ['k', 'ca'], ['l', 'lờ'], ['m', 'mờ'], ['n', 'nờ'], ['o', 'o'], ['ô', 'ô'], ['ơ', 'ơ'],
    ['p', 'pờ'], ['q', 'quờ'], ['r', 'rờ'], ['s', 'sờ'], ['t', 'tờ'], ['u', 'u'], ['ư', 'ư'], ['v', 'vờ'], ['x', 'xờ'], ['y', 'i dài']];
  const LETTER_NAME = Object.fromEntries(LETTERS);
  const ALL_LETTERS = LETTERS.map(l => l[0]);
  const EASY_LETTERS = ['o', 'ô', 'ơ', 'a', 'ă', 'â', 'e', 'ê', 'u', 'ư', 'i', 't', 'c', 'b', 'd', 'đ'];

  // Chỉ dùng từ bắt đầu bằng một chữ cái (tránh ch, kh, ng, nh, th, tr...).
  const WORDS = [
    ['🐟', 'cá', 'c'], ['🐔', 'gà', 'g'], ['🐱', 'mèo', 'm'], ['🐄', 'bò', 'b'], ['🐘', 'voi', 'v'], ['🍎', 'táo', 't'],
    ['🥥', 'dừa', 'd'], ['🚗', 'xe', 'x'], ['🍃', 'lá', 'l'], ['⭐', 'sao', 's'], ['🍦', 'kem', 'k'], ['🐸', 'ếch', 'ê'],
    ['🐝', 'ong', 'o'], ['🐌', 'ốc', 'ô'], ['🐢', 'rùa', 'r'], ['🍐', 'lê', 'l'], ['🍄', 'nấm', 'n'], ['🥛', 'sữa', 's'],
    ['🦆', 'vịt', 'v'], ['🦀', 'cua', 'c'], ['🐐', 'dê', 'd'], ['🐻', 'gấu', 'g'], ['⏰', 'đồng hồ', 'đ'], ['⚽', 'bóng', 'b'],
    ['🌳', 'cây', 'c'], ['🌸', 'hoa', 'h'], ['📚', 'sách', 's'], ['🦋', 'bướm', 'b'], ['🐍', 'rắn', 'r'], ['🐜', 'kiến', 'k'],
    ['🦊', 'cáo', 'c'], ['🫖', 'ấm', 'â'], ['🌶️', 'ớt', 'ơ'], ['👶', 'em bé', 'e'], ['👕', 'áo', 'a'], ['🔋', 'pin', 'p'],
    ['🔥', 'lửa', 'l'], ['🌧️', 'mưa', 'm'],
  ].map(([e, word, l]) => ({ e, word, l }));

  const WATER = [['🐟', 'con cá'], ['🐳', 'cá voi'], ['🐙', 'bạch tuộc'], ['🐬', 'cá heo'], ['🦐', 'con tôm']].map(([e, name]) => ({ e, name }));
  const LAND = ['🐱', '🐶', '🐄', '🐘', '🐯', '🐔', '🐰', '🦒'];
  const FLY = [['🐦', 'con chim'], ['🦋', 'con bướm'], ['🐝', 'con ong'], ['🦅', 'đại bàng'], ['🦜', 'con vẹt']].map(([e, name]) => ({ e, name }));
  const NO_FLY = ['🐟', '🐢', '🐘', '🐱', '🐌', '🐍', '🐶', '🐄'];

  const COLORS = { red: ['màu đỏ', '#ef4444'], yellow: ['màu vàng', '#facc15'], green: ['màu xanh lá', '#22c55e'], orange: ['màu cam', '#f97316'], purple: ['màu tím', '#a855f7'] };
  const COLOR_ITEMS = [
    ['🍌', 'quả chuối', 'yellow'], ['🍎', 'quả táo', 'red'], ['🍊', 'quả cam', 'orange'], ['🍇', 'chùm nho', 'purple'],
    ['🍃', 'chiếc lá', 'green'], ['🍓', 'quả dâu', 'red'], ['🥕', 'củ cà rốt', 'orange'], ['🍅', 'quả cà chua', 'red'],
    ['🌻', 'bông hoa hướng dương', 'yellow'], ['🐸', 'con ếch', 'green'], ['🐤', 'con gà con', 'yellow'],
  ].map(([e, name, color]) => ({ e, name, color }));

  const SENSES = [
    ['Mình nhìn bằng gì?', '👁️', 'Mình nhìn bằng mắt.'],
    ['Mình nghe bằng gì?', '👂', 'Mình nghe bằng tai.'],
    ['Mình ngửi bằng gì?', '👃', 'Mình ngửi bằng mũi.'],
    ['Mình ăn bằng gì?', '👄', 'Mình ăn bằng miệng.'],
    ['Mình cầm đồ vật bằng gì?', '✋', 'Mình cầm đồ vật bằng tay.'],
    ['Mình đi bằng gì?', '🦶', 'Mình đi bằng chân.'],
  ].map(([q, e, explain]) => ({ q, e, explain }));

  const FOOD = [
    ['🐰', 'con thỏ', '🥕', 'cà rốt', ['🦴', '🐟', '🌸']],
    ['🐱', 'con mèo', '🐟', 'cá', ['🥕', '🌸', '🌽']],
    ['🐵', 'con khỉ', '🍌', 'chuối', ['🦴', '🐟', '🌸']],
    ['🐶', 'con chó', '🦴', 'xương', ['🥕', '🌸', '🍌']],
    ['🐝', 'con ong', '🌸', 'mật hoa', ['🦴', '🐟', '🥕']],
    ['🐄', 'con bò', '🌿', 'cỏ', ['🦴', '🐟', '🍦']],
    ['🐼', 'gấu trúc', '🎋', 'lá tre', ['🐟', '🦴', '🍦']],
  ].map(([animal, name, food, foodName, wrong]) => ({ animal, name, food, foodName, wrong }));

  const LIFE = [
    { q: 'Trời mưa con cần mang gì?', scene: '🌧️', ans: '☂️', wrong: ['🕶️', '🩳', '🍦'], explain: 'Trời mưa thì mình che ô.' },
    { q: 'Trời lạnh con mặc gì?', scene: '❄️', ans: '🧥', wrong: ['🩳', '🕶️', '🍦'], explain: 'Trời lạnh thì mặc áo ấm.' },
    { q: 'Đi bơi con mặc gì?', scene: '🏊', ans: '🩱', wrong: ['🧥', '🧣', '🧤'], explain: 'Đi bơi thì mặc đồ bơi.' },
    { q: 'Trời nắng to, con đeo gì cho mắt?', scene: '☀️', ans: '🕶️', wrong: ['🧤', '🧣', '🧦'], explain: 'Trời nắng thì đeo kính cho mắt.' },
    { q: 'Ban ngày, cái gì chiếu sáng trên trời?', ans: '☀️', wrong: ['🌙', '🐟', '🌳'], explain: 'Ban ngày có ông mặt trời chiếu sáng.' },
    { q: 'Ban đêm, trên trời có gì?', ans: '🌙', wrong: ['☀️', '🐟', '🌳'], explain: 'Ban đêm có ông trăng.' },
    { q: 'Con dùng gì để đánh răng?', ans: '🪥', wrong: ['🧦', '⚽', '🧸'], explain: 'Mình đánh răng bằng bàn chải.' },
  ];

  /* ---------- Kỹ năng: gen(level) tạo một câu hỏi, phrases() liệt kê mọi câu có thể nói ---------- */

  const addSay = (a, b) => `${cap(NUM[a])} thêm ${NUM[b]} là mấy?`;
  const addExplain = (a, b) => `${cap(NUM[a])} thêm ${NUM[b]} là ${NUM[a + b]}.`;
  const subSay = (a, b) => `${cap(NUM[a])} bớt ${NUM[b]} còn mấy?`;
  const subExplain = (a, b) => `${cap(NUM[a])} bớt ${NUM[b]} còn ${NUM[a - b]}.`;
  // Mọi cặp a, b ≥ 1 với a + b ≤ 10.
  const pairs = () => range(1, 9).flatMap(a => range(1, 10 - a).map(b => [a, b]));

  const skills = {
    count: {
      name: 'Đếm', maxLevel: 2,
      gen(level) {
        const max = level === 1 ? 5 : 10;
        const o = pick(COUNTABLE), n = 2 + rand(max - 1);
        return { say: `Có bao nhiêu ${o.name}?`, scene: { type: 'group', e: o.e, n }, mode: 'pad', padMax: max,
          answer: n, countAlong: true, explain: `Có ${NUM[n]} ${o.name}.` };
      },
      phrases: () => COUNTABLE.flatMap(o => [`Có bao nhiêu ${o.name}?`, ...range(2, 10).map(n => `Có ${NUM[n]} ${o.name}.`)]),
    },

    add: {
      name: 'Phép thêm', maxLevel: 2,
      gen(level) {
        const max = level === 1 ? 5 : 10;
        const a = 1 + rand(max - 1), b = 1 + rand(max - a), o = pick(COUNTABLE);
        return { say: addSay(a, b), scene: { type: 'add', e: o.e, a, b }, mode: 'pad', padMax: max,
          answer: a + b, countAlong: true, explain: addExplain(a, b) };
      },
      phrases: () => pairs().flatMap(([a, b]) => [addSay(a, b), addExplain(a, b)]),
    },

    sub: {
      name: 'Phép bớt', maxLevel: 2,
      gen(level) {
        const max = level === 1 ? 5 : 10;
        const a = 2 + rand(max - 1), b = 1 + rand(a - 1), o = pick(COUNTABLE);
        return { say: subSay(a, b), scene: { type: 'sub', e: o.e, a, b }, mode: 'pad', padMax: max,
          answer: a - b, countAlong: true, explain: subExplain(a, b) };
      },
      phrases: () => pairs().flatMap(([c, b]) => [subSay(c + b, b), subExplain(c + b, b)]),
    },

    compare: {
      name: 'So sánh nhiều ít', maxLevel: 2,
      gen(level) {
        const o = pick(COUNTABLE);
        let l, r;
        if (level === 1) {
          do { l = 1 + rand(5); r = 1 + rand(5); } while (Math.abs(l - r) < 2);
        } else if (rand(4) === 0) {
          l = r = 2 + rand(6);
        } else {
          do { l = 1 + rand(8); r = 1 + rand(8); } while (l === r);
        }
        const answer = l > r ? 'left' : l < r ? 'right' : 'equal';
        return {
          say: `Bên nào nhiều ${o.name} hơn?`, scene: { type: 'none' }, mode: 'choice', fixedOrder: true, optionsClass: 'compare',
          options: [{ id: 'left', kind: 'group', value: { e: o.e, n: l } }, { id: 'equal', kind: 'text', value: '=' },
            { id: 'right', kind: 'group', value: { e: o.e, n: r } }],
          answer, explain: COMPARE_EXPLAIN[answer],
        };
      },
      phrases: () => [...COUNTABLE.map(o => `Bên nào nhiều ${o.name} hơn?`), ...Object.values(COMPARE_EXPLAIN)],
    },

    findNumber: {
      name: 'Nhận biết số', maxLevel: 2,
      gen(level) {
        const all = range(0, level === 1 ? 10 : 20), t = pick(all);
        const opts = [t, ...sample(all.filter(n => n !== t), 3)];
        return { say: `Số ${NUM[t]} đâu?`, scene: { type: 'none' }, mode: 'choice',
          options: opts.map(n => ({ id: String(n), kind: 'num', value: n })), answer: String(t), explain: `Đây là số ${NUM[t]}.` };
      },
      phrases: () => range(0, 20).flatMap(n => [`Số ${NUM[n]} đâu?`, `Đây là số ${NUM[n]}.`]),
    },

    shape: {
      name: 'Hình dạng', maxLevel: 2,
      gen(level) {
        const pool = level === 1 ? ['circle', 'square', 'triangle', 'rect'] : Object.keys(SHAPES);
        const t = pick(pool);
        // Hình vuông cũng là hình chữ nhật, nên không cho hình vuông làm đáp án nhiễu khi hỏi hình chữ nhật.
        const others = pool.filter(s => s !== t && !(t === 'rect' && s === 'square'));
        const colors = shuffle(SHAPE_COLORS);
        const opts = [t, ...sample(others, level === 1 ? 2 : 3)];
        return { say: `${cap(SHAPES[t])} đâu?`, scene: { type: 'none' }, mode: 'choice',
          options: opts.map((s, i) => ({ id: s, kind: 'shape', value: { shape: s, color: colors[i] } })), answer: t, explain: `Đây là ${SHAPES[t]}.` };
      },
      phrases: () => Object.values(SHAPES).flatMap(n => [`${cap(n)} đâu?`, `Đây là ${n}.`]),
    },

    findLetter: {
      name: 'Nhận biết chữ cái', maxLevel: 2,
      gen(level) {
        const pool = level === 1 ? EASY_LETTERS : ALL_LETTERS, t = pick(pool);
        const opts = [t, ...sample(pool.filter(x => x !== t), 3)];
        return { say: `Chữ ${LETTER_NAME[t]} đâu?`, show: 'Tìm chữ cái con vừa nghe', scene: { type: 'none' }, mode: 'choice',
          options: opts.map(l => ({ id: l, kind: 'letter', value: l })), answer: t, explain: `Đây là chữ ${LETTER_NAME[t]}.` };
      },
      phrases: () => ALL_LETTERS.flatMap(l => [`Chữ ${LETTER_NAME[l]} đâu?`, `Đây là chữ ${LETTER_NAME[l]}.`]),
    },

    firstLetter: {
      name: 'Chữ cái đầu tiên', maxLevel: 1,
      gen() {
        const w = pick(WORDS);
        const opts = [w.l, ...sample(ALL_LETTERS.filter(x => x !== w.l && x !== 'q'), 3)];
        // Không hiện chữ của từ, nếu không bé chỉ cần so hình chữ.
        return { say: `${cap(w.word)} bắt đầu bằng chữ gì?`, show: '… bắt đầu bằng chữ gì?', scene: { type: 'big', e: w.e }, mode: 'choice',
          options: opts.map(l => ({ id: l, kind: 'letter', value: l })), answer: w.l, explain: `${cap(w.word)} bắt đầu bằng chữ ${LETTER_NAME[w.l]}.` };
      },
      phrases: () => WORDS.flatMap(w => [`${cap(w.word)} bắt đầu bằng chữ gì?`, `${cap(w.word)} bắt đầu bằng chữ ${LETTER_NAME[w.l]}.`]),
    },

    water: {
      name: 'Con vật dưới nước', maxLevel: 1,
      gen() {
        const t = pick(WATER);
        return { say: 'Con nào sống dưới nước?', scene: { type: 'none' }, mode: 'choice',
          options: [t.e, ...sample(LAND, 3)].map(emojiOpt), answer: t.e, explain: `${cap(t.name)} sống dưới nước.` };
      },
      phrases: () => ['Con nào sống dưới nước?', ...WATER.map(t => `${cap(t.name)} sống dưới nước.`)],
    },

    fly: {
      name: 'Con vật biết bay', maxLevel: 1,
      gen() {
        const t = pick(FLY);
        return { say: 'Con nào biết bay?', scene: { type: 'none' }, mode: 'choice',
          options: [t.e, ...sample(NO_FLY, 3)].map(emojiOpt), answer: t.e, explain: `${cap(t.name)} biết bay.` };
      },
      phrases: () => ['Con nào biết bay?', ...FLY.map(t => `${cap(t.name)} biết bay.`)],
    },

    color: {
      name: 'Màu sắc', maxLevel: 1,
      gen() {
        const t = pick(COLOR_ITEMS);
        const opts = [t.color, ...sample(Object.keys(COLORS).filter(c => c !== t.color), 3)];
        return { say: `${cap(t.name)} màu gì?`, scene: { type: 'big', e: t.e }, mode: 'choice',
          options: opts.map(c => ({ id: c, kind: 'color', value: COLORS[c][1] })), answer: t.color, explain: `${cap(t.name)} ${COLORS[t.color][0]}.` };
      },
      phrases: () => COLOR_ITEMS.flatMap(t => [`${cap(t.name)} màu gì?`, `${cap(t.name)} ${COLORS[t.color][0]}.`]),
    },

    senses: {
      name: 'Giác quan', maxLevel: 1,
      gen() {
        const t = pick(SENSES);
        const opts = [t.e, ...sample(SENSES.filter(s => s !== t).map(s => s.e), 3)];
        return { say: t.q, scene: { type: 'none' }, mode: 'choice', options: opts.map(emojiOpt), answer: t.e, explain: t.explain };
      },
      phrases: () => SENSES.flatMap(t => [t.q, t.explain]),
    },

    food: {
      name: 'Con vật ăn gì', maxLevel: 1,
      gen() {
        const t = pick(FOOD);
        return { say: `${cap(t.name)} thích ăn gì?`, scene: { type: 'big', e: t.animal }, mode: 'choice',
          options: [t.food, ...t.wrong].map(emojiOpt), answer: t.food, explain: `${cap(t.name)} thích ăn ${t.foodName}.` };
      },
      phrases: () => FOOD.flatMap(t => [`${cap(t.name)} thích ăn gì?`, `${cap(t.name)} thích ăn ${t.foodName}.`]),
    },

    life: {
      name: 'Cuộc sống quanh em', maxLevel: 1,
      gen() {
        const t = pick(LIFE);
        return { say: t.q, scene: t.scene ? { type: 'big', e: t.scene } : { type: 'none' }, mode: 'choice',
          options: [t.ans, ...t.wrong].map(emojiOpt), answer: t.ans, explain: t.explain };
      },
      phrases: () => LIFE.flatMap(t => [t.q, t.explain]),
    },
  };

  const subjects = [
    { id: 'math', name: 'Toán', icon: '🔢', color: '#f97316', skills: ['count', 'add', 'sub', 'compare', 'findNumber', 'shape'] },
    { id: 'letters', name: 'Chữ cái', icon: '🔤', color: '#8b5cf6', skills: ['findLetter', 'firstLetter'] },
    { id: 'nature', name: 'Tự nhiên', icon: '🌿', color: '#16a34a', skills: ['water', 'fly', 'color', 'senses', 'food', 'life'] },
    { id: 'mix', name: 'Tổng hợp', icon: '🎲', color: '#0ea5e9', skills: Object.keys(skills) },
  ];

  // Phần thưởng ở mốc an toàn, đỉnh tháp và nhiệm vụ mỗi ngày.
  const stickers = ['🦄', '🐲', '🦖', '🦕', '🐳', '🐬', '🦁', '🐼', '🐨', '🐸', '🦊', '🐙', '🦋', '🐞', '🐢',
    '🦜', '🦩', '🐧', '🦔', '🐿️', '🐠', '🌈', '🚀', '🎠', '🍩', '🧁', '🍭', '🎸', '🏰', '⛄'];
  const avatars = ['🐰', '🐻', '🐱', '🐶', '🐼', '🦊', '🐯', '🐵'];

  const phrases = {
    whoPlays: 'Ai đang chơi đấy nhỉ?',
    newProfile: 'Con chọn một bạn thú thật dễ thương nhé.',
    welcomeNew: 'Chào con! Con chọn một tòa tháp để leo nhé.',
    welcomeBack: 'Chào mừng con quay lại! Hôm nay mình leo tháp nào?',
    streak: n => `Con đã học ${NUM[n]} ngày liên tiếp rồi!`,
    praise: ['Đúng rồi!', 'Giỏi quá!', 'Tuyệt vời!', 'Con giỏi lắm!', 'Chính xác!'],
    praiseAfter: 'Đúng rồi! Lần này con làm được rồi.',
    praiseTaught: 'Đúng rồi! Con nhớ nhé.',
    confirm: 'Con chắc chắn chưa? Chắc rồi thì bấm chốt nhé.',
    wrong: ['Chưa đúng rồi. Con nhìn thật kỹ rồi chọn lại nhé.', 'Chưa đúng. Con suy nghĩ thêm một chút nhé.'],
    countHint: 'Chưa đúng. Con chỉ tay đếm từng cái nhé.',
    lastHeart: 'Chỉ còn một trái tim thôi. Con suy nghĩ thật kỹ nhé.',
    gameOver: 'Hết tim rồi! Mình nghỉ một chút rồi leo lại nhé.',
    teach: 'Mình cùng xem nhé.',
    teachDone: 'Bây giờ con chọn đáp án đúng nhé.',
    later: 'Lát nữa mình làm lại câu này nhé.',
    retryIntro: 'Câu này mình làm lại nè.',
    levelUp: 'Con giỏi quá! Câu hỏi sẽ khó hơn một chút nhé.',
    owlHelp: 'Cú giúp con nhé.',
    swap: 'Mình đổi câu khác nhé.',
    milestone: 'Con đến mốc an toàn rồi! Mở quà nào!',
    top: 'Con lên tới đỉnh tháp rồi! Giỏi quá!',
    mission: 'Con hoàn thành nhiệm vụ hôm nay rồi!',
    sticker: 'Con được một hình dán mới!',
    bonus: 'Con được thêm ba ngôi sao!',
    quit: 'Con muốn dừng leo tháp à?',
    endFloors: n => (n === 0 ? 'Mình thử lại nhé.' : `Con leo được ${NUM[n]} tầng.`),
    endStars: n => (n === 0 ? 'Mình leo tháp khác nhé.' : `Con được ${NUM[n]} ngôi sao!`),
    resume: 'Mình leo tiếp nào!',
    backToCheckpoint: 'Hết tim rồi! Mình quay về mốc an toàn, tim đầy lại rồi nhé.',
    backToStart: 'Hết tim rồi! Mình leo lại từ đầu nhé.',
    floorReached: n => `Con lên tới tầng ${TENS[n / 10]} rồi!`,
    hat: 'Con được một chiếc mũ mới! Đội thử nào!',
    eggIntro: 'Quả trứng thần kỳ! Con bấm thật nhanh để trứng nở nào!',
    pet: 'Trứng nở rồi! Con có một bạn thú cưng mới đi cùng leo tháp!',
    theme: 'Ồ! Bầu trời đổi màu rồi! Con mở được khung cảnh mới!',
    party: 'Lễ hội nửa đường! Mình cùng nhảy nào!',
    pickIntro: 'Có ba hộp quà bí mật. Con chọn một hộp nhé!',
    golden: 'Oa! Hình dán vàng siêu hiếm!',
    starRainIntro: 'Mưa sao! Con bấm thật nhanh để hứng thật nhiều sao!',
    starRainDone: 'Con hứng được thật nhiều sao!',
    rocket: 'Chuẩn bị bay! Ba, hai, một, phóng!',
    champion: 'Con đã lên tới tầng một trăm! Con là nhà vô địch!',
  };

  const TENS = ['không', 'mười', 'hai mươi', 'ba mươi', 'bốn mươi', 'năm mươi', 'sáu mươi', 'bảy mươi', 'tám mươi', 'chín mươi', 'một trăm'];

  // Quà ở các mốc tầng: mũ, thú cưng, khung cảnh, hình dán vàng.
  const hats = ['🎩', '🎀', '🧢', '🎓', '🌸'];
  const pets = { common: ['🐥', '🐢', '🐧', '🦊', '🐼'], rare: ['🦄', '🐉', '🦖'] };
  const themes = [
    { id: 'sunset', name: 'Hoàng hôn', icon: '🌅' },
    { id: 'night', name: 'Đêm sao', icon: '🌙' },
    { id: 'space', name: 'Vũ trụ', icon: '🪐' },
    { id: 'sea', name: 'Đại dương', icon: '🌊' },
  ];
  const golden = ['💎', '🌟', '🎆', '🏅', '🦚', '🎡', '🍰', '🧸', '🪅', '🦋'];

  // Hình dùng ở giao diện, ngoài các bảng dữ liệu ở trên.
  const UI_EMOJI = ['⭐', '🏠', '🔊', '⏳', '❤️', '💔', '🦉', '🔄', '🎁', '👑', '🔥', '📒', '🪜', '✅',
    '🥚', '🐣', '🎉', '🚀', '🏆', '⛳', '🎨', '🪩'];

  function allPhrases() {
    const out = [];
    for (const v of Object.values(phrases)) {
      if (Array.isArray(v)) out.push(...v);
      else if (typeof v === 'string') out.push(v);
    }
    out.push(...range(2, 20).map(phrases.streak), ...range(1, 10).map(n => phrases.floorReached(n * 10)),
      ...range(0, 9).map(phrases.endFloors), ...range(0, 10).map(phrases.endStars),
      ...NUM.slice(1, 11), ...subjects.map(s => s.name));
    for (const id in skills) out.push(...skills[id].phrases());
    return [...new Set(out)];
  }

  function allEmoji() {
    const text = JSON.stringify([COUNTABLE, WORDS, WATER, LAND, FLY, NO_FLY, COLOR_ITEMS, SENSES, FOOD, LIFE, subjects, stickers, avatars,
      hats, pets, themes, golden, UI_EMOJI]);
    return [...new Set(text.match(/\p{Extended_Pictographic}️?/gu))];
  }

  globalThis.CONTENT = {
    NUM, TENS, skills, subjects, stickers, avatars, hats, pets, themes, golden, phrases, hash, emojiFile, allPhrases, allEmoji,
    util: { rand, pick, shuffle, sample, range },
  };
})();
