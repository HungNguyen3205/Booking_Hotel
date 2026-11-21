#!/usr/bin/env bash
# Cập nhật GLG trên cPanel sau khi kéo code: chạy trong Terminal của cPanel.
#   bash deploy/cpanel/deploy.sh            # git pull + cập nhật backend + build frontend + khởi động lại
#   bash deploy/cpanel/deploy.sh --no-pull  # không git pull (đã pull tay)
#
# Biến có thể ghi đè (đặt trong deploy/cpanel/deploy.env, file này không đưa lên git):
#   PHP_BIN       lệnh PHP CLI 8.2+     (mặc định: php)   vd /opt/cpanel/ea-php82/root/usr/bin/php
#   COMPOSER_BIN  lệnh composer         (mặc định: composer)
#   NODE_VENV     file activate của Node.js App do cPanel tạo, vd ~/nodevenv/glg/frontend/20/bin/activate
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[ -f "$ROOT/deploy/cpanel/deploy.env" ] && . "$ROOT/deploy/cpanel/deploy.env"
PHP_BIN="${PHP_BIN:-php}"
COMPOSER_BIN="${COMPOSER_BIN:-composer}"
NODE_VENV="${NODE_VENV:-}"
export PATH="$(dirname "$(command -v "$PHP_BIN")"):$HOME/bin:$PATH"   # composer dùng đúng bản PHP

step() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mLỖI: %s\033[0m\n' "$*" >&2; exit 1; }
trap 'printf "\n\033[1;31mLỖI: lệnh ở dòng %s của deploy.sh thất bại (xem thông báo phía trên).\033[0m\n" "$LINENO" >&2' ERR

cd "$ROOT"
if [ "${1:-}" != "--no-pull" ]; then
  step "Kéo code mới (git pull)"
  git pull --ff-only
  # Chạy lại bằng bản script vừa kéo về (bash đọc file dần dần, không chạy tiếp bản cũ đã bị ghi đè)
  exec bash "$ROOT/deploy/cpanel/deploy.sh" --no-pull
fi

# ---------- Backend (Laravel) ----------
step "Backend: kiểm tra .env"
[ -f backend/.env ] || fail "Chưa có backend/.env — chép từ deploy/cpanel/backend.env.example rồi điền thông tin (xem docs/trien-khai-cpanel.md)."
grep -q '^APP_KEY=base64:' backend/.env || fail "backend/.env chưa có APP_KEY — chạy: cd backend && $PHP_BIN artisan key:generate"

step "Backend: cài thư viện PHP"
cd "$ROOT/backend"
"$COMPOSER_BIN" install --no-dev --optimize-autoloader --no-interaction --no-progress
mkdir -p storage/app/public storage/app/private storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache

step "Backend: cập nhật CSDL (migrate)"
"$PHP_BIN" artisan migrate --force

step "Backend: nạp cache cấu hình/route/view"
"$PHP_BIN" artisan config:clear >/dev/null && "$PHP_BIN" artisan route:clear >/dev/null && "$PHP_BIN" artisan view:clear >/dev/null
"$PHP_BIN" artisan config:cache
"$PHP_BIN" artisan route:cache

# ---------- Frontend (Next.js) ----------
step "Frontend: kiểm tra .env.production.local"
cd "$ROOT/frontend"
[ -f .env.production.local ] || fail "Chưa có frontend/.env.production.local — chép từ deploy/cpanel/frontend.env.example."

if [ -n "$NODE_VENV" ]; then
  # File activate của CloudLinux dùng biến chưa khai báo (CL_VIRTUAL_ENV...) nên tạm tắt set -u
  set +u
  # shellcheck disable=SC1090
  . "${NODE_VENV/#\~/$HOME}"
  set -u
fi
command -v node >/dev/null || fail "Không thấy node. Đặt NODE_VENV trỏ tới file activate của Node.js App (xem docs/trien-khai-cpanel.md)."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || fail "Cần Node.js 20.9+ (đang là $(node -v)). Chọn Node 20 hoặc 22 trong Setup Node.js App."

step "Frontend: cài thư viện (npm install)"
npm install --include=dev --no-audit --no-fund

# Máy chủ glibc cũ (CentOS/CloudLinux 7) không nạp được sharp -> tắt tối ưu ảnh động, dùng ảnh WebP có sẵn
if ! node -e "require('sharp')" >/dev/null 2>&1; then
  printf '\033[1;33m[!] sharp không chạy trên máy chủ này — dùng ảnh WebP có sẵn, không tối ưu ảnh động.\033[0m\n'
  grep -q '^NEXT_IMAGES_UNOPTIMIZED=' .env.production.local || printf '\nNEXT_IMAGES_UNOPTIMIZED=1\n' >> .env.production.local
fi

step "Frontend: build (có thể mất vài phút)"
# --webpack: Turbopack cần SWC bản native (glibc >= 2.29); Webpack chạy được với SWC WebAssembly trên máy chủ cũ
# NEXT_BUILD_CPUS=1: hosting giới hạn số tiến trình, nhiều worker sẽ lỗi EAGAIN
NEXT_BUILD_CPUS="${NEXT_BUILD_CPUS:-1}" NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}" npm run build -- --webpack

step "Frontend: khởi động lại ứng dụng Node"
mkdir -p tmp && touch tmp/restart.txt

step "Xong. Mở website và /admin để kiểm tra."
