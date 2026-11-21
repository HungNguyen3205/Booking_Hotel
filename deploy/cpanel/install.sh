#!/usr/bin/env bash
# CÀI ĐẶT LẦN ĐẦU GLG trên cPanel — chạy trong Terminal của cPanel:
#   bash ~/glg/deploy/cpanel/install.sh <ten-mien>        vd: bash ~/glg/deploy/cpanel/install.sh glghotel.vn
#
# Tự làm: subdomain api.<ten-mien> → backend/public, database + user MySQL (mật khẩu ngẫu nhiên),
# backend/.env, tài khoản chủ khách sạn (mật khẩu ngẫu nhiên), Node.js App cho website, build, cron, AutoSSL.
# Cuối cùng in thông tin đăng nhập và lưu vào ~/glg-thong-tin-dang-nhap.txt (chỉ chủ tài khoản đọc được).
# Chạy lại an toàn: bước nào đã có thì bỏ qua. Lần cập nhật sau dùng deploy.sh.
set -euo pipefail

DOMAIN="${1:-}"
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"; DOMAIN="${DOMAIN#www.}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_REL="${ROOT#"$HOME"/}"                     # vd: glg (đường dẫn tính từ thư mục home)
API_HOST="api.$DOMAIN"
CRED_FILE="$HOME/glg-thong-tin-dang-nhap.txt"

step() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mLỖI: %s\033[0m\n' "$*" >&2; exit 1; }
rand() { LC_ALL=C tr -dc "$2" </dev/urandom | head -c "$1" || true; }
trap 'printf "\n\033[1;31mLỖI: lệnh ở dòng %s của install.sh thất bại (xem thông báo phía trên). Gửi đoạn này cho người hỗ trợ.\033[0m\n" "$LINENO" >&2' ERR

[ -n "$DOMAIN" ] || fail "Thiếu tên miền. Cách dùng: bash $0 ten-mien.vn"
[ "$ROOT" != "$APP_REL" ] || fail "Mã nguồn phải nằm trong thư mục home ($HOME)."
command -v uapi >/dev/null || fail "Không thấy lệnh uapi — script này chỉ chạy trong Terminal của cPanel."

# ---------- PHP 8.2+ ----------
PHP_BIN=""
for c in php /opt/cpanel/ea-php84/root/usr/bin/php /opt/cpanel/ea-php83/root/usr/bin/php /opt/cpanel/ea-php82/root/usr/bin/php \
         /opt/alt/php84/usr/bin/php /opt/alt/php83/usr/bin/php /opt/alt/php82/usr/bin/php; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -r 'exit(PHP_VERSION_ID >= 80200 ? 0 : 1);' 2>/dev/null; then PHP_BIN="$(command -v "$c")"; break; fi
done
[ -n "$PHP_BIN" ] || fail "Không tìm thấy PHP 8.2+. Vào cPanel > MultiPHP Manager / Select PHP Version chọn PHP 8.2 trở lên rồi chạy lại."
export PATH="$(dirname "$PHP_BIN"):$HOME/bin:$PATH"   # composer cũng dùng đúng bản PHP này
for ext in pdo_mysql pdo_sqlite mbstring openssl fileinfo; do
  "$PHP_BIN" -r "exit(extension_loaded('$ext') ? 0 : 1);" || fail "PHP thiếu extension $ext — bật trong cPanel > Select PHP Version > Extensions rồi chạy lại."
done
echo "PHP: $PHP_BIN ($("$PHP_BIN" -r 'echo PHP_VERSION;'))"

# Đọc một trường trong JSON từ stdin: json_get result.data.prefix
json_get() { "$PHP_BIN" -r '$d=json_decode(stream_get_contents(STDIN),true); foreach(explode(".",$argv[1]) as $k){ if(!is_array($d)||!array_key_exists($k,$d)) exit(1); $d=$d[$k]; } echo is_scalar($d)?$d:json_encode($d);' "$1"; }
uapi_ok() { local out; out="$(uapi --output=json "$@" 2>&1)" || true; [ "$(printf '%s' "$out" | json_get result.status 2>/dev/null)" = "1" ] && return 0; printf '%s' "$out" | json_get result.errors 2>/dev/null >&2 || printf '%s\n' "$out" >&2; return 1; }

# ---------- Composer ----------
if ! command -v composer >/dev/null; then
  step "Cài Composer vào ~/bin"
  mkdir -p "$HOME/bin"
  curl -sS https://getcomposer.org/installer | "$PHP_BIN" -- --install-dir="$HOME/bin" --filename=composer
fi

# ---------- Subdomain api.<ten-mien> ----------
step "Subdomain $API_HOST → $APP_REL/backend/public"
if uapi --output=json DomainInfo list_domains 2>/dev/null | grep -q "\"$API_HOST\""; then
  echo "Đã có, bỏ qua. (Kiểm tra Document Root của $API_HOST phải là $APP_REL/backend/public)"
else
  uapi_ok SubDomain addsubdomain domain=api rootdomain="$DOMAIN" dir="$APP_REL/backend/public" \
    || fail "Không tạo được subdomain. Kiểm tra $DOMAIN có thuộc tài khoản cPanel này không, hoặc tạo tay trong Domains rồi chạy lại."
  echo "Đã tạo."
fi

# ---------- Database + backend/.env ----------
cd "$ROOT/backend"
ADMIN_EMAIL=""; ADMIN_PASSWORD=""
envval() { grep -m1 "^$1=" .env | cut -d= -f2- | sed 's/^"//; s/"$//'; }
if [ -f .env ]; then
  step "backend/.env đã tồn tại — giữ nguyên (không tạo lại database/mật khẩu)"
  ADMIN_EMAIL="$(envval HOTEL_ADMIN_EMAIL)"; ADMIN_PASSWORD="$(envval HOTEL_ADMIN_PASSWORD)"
  DB_NAME="$(envval DB_DATABASE)"; DB_USER="$(envval DB_USERNAME)"; DB_PASS="$(envval DB_PASSWORD)"
else
  step "Tạo database MySQL"
  PREFIX="$(uapi --output=json Mysql get_restrictions | json_get result.data.prefix 2>/dev/null || true)"
  [ -n "$PREFIX" ] || PREFIX="$(whoami | cut -c1-16)_"
  DB_NAME="${PREFIX}glg"; DB_USER="${PREFIX}glg"
  DB_PASS="$(rand 28 'A-Za-z0-9')"
  if uapi --output=json Mysql list_databases | grep -q "\"$DB_NAME\""; then
    fail "Database $DB_NAME đã tồn tại nhưng không có backend/.env. Xóa database/user $DB_NAME trong cPanel > MySQL Databases (nếu không dùng) rồi chạy lại."
  fi
  uapi_ok Mysql create_database name="$DB_NAME" || fail "Không tạo được database $DB_NAME."
  if uapi --output=json Mysql list_users | grep -q "\"$DB_USER\""; then
    uapi_ok Mysql set_password user="$DB_USER" password="$DB_PASS" || fail "Không đặt được mật khẩu cho user $DB_USER."
  else
    uapi_ok Mysql create_user name="$DB_USER" password="$DB_PASS" || fail "Không tạo được user $DB_USER."
  fi
  uapi_ok Mysql set_privileges_on_database user="$DB_USER" database="$DB_NAME" privileges=ALL%20PRIVILEGES || fail "Không cấp quyền cho $DB_USER."
  echo "Database: $DB_NAME  User: $DB_USER"

  ADMIN_EMAIL="admin@$DOMAIN"
  ADMIN_PASSWORD="Glg-$(rand 4 'A-HJ-NP-Z')$(rand 4 '2-9')-$(rand 6 'a-km-z2-9')"
  # IP của chính server: Next.js gọi sang api.<ten-mien> từ các IP này
  SERVER_IPS="$( (hostname -I 2>/dev/null || ip -o addr show 2>/dev/null | awk '{split($4,a,"/"); print a[1]}') | tr ' ' '\n' | grep -v '^$' | paste -sd, - || true)"
  TRUSTED="127.0.0.1,::1${SERVER_IPS:+,$SERVER_IPS}"

  step "Ghi backend/.env"
  umask 077
  cat > .env <<EOF
APP_NAME="GLG HOTEL & SPA"
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://$DOMAIN
APP_TIMEZONE=Asia/Ho_Chi_Minh
LOG_CHANNEL=daily
LOG_LEVEL=warning

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=$DB_NAME
DB_USERNAME=$DB_USER
DB_PASSWORD=$DB_PASS

SESSION_DRIVER=database
SESSION_COOKIE=glg_hotel_session
SESSION_SECURE_COOKIE=true
CACHE_STORE=database
QUEUE_CONNECTION=sync

HOTEL_ADMIN_EMAIL=$ADMIN_EMAIL
HOTEL_ADMIN_PASSWORD=$ADMIN_PASSWORD
HOTEL_SEED_DEMO=false
HOTEL_DEMO_PASSWORD=

PAYMENT_WEBHOOK_SECRET=
MAIL_MAILER=log

TRUSTED_PROXIES=$TRUSTED
EOF
  umask 022
fi

step "Backend: cài thư viện, khởi tạo dữ liệu"
composer install --no-dev --optimize-autoloader --no-interaction --no-progress
mkdir -p storage/app/public storage/app/private storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache
# Không dùng optimize:clear: nó xóa cache trong CSDL, lỗi khi bảng cache chưa được tạo
"$PHP_BIN" artisan config:clear >/dev/null && "$PHP_BIN" artisan route:clear >/dev/null && "$PHP_BIN" artisan view:clear >/dev/null
grep -q '^APP_KEY=base64:' .env || "$PHP_BIN" artisan key:generate --force
"$PHP_BIN" artisan migrate --force
"$PHP_BIN" artisan db:seed --force     # chạy lại an toàn: chỉ tạo những gì chưa có

# ---------- Frontend ----------
step "Frontend: frontend/.env.production.local"
cd "$ROOT/frontend"
if [ ! -f .env.production.local ]; then
  printf 'NEXT_PUBLIC_SITE_URL=https://%s\nHOTEL_API_URL=https://%s\n' "$DOMAIN" "$API_HOST" > .env.production.local
fi
cat .env.production.local

step "Node.js App cho $DOMAIN"
NODE_MAJOR=""
for v in 22 20 24; do if [ -d "/opt/alt/alt-nodejs$v" ]; then NODE_MAJOR="$v"; break; fi; done
EXIST_VENV="$(ls -d "$HOME/nodevenv/$APP_REL/frontend"/*/bin/activate 2>/dev/null | head -1 || true)"
if [ -n "$EXIST_VENV" ]; then
  NODE_VENV="$EXIST_VENV"; echo "Đã có ứng dụng Node, bỏ qua tạo mới."
elif command -v cloudlinux-selector >/dev/null && [ -n "$NODE_MAJOR" ]; then
  cloudlinux-selector create --json --interpreter nodejs --version "$NODE_MAJOR" --app-root "$APP_REL/frontend" \
    --domain "$DOMAIN" --app-uri / --app-mode production --startup-file server.cjs
  NODE_VENV="$HOME/nodevenv/$APP_REL/frontend/$NODE_MAJOR/bin/activate"
else
  fail "Không tự tạo được Node.js App (cần Node 20+ và CloudLinux Node.js Selector).
Vào cPanel > Setup Node.js App > Create Application: Node 20/22, Production, Application root: $APP_REL/frontend,
Application URL: $DOMAIN, Startup file: server.cjs — rồi chạy lại lệnh này."
fi
[ -f "$NODE_VENV" ] || fail "Không thấy $NODE_VENV"
printf 'PHP_BIN=%s\nNODE_VENV=%s\n' "$PHP_BIN" "$NODE_VENV" > "$ROOT/deploy/cpanel/deploy.env"

DOCROOT="$(uapi --output=json DomainInfo single_domain_data domain="$DOMAIN" 2>/dev/null | json_get result.data.documentroot 2>/dev/null || true)"
for f in index.html index.htm index.php default.html; do
  if [ -n "$DOCROOT" ] && [ -f "$DOCROOT/$f" ]; then warn "Có file $DOCROOT/$f — nó có thể che trang chủ website. Nếu là trang mặc định của hosting, hãy đổi tên/xóa."; fi
done

# ---------- Build + khởi động ----------
bash "$ROOT/deploy/cpanel/deploy.sh" --no-pull

# ---------- Cron ----------
step "Cron schedule:run mỗi phút"
CRON_LINE="* * * * * cd $ROOT/backend && $PHP_BIN artisan schedule:run >> /dev/null 2>&1"
if crontab -l 2>/dev/null | grep -qF "$ROOT/backend && "; then echo "Đã có, bỏ qua."
else (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab - && echo "Đã thêm."; fi

step "Yêu cầu cấp SSL (AutoSSL)"
uapi_ok SSL start_autossl_check && echo "Đã yêu cầu — chứng chỉ cho $DOMAIN và $API_HOST thường có sau vài phút." \
  || warn "Không yêu cầu được AutoSSL tự động; vào cPanel > SSL/TLS Status > Run AutoSSL."

# ---------- Thông tin đăng nhập ----------
if [ -n "$ADMIN_PASSWORD" ]; then
  umask 077
  cat > "$CRED_FILE" <<EOF
GLG HOTEL & SPA — thông tin cài đặt ($(date '+%d/%m/%Y %H:%M'))
Website:        https://$DOMAIN
Trang quản trị: https://$DOMAIN/admin
  Email đăng nhập: $ADMIN_EMAIL
  Mật khẩu:        $ADMIN_PASSWORD
API (backend):  https://$API_HOST
Database:       $DB_NAME / user $DB_USER / mật khẩu $DB_PASS
EOF
  umask 022
fi

printf '\n\033[1;32m================ CÀI ĐẶT XONG ================\033[0m\n'
if [ -f "$CRED_FILE" ]; then cat "$CRED_FILE"; else echo "Website: https://$DOMAIN   Quản trị: https://$DOMAIN/admin"; fi
printf '\nĐã lưu tại %s. Đăng nhập xong nên đổi mật khẩu và xóa file này: rm %s\n' "$CRED_FILE" "$CRED_FILE"
printf 'Cập nhật code sau này: cd %s && bash deploy/cpanel/deploy.sh\n' "$ROOT"
