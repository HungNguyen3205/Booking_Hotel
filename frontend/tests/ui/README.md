# Kiểm thử giao diện trên trình duyệt (Playwright + Chromium)

Không nằm trong dependency của dự án. Cài một lần ở thư mục bất kỳ:

```bash
npm i -D playwright@1.49.1 && npx playwright install chromium
```

Chạy khi backend (8000) và frontend (3000) đang chạy, CSDL đã seed demo:

```bash
node tests/ui/qa.cjs http://localhost:3000 ./qa-out        # responsive 360–1440, bàn phím/Esc, giảm chuyển động, CLS/LCP, luồng đặt phòng (bấm đúp)
node tests/ui/admin.cjs http://localhost:3000 ./qa-admin   # sơ đồ chữ U, lịch, việc hôm nay ở 1440/1024/390 (đăng nhập bằng HOTEL_ADMIN_* trong backend/.env)
node tests/ui/capture.cjs http://localhost:3000/ ./shots/home 1440 900 9 video   # ảnh từng màn hình khi cuộn + video
```

Lưu ý: `qa.cjs` tạo một đặt phòng giữ chỗ thật (SĐT 0977111222) — chạy trên CSDL thử nghiệm.

### Bộ nghiệm thu (xem `docs/nghiem-thu.md`)

Đặt `NODE_PATH` trỏ tới `node_modules` có playwright và sharp. Nên chạy trên môi trường xem trước (`http://localhost:3100`, CSDL thử riêng):

```bash
node tests/ui/booking-slow.cjs http://localhost:3100 ./out-slow 0966555111   # Slow 4G + CPU 4×: tìm → quay lại/tiến → mất mạng khi gửi → bấm đúp → quay lại; mỗi lần dùng SĐT thử khác
node tests/ui/journey.cjs http://localhost:3100 ./out-journey                # video cuộn xuống/cuộn ngược/chuyển loại phòng + ảnh toàn trang và ảnh chi tiết
node tests/ui/lcp-probe.cjs http://localhost:3100/ 3 [none|noanim|nofont]    # LCP đo thật 3 lần, in trung vị
CHROME_PATH=<chrome.exe đầy đủ> node tests/ui/frames.cjs <video.webm> <bang.jpg> 420 5 1   # trích 1 khung/giây để xem video
```

`booking-slow.cjs` tạo đặt phòng giữ chỗ thật trong CSDL đang trỏ tới, nên không chạy trên production.
