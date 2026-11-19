# Cấu hình tích hợp

Trạng thái thật của từng tích hợp hiển thị ở **Quản trị → Cấu hình → Thanh toán & tích hợp**. Tích hợp chưa cấu hình luôn hiện "Chưa cấu hình" / "Chờ nhà cung cấp"; hệ thống không giả lập kết quả thành công.

## 1. Mã QR chuyển khoản (VietQR) — đã hoạt động khi cấu hình

Cấu hình → Thanh toán & tích hợp → QR: bật, nhập **mã BIN ngân hàng** (6 số, theo danh sách NAPAS), **số tài khoản**, tên ngân hàng, tên chủ tài khoản.

- Chuỗi QR theo chuẩn EMVCo/NAPAS được tạo cục bộ (`backend/app/Services/VietQr.php`), không gọi dịch vụ ngoài. Nội dung chuyển khoản = mã đặt phòng (VD `GLGAB12CD`).
- Website hiển thị QR số tiền cọc còn thiếu sau khi đặt; trang đặt phòng admin hiển thị QR số còn phải thu.
- Khoản tiền **chỉ được ghi nhận** khi: (a) lễ tân/kế toán đối soát ở Tài chính → Chờ đối soát, hoặc ghi "Thu tiền" thủ công; hoặc (b) webhook ngân hàng hợp lệ (mục 2).
- Cần kiểm tra thực tế: quét thử bằng ứng dụng ngân hàng với tài khoản thật trước khi công bố.

## 2. Webhook báo có ngân hàng — sẵn sàng, cần bộ chuyển đổi theo nhà cung cấp

```
POST /api/webhooks/payments/{provider}
Header: X-Signature: hex(HMAC-SHA256(raw_body, PAYMENT_WEBHOOK_SECRET))
Body:   {"event_id":"...","transaction_id":"...","amount":300000,"content":"GLGAB12CD coc","paid_at":"2026-11-19T10:00:00+07:00"}
```

- Đặt `PAYMENT_WEBHOOK_SECRET` trong `backend/.env`; để trống = webhook tắt (trả 503).
- Idempotent hai lớp: `(provider, event_id)` trong `webhook_events` và `(provider, external_id)` trong `payments`. Gửi lặp → `{"result":"duplicate"}`, không tạo khoản thu mới.
- Nội dung không chứa mã đặt phòng hợp lệ → `unmatched` (lưu lại để đối soát tay).
- Định dạng trên là định dạng chuẩn hóa nội bộ. Mỗi nhà cung cấp (ngân hàng, Casso, SePay, PayOS…) có định dạng và cách ký riêng: cần viết bộ chuyển đổi trong `WebhookController` khi có tài liệu và thông tin truy cập của họ. Endpoint cần truy cập được từ Internet (HTTPS).

## 3. Email xác nhận đặt phòng — cần SMTP

`backend/.env`: `MAIL_MAILER=smtp`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`. Sau đó bật "Email" ở Cấu hình → Khách sạn → Thông báo và sửa mẫu (biến `{name} {code} {check_in} {check_out} {total} {deposit}`).

Mọi thông báo được ghi vào `notifications_outbox` với trạng thái `sent` / `failed` / `not_configured` (xem ở Cấu hình → Thanh toán & tích hợp). Khi `MAIL_MAILER=log` (mặc định), trạng thái là `not_configured`.

## 4. Chờ nhà cung cấp (chưa triển khai kết nối)

| Tích hợp | Hiện trạng | Cần để triển khai |
| --- | --- | --- |
| Zalo OA / ZNS | Ghi hàng đợi với trạng thái "chưa cấu hình" | Tài khoản Zalo OA, mẫu ZNS đã duyệt, access token |
| Hóa đơn điện tử | Chỉ in phiếu thu/bảng kê nội bộ | Nhà cung cấp HĐĐT (VNPT, Viettel, MISA…), tài khoản API, mẫu số/ký hiệu |
| OTA / Channel manager | Nhập tay đặt phòng nguồn "OTA" với mã tham chiếu | Nhà cung cấp channel manager và thông tin kết nối |
| Khai báo lưu trú | Xuất CSV danh sách khách đang ở (Đặt phòng → quyền `guests.export`) để khai báo thủ công | Chỉ tích hợp trực tiếp khi có kết nối chính thức |
| Cổng thanh toán thẻ/ví | Chưa có | Hợp đồng cổng thanh toán, khóa API, URL IPN |

## 5. Sao lưu

`php artisan hotel:backup` (SQLite, tự chạy 02:30 qua `schedule:run`); danh sách bản sao lưu xem ở Cấu hình. MySQL dùng `mysqldump`. Hướng dẫn phục hồi: README mục 4. Nên chép bản sao lưu ra ngoài máy chủ (ổ khác/đám mây) hằng ngày.
