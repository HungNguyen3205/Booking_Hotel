# Triển khai lên cPanel (kéo code bằng git)

Mô hình: **một lần clone**, mỗi lần cập nhật chỉ `git pull` + một lệnh `deploy.sh`. Code được build ngay trên server.

```
https://<ten-mien>       → Node.js App (Next.js: website + /admin)  — thư mục ~/glg/frontend
                              └─ chuyển tiếp /api/* sang ↓
https://api.<ten-mien>   → PHP (Laravel)                           — document root ~/glg/backend/public
                              └─ MySQL/MariaDB (tạo trong cPanel)
```

## Cách nhanh: một lệnh cài tất cả

Dán vào **Terminal** của cPanel (đổi `ten-mien-cua-ban.vn` thành tên miền thật, tên miền này phải đã gắn vào tài khoản cPanel):

```bash
DOMAIN=ten-mien-cua-ban.vn; cd ~ && { [ -d glg ] || git clone https://github.com/HungNguyen3205/Booking_Hotel.git glg; } && bash ~/glg/deploy/cpanel/install.sh "$DOMAIN"
```

`install.sh` tự: tạo subdomain `api.<ten-mien>`, database + user MySQL (mật khẩu ngẫu nhiên), `backend/.env`, tài khoản chủ khách sạn `admin@<ten-mien>` (mật khẩu ngẫu nhiên), Node.js App, build, cron, yêu cầu AutoSSL. Cuối cùng **in thông tin đăng nhập** và lưu vào `~/glg-thong-tin-dang-nhap.txt`. Bước nào lỗi sẽ dừng và báo cách xử lý; sửa xong chạy lại đúng lệnh trên (bước đã làm sẽ được bỏ qua). Các mục dưới đây là cách làm tay / tham khảo.

## 0. Yêu cầu gói hosting

| Hạng mục | Cần có | Xem ở đâu trong cPanel |
| --- | --- | --- |
| Node.js | **20.9+** (chọn 20 hoặc 22) | Software → **Setup Node.js App**. Không có mục này = gói hosting không chạy được Next.js, cần nâng gói/đổi sang VPS |
| PHP | **8.2+**, extension: `pdo_mysql`, `pdo_sqlite`, `mbstring`, `openssl`, `fileinfo` | Software → Select PHP Version / MultiPHP Manager |
| Terminal | có (hoặc SSH) | Advanced → **Terminal** |
| Composer | thường có sẵn (`composer -V`) | — |
| RAM cho build | build Next.js cần ~1–2 GB; gói quá thấp có thể bị dừng giữa chừng (xem mục 6) | — |

Mã nguồn đã được kiểm thử trên MariaDB 10.4: 27/27 bài kiểm thử backend đạt, `migrate:fresh --seed` thành công.

## 1. Chuẩn bị trong giao diện cPanel (làm một lần)

1. **Subdomain** `api.<ten-mien>`: Domains → Create A New Domain → `api.<ten-mien>`, *bỏ chọn* "Share document root", Document Root = `glg/backend/public`.
2. **SSL**: SSL/TLS Status → Run AutoSSL cho cả `<ten-mien>` và `api.<ten-mien>`.
3. **CSDL**: MySQL Databases → tạo database (vd `glg`) và user, gán user vào DB với **ALL PRIVILEGES**. Ghi lại tên đầy đủ có tiền tố (vd `cpuser_glg`).
4. **PHP**: chọn PHP 8.2+ cho tài khoản/subdomain.

## 2. Kéo code về server (Terminal của cPanel)

Repo GitHub riêng tư cần một **deploy key** để server được phép kéo code:

```bash
ssh-keygen -t ed25519 -C "cpanel-glg" -f ~/.ssh/glg_deploy -N ""
cat ~/.ssh/glg_deploy.pub
```

Chép dòng vừa in ra → GitHub, repo → **Settings → Deploy keys → Add deploy key** (chỉ cần quyền đọc). Sau đó:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github-glg
  HostName github.com
  User git
  IdentityFile ~/.ssh/glg_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

cd ~
git clone github-glg:HungNguyen3205/Booking_Hotel.git glg
cd ~/glg
```

> Dùng repo `danava-org/DANAVA_GLG` thì đổi đường dẫn tương ứng: `github-glg:danava-org/DANAVA_GLG.git`.
> Repo công khai thì bỏ phần deploy key, dùng thẳng `git clone https://github.com/HungNguyen3205/Booking_Hotel.git glg`.

## 3. Cấu hình backend (lần đầu)

```bash
cd ~/glg
cp deploy/cpanel/backend.env.example backend/.env
nano backend/.env        # điền mọi chỗ <...>: tên miền, DB, email + mật khẩu chủ khách sạn, IP server
```

- `APP_URL` = địa chỉ **website chính** `https://<ten-mien>` (không phải api).
- `TRUSTED_PROXIES`: thêm IP của server (cPanel → General Information → *Shared IP Address*). Next.js gọi sang `api.<ten-mien>` từ IP này; nếu thiếu, giới hạn số lần thử sẽ tính chung mọi khách thành một IP.

```bash
cd ~/glg/backend
composer install --no-dev --optimize-autoloader --no-interaction
php artisan key:generate
php artisan migrate --force
php artisan db:seed --force          # chỉ chạy LẦN ĐẦU: tạo phòng, loại phòng (kèm ảnh Phòng đôi), tài khoản chủ khách sạn
```

Nếu lệnh `php` trên server không phải 8.2+: kiểm tra `php -v`; dùng đường dẫn đầy đủ, vd `/opt/cpanel/ea-php82/root/usr/bin/php`, và ghi vào `deploy/cpanel/deploy.env` (mục 5).

Kiểm tra: mở `https://api.<ten-mien>/api/site` phải thấy dữ liệu JSON.

## 4. Cấu hình frontend (lần đầu)

1. cPanel → **Setup Node.js App → Create Application**:
   - Node.js version: **20** hoặc **22**
   - Application mode: **Production**
   - Application root: `glg/frontend`
   - Application URL: `<ten-mien>`
   - Application startup file: `server.cjs`
   - Bấm **Create**. Đầu trang sẽ hiện lệnh dạng `source /home/<user>/nodevenv/glg/frontend/20/bin/activate && cd /home/<user>/glg/frontend` — chép lại phần đường dẫn `activate`.
2. Trong Terminal:

```bash
cd ~/glg
cp deploy/cpanel/frontend.env.example frontend/.env.production.local
nano frontend/.env.production.local     # NEXT_PUBLIC_SITE_URL=https://<ten-mien>, HOTEL_API_URL=https://api.<ten-mien>

cat > deploy/cpanel/deploy.env <<'EOF'
NODE_VENV=~/nodevenv/glg/frontend/20/bin/activate
# PHP_BIN=/opt/cpanel/ea-php82/root/usr/bin/php
EOF

bash deploy/cpanel/deploy.sh --no-pull
```

Script sẽ: cài thư viện PHP, migrate, cache cấu hình, `npm install`, `npm run build`, rồi khởi động lại ứng dụng Node. Xong mở `https://<ten-mien>` và `https://<ten-mien>/admin`.

## 5. Cron (làm một lần)

cPanel → **Cron Jobs** → Common Settings: *Once Per Minute* (`* * * * *`), Command:

```
cd /home/<user>/glg/backend && php artisan schedule:run >> /dev/null 2>&1
```

(thay `php` bằng đường dẫn PHP 8.2 nếu cần). Cron này chạy: giải phóng giữ chỗ hết hạn (5 phút/lần), việc hằng ngày lúc 00:10 (khách không đến, việc dọn phòng).

**Sao lưu MySQL**: `hotel:backup` chỉ sao lưu SQLite. Với MySQL dùng cPanel → **Backup** (tải bản sao lưu database) hoặc thêm cron hằng ngày:

```
30 2 * * * mysqldump --single-transaction <cpuser_glg> -u <cpuser_glg> -p'<mat-khau-db>' | gzip > /home/<user>/backups/glg-$(date +\%F).sql.gz
```

(tạo thư mục `~/backups` trước; nên tải bản sao lưu ra ngoài server định kỳ).

## 6. Mỗi lần cập nhật code

Trên máy: commit & push lên GitHub. Trên cPanel Terminal:

```bash
cd ~/glg && bash deploy/cpanel/deploy.sh
```

**Build bị dừng giữa chừng** ("Killed", "JavaScript heap out of memory"): gói hosting thiếu RAM. Cách xử lý: thử giảm `NODE_OPTIONS=--max-old-space-size=1024 bash deploy/cpanel/deploy.sh`; nếu vẫn lỗi thì cần gói có nhiều RAM hơn hoặc VPS.

## 7. Xử lý sự cố

| Hiện tượng | Kiểm tra |
| --- | --- |
| Website báo 503 / "Incomplete response" | Setup Node.js App → app đã **Start** chưa; xem log `~/glg/frontend/stderr.log` |
| Trang web mở được nhưng không có phòng/giá | `HOTEL_API_URL` trong `frontend/.env.production.local` đúng chưa → sửa xong phải chạy lại `deploy.sh --no-pull` (giá trị được nạp lúc build) |
| `api.<ten-mien>` báo 500 | `~/glg/backend/storage/logs/laravel-*.log`; thường do sai DB trong `.env` → sửa rồi `php artisan config:cache` |
| `api.<ten-mien>` báo 404 cho mọi đường dẫn | Document root của subdomain phải là `glg/backend/public` (có file `.htaccess`) |
| Đăng nhập /admin không giữ phiên | Website phải chạy **https** (vì `SESSION_SECURE_COOKIE=true`) |
| `composer install` báo thiếu `ext-pdo_sqlite` | Bật `pdo_sqlite` trong Select PHP Version → Extensions (cũng cần cho chính lệnh `php` ở Terminal) |
| Sửa `backend/.env` không có tác dụng | Cấu hình đang được cache: `cd ~/glg/backend && php artisan config:cache` |
