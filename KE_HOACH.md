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

- Tháp **10 tầng** mỗi môn (Toán, Chữ cái, Tự nhiên, Tổng hợp), 3 tim, quyền trợ giúp Hỏi Cú và Đổi câu (mỗi tháp 1 lần).
- Chống đoán bừa: khóa đáp án tới khi đọc xong câu hỏi; chọn rồi bấm "Chốt!" (hoặc bấm lại ô đó), trống hồi hộp;
  sai lần 1 mất tim, khóa 3 giây, xáo đáp án; sai lần 2 thì cú dạy lại (đếm cùng, chỉ đáp án), không lên tầng, câu
  quay lại sau 2 câu; chỉ đúng ngay mới có sao; toán dùng bàn phím số 0–10.
- Độ khó tự điều chỉnh theo từng kỹ năng (lên cấp khi đúng ngay 7/8, xuống khi chỉ 2/6).
- Hồ sơ nhiều bé, sao, hình dán (30), chuỗi ngày học, nhiệm vụ ngày (15 câu đúng ngay), trang Bố mẹ xem.
- Hiệu ứng đúng: pháo hoa + ống pháo giấy canvas, chớp sáng, sóng lan, chữ khen cầu vồng, đồ vật nhảy, kèn;
  huy hiệu 🔥 chuỗi đúng liên tiếp (≥3 thì pháo hoa gấp đôi). Hiệu ứng lớn chỉ khi đúng ngay lần đầu.

## 4. Việc còn dang dở (làm theo thứ tự)

### 4.1 Tháp 100 tầng, lưu tiến độ, quay về mốc (đang làm dở)

Trạng thái: `content.js` **đã có** dữ liệu và câu nói mới (`TENS`, `hats`, `pets`, `themes`, `golden`,
`phrases.resume`, `backToCheckpoint`, `backToStart`, `floorReached(n)`, `hat`, `eggIntro`, `pet`, `theme`, `party`,
`pickIntro`, `golden`, `starRainIntro`, `starRainDone`, `rocket`, `champion`), audio và hình đã tạo xong.
`app.js` **chưa dùng** chúng: vẫn là tháp 10 tầng, mốc ở tầng 5 và 10.

Cần làm trong `app.js`:
- `FLOORS = 100`, mỗi `SEGMENT = 10` tầng là một mốc an toàn (bỏ `MILESTONES`).
- `normalizeProfile`: thêm `climbs` (tiến độ từng tháp: `{floor, hearts, owl, swap}`), `hats`, `hat`, `pets`, `pet`,
  `themes`, `theme`, `golden`.
- Lưu tiến độ sau mỗi câu (`saveClimb()`); vào tháp thì leo tiếp đúng tầng, tim và trợ giúp đã lưu (nói `phrases.resume`).
  Thoát giữa chừng không được nạp lại tim (tránh lách luật).
- Tới mỗi mốc (tầng 10, 20, …): mở quà (mục 4.2), rồi nạp đầy tim, trợ giúp mỗi đoạn 10 tầng 1 lần, xóa `seen`.
- Hết tim: **không kết thúc tháp**, mà quay về mốc gần nhất (`floor = Math.floor(floor/10)*10`), tim đầy lại,
  hiện hộp "Hết tim rồi!" với nút Leo tiếp / Về nhà (nói `backToCheckpoint` hoặc `backToStart` nếu chưa qua mốc nào).
- Lên tầng 100: màn nhà vô địch, rồi reset tiến độ tháp đó về 0, `best = 100`.
- Thang tầng bên phải chỉ hiện **đoạn 10 tầng hiện tại** (ví dụ 31–40), mốc trên cùng là 🎁 bí ẩn (tầng 100 là 🏆),
  dưới cùng là mốc đã qua (⛳ 30); thêm thanh tiến độ "37/100".
  Khi vừa chạm mốc, giữ đoạn cũ (bé đứng trên đỉnh) tới khi mở quà xong mới chuyển sang đoạn mới.
- Độ khó theo tầng: tầng 1–20 dễ hơn cấp của bé một bậc, 21–60 đúng cấp, 61–100 khó hơn một bậc.
- Trang chủ: thẻ tháp hiện "Đang ở tầng X/100" và 10 vạch (mỗi vạch 10 tầng); trang Bố mẹ: tầng cao nhất /100.
- Câu dừng tháp: "Lần sau con leo tiếp từ tầng X."

### 4.2 Quà ở các mốc: càng cao càng bất ngờ, không chỉ là hình dán

Mốc luôn hiện là hộp 🎁 bí ẩn. Kế hoạch đã thống nhất với phụ huynh:

| Tầng | Quà | Ghi chú cài đặt |
|---|---|---|
| 10 | Hộp quà → hình dán | dùng lại màn mở hộp hiện có |
| 20 | Mũ mới cho bạn thú (avatar) | `hats`; tự đội mũ mới; mũ hiện chồng lên avatar ở mọi chỗ (thẻ hồ sơ, trang chủ, nhân vật trên thang) |
| 30 | 🥚 Trứng thần kỳ | mini-game: bấm OK/chạm liên tục ~12 lần, trứng lắc và nứt dần, nở ra **thú cưng** (`pets.common`) đi cạnh avatar |
| 40 | 🌅 Khung cảnh mới | `themes` theo thứ tự; đổi nền cả app (`body[data-theme]`): hoàng hôn, đêm sao, vũ trụ, đại dương |
| 50 | 🎉 Lễ hội nửa đường | màn disco ~5 giây (đèn xoay, avatar + cú + thú cưng nhảy, nhạc), rồi chọn 1 trong 3 hộp bí mật → **hình dán vàng** (`golden`) |
| 60 | 🥚 Trứng hiếm | như tầng 30, ~16 lần bấm, nở `pets.rare` (kỳ lân, rồng, khủng long) |
| 70 | 🌙 Khung cảnh + mũ mới | hai quà liên tiếp |
| 80 | ⭐ Mưa sao | sao rơi trên nền; bấm liên tục trong 8 giây, mỗi lần +1 sao (tối đa 30) |
| 90 | 🚀 Tên lửa | avatar cưỡi tên lửa bay chéo màn hình, đếm "Ba, hai, một, phóng!", rồi mở khung cảnh tiếp theo |
| 100 | 🏆 Nhà vô địch | cúp, vương miện 👑 (đội luôn), giấy khen có tên bé, môn, ngày; pháo hoa lớn nhất |

- Món đã có hết thì thay bằng hình dán vàng, hết nữa thì +3 sao (khớp câu `phrases.bonus`).
- Mỗi lần có quà phải có **nhạc chiến thắng bùng nổ** (mục 4.3) và `celebrate(…, 3)`.
- Mốc đầu tiên của mỗi lần mở quà nói `phrases.floorReached(tầng)`.
- Trang chủ: thêm nút "Đổi mũ" và "Khung cảnh" (chỉ hiện khi đã có món) để bé tự đổi qua lại.
- Bộ sưu tập: thêm các mục Hình dán vàng, Mũ, Thú cưng, Khung cảnh.
- Nhiệm vụ ngày vẫn tặng hình dán như cũ.

### 4.3 Nhạc (phụ huynh yêu cầu)

Tổng hợp bằng Web Audio, không cần file:
- **Nhạc thưởng** mỗi khi có quà: trống dồn → chũm chọe → kèn đồng (sawtooth qua lọc thông thấp) đi lên → hợp âm Đô
  trưởng ngân dài → tiếng lấp lánh. Khoảng 2,5 giây, phải nghe "bùng nổ".
- **Nhạc nền khi leo tháp**: vòng lặp vui tai (khoảng 116 BPM, hợp âm C–Am–F–G, giai điệu ngũ cung), âm lượng nhỏ;
  **hạ nhỏ khi cú đang đọc** (gọi trong `Voice.say`), tắt khi rời màn tháp, tạm dừng khi mở quà;
  nút 🎵 trên thanh trên cùng để tắt/bật (lưu trong localStorage). Cần thêm emoji 🎵 vào `UI_EMOJI` rồi chạy `node tools/build.js`.
- Lễ hội tầng 50 có đoạn nhạc nhảy riêng.

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
