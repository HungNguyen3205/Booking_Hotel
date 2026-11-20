# Chuẩn bị nghiệm thu — website GLG HOTEL & SPA

Nhánh `feature/glg-pms-art-direction` · 19/11/2026 · chưa merge, chưa deploy production.

**Trang tổng hợp ảnh và video** (mở bằng trình duyệt, riêng tư cho đến khi chủ tài khoản chia sẻ): https://claude.ai/artifact/XsErUhHGxeFhFE8fbzA8zD
Cùng các tệp ấy trong repo: [`docs/qa/nghiem-thu/`](qa/nghiem-thu/).

Ba trạng thái dùng trong tài liệu:
- **Đã kiểm chứng**: có kiểm thử chạy thật và có dẫn chứng (tệp kết quả, ảnh, video).
- **Chưa kiểm chứng**: chưa thử, hoặc mới thử bằng giả lập. **Không tính là đạt.**
- **Chờ khách sạn cung cấp**: thiếu thông tin hoặc ảnh thật. Website không tự tạo nội dung thay.

---

## 1. Môi trường xem trước

| Thành phần | Xem trước | Production cục bộ (đối chiếu) |
| --- | --- | --- |
| Frontend | `http://localhost:3100`, build riêng vào `.next-preview/` | `http://localhost:3000`, `.next/` |
| Backend | `http://127.0.0.1:8100`, `APP_ENV=preview` | `http://127.0.0.1:8000` |
| Dữ liệu | `backend/database/preview.sqlite`: chỉ dữ liệu thử (`HOTEL_SEED_DEMO=true`), không có khách thật; không commit (`*.sqlite` trong `.gitignore`) | CSDL riêng |
| Phiên đăng nhập | cookie `glg_preview_session`, tài khoản quản trị riêng | cookie khác, tài khoản khác |
| Lập chỉ mục | `X-Robots-Tag: noindex, nofollow`; `robots.txt` chặn toàn bộ; dải thông báo "Bản xem trước để nghiệm thu — dữ liệu thử, không nhận đặt phòng thật" trên mọi trang | bình thường |

**Đã kiểm chứng tách biệt**:
- Tài khoản xem trước đăng nhập backend 8100 được (200), đăng nhập backend 8000 bị từ chối (422).
- Tài khoản production đăng nhập backend 8100 bị từ chối (422).

**Khởi động lại** (PowerShell, thư mục `frontend`):
```
$env:NEXT_DIST_DIR='.next-preview'; $env:HOTEL_API_URL='http://127.0.0.1:8100'; $env:NEXT_PUBLIC_PREVIEW='1'; $env:NEXT_PUBLIC_SITE_URL='http://localhost:3100'
npx next build; npx next start -p 3100
```
Backend (bash, thư mục `backend`):
```
DB_DATABASE="$(pwd)/database/preview.sqlite" SESSION_COOKIE=glg_preview_session APP_ENV=preview APP_URL=http://localhost:3100 php artisan serve --port=8100
```
Tạo lại CSDL thử: thêm `HOTEL_ADMIN_EMAIL`, `HOTEL_ADMIN_PASSWORD` (mật khẩu riêng cho bản xem trước) và `HOTEL_SEED_DEMO=true` vào lệnh trên, rồi chạy `php artisan migrate:fresh --seed`.

**Chưa kiểm chứng: URL truy cập từ Internet.** Môi trường hiện chỉ chạy trên máy phát triển. Việc tải công cụ đường hầm để mở URL công khai đã bị chặn trong phiên làm việc, nên chưa tạo được URL. Có ba cách, cần chủ dự án chọn:
1. Tự chạy `cloudflared tunnel --url http://localhost:3100` trên máy này. Đường hầm chỉ dẫn tới frontend xem trước; backend xem trước đi qua proxy của frontend.
2. Cho phép tạo đường hầm trong phiên tiếp theo.
3. Cung cấp hosting tách biệt production, ví dụ Vercel Preview cho frontend và một máy chủ nhỏ cho backend có CSDL thử riêng.

---

## 2. Kết quả trên bản build production của môi trường xem trước

### 2.1. Luồng đặt phòng trên mạng chậm: **đã kiểm chứng**, 7/7, chạy 3 lần liên tiếp đều đạt

Lệnh: `NODE_PATH=<thư mục có playwright> node tests/ui/booking-slow.cjs http://localhost:3100 <thư mục kết quả> <SĐT thử>`. Điều kiện: điện thoại 390 px, Slow 4G (độ trễ 150 ms, tải xuống 1,6 Mbps, tải lên 750 kbps), CPU chậm 4×.

| Bước | Kết quả |
| --- | --- |
| Tìm phòng từ trang chủ | Hiện "Đang tìm…", ra kết quả sau 1,4–2,5 s |
| Quay lại trang chủ | Giữ ngày đã chọn |
| Tiến lại trang đặt phòng | Tự tìm lại đúng ngày |
| Mất mạng khi bấm "Đặt phòng" (giả lập offline của DevTools) | "Không kết nối được. Vui lòng kiểm tra mạng và thử lại. Bạn có thể bấm "Đặt phòng" lại — hệ thống sẽ không tạo đơn trùng." Không báo thành công |
| Có mạng lại, bấm đúp | 1 yêu cầu POST, 1 `request_key`, 1 mã |
| Mã đặt phòng | Đúng số điện thoại vừa nhập |
| Quay lại sau khi đặt | Không gửi lại yêu cầu |

Ảnh: `docs/qa/nghiem-thu/dat-phong-mang-cham-*.jpg`. Kết quả: `ket-qua-mang-cham.json`.

**Lỗi tìm ra trong lúc kiểm thử và đã sửa:**
1. **Giới hạn tần suất dùng chung một bộ đếm.**
   - Nguyên nhân: các route dùng `throttle:X,1` không đặt tên, nên Laravel tính chung một khóa theo IP cho mọi API công khai.
   - Ảnh hưởng: khách tìm phòng vài lần rồi đặt thì bị chặn, với thông báo tiếng Anh "Too Many Attempts.".
   - Website gọi API qua proxy Next.js nên backend thấy mọi khách cùng IP 127.0.0.1. Trên production, cả website có thể dùng chung 10 lượt đặt mỗi phút.
   - Sửa: mỗi loại thao tác có bộ đếm riêng (`AppServiceProvider`); lấy IP thật từ proxy tin cậy (`TRUSTED_PROXIES`); thông báo tiếng Việt.
   - Kiểm thử: `test_searching_does_not_use_up_booking_rate_limit`.
2. **Mã đặt phòng lấy số điện thoại cũ.**
   - Lỗi: khách nhập số mới nhưng email trùng hồ sơ cũ thì hệ thống dùng lại hồ sơ cũ, mã là số cũ, số mới bị mất.
   - Sửa: ưu tiên khớp theo số điện thoại (cả dạng 0… và +84…). Hồ sơ trùng email chỉ được dùng lại khi chưa có số điện thoại; mã luôn theo số khách vừa nhập.
   - Kiểm thử: `test_booking_code_follows_phone_entered_even_if_email_matches_old_profile`.
3. Mất mạng hiện "Failed to fetch": đã đổi thành thông báo tiếng Việt.
4. Trên máy chậm, ngày khách nhập trước khi trang tải xong bị ghi đè: đã giữ giá trị khách nhập.
5. Ô nhập trong form đặt phòng thiếu thuộc tính `name`, nên trình duyệt không tự điền được: đã bổ sung.

> **Yêu cầu khi triển khai production**: reverse proxy đứng trước Next.js (nginx, Cloudflare, Vercel…) phải ghi IP thật của khách vào `X-Forwarded-For`. Next.js không tự thêm header này. Nếu backend không chạy cùng máy với Next.js, đặt `TRUSTED_PROXIES` trong `backend/.env` là IP của máy chạy Next.js.

### 2.2. Video và tính liền mạch: **đã kiểm chứng trên Chromium**, 12/12

Lệnh: `node tests/ui/journey.cjs http://localhost:3100 <thư mục>`. Video quay: cuộn xuống hết trang theo nhịp 60% chiều cao màn hình, cuộn ngược về đầu, rồi chuyển loại phòng Phòng đôi → Phòng gia đình → Phòng đơn.

| Tiêu chí | Desktop 1440 | Mobile 390 |
| --- | --- | --- |
| Khoảng trống bất thường (khung có >55% hàng điểm ảnh một màu) | không có | không có |
| Ảnh giật / dịch chuyển bố cục khi cuộn | CLS 0,000; 0 khung >100 ms | CLS 0,000; 0 khung >100 ms |
| Chữ xuất hiện muộn (chữ trong khung có độ mờ <0,95) | 0 | 0 |
| Header cố định che ô đang nhập | không (header 100 px, ô 472 px) | không (header 69 px, ô 445 px) |
| Cuộn ngược làm mất nội dung | không (tiêu đề hero opacity 1) | không |
| Chuyển loại phòng cập nhật thẻ | đúng 3/3 | đúng 3/3 |

Ngoài kiểm tra tự động, đã trích 1 khung/giây (`khung-video-desktop.jpg`, `khung-video-mobile.jpg`) và xem từng khung:
- Không có khung trống, trừ khung đầu tiên của video desktop. Khung đó trắng vì trình ghi bắt đầu trước khi trang tải.
- Thẻ thông tin phòng chuyển bằng hiệu ứng mờ dần 0,7 s; trong lúc chuyển có một khung thẻ đang mờ, đây là chủ ý.

Lỗi đã sửa trong đợt này:
- Chữ menu đầu trang để mờ 0,88: đã bỏ.
- Slide phòng không được chọn vẫn bị đọc là chữ mờ: đã ẩn hẳn bằng `visibility`.
- Trên điện thoại, chạm tên phòng mở luôn trang chi tiết: nay chạm lần đầu để chọn, chạm lần hai để mở.

Giới hạn: máy đo không giới hạn CPU, nên độ mượt trên điện thoại yếu thật **chưa kiểm chứng** (xem mục 3).

### 2.3. LCP: **đã kiểm chứng trên giả lập mạng/CPU**

- **Phần tử LCP**: ảnh hero `IMG.hero-img` (cổng GLG Hotel Wellness), ở mọi lần đo.
- **Phân tích**: con số ~4,5 s trước đây là LCP *mô phỏng* của Lighthouse, với phần lớn thời gian được quy vào "chờ render". Đo thật bằng `PerformanceObserver` trong Chromium bị giới hạn mạng thì khác: ảnh hero tải xong là được vẽ ngay (chênh khoảng 200 ms).
- **Nguyên nhân thật**: ảnh hero phải chia băng thông với 12 tệp font và JavaScript.
  - Biến thể tắt animation của hero: trung vị 2691 ms, gần như không đổi.
  - Biến thể chặn tải font: trung vị 2362 ms, giảm.
- **Tối ưu**:
  - Ảnh AVIF trước, WebP dự phòng, giữ chất lượng q75 (ảnh hero mobile 46 KB thay vì 97 KB).
  - Chỉ tải các độ đậm font thực sự dùng (12 → 8 tệp).
  - Dùng `preload` cho ảnh hero.
  - Không hạ chất lượng ảnh.

Đo thật (`tests/ui/lcp-probe.cjs`): Slow 4G + CPU 4×, 412×823 @1,75×, tắt cache, cùng máy, cùng điều kiện.

| Lần | Trước | Sau |
| --- | ---: | ---: |
| 1 | 2845 ms | 1696 ms |
| 2 | 2603 ms | 1630 ms |
| 3 | 2648 ms | 2014 ms |
| **Trung vị** | **2648 ms** | **1696 ms** |
| Ảnh hero tải xong | ≈ 2440 ms | ≈ 1430 ms |

Lighthouse 12.3 mobile (mô phỏng) trên bản xem trước, 3 lần:

| Chỉ số | Lần 1 | Lần 2 | Lần 3 | Trung vị |
| --- | --- | --- | --- | --- |
| Performance | 88 | 76 | 77 | 77 |
| LCP | 3,4 s | 3,8 s | 3,7 s | 3,7 s |
| Accessibility | 100 | 100 | 100 | 100 |
| Best practices | 100 | 100 | 100 | 100 |

Trước tối ưu: Performance 53 / 66 / 66, LCP 4,5–5,0 s. SEO của bản xem trước là 69 vì cố ý đặt `noindex`; bản production vẫn đạt 100.

**Chưa kiểm chứng**: LCP trên mạng di động thật và máy chủ thật. Ngưỡng tốt là 2,5 s: số đo thật trên giả lập đã đạt, nhưng số mô phỏng của Lighthouse (3,7 s) chưa đạt.

### 2.4. Backend: **đã kiểm chứng**, 27/27 kiểm thử, 270 assertion (`php vendor/bin/phpunit`)

### 2.5. Thiết kế lại trang đặt phòng "vé lưu trú" (20/11/2026, theo yêu cầu chủ dự án)

- **Đầu trang:** dải ảnh thật cổng GLG Hotel Wellness. Không dùng ảnh hàng rào tre đầy đủ vì có bảng hiệu "Đặc sản Huế cung đình" của cơ sở khác.
- **Khung tìm phòng dạng vé:** hai ô ngày nối bằng cuống "số đêm", đường xé, số khách, nút tìm.
- **Thẻ phòng có hình:** ảnh thật khi khách sạn tải lên. Khi chưa có, hiển thị tấm diện tích ghi rõ "Ảnh phòng thực tế đang cập nhật"; không lấy ảnh khác thay ảnh phòng. Nút "Đặt phòng này" đặt ngay trên từng gói giá.
- **Gộp hai bước "Thông tin" và "Xác nhận" thành một:** form người đặt, chính sách và ô đồng ý nằm cùng một trang, bên cạnh là "vé lưu trú" tóm tắt phòng, ngày, khách, tổng tiền và tiền cọc. Luồng còn 4 bước.
- **Kiểm chứng trên bản build production của môi trường xem trước:**
  - Không tràn ngang ở 1440 và 390 px.
  - `qa.cjs` đạt 19/19.
  - `booking-slow.cjs` đạt 7/7, chạy 3 lần; tìm phòng trên Slow 4G mất 1,4–2,3 s.
  - Một lần thử ảnh đầu trang ưu tiên tải (`preload`) làm tìm phòng chậm lên 7,0 s, nên ảnh này để mức ưu tiên thấp.
- **Chưa kiểm chứng:** trên thiết bị thật (mục 3).

---

## 3. Checklist thử trên thiết bị thật: **chưa kiểm thử, không tính là đạt**

Chưa có iPhone hay điện thoại Android thật trong đợt này. Mọi mục dưới đây **chưa kiểm thử**. Khi thử, ghi: thiết bị, phiên bản hệ điều hành, phiên bản trình duyệt, mạng (Wi-Fi/4G), người thử, ngày.

| # | Hạng mục | iPhone · Safari | Android · Chrome |
| --- | --- | --- | --- |
| 1 | Mở trang chủ lần đầu bằng 4G: ảnh hero hiện trong khoảng 2,5 s, không nhảy bố cục | ☐ | ☐ |
| 2 | Chữ tiếng Việt có dấu hiển thị đúng font (tiêu đề serif, nội dung không chân) | ☐ | ☐ |
| 3 | Cuộn xuống hết trang rồi cuộn ngược: không khoảng trắng, không giật, chữ không hiện muộn | ☐ | ☐ |
| 4 | Thanh địa chỉ co/giãn khi cuộn không làm hero hoặc header nhảy | ☐ | ☐ |
| 5 | Header cố định không che tiêu đề mục khi bấm liên kết trong menu | ☐ | ☐ |
| 6 | Menu ☰ mở/đóng, khóa cuộn nền, đóng khi chọn mục | ☐ | ☐ |
| 7 | Khu phòng nghỉ: chạm tên phòng lần 1 đổi thẻ, chạm lần 2 mở trang chi tiết | ☐ | ☐ |
| 8 | Ô chọn ngày mở bộ chọn ngày gốc của máy; ngày trả không trước ngày nhận | ☐ | ☐ |
| 9 | Tìm phòng → chọn → nhập tên, SĐT, email (bàn phím số cho SĐT, tự điền hoạt động) → đồng ý chính sách → Đặt phòng | ☐ | ☐ |
| 10 | Mã đặt phòng hiển thị đúng số điện thoại đã nhập | ☐ | ☐ |
| 11 | Bật chế độ máy bay rồi bấm Đặt phòng: báo lỗi tiếng Việt; tắt chế độ máy bay, bấm lại: 1 mã, không trùng | ☐ | ☐ |
| 12 | Nút quay lại của trình duyệt/cử chỉ vuốt: không mất ngày đã chọn, không gửi lại đơn | ☐ | ☐ |
| 13 | Bàn phím ảo không che ô đang nhập hoặc nút Đặt phòng | ☐ | ☐ |
| 14 | Xoay ngang: không tràn ngang, đọc được | ☐ | ☐ |
| 15 | Bật "Giảm chuyển động" (iOS: Trợ năng → Chuyển động; Android: Xóa hiệu ứng động): không còn hiệu ứng trượt | ☐ | ☐ |
| 16 | Phóng to chữ hệ thống lên 130%: không cắt chữ, nút vẫn bấm được | ☐ | ☐ |
| 17 | VoiceOver / TalkBack đọc được tiêu đề, nút, ảnh có mô tả, thông báo lỗi | ☐ | ☐ |
| 18 | Tra cứu đặt phòng bằng mã + email | ☐ | ☐ |
| 19 | Trang Liên hệ: nút "Mở Google Maps" mở ứng dụng bản đồ (khi đã nhập link bản đồ trong Cấu hình) | ☐ | ☐ |
| 20 | Trang quản trị trên điện thoại: đăng nhập, sơ đồ phòng, danh sách đặt phòng đọc được | ☐ | ☐ |

Kết luận hiện tại: **iPhone/Safari: chưa kiểm thử. Android/Chrome: chưa kiểm thử.**

---

## 4. Ảnh và nội dung khách sạn cần cung cấp

Website chỉ dùng 4 ảnh thật đã nhận (mặt tiền, cổng GLG Hotel Wellness, Mộc Spa, hàng rào tre/khu Kids). Các vị trí dưới đây đang dùng ảnh cắt từ 4 ảnh này, hoặc khung chữ "Ảnh phòng thực tế đang cập nhật".

**Yêu cầu chung cho ảnh**:
- Ảnh gốc từ máy ảnh hoặc điện thoại, không qua bộ lọc mạnh, không gắn chữ hay logo.
- Cạnh dài ≥ 2400 px nếu có thể (tối thiểu như từng dòng dưới).
- Chụp ban ngày, ánh sáng tự nhiên.
- Có quyền sử dụng; ảnh có người cần sự đồng ý của người đó.
- Website tự cắt theo tỷ lệ, nên để khoảng trống quanh chủ thể.

| Vị trí trên website | Tỷ lệ hiển thị | Kích thước tối thiểu | Cần cung cấp | Đang dùng |
| --- | --- | --- | --- | --- |
| Hero trang chủ (ảnh đầu tiên) | Toàn màn hình: ngang ~16:9 trên desktop, dọc ~9:19 trên điện thoại (chủ thể nên ở giữa) | 2400 × 1600 | 1 ảnh đặc trưng nhất (có thể giữ ảnh cổng hiện tại) | Cổng GLG Hotel Wellness |
| Chương 01 · Không gian: ảnh chính | 5:4 | 1600 × 1280 | Sảnh / lối vào / mặt tiền | Mặt tiền |
| Chương 01 · Không gian: ảnh nhỏ chồng | 5:3 | 1000 × 600 | 1 chi tiết vật liệu (tre, gỗ, cây) | Bảng gỗ cắt từ ảnh cổng |
| Chương 02 · Phòng nghỉ: khung xem phòng | 5:4 (điện thoại 4:3) | 1600 × 1280 | **Mỗi loại phòng (Đơn, Đôi, Gia đình) 1 ảnh toàn cảnh phòng** | Khung chữ "Ảnh phòng thực tế đang cập nhật" |
| Thẻ phòng (trang chủ, danh sách) | 3:2 | 1200 × 800 | Dùng chung ảnh toàn cảnh phòng ở trên | Khung chữ |
| Trang chi tiết phòng: ảnh lớn | 16:10 | 1920 × 1200 | Ảnh toàn cảnh phòng | Khung chữ |
| Trang chi tiết phòng: bộ ảnh | 3:2 | 1200 × 800 | **Mỗi loại phòng 4–8 ảnh**: giường, cửa sổ/view, phòng tắm, góc làm việc, tiện nghi | Chưa có |
| Chương 03 · Trải nghiệm: ảnh lớn (Mộc Spa) | 3:2 | 1600 × 1067 | Phòng trị liệu Mộc Spa (bên trong) | Bảng hiệu Mộc Spa |
| Chương 03 · Trải nghiệm: các thẻ khác | 4:3 | 1200 × 900 | Khu vui chơi Kids; **Coffee & khu đọc sách**; **Gym · Yoga** | Kids: cửa khu Kids. Coffee, Gym·Yoga: chưa có ảnh |
| Dải tre chuyển chương (câu trích) | Dải ngang toàn màn hình (~3:1 desktop) | 2400 × 800 | Ảnh tre/cây xanh không có chữ (có thể giữ ảnh hiện tại) | Hàng rào tre |
| Chương 04 · Thư viện ảnh (4 ô) | Ô lớn ~4:3, ô nhỏ ~1:1 và dọc ~3:4 | 1600 px cạnh dài | 8–20 ảnh: ngoại thất, sảnh, hành lang, phòng, spa, cà phê, đêm | 4 ảnh thật và ảnh cắt |
| Trang Thư viện ảnh | 3:2 | 1200 × 800 | Như trên | 4 ảnh thật |
| Trang Tiện ích, Giới thiệu, Liên hệ | 4:3 | 1200 × 900 | Ảnh khu tiện ích; ảnh đội ngũ/chủ (nếu muốn) | Mộc Spa, mặt tiền |
| Ảnh chia sẻ mạng xã hội (Open Graph) | 1,91:1 | 1200 × 630 | 1 ảnh đặc trưng | Trang chủ chưa đặt ảnh chia sẻ (trang phòng/bài viết dùng ảnh riêng nếu có) |
| Bài viết / ưu đãi | 3:2 | 1200 × 800 | Ảnh bìa từng bài | Chưa có bài thật |

**Nội dung chữ cần cung cấp hoặc xác nhận**:

| Nội dung | Vị trí | Hiện trạng |
| --- | --- | --- |
| Câu chuyện giới thiệu khách sạn (3–6 đoạn: ra đời, ý tưởng không gian xanh, con người) | Trang Giới thiệu, đoạn mở chương 01 | Câu giới thiệu ngắn chung chung |
| Số điện thoại đặt phòng, email, Zalo, Facebook | Đầu trang, chân trang, Liên hệ, email xác nhận | Trống, website ẩn các mục này |
| Loại giường và sức chứa chính xác từng loại phòng; tiện nghi trong phòng; diện tích xác nhận | Thẻ phòng, trang chi tiết | "Giường: đang cập nhật"; diện tích 18/25/32 m² và sức chứa đang là số tạm |
| Mô tả từng loại phòng (2–4 câu) | Trang chi tiết phòng | Mô tả ngắn tạm |
| Chính sách cọc, hủy, hoàn tiền, không đến; giờ nhận/trả phòng chính thức | Trang Chính sách, bước xác nhận đặt phòng | Cọc 30%, hủy miễn phí trước 48 giờ, 14:00/12:00 (tạm) |
| Chính sách quyền riêng tư (đơn vị quản lý dữ liệu, liên hệ) | Trang Quyền riêng tư | Bản mẫu cần xác nhận |
| Mô tả dịch vụ Mộc Spa (danh sách liệu trình, giá, giờ mở cửa); Coffee; Gym · Yoga; khu Kids (độ tuổi, giờ) | Chương 03, trang Tiện ích | Mô tả một dòng, không có giá |
| Đánh giá thật của khách (nguồn, tên viết tắt, có đồng ý) | Chưa có vị trí; chỉ thêm khi có thật | Website không hiển thị đánh giá |
| Hạng sao / giấy phép (nếu muốn hiển thị) | Chân trang | Không hiển thị |
| Tên pháp nhân, mã số thuế (nếu cần trên website/hóa đơn) | Chân trang, hóa đơn | Không có |
