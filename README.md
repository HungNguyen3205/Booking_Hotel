# GLG Hotel

Website đặt phòng khách sạn tiếng Việt và khu vực vận hành tại `/admin`. GLG Hotel là thương hiệu mẫu. Ảnh minh họa trong `frontend/public/images` được tạo cho dự án.

## Chạy trên máy

Cần Node.js 20.9+, PHP 8.4+ với PDO SQLite, Composer 2 và npm. Dùng hai cửa sổ terminal.

**Terminal 1**

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
```

Mở `backend/.env` và điền `HOTEL_ADMIN_EMAIL` cùng `HOTEL_ADMIN_PASSWORD` từ 12 ký tự. Sau đó chạy:

```bash
touch database/database.sqlite
php artisan migrate --seed
php artisan serve --host=127.0.0.1 --port=8000
```

Trên PowerShell, thay `cp .env.example .env` bằng `Copy-Item .env.example .env` và `touch` bằng `New-Item database/database.sqlite -ItemType File` nếu cơ sở dữ liệu chưa tồn tại.

**Terminal 2**

```bash
cd frontend
npm ci
npm run dev
```

- [Đặt phòng](http://localhost:3000)
- [Đăng nhập quản trị](http://localhost:3000/admin) bằng thông tin trong `.env`.
- `npm run build` kiểm tra bản dựng Next.js. `HOTEL_API_URL` là địa chỉ nội bộ của Laravel, mặc định `http://127.0.0.1:8000`. Đặt biến này khi build nếu backend dùng địa chỉ khác.

## Nghiệp vụ

| Vai trò | Chức năng |
| --- | --- |
| Khách | Xem phòng, lọc theo ngày và số khách, xem tổng tiền, gửi yêu cầu, tra cứu bằng mã và email |
| Lễ tân | Xem tổng quan và danh sách phòng, tìm và lọc đơn, xác nhận, hủy đơn chưa thu tiền, nhận phòng, ghi nhận tiền tại quầy, trả phòng |
| Quản trị viên | Toàn bộ chức năng lễ tân, thêm/sửa/xóa phòng, mở/ngừng bán, thêm/sửa/xóa tài khoản lễ tân |

- Một đơn tương ứng một phòng vật lý và từ 1 đến 30 đêm. Đêm trả phòng thuộc kỳ đặt tiếp theo. Giá được lưu tại thời điểm khách gửi đơn.
- Đơn chờ xác nhận giữ phòng. Lễ tân xử lý đơn chờ trên trang quản trị. Hủy đơn giải phóng các đêm đã giữ. Trả phòng yêu cầu đã thu tiền.
- Cơ sở dữ liệu khóa mỗi cặp phòng và đêm. Việc tạo đơn và giữ phòng diễn ra trong cùng transaction. Gửi lại cùng yêu cầu trả về mã đã tạo.
- Phòng có đơn đang hoạt động cần được xử lý trước khi xóa. Phòng đã xóa vẫn có trong lịch sử đặt phòng.
- Bản này dùng thanh toán tại quầy và hiển thị mã đặt phòng trên web. Luồng hoàn tiền, email tự động và cổng thanh toán online nằm ngoài phạm vi bản này.

## Kiến trúc

| Tầng | Mã nguồn | Trách nhiệm |
| --- | --- | --- |
| Entity | `backend/app/Models`, `backend/database/migrations` | Phòng, tài khoản, đơn, khóa lịch theo đêm |
| View | `frontend/app` | Trang đặt phòng, tra cứu, đăng nhập và vận hành |
| Controller | `backend/app/Http/Controllers`, `backend/routes/web.php` | API, xác thực, phân quyền và kiểm tra đầu vào |
| Service | `backend/app/Services/BookingService.php` | Tính giá, giữ lịch, chuyển trạng thái và ghi nhận thanh toán |

Next.js chuyển tiếp `/api/*` sang Laravel cùng origin với frontend. Laravel lưu session trong SQLite và kiểm tra CSRF đối với các yêu cầu ghi. Khi vận hành qua HTTPS, đặt `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL` theo tên miền thực và `SESSION_SECURE_COOKIE=true`. Dùng volume bền vững cho SQLite và sao lưu cơ sở dữ liệu định kỳ.
