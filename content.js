/* Nội dung câu hỏi của Bé Học Vui.
   Dùng chung cho trình duyệt (window.CONTENT) và tools/build.js (tạo âm thanh, tải hình). */
(function () {
  'use strict';

  const NUM = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười',
    'mười một', 'mười hai', 'mười ba', 'mười bốn', 'mười lăm', 'mười sáu', 'mười bảy', 'mười tám', 'mười chín', 'hai mươi'];

  // Đọc số 0–100 theo cách nói thường ngày: hai mươi mốt, hai mươi tư, hai mươi lăm.
  function numWord(n) {
    if (n <= 20) return NUM[n];
    if (n === 100) return 'một trăm';
    const t = Math.floor(n / 10);
    const u = n % 10;
    const tens = NUM[t] + ' mươi';
    if (!u) return tens;
    return tens + ' ' + (u === 1 ? 'mốt' : u === 4 ? 'tư' : u === 5 ? 'lăm' : NUM[u]);
  }

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
  const LETTER_NAME = {};
  LETTERS.forEach(([l, name]) => { LETTER_NAME[l] = name; });
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
    ['🐦', 'con chim', '🐛', 'sâu', ['🦴', '🍦', '🥕']],
    ['🐿️', 'con sóc', '🌰', 'hạt dẻ', ['🦴', '🐟', '🍦']],
    ['🐔', 'con gà', '🌽', 'ngô', ['🦴', '🐟', '🍦']],
    ['🐻', 'con gấu', '🍯', 'mật ong', ['🥕', '🌽', '🦴']],
  ].map(([animal, name, food, foodName, wrong]) => ({ animal, name, food, foodName, wrong }));

  const LIFE = [
    { q: 'Trời mưa con cần mang gì?', scene: '🌧️', ans: '☂️', wrong: ['🕶️', '🩳', '🍦'], explain: 'Trời mưa thì mình che ô.' },
    { q: 'Trời lạnh con mặc gì?', scene: '❄️', ans: '🧥', wrong: ['🩳', '🕶️', '🍦'], explain: 'Trời lạnh thì mặc áo ấm.' },
    { q: 'Đi bơi con mặc gì?', scene: '🏊', ans: '🩱', wrong: ['🧥', '🧣', '🧤'], explain: 'Đi bơi thì mặc đồ bơi.' },
    { q: 'Trời nắng to, con đeo gì cho mắt?', scene: '☀️', ans: '🕶️', wrong: ['🧤', '🧣', '🧦'], explain: 'Trời nắng thì đeo kính cho mắt.' },
    { q: 'Ban ngày, cái gì chiếu sáng trên trời?', ans: '☀️', wrong: ['🌙', '🐟', '🌳'], explain: 'Ban ngày có ông mặt trời chiếu sáng.' },
    { q: 'Ban đêm, trên trời có gì?', ans: '🌙', wrong: ['☀️', '🐟', '🌳'], explain: 'Ban đêm có ông trăng.' },
    { q: 'Con dùng gì để đánh răng?', ans: '🪥', wrong: ['🧦', '⚽', '🧸'], explain: 'Mình đánh răng bằng bàn chải.' },
    { q: 'Trước khi ăn, con rửa tay bằng gì?', ans: '🧼', wrong: ['⚽', '🧸', '🎈'], explain: 'Mình rửa tay bằng xà phòng.' },
    { q: 'Buổi tối, con ngủ ở đâu?', ans: '🛏️', wrong: ['🚗', '⚽', '🌳'], explain: 'Buổi tối mình ngủ trên giường.' },
    { q: 'Đèn giao thông màu gì thì mình phải dừng lại?', scene: '🚦', ans: '🔴', wrong: ['🟢', '🟡', '🔵'], explain: 'Đèn đỏ thì mình phải dừng lại.' },
    { q: 'Khi bị ốm, con đi gặp ai?', ans: '🧑‍⚕️', wrong: ['🧑‍🍳', '🧑‍🌾', '🧑‍🚒'], explain: 'Bị ốm thì mình đi gặp bác sĩ.' },
    { q: 'Con uống gì để mau lớn, khỏe mạnh?', ans: '🥛', wrong: ['🍭', '🍩', '🧁'], explain: 'Uống sữa giúp mình mau lớn, khỏe mạnh.' },
    { q: 'Rác thì mình bỏ vào đâu?', ans: '🗑️', wrong: ['🛏️', '🚗', '🌳'], explain: 'Rác thì bỏ vào thùng rác.' },
    { q: 'Mùa hè nóng nực, mình ăn gì cho mát?', ans: '🍦', wrong: ['🔥', '🧥', '🧣'], explain: 'Mùa hè ăn kem cho mát.' },
  ];

  // Từ bắt đầu bằng hai chữ cái ghép (cấp 2 của "Chữ cái đầu tiên", cho bé lớn).
  const DIGRAPHS = { ch: 'chờ', nh: 'nhờ', ng: 'ngờ', th: 'thờ', tr: 'trờ', kh: 'khờ', ph: 'phờ', gi: 'giờ' };
  const DIGRAPH_WORDS = [
    ['🍌', 'chuối', 'ch'], ['🐶', 'chó', 'ch'], ['🍇', 'nho', 'nh'], ['🕷️', 'nhện', 'nh'], ['🐴', 'ngựa', 'ng'], ['🌽', 'ngô', 'ng'],
    ['🐰', 'thỏ', 'th'], ['⛵', 'thuyền', 'th'], ['🌙', 'trăng', 'tr'], ['🥁', 'trống', 'tr'], ['🥚', 'trứng', 'tr'],
    ['🐵', 'khỉ', 'kh'], ['🧣', 'khăn', 'kh'], ['🎆', 'pháo hoa', 'ph'], ['👟', 'giày', 'gi'],
  ].map(([e, word, l]) => ({ e, word, l }));

  // Câu đố: mỗi câu chỉ có đúng một đáp án hợp lý trong các hình (đã loại hình dễ gây nhầm).
  const RIDDLES = [
    ['Con gì tai dài, đuôi ngắn, thích ăn cà rốt?', '🐰', 'con thỏ', ['🐱', '🐶', '🐔']],
    ['Con gì sáng sớm gáy ò ó o?', '🐓', 'con gà trống', ['🦆', '🐱', '🐷']],
    ['Con gì to lớn, có cái vòi thật dài?', '🐘', 'con voi', ['🦒', '🐄', '🐯']],
    ['Quả gì vỏ xanh, ruột đỏ, hạt đen, ăn mát lành mùa hè?', '🍉', 'quả dưa hấu', ['🍌', '🍇', '🍊']],
    ['Cái gì có bốn chân mà không biết đi, mỏi chân thì mình ngồi lên?', '🪑', 'cái ghế', ['🧸', '⚽', '🚗']],
    ['Con gì kêu meo meo, thích bắt chuột?', '🐱', 'con mèo', ['🐶', '🐰', '🐷']],
    ['Con gì mai cứng, bò chậm chạp, sống được cả dưới nước lẫn trên cạn?', '🐢', 'con rùa', ['🐰', '🐟', '🐦']],
    ['Cái gì có kim ngắn, kim dài, chạy tích tắc cả ngày?', '⏰', 'cái đồng hồ', ['📚', '☂️', '🪥']],
    ['Quả gì cong cong, vỏ vàng, các bạn khỉ rất thích?', '🍌', 'quả chuối', ['🍎', '🍉', '🍇']],
    ['Cái gì trời mưa thì mở ra, trời tạnh thì cụp lại?', '☂️', 'cái ô', ['🕶️', '🧢', '👟']],
    ['Con gì cổ rất dài, ăn lá trên ngọn cây cao?', '🦒', 'con hươu cao cổ', ['🐘', '🐄', '🐷']],
    ['Con gì kêu ủn ỉn, mũi to, ăn no rồi lại ngủ?', '🐷', 'con lợn', ['🐶', '🐱', '🐔']],
    ['Xe gì có hai bánh, mình đạp bằng chân thì xe chạy?', '🚲', 'xe đạp', ['🚗', '🚂', '✈️']],
    ['Cái gì có cánh, bay trên trời, chở được rất nhiều người?', '✈️', 'máy bay', ['🚗', '🚲', '⛵']],
    ['Con gì kêu ộp ộp, nhảy rất xa, sống bên bờ ao?', '🐸', 'con ếch', ['🐟', '🐱', '🐔']],
    ['Ai được làm bằng tuyết, có mũi cà rốt, đứng ngoài sân mùa đông?', '⛄', 'người tuyết', ['🧸', '🌳', '🚗']],
    ['Con gì có tám cái chân, sống dưới biển, biết phun mực?', '🐙', 'con bạch tuộc', ['🐟', '🐳', '🐬']],
    ['Con gì kêu gâu gâu, trông nhà cho chủ?', '🐶', 'con chó', ['🐱', '🐷', '🐰']],
    ['Cái gì sáng trên trời ban đêm, lúc thì tròn, lúc thì cong cong?', '🌙', 'ông trăng', ['☀️', '🌈', '☁️']],
    ['Con gì giống con ngựa, khoác áo sọc đen trắng?', '🦓', 'con ngựa vằn', ['🐴', '🐄', '🐘']],
    ['Xe gì chạy trên đường ray, có nhiều toa nối nhau?', '🚂', 'tàu hỏa', ['🚗', '🚲', '✈️']],
    ['Con gì có bờm dày quanh đầu, gầm rất to, là vua của các loài thú?', '🦁', 'con sư tử', ['🐘', '🐶', '🐰']],
    ['Con gì chân có màng, bơi dưới ao, kêu cạp cạp?', '🦆', 'con vịt', ['🐔', '🐦', '🐟']],
    ['Quả gì màu cam, bóc vỏ ra có nhiều múi?', '🍊', 'quả cam', ['🍎', '🍌', '🍉']],
    ['Con gì bé xíu, bay vo ve, chăm chỉ làm mật?', '🐝', 'con ong', ['🦋', '🐞', '🐜']],
    ['Cái gì có nhiều trang, có chữ, có hình, mình đọc trước khi đi ngủ?', '📚', 'quyển sách', ['🧸', '⚽', '🪥']],
    ['Con gì có lông vũ, bay trên trời, hót líu lo?', '🐦', 'con chim', ['🐟', '🐱', '🐢']],
    ['Con gì có hai cái càng, bò ngang, sống dưới nước?', '🦀', 'con cua', ['🐟', '🐙', '🐬']],
    ['Con gì to nhất dưới biển, phun nước lên từ trên lưng?', '🐳', 'con cá voi', ['🐟', '🦀', '🐙']],
    ['Con gì có bướu trên lưng, đi qua sa mạc nóng?', '🐫', 'con lạc đà', ['🐴', '🐄', '🐘']],
    ['Con gì có cái túi trước bụng để địu con, nhảy rất xa?', '🦘', 'con chuột túi', ['🐰', '🐻', '🐵']],
    ['Con gì sống ở xứ lạnh, đi lạch bạch, bơi giỏi mà không biết bay?', '🐧', 'chim cánh cụt', ['🐦', '🦅', '🐔']],
    ['Con gì bò rất chậm, mang cái vỏ xoắn như ngôi nhà trên lưng?', '🐌', 'con ốc sên', ['🐰', '🐱', '🐦']],
    ['Con gì có tám cái chân, giăng tơ để bắt muỗi?', '🕷️', 'con nhện', ['🐝', '🐜', '🦋']],
    ['Con gì nhỏ xíu, đi thành hàng dài, khiêng mồi về tổ?', '🐜', 'con kiến', ['🐘', '🐰', '🦋']],
    ['Con gì thân dài, không có chân, trườn trên mặt đất?', '🐍', 'con rắn', ['🐢', '🐰', '🐔']],
    ['Con gì mõm dài, răng nhọn, da sần sùi, sống dưới sông?', '🐊', 'con cá sấu', ['🐟', '🐸', '🐢']],
    ['Con gì lông đen trắng, rất thích ăn lá tre?', '🐼', 'con gấu trúc', ['🐻', '🐱', '🦓']],
    ['Con gì leo trèo giỏi, đuôi dài, rất thích ăn chuối?', '🐵', 'con khỉ', ['🐶', '🐷', '🐄']],
    ['Con gì lông vằn, được gọi là chúa sơn lâm?', '🐯', 'con hổ', ['🐱', '🐶', '🐘']],
    ['Con gì kêu ò ò, cho mình sữa để uống?', '🐄', 'con bò', ['🐷', '🐶', '🐔']],
    ['Con gì lông trắng xoăn như bông, kêu be be?', '🐑', 'con cừu', ['🐶', '🐷', '🐄']],
    ['Con gì bay vào ban đêm, ngủ thì treo ngược mình?', '🦇', 'con dơi', ['🐦', '🦋', '🐝']],
    ['Con gì mắt to tròn, thức đêm, kêu cú cú?', '🦉', 'con cú', ['🐦', '🐔', '🦆']],
    ['Quả gì vỏ cứng, bên trong có nước ngọt mát, mọc trên cây cao?', '🥥', 'quả dừa', ['🍎', '🍌', '🍇']],
    ['Quả gì màu đỏ, mẹ hay nấu canh và làm nước sốt?', '🍅', 'quả cà chua', ['🍌', '🍇', '🍊']],
    ['Củ gì màu cam, các bạn thỏ rất thích?', '🥕', 'củ cà rốt', ['🍌', '🍎', '🌽']],
    ['Quả gì nhỏ nhỏ, màu tím, mọc thành từng chùm?', '🍇', 'chùm nho', ['🍎', '🍌', '🍉']],
    ['Quả gì vỏ vàng, rất chua, mình vắt làm nước uống?', '🍋', 'quả chanh', ['🍌', '🍎', '🍇']],
    ['Xe gì có hai bánh, có động cơ, bố chở con đi học?', '🛵', 'xe máy', ['🚗', '🚂', '✈️']],
    ['Xe gì màu đỏ, có thang dài, chạy đi dập lửa?', '🚒', 'xe cứu hỏa', ['🚑', '🚌', '🚗']],
    ['Xe gì chở người bệnh tới bệnh viện, kêu bíp bo bíp bo?', '🚑', 'xe cứu thương', ['🚒', '🚌', '🚲']],
    ['Cái gì nổi trên mặt nước, chở người qua sông?', '⛵', 'con thuyền', ['🚗', '🚲', '✈️']],
    ['Cái gì có bốn bánh, có vô lăng, chở cả nhà đi chơi?', '🚗', 'ô tô', ['🚲', '✈️', '⛵']],
    ['Cái gì có nhiều răng mà không biết cắn, dùng để chải tóc?', '🪮', 'cái lược', ['🪥', '✂️', '📚']],
    ['Cái gì có hai lưỡi sắc, dùng để cắt giấy?', '✂️', 'cái kéo', ['🪥', '📚', '⚽']],
    ['Cái gì càng gọt càng ngắn, dùng để viết chữ?', '✏️', 'cái bút chì', ['✂️', '📚', '🧸']],
    ['Cái gì mình soi vào thì thấy mặt mình?', '🪞', 'cái gương', ['📚', '⚽', '🧸']],
    ['Cái gì kêu reng reng, gọi mình dậy mỗi sáng?', '⏰', 'cái đồng hồ báo thức', ['📚', '☂️', '⚽']],
    ['Cái gì có dây, mình gảy lên thì thành tiếng nhạc?', '🎸', 'cây đàn ghi ta', ['🥁', '📚', '⚽']],
    ['Cái gì mình đánh vào thì kêu tùng tùng?', '🥁', 'cái trống', ['🎸', '📚', '🧸']],
    ['Cái gì tròn tròn, mình đá vào thì lăn đi xa?', '⚽', 'quả bóng', ['🧸', '📚', '🪑']],
    ['Cái gì mềm mềm hình con gấu, mình ôm khi đi ngủ?', '🧸', 'con gấu bông', ['⚽', '📚', '🪑']],
    ['Cái gì mình thổi phồng lên, buộc dây, bay lơ lửng?', '🎈', 'quả bóng bay', ['⚽', '🧸', '📚']],
    ['Cái gì bay trên trời nhờ gió, có sợi dây dài mình cầm?', '🪁', 'con diều', ['⚽', '🧸', '✈️']],
    ['Cái gì có bảy màu, hiện trên trời sau cơn mưa?', '🌈', 'cầu vồng', ['☀️', '🌙', '⭐']],
    ['Cái gì lấp lánh trên trời đêm, nhỏ xíu và có rất nhiều?', '⭐', 'ngôi sao', ['☀️', '🌈', '☁️']],
    ['Cái gì trắng xốp, trôi trên trời, có khi đổ mưa?', '☁️', 'đám mây', ['☀️', '🌈', '⭐']],
    ['Cái gì nóng, cháy bập bùng, con không được nghịch?', '🔥', 'ngọn lửa', ['💧', '❄️', '🌈']],
    ['Cái gì trắng, lạnh, rơi từ trên trời xuống vào mùa đông xứ lạnh?', '❄️', 'bông tuyết', ['🔥', '☀️', '🌈']],
  ].map(([q, ans, name, wrong]) => ({ q, ans, name, wrong }));

  const JOBS = [
    ['Ai nấu những món ăn ngon?', '🧑‍🍳', 'Đầu bếp nấu những món ăn ngon.'],
    ['Ai khám bệnh cho mình?', '🧑‍⚕️', 'Bác sĩ khám bệnh cho mình.'],
    ['Ai dập tắt đám cháy?', '🧑‍🚒', 'Chú lính cứu hỏa dập tắt đám cháy.'],
    ['Ai dạy các bạn học bài?', '🧑‍🏫', 'Thầy cô giáo dạy các bạn học bài.'],
    ['Ai trồng lúa, trồng rau?', '🧑‍🌾', 'Bác nông dân trồng lúa, trồng rau.'],
    ['Ai lái máy bay?', '🧑‍✈️', 'Chú phi công lái máy bay.'],
    ['Ai giữ trật tự, an toàn trên đường phố?', '👮', 'Chú công an giữ trật tự, an toàn.'],
    ['Ai sửa ô tô, xe máy bị hỏng?', '🧑‍🔧', 'Chú thợ sửa xe sửa ô tô, xe máy bị hỏng.'],
    ['Ai vẽ những bức tranh thật đẹp?', '🧑‍🎨', 'Họa sĩ vẽ những bức tranh thật đẹp.'],
    ['Ai hát cho mọi người cùng nghe?', '🧑‍🎤', 'Ca sĩ hát cho mọi người cùng nghe.'],
    ['Ai bay lên vũ trụ?', '🧑‍🚀', 'Nhà du hành bay lên vũ trụ.'],
    ['Ai xây những ngôi nhà cao?', '👷', 'Chú công nhân xây những ngôi nhà cao.'],
    ['Ai làm thí nghiệm để khám phá điều mới?', '🧑‍🔬', 'Nhà khoa học làm thí nghiệm để khám phá điều mới.'],
    ['Ai làm việc với máy tính, viết ra trò chơi và ứng dụng?', '🧑‍💻', 'Kỹ sư phần mềm làm việc với máy tính.'],
  ].map(([q, e, explain]) => ({ q, e, explain }));

  // Tìm cái không cùng nhóm.
  const GROUPS = [
    ['trái cây', [['🍎', 'quả táo'], ['🍌', 'quả chuối'], ['🍇', 'chùm nho'], ['🍓', 'quả dâu'], ['🍊', 'quả cam'], ['🍉', 'quả dưa hấu']]],
    ['con vật', [['🐱', 'con mèo'], ['🐶', 'con chó'], ['🐰', 'con thỏ'], ['🐘', 'con voi'], ['🐔', 'con gà'], ['🐷', 'con lợn']]],
    ['xe cộ', [['🚗', 'ô tô'], ['🚲', 'xe đạp'], ['🚌', 'xe buýt'], ['🚂', 'tàu hỏa'], ['🚑', 'xe cứu thương'], ['🚒', 'xe cứu hỏa']]],
    ['quần áo', [['👕', 'cái áo'], ['👗', 'cái váy'], ['👖', 'cái quần'], ['🩳', 'quần đùi'], ['🧥', 'áo khoác']]],
    ['rau củ', [['🥕', 'củ cà rốt'], ['🌽', 'bắp ngô'], ['🥦', 'súp lơ xanh'], ['🥔', 'củ khoai tây'], ['🍆', 'quả cà tím'], ['🥒', 'quả dưa chuột']]],
    ['đồ dùng học tập', [['✏️', 'bút chì'], ['📚', 'quyển sách'], ['✂️', 'cái kéo'], ['📏', 'cái thước'], ['🎒', 'cặp sách'], ['🖍️', 'bút sáp màu']]],
  ].map(([name, items]) => ({ name, items: items.map(([e, n]) => ({ e, name: n })) }));
  const oddExplain = (item, group) => `${cap(item.name)} không phải là ${group.name}.`;

  // 4 đáp án là số: đáp án đúng và 3 số sát bên (để không đoán được nhờ số quá xa).
  function numOptions(t, lo, hi) {
    const near = range(Math.max(lo, t - 3), Math.min(hi, t + 3)).filter(n => n !== t);
    return [t, ...sample(near, 3)].map(n => ({ id: String(n), kind: 'num', value: n }));
  }

  /* ---------- Kỹ năng: gen(level) tạo một câu hỏi, phrases() liệt kê mọi câu có thể nói ---------- */

  const missAddSay = (a, c) => `${cap(NUM[a])} thêm mấy thì được ${NUM[c]}?`;
  const missSubSay = (a, c) => `${cap(NUM[a])} bớt mấy thì còn ${NUM[c]}?`;
  const addSay = (a, b) => `${cap(NUM[a])} thêm ${NUM[b]} là mấy?`;
  const addExplain = (a, b) => `${cap(NUM[a])} thêm ${NUM[b]} là ${NUM[a + b]}.`;
  const subSay = (a, b) => `${cap(NUM[a])} bớt ${NUM[b]} còn mấy?`;
  const subExplain = (a, b) => `${cap(NUM[a])} bớt ${NUM[b]} còn ${NUM[a - b]}.`;
  // Mọi cặp a, b ≥ 1 với a + b ≤ max.
  const pairs = (max = 10) => range(1, max - 1).flatMap(a => range(1, max - a).map(b => [a, b]));
  const sumScene = (a, op, b, c) => ({ type: 'sum', parts: [a, op, b, '=', c] });

  const skills = {
    count: {
      name: 'Đếm', maxLevel: 3,
      gen(level) {
        const o = pick(COUNTABLE);
        if (level >= 3) {
          const n = 11 + rand(10);
          return { say: `Có bao nhiêu ${o.name}?`, scene: { type: 'group', e: o.e, n }, mode: 'choice', options: numOptions(n, 8, 20),
            answer: String(n), countAlong: true, explain: `Có ${NUM[n]} ${o.name}.` };
        }
        const max = level === 1 ? 5 : 10;
        const n = 2 + rand(max - 1);
        return { say: `Có bao nhiêu ${o.name}?`, scene: { type: 'group', e: o.e, n }, mode: 'pad', padMax: max,
          answer: n, countAlong: true, explain: `Có ${NUM[n]} ${o.name}.` };
      },
      phrases: () => COUNTABLE.flatMap(o => [`Có bao nhiêu ${o.name}?`, ...range(2, 20).map(n => `Có ${NUM[n]} ${o.name}.`)]),
    },

    add: {
      name: 'Phép thêm', maxLevel: 4,
      gen(level) {
        if (level === 4) {
          // Tìm số còn thiếu: 3 thêm mấy thì được 7?
          const c = 4 + rand(7), a = 1 + rand(c - 2), b = c - a;
          return { say: missAddSay(a, c), scene: sumScene(a, '+', '?', c), mode: 'pad', padMax: 10, answer: b, explain: addExplain(a, b) };
        }
        if (level === 3) {
          const a = 3 + rand(15), b = 1 + rand(Math.min(9, 20 - a)), c = a + b;
          return { say: addSay(a, b), scene: sumScene(a, '+', b, '?'), mode: 'choice', options: numOptions(c, 2, 20),
            answer: String(c), explain: addExplain(a, b) };
        }
        const max = level === 1 ? 5 : 10;
        const a = 1 + rand(max - 1), b = 1 + rand(max - a), o = pick(COUNTABLE);
        return { say: addSay(a, b), scene: { type: 'add', e: o.e, a, b }, mode: 'pad', padMax: max,
          answer: a + b, countAlong: true, explain: addExplain(a, b) };
      },
      phrases: () => [...pairs(20).flatMap(([a, b]) => [addSay(a, b), addExplain(a, b)]),
        ...pairs(10).map(([a, b]) => missAddSay(a, a + b))],
    },

    sub: {
      name: 'Phép bớt', maxLevel: 4,
      gen(level) {
        if (level === 4) {
          // Tìm số còn thiếu: 9 bớt mấy thì còn 5?
          const a = 4 + rand(7), b = 1 + rand(a - 1), c = a - b;
          return { say: missSubSay(a, c), scene: sumScene(a, '−', '?', c), mode: 'pad', padMax: 10, answer: b, explain: subExplain(a, b) };
        }
        if (level === 3) {
          const a = 11 + rand(10), b = 1 + rand(9), c = a - b;
          return { say: subSay(a, b), scene: sumScene(a, '−', b, '?'), mode: 'choice', options: numOptions(c, 0, 20),
            answer: String(c), explain: subExplain(a, b) };
        }
        const max = level === 1 ? 5 : 10;
        const a = 2 + rand(max - 1), b = 1 + rand(a - 1), o = pick(COUNTABLE);
        return { say: subSay(a, b), scene: { type: 'sub', e: o.e, a, b }, mode: 'pad', padMax: max,
          answer: a - b, countAlong: true, explain: subExplain(a, b) };
      },
      phrases: () => [...pairs(20).flatMap(([c, b]) => [subSay(c + b, b), subExplain(c + b, b)]),
        ...pairs(10).map(([c, b]) => missSubSay(c + b, c))],
    },

    compare: {
      name: 'So sánh', maxLevel: 4,
      gen(level) {
        if (level >= 3) {
          const max = level === 3 ? 20 : 100;
          let a, b;
          do { a = rand(max + 1); b = rand(max + 1); } while (a === b || (level === 4 && Math.floor(a / 10) === Math.floor(b / 10) && rand(2)));
          const big = rand(2) === 0;
          const t = big ? Math.max(a, b) : Math.min(a, b);
          return { say: big ? 'Số nào lớn hơn?' : 'Số nào bé hơn?', scene: { type: 'none' }, mode: 'choice',
            options: [a, b].map(n => ({ id: String(n), kind: 'num', value: n })), answer: String(t),
            explain: `Số ${numWord(t)} ${big ? 'lớn' : 'bé'} hơn.` };
        }
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
      phrases: () => [...COUNTABLE.map(o => `Bên nào nhiều ${o.name} hơn?`), ...Object.values(COMPARE_EXPLAIN),
        'Số nào lớn hơn?', 'Số nào bé hơn?', ...range(0, 100).flatMap(n => [`Số ${numWord(n)} lớn hơn.`, `Số ${numWord(n)} bé hơn.`])],
    },

    findNumber: {
      name: 'Nhận biết số', maxLevel: 4,
      gen(level) {
        const max = [10, 20, 50, 100][level - 1];
        const all = range(0, max), t = pick(all);
        // Bé lớn: đáp án nhiễu gồm số đảo chữ số (25 và 52) cho khó hơn.
        const rev = t % 10 * 10 + Math.floor(t / 10);
        const swapped = t > 9 && t % 10 && rev !== t && rev <= max ? [rev] : [];
        const rest = all.filter(n => n !== t && !swapped.includes(n));
        const opts = [t, ...(level >= 3 ? swapped : []), ...sample(rest, 3)].slice(0, 4);
        return { say: `Số ${numWord(t)} đâu?`, scene: { type: 'none' }, mode: 'choice',
          options: opts.map(n => ({ id: String(n), kind: 'num', value: n })), answer: String(t), explain: `Đây là số ${numWord(t)}.` };
      },
      phrases: () => range(0, 100).flatMap(n => [`Số ${numWord(n)} đâu?`, `Đây là số ${numWord(n)}.`]),
    },

    nextNumber: {
      name: 'Số liền trước, liền sau', maxLevel: 3,
      gen(level) {
        const max = [10, 20, 100][level - 1];
        const after = rand(2) === 0;
        const n = after ? rand(max) : 1 + rand(max);
        const t = after ? n + 1 : n - 1;
        const word = after ? 'sau' : 'trước';
        return { say: `Số liền ${word} số ${numWord(n)} là số mấy?`, show: `Số liền ${word} số ${n} là số mấy?`, scene: { type: 'none' },
          mode: 'choice', options: numOptions(t, 0, max), answer: String(t), explain: `Số liền ${word} số ${numWord(n)} là số ${numWord(t)}.` };
      },
      phrases: () => range(0, 99).flatMap(n => [`Số liền sau số ${numWord(n)} là số mấy?`, `Số liền sau số ${numWord(n)} là số ${numWord(n + 1)}.`,
        `Số liền trước số ${numWord(n + 1)} là số mấy?`, `Số liền trước số ${numWord(n + 1)} là số ${numWord(n)}.`]),
    },

    pattern: {
      name: 'Quy luật', maxLevel: 3,
      gen(level) {
        if (level === 3) {
          // Dãy số đếm thêm 1, 2, 5 hoặc 10.
          const d = pick([1, 2, 2, 5, 10]);
          const start = d === 1 ? rand(15) : d * rand(d === 10 ? 5 : 6);
          const seq = range(0, 3).map(i => start + i * d), t = start + 4 * d;
          return { say: 'Số nào tiếp theo?', scene: { type: 'seq', items: seq.map(n => ({ num: n })) }, mode: 'choice',
            options: numOptions(t, 0, 100), answer: String(t), explain: `Mỗi lần thêm ${NUM[d]}, nên số tiếp theo là ${numWord(t)}.` };
        }
        const [a, b, c] = sample(COUNTABLE, 3);
        const unit = level === 1 ? [a, b] : pick([[a, b, c], [a, a, b], [a, b, b]]);
        const len = unit.length === 2 ? 5 : 6;
        const seq = range(0, len - 1).map(i => unit[i % unit.length]);
        const t = unit[len % unit.length];
        const opts = [...new Set([a, b, c])].concat(sample(COUNTABLE.filter(o => o !== a && o !== b && o !== c), 1));
        return { say: 'Cái gì tiếp theo?', scene: { type: 'seq', items: seq.map(o => ({ e: o.e })) }, mode: 'choice',
          options: opts.map(o => emojiOpt(o.e)), answer: t.e, explain: `Tiếp theo là ${t.name}.` };
      },
      phrases: () => ['Cái gì tiếp theo?', 'Số nào tiếp theo?', ...COUNTABLE.map(o => `Tiếp theo là ${o.name}.`),
        ...[1, 2, 5, 10].flatMap(d => range(4 * d, 100).map(t => `Mỗi lần thêm ${NUM[d]}, nên số tiếp theo là ${numWord(t)}.`))],
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
      name: 'Chữ cái đầu tiên', maxLevel: 2,
      gen(level) {
        if (level >= 2) {
          const w = pick(DIGRAPH_WORDS);
          const opts = [w.l, ...sample(Object.keys(DIGRAPHS).filter(x => x !== w.l), 3)];
          return { say: `${cap(w.word)} bắt đầu bằng chữ gì?`, show: '… bắt đầu bằng chữ gì?', scene: { type: 'big', e: w.e }, mode: 'choice',
            options: opts.map(l => ({ id: l, kind: 'letter', value: l })), answer: w.l, explain: `${cap(w.word)} bắt đầu bằng chữ ${DIGRAPHS[w.l]}.` };
        }
        const w = pick(WORDS);
        const opts = [w.l, ...sample(ALL_LETTERS.filter(x => x !== w.l && x !== 'q'), 3)];
        // Không hiện chữ của từ, nếu không bé chỉ cần so hình chữ.
        return { say: `${cap(w.word)} bắt đầu bằng chữ gì?`, show: '… bắt đầu bằng chữ gì?', scene: { type: 'big', e: w.e }, mode: 'choice',
          options: opts.map(l => ({ id: l, kind: 'letter', value: l })), answer: w.l, explain: `${cap(w.word)} bắt đầu bằng chữ ${LETTER_NAME[w.l]}.` };
      },
      phrases: () => [...WORDS, ...DIGRAPH_WORDS].flatMap(w => [`${cap(w.word)} bắt đầu bằng chữ gì?`,
        `${cap(w.word)} bắt đầu bằng chữ ${LETTER_NAME[w.l] || DIGRAPHS[w.l]}.`]),
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

    riddle: {
      name: 'Câu đố', maxLevel: 1,
      gen() {
        const t = pick(RIDDLES);
        return { say: t.q, scene: { type: 'none' }, mode: 'choice', long: true,
          options: [t.ans, ...t.wrong].map(emojiOpt), answer: t.ans, explain: `Đó là ${t.name}.` };
      },
      phrases: () => RIDDLES.flatMap(t => [t.q, `Đó là ${t.name}.`]),
    },

    oddOne: {
      name: 'Không cùng nhóm', maxLevel: 1,
      gen() {
        const [g, other] = sample(GROUPS, 2);
        const odd = pick(other.items);
        const opts = [...sample(g.items, 3), odd].map(o => emojiOpt(o.e));
        return { say: 'Cái nào không cùng nhóm?', scene: { type: 'none' }, mode: 'choice', options: opts, answer: odd.e, explain: oddExplain(odd, g) };
      },
      phrases: () => ['Cái nào không cùng nhóm?', ...GROUPS.flatMap(g => GROUPS.filter(o => o !== g).flatMap(o => o.items.map(it => oddExplain(it, g))))],
    },

    jobs: {
      name: 'Nghề nghiệp', maxLevel: 1,
      gen() {
        const t = pick(JOBS);
        const opts = [t.e, ...sample(JOBS.filter(j => j !== t).map(j => j.e), 3)];
        return { say: t.q, scene: { type: 'none' }, mode: 'choice', options: opts.map(emojiOpt), answer: t.e, explain: t.explain };
      },
      phrases: () => JOBS.flatMap(t => [t.q, t.explain]),
    },
  };

  const subjects = [
    { id: 'math', name: 'Toán', icon: '🔢', color: '#f97316', skills: ['count', 'add', 'sub', 'compare', 'findNumber', 'nextNumber', 'pattern', 'shape'] },
    { id: 'letters', name: 'Chữ cái', icon: '🔤', color: '#8b5cf6', skills: ['findLetter', 'firstLetter'] },
    { id: 'nature', name: 'Tự nhiên', icon: '🌿', color: '#16a34a', skills: ['water', 'fly', 'color', 'senses', 'food', 'life'] },
    { id: 'riddle', name: 'Đố vui', icon: '🧩', color: '#e11d48', skills: ['riddle', 'oddOne', 'jobs'] },
    { id: 'mix', name: 'Tổng hợp', icon: '🎲', color: '#0ea5e9', skills: Object.keys(skills) },
  ];

  // Phần thưởng ở mốc an toàn, đỉnh tháp và nhiệm vụ mỗi ngày.
  const stickers = ['🦄', '🐲', '🦖', '🦕', '🐳', '🐬', '🦁', '🐼', '🐨', '🐸', '🦊', '🐙', '🦋', '🐞', '🐢',
    '🦜', '🦩', '🐧', '🦔', '🐿️', '🐠', '🌈', '🚀', '🎠', '🍩', '🧁', '🍭', '🎸', '🏰', '⛄'];
  const avatars = ['🐰', '🐻', '🐱', '🐶', '🐼', '🦊', '🐯', '🐵'];
  // Tuổi của bé quyết định cấp khởi đầu của mọi kỹ năng; sau đó độ khó vẫn tự điều chỉnh theo kết quả.
  const ages = [
    { age: 3, label: 'Mẫu giáo bé', level: 1 },
    { age: 4, label: 'Mẫu giáo nhỡ', level: 1 },
    { age: 5, label: 'Mẫu giáo lớn', level: 2 },
    { age: 6, label: 'Lớp 1', level: 3 },
    { age: 7, label: 'Lớp 2', level: 4 },
  ];

  const phrases = {
    whoPlays: 'Ai đang chơi đấy nhỉ?',
    askAge: 'Con mấy tuổi rồi?',
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
    owlRemoved: 'Cú bỏ bớt đáp án sai rồi. Con chọn trong những ô còn lại nhé.',
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
    lookCarefully: 'Con nhìn thật kỹ rồi mới chọn nhé.',
    tired: 'Cú mệt rồi. Mình nghỉ một chút nhé.',
    breatheIn: 'Hít vào thật sâu.',
    breatheOut: 'Thở ra thật chậm.',
    breakDone: 'Hết giờ nghỉ rồi! Mình leo tiếp nào!',
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
    '🥚', '🐣', '🎉', '🚀', '🏆', '⛳', '🎨', '🪩', '🎵', '🎂'];

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
      DIGRAPH_WORDS, RIDDLES, JOBS, GROUPS,
      hats, pets, themes, golden, UI_EMOJI]);
    // Tạo RegExp lúc gọi (chỉ tools/build.js dùng): viết thẳng /\p{…}/u sẽ là lỗi cú pháp trên trình duyệt tivi cũ.
    return [...new Set(text.match(new RegExp('\\p{Extended_Pictographic}\\uFE0F?', 'gu')))];
  }

  globalThis.CONTENT = {
    NUM, TENS, numWord, skills, subjects, stickers, avatars, ages, hats, pets, themes, golden, phrases, hash, emojiFile, allPhrases, allEmoji,
    util: { rand, pick, shuffle, sample, range },
  };
})();
