#!/usr/bin/env bash
# Kiểm thử tranh chấp thật: N tiến trình PHP độc lập cùng lúc đặt phòng gia đình cho đêm D+60.
# Kỳ vọng: số đặt thành công = số phòng gia đình còn trống, còn lại nhận 409; không có phòng-đêm trùng.
# Chạy trên CSDL dev (tạo đặt phòng thật, tên "Race N"); hủy chúng sau khi kiểm tra.
set -e
cd "$(dirname "$0")/../.."
N=${1:-8}
T=$(php -r 'echo microtime(true)+5;')
for i in $(seq 1 "$N"); do php tests/Concurrency/race.php "$(pwd)" "$i" "$T" & done
wait
