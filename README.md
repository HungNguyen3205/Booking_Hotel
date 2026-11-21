# GLG HOTEL & SPA — Hệ thống quản lý khách sạn

Website đặt phòng công khai, trang quản trị vận hành và backend dùng chung một nguồn tồn phòng, bảng giá và hồ sơ thanh toán.
Luồng vận hành: **đặt phòng → thu cọc → nhận phòng → dịch vụ → trả phòng → quyết toán → dọn phòng → mở bán tiếp.**

| Thành phần | Công nghệ | Thư mục |
| --- | --- | --- |
| Backend API, nghiệp vụ, phân quyền | Laravel 12 (PHP ≥ 8.2) | `backend/` |
| Cơ sở dữ liệu | SQLite (máy đơn/thử nghiệm) hoặc MySQL 8 / MariaDB 10.6+ (vận hành) | `backend/database/` |
| Website công khai + trang quản trị | Next.js 16 (App Router, React 19, TypeScript) | `frontend/` |

Tài liệu khác:

- [docs/kien-truc-nghiep-vu.md](docs/kien-truc-nghiep-vu.md) — kiến trúc, cơ sở dữ liệu, mô hình trạng thái, quy tắc giá/tiền/báo cáo.
- [docs/tich-hop.md](docs/tich-hop.md) — cấu hình QR, webhook ngân hàng, email, Zalo, hóa đơn điện tử, OTA, sao lưu.
- [docs/ban-giao.md](docs/ban-giao.md) — kết quả kiểm thử, tính năng đã chạy / chờ tích hợp, giới hạn, thông tin cần khách sạn bổ sung.

## 1. Chạy trên máy

Yêu cầu: PHP 8.2+ (pdo_sqlite hoặc pdo_mysql, mbstring, openssl, fileinfo), Composer 2, Node.js 20.9+, npm.

**Backend** (cửa sổ 1)

```bash
cd backend
composer install
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
php artisan key:generate
```

Mở `backend/.env`, đặt tối thiểu:

- `HOTEL_ADMIN_EMAIL`, `HOTEL_ADMIN_PASSWORD` (≥ 12 ký tự) — tài khoản **Chủ khách sạn**.
- `HOTEL_DEMO_PASSWORD` (≥ 10 ký tự) — mật khẩu chung cho các tài khoản thử theo vai trò (chỉ khi `HOTEL_SEED_DEMO=true`).

```bash
touch database/database.sqlite   # PowerShell: New-Item database/database.sqlite -ItemType File
php artisan migrate --seed
php artisan serve --host=127.0.0.1 --port=8000
```

**Frontend** (cửa sổ 2)

```bash
cd frontend
npm ci
npm run dev
```

- Website: <http://localhost:3000>
- Quản trị: <http://localhost:3000/admin> (đăng nhập bằng tài khoản ở trên)

Next.js chuyển tiếp `/api/*` sang Laravel (biến `HOTEL_API_URL`, mặc định `http://127.0.0.1:8000`), nên cookie phiên và CSRF luôn cùng origin.

### Tài khoản thử (khi `HOTEL_SEED_DEMO=true`)

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Chủ khách sạn | `HOTEL_ADMIN_EMAIL` | `HOTEL_ADMIN_PASSWORD` |
| Quản lý | `quanly@demo.glg.test` | `HOTEL_DEMO_PASSWORD` |
| Lễ tân | `letan@demo.glg.test` | như trên |
| Kế toán | `ketoan@demo.glg.test` | như trên |
| Buồng phòng | `buongphong@demo.glg.test` | như trên |
| Kỹ thuật | `kythuat@demo.glg.test` | như trên |

Dữ liệu demo (khách, đặt phòng, dịch vụ và đơn giá dịch vụ, tồn kho, bài viết nháp) là **giả định để thử nghiệm**, có hậu tố "(demo)". Seed lại từ đầu: `php artisan migrate:fresh --seed`.

## 2. Kiểm thử

```bash
cd backend && vendor/bin/phpunit          # 22 kịch bản nghiệp vụ, SQLite in-memory
bash tests/Concurrency/run.sh 8           # tranh chấp thật: 8 tiến trình đặt cùng loại phòng cùng lúc (CSDL dev)
cd ../frontend && npx tsc --noEmit && npm run build
```

Kết quả lần chạy gần nhất ở [docs/ban-giao.md](docs/ban-giao.md).

## 3. Lệnh định kỳ

Windows (máy chủ đơn): chạy thường trực `php artisan schedule:work`. Cron (Linux) mỗi phút:

```cron
* * * * * cd /duong-dan/backend && php artisan schedule:run >> /dev/null 2>&1
```

| Lệnh | Lịch | Việc |
| --- | --- | --- |
| `php artisan hotel:daily` | 00:10 hằng ngày | Tự động hóa cuối ngày: đánh dấu không đến, tạo việc dọn phòng đang ở, giao việc dọn. Cũng tự chạy khi có người mở "Việc hôm nay" hoặc sơ đồ phòng lần đầu trong ngày, nên vẫn hoạt động khi chưa cài cron. Bật/tắt từng việc ở Cấu hình → Tự động hóa. |
| `php artisan hotel:release-holds` | 5 phút/lần | Hủy giữ chỗ quá hạn, giải phóng tồn. (Hệ thống cũng tự chạy trước mỗi lần tra tồn/tạo đặt phòng, nên không phụ thuộc cron.) |
| `php artisan hotel:backup` | 02:30 hằng ngày | Sao lưu SQLite bằng `VACUUM INTO` vào `storage/app/private/backups`, giữ 14 bản. |

## 4. Triển khai

**cPanel (kéo code bằng git, build trên server):** xem [docs/trien-khai-cpanel.md](docs/trien-khai-cpanel.md) — cập nhật bằng `bash deploy/cpanel/deploy.sh`.

**Máy chủ riêng (VPS):**

1. **Backend**: PHP-FPM + Nginx trỏ `backend/public`. `.env`: `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://ten-mien`, `SESSION_SECURE_COOKIE=true`. Khuyến nghị MySQL/MariaDB cho nhiều người dùng đồng thời (đặt `DB_CONNECTION=mysql` và thông tin DB). Chạy `composer install --no-dev --optimize-autoloader`, `php artisan migrate --force`, `php artisan db:seed --force` (lần đầu; đặt `HOTEL_SEED_DEMO=false`), `php artisan config:cache route:cache`. Thư mục `storage/` và (nếu dùng) file SQLite phải ghi được và nằm trên ổ bền vững.
2. **Frontend**: `npm ci && npm run build && npm run start` (hoặc PM2/systemd). Biến môi trường khi build và chạy: `HOTEL_API_URL` (địa chỉ nội bộ của Laravel), `NEXT_PUBLIC_SITE_URL` (tên miền công khai, dùng cho canonical/sitemap).
3. Reverse proxy: tên miền chính → Next.js (cổng 3000). Next.js tự chuyển `/api/*` sang Laravel; không cần mở Laravel ra Internet trừ khi muốn nhận webhook trực tiếp.
4. Cron `schedule:run` như mục 3. Sao lưu: với SQLite dùng `hotel:backup`; với MySQL dùng `mysqldump --single-transaction --routines glg_hotel > backup.sql` theo lịch và lưu ra ngoài máy chủ.

**Phục hồi**: dừng ứng dụng → SQLite: chép bản `storage/app/private/backups/glg-*.sqlite` đè lên `database/database.sqlite`; MySQL: `mysql glg_hotel < backup.sql` → chạy `php artisan migrate --force` → khởi động lại. Không có nút phục hồi trên giao diện để tránh ghi đè nhầm dữ liệu đang vận hành.
