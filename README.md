# Bé Học Vui

Trò chơi leo tháp đố vui cho bé 5 tuổi: Toán, Chữ cái, Tự nhiên và Tổng hợp. Câu hỏi được đọc to bằng giọng tiếng Việt.

## Chạy

```bash
python3 serve.py
```

Mở địa chỉ được in ra (ví dụ `http://192.168.1.154:8080`) trên tivi LG, iPad hoặc máy tính trong cùng mạng Wi‑Fi.
Hồ sơ của bé được lưu vào `data/profiles.json` trên máy Mac (và trong trình duyệt), nên hôm sau mở trên thiết bị nào cũng học tiếp được.

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

- Tháp 10 tầng; mỗi câu đúng ngay lần đầu được 1 sao và lên 1 tầng. Tầng 5 và 10 có quà (hình dán).
- Phải bấm chọn rồi bấm **Chốt!** (hoặc bấm lại ô đó) mới tính.
- Chưa đọc xong câu hỏi thì chưa bấm được. Mỗi lần sai mất 1 trái tim, khóa 3 giây và đáp án bị xáo lại.
- Sai 2 lần: cú dạy lại, bé tự chọn đúng nhưng không lên tầng, câu đó quay lại sau 2 câu. Hết 3 tim là hết lượt.
- Quyền trợ giúp mỗi tháp: **Hỏi Cú** (giải thích, không có sao) và **Đổi câu**.
- Độ khó tự tăng khi bé đúng ngay 7/8 câu gần nhất của một kỹ năng, tự giảm khi sai nhiều.
- Nhiệm vụ mỗi ngày: 15 câu đúng ngay. Chuỗi ngày học liên tiếp hiện ở trang chủ.

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
