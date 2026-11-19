# Nâng cấp mỹ thuật & kiểm thử giao diện — GLG HOTEL & SPA

Nhánh: `feature/glg-pms-art-direction` (chưa merge, chưa deploy). Ngày: 19/11/2026.

## 1. Môi trường và giới hạn

- **Trình duyệt**: Chromium 131 qua Playwright 1.49 (chạy không giao diện) trên laptop Windows 11. Kích thước điện thoại là **viewport giả lập có cảm ứng**, không phải điện thoại thật.
- **Website GLG**: bản production `next build && next start` tại `http://localhost:3000`, backend Laravel cục bộ, CSDL demo. URL công khai thật chưa được cung cấp.
- **Trang tham chiếu** https://vinhomeshaivanbaydanang.vn/: mở trực tiếp bằng Chromium, chụp khung hình mỗi ~1,4 giây khi cuộn (desktop 1440, điện thoại 390). **Không quan sát được chuyển động/hiệu ứng** (chỉ có ảnh tĩnh; có quay video nhưng không phân tích từng khung). Không sao chép nội dung, hình ảnh hay nhận diện.
- **Mạng chậm**: chỉ có mô phỏng của Lighthouse; chưa đo trên mạng di động thật.
- **Chuyển động** của GLG: kiểm tra bằng mã (CSS) và bằng việc bật/tắt giảm chuyển động; chưa có người xem trực tiếp để đánh giá cảm nhận.

## 2. Quan sát trang tham chiếu (ảnh tĩnh)

| Quan sát | Bài học cho GLG |
| --- | --- |
| 5 giây đầu: popup thu số điện thoại che toàn trang, khóa cuộn | **Không** dùng popup chặn nội dung; CTA đặt phòng luôn hiện nhưng không che |
| Hero ảnh tràn màn hình, tiêu đề serif rất lớn, cụm chữ nghiêng làm điểm nhấn, 2 CTA, dải 3 điểm nổi bật đè đáy ảnh | Hero ảnh thật + chữ nghiêng có chủ đích + ô tìm phòng ngay đáy hero |
| Đánh số chương "01 / …" lặp xuyên suốt | Chi tiết nhận diện lặp lại: số chương, nan tre, đường kẻ đồng |
| Luân phiên nền xanh đậm ↔ kem, dải ảnh tràn khung chèn giữa | Nhịp màu có chủ đích, khoảng nghỉ thị giác bằng ảnh |
| Ảnh lớn kèm ảnh nhỏ đè góc; thư viện mosaic | Ảnh mặt tiền + ảnh chi tiết bảng gỗ chồng lớp; mosaic ảnh thật |
| Thanh CTA cố định đáy màn hình điện thoại che một phần thẻ nội dung | Đặt nút Đặt phòng trong header (luôn thấy) thay vì thanh đè nội dung |
| Font: Be Vietnam Pro + Noto Serif (+ Great Vibes trên điện thoại) | Chọn Be Vietnam Pro (nội dung) + Cormorant Garamond (tiêu đề), cùng hỗ trợ tiếng Việt |

## 3. Đánh giá trước khi sửa

**Cản trở thao tác**
- Điện thoại: nút Đặt phòng chỉ nằm trong menu ẩn; cuộn xuống không còn thấy.
- Khu phòng nghỉ: 3 khối "ảnh đang cập nhật" trống chiếm gần 3 màn hình điện thoại.
- Ngày/số khách mất khi chuyển trang hoặc quay lại.

**Giảm chất lượng thị giác**
- Ảnh hero (mặt tiền) bị dây điện cắt ngang.
- Mọi section cùng nền kem, thẻ na ná — cảm giác template ghép; khoảng trống lớn trước phần vị trí; footer tách rời.

**Cơ hội**: ảnh thật có nhiều chi tiết đắt giá chưa dùng (bảng gỗ khắc chữ, nhà chim gỗ, hàng rào tre, cửa khu Kids).

Ảnh: `docs/qa/truoc-desktop.jpg`, `docs/qa/truoc-dien-thoai.jpg`, `docs/qa/video-truoc-desktop.webm`.

## 4. Hướng mỹ thuật

- **Ý tưởng**: "Một khoảng xanh để nghỉ lại giữa nhịp sống Đà Nẵng" — trang chủ kể theo 5 chương: Không gian → Phòng nghỉ → Trải nghiệm → Thư viện → Ghé thăm, nối liền footer.
- **Chữ**: Cormorant Garamond 500/600 + nghiêng (tiêu đề, chỉ dùng từ 22px), Be Vietnam Pro 400–700 (nội dung). Đã kiểm tra cả hai có bộ ký tự tiếng Việt.
- **Màu**: kem #F7F4EE, xanh đậm #233D35, đồng #B49563 (trang trí); đồng đậm #7A5E33 cho chữ/nút (đạt AA: 5,5:1 trên kem, 6,0:1 chữ trắng); chữ phụ #5A6862 (5,3:1).
- **Lưới**: chiều rộng nội dung 1200px, lề 20px (16px trên điện thoại); chương cách nhau 72–136px.
- **Ảnh theo vai trò**: chủ đạo = cổng GLG Hotel Wellness (không dây điện); không gian = mặt tiền; chi tiết = bảng gỗ, nhà chim, tre, Mộc Spa (cắt từ ảnh gốc độ phân giải cao); trải nghiệm = Mộc Spa, cửa khu Kids. Bỏ vùng ảnh có bảng "Đặc sản Huế cung đình" (có thể thuộc cơ sở khác, tránh tuyên bố chưa xác nhận).
- **3 điểm nhấn chuyển động**: (1) hero: ảnh thu nhẹ 9 giây, 3 dòng chữ hiện lần lượt; (2) ảnh mặt tiền "mở ra" (clip-path) khi cuộn tới; (3) khu phòng nghỉ chuyển cảnh mượt khi chọn loại phòng. Còn lại: trượt nhẹ khi vào màn hình, **không làm mờ chữ**. Tất cả tắt khi giảm chuyển động; trình duyệt không hỗ trợ cuộn-điều-khiển-animation thì hiển thị tĩnh.

## 5. Thay đổi chính và mục đích

| Thay đổi | Mục đích |
| --- | --- |
| Trang chủ viết lại theo 5 chương đánh số, luân phiên nền kem/xanh, dải ảnh tre làm khoảng nghỉ, chương cuối nối liền footer | Nhịp kể chuyện liền mạch, có lý do cho từng section |
| Header trong suốt trên hero, có nền khi cuộn; nút Đặt phòng luôn hiện (cả điện thoại); menu đóng bằng Esc, trả focus | CTA dễ tìm không che nội dung; thao tác bàn phím |
| `RoomPlate`: khi chưa có ảnh phòng, hiển thị "tấm phòng" chữ (diện tích, sức chứa, giường) trên nền nan tre + ghi chú "ảnh đang cập nhật" | Bỏ khối trống mà không dùng ảnh khác giả làm ảnh phòng |
| `RoomExplorer`: danh sách loại phòng (link thật) + khung chuyển cảnh | Khám phá phòng nhanh; vẫn dùng được khi tắt JS |
| Ô tìm phòng ngay đáy hero, ô thứ hai ở chương "Ghé thăm" | Lời mời đặt phòng ở đầu và cuối hành trình |
| Ghi nhớ ngày/số khách trong phiên (`sessionStorage`); mọi ô tìm phòng tự điền lại; trang đặt phòng tự khôi phục | Không mất lựa chọn khi chuyển trang/quay lại/tải lại |
| Luồng đặt phòng: bỏ phản hồi tìm phòng cũ (đánh số yêu cầu) | Sửa lỗi lựa chọn phòng bị xóa khi phản hồi đến muộn |
| Footer: dải nan tre, chữ GLG lớn dạng viền, câu chủ đề | Footer kết thúc câu chuyện thị giác |
| Admin: sửa tương phản danh sách phòng trên điện thoại, nút + bị đẩy ra ngoài, thanh lịch ngắn ưu tiên tên khách | Khả năng đọc cho lễ tân |
| Font toàn hệ thống (cả admin) đổi sang Be Vietnam Pro / Cormorant Garamond | Đồng bộ nhận diện, dấu tiếng Việt rõ |
| Favicon, link "bỏ qua đến nội dung" hiện khi focus, `scroll-padding` cho header cố định | Truy cập, header không che tiêu đề/thông báo |

## 6. Kết quả kiểm thử

### 6.1. Lỗi phát hiện trên trình duyệt và đã sửa

1. **Nút "Tìm phòng" trên hero không bấm được trên điện thoại** — phần ô tìm phòng tràn xuống bị section kế tiếp vẽ đè.
2. **Tràn ngang 360px** ở trang chi tiết phòng (`aspect-ratio` + `min-height` ép chiều rộng 352px).
3. **Ô ngày "Trả phòng" lòi khỏi khung** tìm phòng ở 360px.
4. **Lựa chọn phòng bị xóa** khi phản hồi tìm phòng thứ hai đến muộn; và việc ghi URL giữa luồng khiến router quay về bước chọn phòng.
5. **Admin điện thoại: chữ trắng trên nền trắng** ở các phòng đang có khách; nút + trên thanh trên bị đẩy khỏi màn hình (tràn ngang).
6. **Tương phản dưới AA**: nút đồng chữ trắng (2,83:1), số chương, chữ phụ, mục phòng chưa chọn (dùng độ trong suốt), logo có nhãn đọc màn hình không khớp chữ hiển thị; link "Tất cả loại phòng" vùng bấm thấp; favicon 404.
7. Dòng mô tả hero khó đọc trên nền bảng gỗ ở điện thoại; thẻ thông tin phòng che con số diện tích; tiêu đề hero 4 dòng đẩy ô tìm phòng khỏi màn hình đầu.

### 6.2. Bộ kiểm thử trình duyệt (`frontend/tests/ui/qa.cjs`) — bản production: **19/19 đạt**

- Responsive 9 trang × 360/390/720/768/1024/1440 px: không tràn ngang, mỗi trang 1 thẻ h1, không ảnh thiếu alt (720px ≈ zoom 200% của màn 1440).
- Tab có viền focus rõ; menu điện thoại mở → Esc đóng → focus về nút; nút Đặt phòng luôn thấy trên điện thoại.
- Giảm chuyển động: 0 animation đang chạy, không phần tử bị mờ.
- CLS 0–0,001; LCP 0,17–0,25 s (máy cục bộ, không giới hạn mạng).
- Trang chủ (ngày 22/11, khác mặc định) → kết quả → chọn phòng → thông tin → xác nhận chính sách → **bấm đúp "Đặt phòng" tạo đúng 1 yêu cầu**, mã = SĐT; trang xác nhận ghi "Giữ chỗ", không báo đã thanh toán; sang trang chi tiết phòng vẫn giữ ngày 22/11.
- Ghi chú: một lần chạy ngay sau Lighthouse bị quá thời gian chờ 20 giây (máy đang tải nặng); chạy lại đạt.

### 6.3. Admin (`frontend/tests/ui/admin.cjs`)

1440/1024 px: 8/8 ô phòng không chữ bị cắt/đè, đủ 2 nhóm trạng thái (lưu trú + buồng phòng); tên khách 60 ký tự được rút gọn "…", số tiền 125.900.000đ hiển thị đủ. 390 px: không tràn ngang, danh sách phòng đọc được (`docs/qa/admin-dien-thoai.jpg`). Phân quyền và dữ liệu khách không đổi.

### 6.4. Lighthouse 12.3 (Chromium 131, bản production cục bộ, mô phỏng mobile/desktop mặc định)

| Trang | Hiệu năng | Truy cập | Thực hành tốt | SEO | LCP | CLS |
| --- | --- | --- | --- | --- | --- | --- |
| Trang chủ – mobile (3 lần) | 53 / 66 / 66 | 100 | 100 | 100 | 4,5–5,0 s | 0 |
| Trang chủ – desktop (3 lần) | 59 / 95 / 91 | 100 | 100 | 100 | 1,0–1,6 s | 0,001 |
| Chi tiết phòng – mobile / desktop | 54 / 98 | 100 / 100 | 100 / 100 | 100 / 100 | 4,6 / 0,8 s | 0,005 / 0,004 |
| Đặt phòng – mobile | 55 | 100 | 100 | 100 | 4,5 s | 0,038 |

Dữ liệu thô: `docs/qa/lighthouse.jsonl`. **Điểm hiệu năng dao động mạnh** giữa các lần trên cùng trang (TBT 0,14–1,77 s) do máy đo chạy nhiều tiến trình; trước các chỉnh sửa tương phản, một lần đo mobile đạt 81 (LCP 4,1 s). Kết luận thận trọng: **LCP mobile mô phỏng ~4,5 s chưa đạt ngưỡng tốt (2,5 s)**; cần đo lại trên máy chủ thật/WebPageTest. Đã thử `experimental.inlineCss` nhưng không thấy cải thiện rõ nên không giữ.

## 7. Chấm điểm (có dẫn chứng, thang 10)

| Tiêu chí | Điểm | Dẫn chứng | Vì sao chưa cao hơn |
| --- | --- | --- | --- |
| Bản sắc GLG | 7 | Ảnh thật + ảnh chi tiết cắt từ ảnh gốc; nan tre, số chương, câu chủ đề lặp lại (`sau-desktop.jpg`) | Chưa có ảnh nội thất/phòng; câu chuyện thương hiệu còn là nội dung tạm |
| Hình ảnh & typography | 7 | Cormorant + Be Vietnam Pro, dấu tiếng Việt hiển thị đúng ở mọi kích thước đã chụp; hero không còn dây điện | Ảnh chủ yếu là bảng hiệu/ngoại thất; Coffee và Gym·Yoga chưa có ảnh |
| Sự liền mạch | 7,5 | Nhịp kem ↔ xanh, chương 05 nối footer, không khoảng trống vô nghĩa (`sau-desktop.jpg`, `sau-dien-thoai.jpg`) | Trang con (tiện ích, giới thiệu…) mới đồng bộ phong cách, chưa thiết kế riêng |
| Chuyển động | 6 | 3 điểm nhấn + trượt nhẹ; tắt hoàn toàn khi giảm chuyển động (kiểm thử) | Chưa có người xem trực tiếp để đánh giá cảm nhận; chưa phân tích video từng khung |
| Khả năng đặt phòng | 8 | Luồng đầy đủ đạt kiểm thử, bấm đúp an toàn, giữ ngày khi chuyển trang, không thông báo giả | LCP mobile chậm; chưa thử với người dùng thật |
| Trải nghiệm điện thoại | 6,5 | Không tràn ở 360–768, nút Đặt phòng luôn thấy, menu/Esc/focus đạt | Chỉ giả lập viewport; LCP mobile ~4,5 s; chưa thử máy thật, xoay ngang chưa kiểm |

## 8. Còn thiếu và lỗi còn lại

**Nội dung/ảnh thật cần khách sạn cung cấp**: ảnh từng loại phòng và nội thất; ảnh Coffee & khu đọc sách, Gym·Yoga; câu chuyện giới thiệu; số điện thoại, email, Zalo; phản hồi khách thật (website không tự tạo đánh giá); xác nhận chính sách cọc/hủy.

**Kỹ thuật còn lại**
- LCP mobile mô phỏng ~4,5 s: cân nhắc ảnh hero nhỏ hơn cho điện thoại, giảm số tệp font (đang 14 tệp latin + tiếng Việt), đo trên máy chủ thật.
- Trang chi tiết phòng chưa vào được back/forward cache (Lighthouse `bf-cache`: có yêu cầu `no-store`).
- Chưa kiểm thử: điện thoại thật, xoay ngang, mạng chậm thật, Safari/Firefox, trình đọc màn hình thật.
- Video cuộn: `docs/qa/video-sau-desktop.webm`, `docs/qa/video-sau-dien-thoai.webm`, `docs/qa/video-truoc-desktop.webm`.
