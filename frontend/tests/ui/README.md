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
