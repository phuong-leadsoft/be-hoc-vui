# Kế hoạch và việc còn dang dở

Tài liệu bàn giao để người (hoặc AI) khác làm tiếp. Đọc `README.md` trước để biết cách chạy.
Cập nhật lần cuối: 2026-11-01.

## 1. Bối cảnh

- App web thuần (HTML/CSS/JS, không framework, không bước build JS) cho bé 5 tuổi, chạy trên **tivi LG webOS 23**
  (model 55UR8050PSB, Chromium cũ cỡ bản 94: tránh cú pháp/API quá mới), iPad và máy tính.
- Ngôn ngữ giao diện, giọng đọc và comment trong code: **tiếng Việt**.
- Yêu cầu cốt lõi của phụ huynh: **trả lời chính xác, không được đoán bừa**; hấp dẫn như gameshow; hiệu ứng bùng nổ;
  lưu hồ sơ để hôm sau học tiếp.
- Thiết kế gameshow là **của riêng app** (leo tháp, mốc an toàn, quyền trợ giúp, nút "Chốt!"), không sao chép
  tên, nhạc, luật hay giao diện của "Ai là triệu phú".

## 2. Cấu trúc code

| Tệp | Vai trò |
|---|---|
| `content.js` | Toàn bộ câu hỏi (`skills`: `gen(level)` tạo câu, `phrases()` liệt kê mọi câu nói), môn (`subjects`), câu nói chung (`phrases`), quà (`stickers`, `hats`, `pets`, `themes`, `golden`), `allPhrases()`, `allEmoji()`. Dùng chung cho trình duyệt và node. |
| `app.js` | Hồ sơ (`Store`: localStorage + đồng bộ `serve.py`), âm thanh (`Voice` đọc file `audio/<hash>.m4a`, `Sfx` Web Audio), pháo hoa canvas (`Fx`, `celebrate`), các màn hình, luật leo tháp, điều hướng bằng remote (phím mũi tên, OK, Back = keyCode 461). |
| `style.css` | Giao diện; kích thước theo `rem`, `rem` co theo màn hình (`min(1.6vw, 2.8vh)`). |
| `serve.py` | Máy chủ trong mạng nhà: phục vụ app, `GET /api/profiles`, `PUT /api/profiles/<id>` (lưu `data/profiles.json`), có CORS cho bản cài tivi chạy từ `file://`. |
| `tools/build.js` | Tạo giọng đọc (macOS `say -v Linh -r 150` → AAC `.m4a`, tên file = FNV-1a hash của câu) và tải hình Twemoji 15.1.0 vào `img/`. Chỉ tạo phần thiếu, xóa âm thanh thừa. **Chạy lại mỗi khi sửa câu nói trong `content.js`.** |
| `tools/package_tv.js` | Đóng gói `.ipk` webOS (`appinfo.json`, icon từ `tools/icon.svg`), chèn `window.BHV_SERVER` = địa chỉ máy chủ để đồng bộ. Cần `@webos-tools/cli` (`ares-package`). |
| `tools/lgtv.py` | Điều khiển tivi qua mạng (aiowebostv): `uv run tools/lgtv.py [launcher|apps|launch <id>|open <url>]`. Tự dò tivi bằng SSDP; lần đầu tivi hỏi "Đồng ý" và lưu khóa vào `tools/.lgtv_key.json` (đã gitignore). |

Kiểm thử nhanh: mở `index.html?debug`, trong console có `BHV.game()`, `BHV.profile()`, `BHV.Store`, `BHV.Fx`,
`BHV.ask(skill, level)` (hiện ngay một câu của kỹ năng đó khi đang trong tháp).
Khi thử, nên chạy app ở cổng tĩnh khác (`python3 -m http.server 8082`) để không tạo hồ sơ rác trên `serve.py`.

## 3. Luật chơi hiện có (đã xong, đã thử)

- Tháp **100 tầng** mỗi môn (Toán, Chữ cái, Tự nhiên, Tổng hợp), mốc an toàn có quà mỗi 10 tầng, 3 tim,
  quyền trợ giúp Hỏi Cú và Đổi câu (mỗi đoạn 10 tầng 1 lần). Chi tiết ở mục 4.1–4.3.
- Chống đoán bừa: khóa đáp án tới khi đọc xong câu hỏi; chọn rồi bấm "Chốt!" (hoặc bấm lại ô đó), trống hồi hộp;
  sai lần 1 mất tim, khóa 3 giây, xáo đáp án; sai lần 2 thì cú dạy lại (đếm cùng, chỉ đáp án), không lên tầng, câu
  quay lại sau 2 câu; chỉ đúng ngay mới có sao; toán dùng bàn phím số 0–10.
- Độ khó tự điều chỉnh theo từng kỹ năng (lên cấp khi đúng ngay 7/8, xuống khi chỉ 2/6).
- Hồ sơ nhiều bé, sao, hình dán (30), chuỗi ngày học, nhiệm vụ ngày (15 câu đúng ngay), trang Bố mẹ xem.
- Hiệu ứng đúng: pháo hoa + ống pháo giấy canvas, chớp sáng, sóng lan, chữ khen cầu vồng, đồ vật nhảy, kèn;
  huy hiệu 🔥 chuỗi đúng liên tiếp (≥3 thì pháo hoa gấp đôi). Hiệu ứng lớn chỉ khi đúng ngay lần đầu.

## 4. Việc còn dang dở (làm theo thứ tự)

### 4.1–4.3 Tháp 100 tầng, quà ở các mốc, nhạc: ĐÃ XONG (2026-11-01)

Đã làm trong `app.js` và `style.css` đúng theo kế hoạch đã thống nhất, đã chạy thử trong Chromium (Playwright):
- `FLOORS = 100`, `SEGMENT = 10`. Tiến độ từng tháp lưu trong `profile.climbs[môn] = {floor, hearts, owl, swap}`
  (`saveClimb()` sau mỗi lần trả lời, dùng trợ giúp, thoát). Vào lại tháp thì leo tiếp, nói `phrases.resume`.
- Hết tim: `outOfHearts()` đưa về mốc gần nhất, nạp đầy tim và trợ giúp, hộp "Hết tim rồi!" (Leo tiếp / Về nhà).
- Mốc: `milestone(tầng)` chạy các bước trong `GIFT_PLAN` (mỗi bước xong có nút "Tiếp tục"); `grant(kind)` tặng món,
  hết món thì đổi sang hình dán vàng, hết nữa thì +3 sao. Các mini-game: `eggGame`, `partyGift`, `starRain`,
  `rocketGift`, `championGift`. Tầng 100: `crownTower()` ghi `best = 100`, `wins++`, xóa tiến độ, rồi `endTower()`.
- Thang bên phải chỉ hiện đoạn 10 tầng đang leo (`renderLadder()`), thanh tiến độ "37/100".
- Bạn thú đội mũ, thú cưng đi cạnh: `avatarHtml(p, withPet)`. Khung cảnh: `applyTheme()` đặt `body[data-theme]`.
- Trang chủ: 10 vạch tiến độ, "Đang ở tầng X/100", nút Đổi mũ / Thú cưng / Khung cảnh (chỉ hiện khi đã có món).
  Bộ sưu tập có các ngăn Hình dán, Hình dán vàng, Mũ, Thú cưng, Khung cảnh. Trang Bố mẹ có tầng hiện tại và cao nhất.
- Âm thanh (Web Audio, không cần file): `Sfx.fanfare()` (nhạc thưởng), `Sfx.dance()` (lễ hội tầng 50),
  `Sfx.whoosh()` (tên lửa), `Music` (nhạc nền 116 BPM, hạ nhỏ khi cú đọc, tạm dừng khi mở quà, nút 🎵 lưu trong
  localStorage `be-hoc-vui:music`).
- Kiểm thử nhanh trong console (`index.html?debug`): `BHV.setFloor(39)` rồi trả lời đúng để tới mốc 40,
  hoặc `BHV.gift(50)` để mở thẳng quà của một mốc.

Còn lại cho phần này:
- `img/1f3b5.svg` (🎵) là hình vẽ tay tạm vì máy làm việc không tải được Twemoji. Trên Mac: xóa file đó rồi chạy
  `node tools/build.js` để lấy hình Twemoji thật.
- Chưa thử trên tivi thật: kiểm tra độ mượt của sàn disco, mưa sao, pháo hoa và âm lượng nhạc nền; giảm nếu giật.
- Không thêm câu nói mới nên không cần tạo lại giọng đọc.

### 4.3b Chọn tuổi, câu hỏi khó hơn, tháp Đố vui: ĐÃ XONG (2026-11-01)

Phụ huynh thấy câu hỏi quá dễ với bé 5 tuổi. Đã làm:
- `CONTENT.ages`: 3–7 tuổi → cấp khởi đầu 1, 1, 2, 3, 4. Chọn tuổi khi tạo hồ sơ; hồ sơ cũ chưa có tuổi được hỏi
  một lần ("Con mấy tuổi rồi?"); đổi ở trang Bố mẹ (`setAge()` đặt lại cấp mọi kỹ năng).
- Lên cấp nhanh hơn: đúng ngay 5/6 câu gần nhất. Chỉ tầng 1–10 dễ hơn một bậc (trước là 1–20).
- Kỹ năng thêm cấp: `count` 3, `add`/`sub` 4, `compare` 4, `findNumber` 4, `firstLetter` 2.
  Kỹ năng mới: `nextNumber`, `pattern` (Toán); `riddle`, `oddOne`, `jobs` (tháp **Đố vui** 🧩).
  Đáp án số ở cấp cao dùng 4 lựa chọn sát nhau (`numOptions`). `numWord(n)` đọc số tới 100.
- 27 hình mới lấy từ gói npm `@twemoji/svg@15.0.0` (cùng hình với Twemoji 15.1.0); 🎵 đã thay bằng hình thật.

**Việc phải làm trên Mac:** có khoảng 2000 câu nói mới chưa có giọng đọc. Thiếu file thì app dùng giọng trình duyệt
(tivi thường không có giọng Việt nên sẽ im lặng). Chạy:
`git pull && node tools/build.js && git add audio && git commit -m "Giọng đọc cho câu hỏi mới" && git push`

### 4.3c Nổ lớn ở các mốc, càng cao càng dữ dội: ĐÃ XONG (2026-11-01)

- `megaBurst(title, power)` với power = tầng/10 (1–10): rung màn hình (`body.quake`, biên độ tăng theo power),
  chớp trắng, sóng nổ, chữ "TẦNG 30!" đập xuống trên nền tia sáng xoay (từ mốc 50 vàng đậm, từ mốc 80 cầu vồng,
  tầng 100 là "VÔ ĐỊCH!"), 1–4 đợt pháo hoa bắn từ dưới lên (mỗi đợt 6–15 quả, các kiểu peony, willow, ring,
  crackle), ống pháo giấy, mưa tiền vàng, tiếng nổ trầm (`Sfx.boom`), tiếng rít (`Sfx.whistle`), lách tách.
- Dùng khi chạm mốc, khi mở từng món quà (theo mốc hiện tại), mưa sao và màn vô địch (4 lần liền, mức 10).
- `Fx.quality` tự giảm số mảnh nếu vẽ chậm (dưới ~33 hình/giây), tự tăng lại khi mượt, lưu trong
  localStorage `be-hoc-vui:fxq`. Tối đa ~900 mảnh. Cần xem thử trên tivi thật.

### 4.4 Máy chủ tự chạy khi bật Mac (phụ huynh đã đồng ý)

- Repo đang được làm trong một thư mục tạm; cần clone/đặt ở chỗ cố định, **không** trong Desktop/Documents/Downloads
  (macOS chặn dịch vụ nền đọc các thư mục này). Gợi ý: `~/prjs/be-hoc-vui`.
- Tạo LaunchAgent `~/Library/LaunchAgents/vn.behocvui.server.plist`: chạy `/usr/bin/python3 serve.py`,
  `WorkingDirectory` = thư mục repo, `RunAtLoad` + `KeepAlive`, log vào `~/Library/Logs/be-hoc-vui.log`;
  nạp bằng `launchctl bootstrap gui/$(id -u) <plist>`. Tường lửa macOS đã cho phép `/usr/bin/python3`.
- Nếu đã có `data/profiles.json` ở chỗ cũ thì chép sang (đang có hồ sơ của bé "bo").
- Máy chủ chỉ chạy khi Mac thức; nhắc phụ huynh nếu muốn chỉnh chế độ ngủ.

### 4.5 Biểu tượng trên launcher tivi (chờ phụ huynh)

- Tivi **chưa có** app Developer Mode. Phụ huynh cần: tạo tài khoản webostv.developer.lge.com, cài app Developer Mode
  từ LG Content Store, đăng nhập, bật Dev Mode Status (tivi khởi động lại), bật Key Server.
- Sau đó: `ares-setup-device` thêm tivi (cổng 9922, user `prisoner`), `ares-novacom --device tv --getkey`.
  **Mã passphrase hiện trên tivi phải để phụ huynh tự gõ**, AI không nhập thay.
  Rồi `node tools/package_tv.js` và `ares-install -d tv dist/vn.behocvui.tv_<version>_all.ipk`, `ares-launch -d tv vn.behocvui.tv`.
- Phiên Developer Mode có hạn; hết hạn tivi gỡ app, cần nhắc phụ huynh vào app Developer Mode bấm gia hạn.
- Trong lúc chờ, bé chơi bằng trình duyệt tivi: `uv run tools/lgtv.py open http://<IP Mac>:8080/`.

## 5. Lưu ý kỹ thuật

- Mạng nhà: Mac `192.168.1.154` (cổng 8080), tivi đổi IP sau mỗi lần bật (đã thấy `.157`, `.105`), nên luôn dò bằng SSDP.
  Bản `.ipk` gắn cứng IP của Mac để đồng bộ; Mac đổi IP thì đóng gói lại (hoặc đặt IP cố định trong router).
  Tivi chưa bật "Bật qua Wi-Fi" nên Wake-on-LAN không bật được tivi.
- Khung xem trình duyệt bị ẩn thì CSS animation và `requestAnimationFrame` đứng yên, ảnh chụp ra khung cũ. Muốn xem
  hiệu ứng: gọi `BHV.Fx.tick(BHV.Fx.last + 16.7)` nhiều lần và đặt `document.getAnimations()` về một `currentTime` cố định rồi chụp.
- Pháo hoa đỉnh điểm ~700 mảnh; chưa thử độ mượt trên tivi thật, cần kiểm tra và giảm nếu giật.
- Mọi câu nói phải nằm trong `allPhrases()` thì mới có file giọng đọc; thiếu file thì app tự dùng giọng trình duyệt
  hoặc chờ theo độ dài câu.
- Kiểm tra cú pháp nhanh: `node --check app.js && node --check content.js && python3 -m py_compile serve.py`.
