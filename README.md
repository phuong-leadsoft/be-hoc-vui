# Bé Học Vui

Trò chơi leo tháp đố vui cho bé 3–7 tuổi: Toán, Chữ cái, Tự nhiên, Đố vui và Tổng hợp. Câu hỏi được đọc to bằng giọng tiếng Việt.

## Chạy

```bash
python3 serve.py
```

Mở địa chỉ được in ra (ví dụ `http://192.168.1.154:8080`) trên tivi LG, iPad hoặc máy tính trong cùng mạng Wi‑Fi.
Hồ sơ của bé được lưu vào `data/profiles.json` trên máy Mac (và trong trình duyệt), nên hôm sau mở trên thiết bị nào cũng học tiếp được.

## Mở trên tivi qua Internet (GitHub Pages)

Mỗi khi nhánh `main` thay đổi, app được đưa lên **https://phuong-leadsoft.github.io/be-hoc-vui/**
(workflow `.github/workflows/pages.yml`). Mở địa chỉ này bằng trình duyệt Web của tivi rồi lưu dấu trang,
không cần bật máy Mac. Gõ địa chỉ bằng remote thì chậm; có thể mở từ máy Mac bằng:

```bash
uv run tools/lgtv.py open https://phuong-leadsoft.github.io/be-hoc-vui/
```

Bản này không đồng bộ hồ sơ với `serve.py` (trang https không được gọi máy chủ http trong nhà):
tiến độ của bé chỉ lưu trong trình duyệt của tivi.

## Kiểm tra trên tivi

- Mở thêm `?perf` sau địa chỉ (ví dụ `…/be-hoc-vui/?perf`) để hiện bảng đo: số hình/giây, số lần khựng, chip đồ họa,
  chế độ hiệu ứng, nhật ký giọng đọc. Chụp ảnh bảng này khi app chạy chậm hoặc mất tiếng.
- App lưu sẵn trên máy (service worker) nên lần sau mở nhanh, mạng yếu vẫn chơi được. Nếu nghi app bị kẹt ở bản cũ,
  mở với `?nosw` một lần để xóa bộ nhớ đệm.
- Sửa code xong chạy `node tools/compat.js` để chắc vẫn chạy được trên tivi đời cũ (Chromium 63+).

## Cài lên tivi LG (biểu tượng trên launcher)

Cần bật Developer Mode trên tivi: cài app **Developer Mode** từ LG Content Store, đăng nhập tài khoản
webostv.developer.lge.com, bật Dev Mode Status (tivi khởi động lại), rồi bật Key Server.

```bash
node tools/package_tv.js
```

Lệnh trên tạo `dist/vn.behocvui.tv_<version>_all.ipk`: app chứa sẵn hình và giọng đọc, chơi được khi máy Mac tắt,
và đồng bộ hồ sơ với `serve.py` khi máy Mac bật. Cài bằng `ares-install` (bộ công cụ `@webos-tools/cli`).
Phiên Developer Mode có thời hạn: thỉnh thoảng mở app Developer Mode trên tivi và bấm gia hạn, nếu hết hạn tivi sẽ gỡ app.

## Luật chơi

- Mỗi môn là một tháp **100 tầng**; mỗi câu đúng ngay lần đầu được 1 sao và lên 1 tầng.
- Cứ 10 tầng là một **mốc an toàn** có quà bí mật: hình dán, mũ cho bạn thú, trứng nở thú cưng, khung cảnh mới,
  lễ hội nửa đường, mưa sao, tên lửa… Tầng 100 là cúp, vương miện và giấy khen.
- Tiến độ được lưu sau mỗi câu: lần sau vào tháp là leo tiếp đúng tầng đó (số tim còn lại cũng được giữ).
- Phải bấm chọn rồi bấm **Chốt!** (hoặc bấm lại ô đó) mới tính.
- Chưa đọc xong câu hỏi thì chưa bấm được. Mỗi lần sai mất 1 trái tim, khóa 3 giây và đáp án bị xáo lại.
- Sai 2 lần: cú dạy lại, bé tự chọn đúng nhưng không lên tầng, câu đó quay lại sau 2 câu.
- Sai liên tiếp thì chờ lâu dần: 3, 6, 10 giây (bố mẹ chỉnh mức tối đa); đúng ngay một câu là về lại 3 giây.
- Bấm vội (chốt chỉ 1–2 giây sau khi được bấm) mà sai: câu sau cú đếm 3-2-1 "con nhìn thật kỹ" rồi mới cho chọn.
- Hết tim 2 lần trong 10 phút: nghỉ giải lao 2 phút (cú ngủ, quả bóng hướng dẫn hít thở, đồng hồ cát).
  Bố mẹ bật/tắt, chọn 1–3 phút, hoặc kết thúc giờ nghỉ ngay trong trang "Bố mẹ xem".
- Hết 3 tim: quay về mốc an toàn gần nhất, tim đầy lại. Tới mốc mới cũng được nạp đầy tim.
- Quyền trợ giúp mỗi đoạn 10 tầng: **Hỏi Cú** (giải thích, không có sao) và **Đổi câu**.
- Khi tạo hồ sơ, bố mẹ chọn tuổi (3–7). Tuổi quyết định cấp khởi đầu: 3–4 tuổi cấp 1, 5 tuổi cấp 2,
  6 tuổi (lớp 1) cấp 3, 7 tuổi (lớp 2) cấp 4. Đổi tuổi trong trang "Bố mẹ xem".
- Độ khó tự tăng khi bé đúng ngay 5/6 câu gần nhất của một kỹ năng, tự giảm khi sai nhiều.
  Tầng 1–10 (khởi động) dễ hơn một bậc, tầng 61–100 khó hơn một bậc.
- Cấp cao của Toán: đếm tới 20, cộng trừ trong phạm vi 20 bằng chữ số, tìm số còn thiếu (3 + ? = 7),
  so sánh và nhận biết số tới 100, số liền trước/liền sau, quy luật (hình và dãy số đếm thêm 2, 5, 10).
  Chữ cái cấp 2: chữ ghép đầu từ (ch, nh, ng, th, tr, kh, ph, gi).
- Tháp Đố vui: câu đố về con vật, đồ vật; tìm cái không cùng nhóm; ai làm nghề gì.
- Nhiệm vụ mỗi ngày: 15 câu đúng ngay. Chuỗi ngày học liên tiếp hiện ở trang chủ.
- Nhạc nền khi leo tháp bật/tắt bằng nút 🎵 ở góc trên.

## Sửa nội dung

Câu hỏi nằm trong `content.js`. Sau khi sửa, tạo lại giọng đọc và hình (chỉ tạo phần còn thiếu):

```bash
node tools/build.js
```

Cần macOS (giọng Linh) và mạng để tải hình Twemoji lần đầu.

## Tệp

- `index.html`, `style.css`, `app.js`: giao diện, luật chơi, hồ sơ, điều khiển bằng remote.
- `content.js`: câu hỏi, câu nói, hình dán.
- `serve.py`: máy chủ nhỏ, lưu hồ sơ.
- `audio/`, `img/`: giọng đọc và hình đã tạo sẵn.

Hình minh họa: [Twemoji](https://github.com/jdecked/twemoji) (CC-BY 4.0).
