# Bàn giao — GLG HOTEL & SPA

Ngày bàn giao: 19/11/2026. Phạm vi: Giai đoạn 1 đầy đủ, phần lớn Giai đoạn 2, nền tảng cho Giai đoạn 3.

## 1. Kết quả kiểm thử

### 1.1. Kiểm thử tự động backend — `vendor/bin/phpunit`: **23/23 đạt, 209 assertion**

| # | Tình huống (mục K) | Kiểm thử | Kết quả |
| --- | --- | --- | --- |
| 1 | Hai yêu cầu đặt cùng phòng không bán trùng | `test_same_room_cannot_be_sold_twice`, `test_last_room_of_type_goes_to_exactly_one_request` (+ khóa chính CSDL chặn ghi trùng trực tiếp) | Đạt |
| 2 | Hết hạn giữ chỗ giải phóng tồn | `test_expired_hold_releases_inventory`, `test_paid_deposit_confirms_hold_and_keeps_inventory` | Đạt |
| 3 | Khách trả và khách nhận cùng ngày | `test_same_day_turnover` (tồn hợp lệ; chặn nhận khi khách trước chưa trả và khi phòng chưa sạch) | Đạt |
| 4 | Chuyển phòng/gia hạn kiểm tra tồn và giá | `test_extend_checks_conflicts_and_prices_new_nights`, `test_move_quote_shows_price_difference`, `test_move_requires_reason_and_free_room` | Đạt |
| 5 | Checkout cập nhật công nợ, phòng sang cần dọn | `test_checkout_requires_settlement_or_records_debt_and_dirties_room`, `test_early_departure_voids_unused_nights_and_frees_room` | Đạt |
| 6 | Không nhận phòng chưa sẵn sàng khi không có quyền ngoại lệ | `test_dirty_room_checkin_needs_override_permission_and_reason` | Đạt |
| 7 | Cọc, thu thêm, hoàn tiền, còn phải thu khớp | `test_deposit_payment_refund_balance_reconcile` (kèm tiền mặt dự kiến của ca) | Đạt |
| 8 | Webhook lặp không tạo khoản thu lặp | `test_webhook_is_authenticated_and_idempotent`, `test_guest_transfer_claim_is_not_counted_as_paid` | Đạt |
| 9 | Nhân viên không vượt quyền | `test_permissions_are_enforced_by_backend`, `test_guest_document_number_is_encrypted_and_hidden_without_permission` | Đạt |
| 10 | Website và admin tồn nhất quán | `test_website_and_admin_share_inventory`, `test_website_booking_is_idempotent_and_validates_price` | Đạt |
| + | Giá ưu tiên & chụp giá | `test_pricing_precedence_and_snapshot` | Đạt |
| + | Phí hủy/không đến theo chính sách | `test_cancellation_fee_follows_policy_and_no_show` | Đạt |
| + | Minibar trừ kho đúng một lần, hoàn kho khi hủy | `test_minibar_sale_deducts_stock_once_and_restores_on_void`, `test_walk_in_sale_reversal_restores_stock_once` | Đạt |
| + | Chặn bảo trì, không xóa phòng có giao dịch | `test_room_block_prevents_sale_and_cannot_overlap_bookings` | Đạt |

### 1.2. Tranh chấp thật — `bash tests/Concurrency/run.sh 8`

8 tiến trình PHP độc lập cùng lúc đặt **Phòng gia đình** (4 phòng) cho cùng một đêm trên CSDL SQLite thật:

- Lần chạy đầu phát hiện lỗi: Laravel chỉ dùng `BEGIN IMMEDIATE` trên PHP ≥ 8.4; với PHP 8.2 các giao dịch nhận lỗi "database is locked" thay vì chờ (không bán trùng nhưng từ chối oan). Đã sửa bằng `App\Database\ImmediateSQLiteConnection`.
- Sau sửa: số đặt thành công đúng bằng số phòng còn trống, các yêu cầu còn lại nhận **409 "không còn phòng trống"**; `room_nights` của đêm đó = 4, 4 phòng khác nhau.

### 1.3. Đầu-cuối qua proxy Next.js — `php tests/E2E/flow.php http://localhost:3000 <HOTEL_DEMO_PASSWORD>`: **16/16 bước đạt**

Lễ tân giữ chỗ → thu cọc (tự xác nhận) → nhận phòng → ghi minibar → gia hạn (xem trước tồn & giá) → trả phòng bị chặn khi còn nợ → xem trước quyết toán trả sớm → thu đủ, trả phòng, hồ sơ đóng → phòng Bẩn + việc dọn → buồng phòng dọn, kiểm tra đạt → phòng mở bán lại, website thấy còn phòng → buồng phòng bị chặn thu tiền/xem báo cáo (403).

Kiểm thử này phát hiện và đã sửa một lỗi nghiệp vụ: khi trả phòng sớm, số "còn phải thu" hiển thị trước đó chưa trừ các đêm sẽ bị hủy → có thể thu thừa. Nay có bước **xem trước quyết toán** (`/stays/{id}/check-out/quote`) và trả phòng gửi kèm `expected_balance`.

### 1.4. Frontend

- `npx tsc --noEmit`: 0 lỗi. `npm run build`: thành công, 29 route.
- Bản production (`next start`): mọi trang website trả 200, slug không tồn tại trả 404; `robots.txt` chặn `/admin`, `/api/`; `sitemap.xml` chỉ gồm trang công khai và 3 loại phòng; trang admin có `noindex`.
- HTML render sẵn: mỗi trang 1 thẻ `h1`, có `title`, `meta description`, `canonical`; JSON-LD `Hotel`/`HotelRoom` chỉ chứa dữ liệu thật; không ảnh nào thiếu `alt`.
- Rà soát mã giao diện độc lập (đối chiếu từng màn hình với dữ liệu backend trả về) tìm ra 13 lỗi chạy thực tế, **đã sửa toàn bộ**. Các lỗi đáng kể nhất: form thu tiền lồng trong form trả phòng làm gửi trả phòng ngoài ý muốn; lễ tân không ghi công nợ được cho đặt phòng công ty/đại lý; ô tìm kiếm xóa khoảng trắng; phản hồi cũ ghi đè bảng chi tiết khi bấm nhanh giữa các phòng/ngày; chuyển khoản mục giữa hồ sơ không đóng form; giá xem trước khi thêm phòng sai kế hoạch giá; kỹ thuật viên không được giao sự cố.
- **Chưa kiểm thử bằng trình duyệt thật** (thao tác chuột, hiển thị trên điện thoại). Cần một lượt thử giao diện thực tế trước khi vận hành — xem mục 4.

## 2. Trạng thái tính năng

### Đã hoạt động

- **Sơ đồ chữ U**: mặt bằng 2D theo tầng (tab), ba dãy theo chữ U, hành lang, khoảng giữa trung tính, mốc định hướng cấu hình được, vạch cửa phòng; ô phòng hiển thị số phòng, loại, trạng thái lưu trú, ngày đến/đi, số khách, nhãn buồng phòng, khoản còn phải thu (chỉ với quyền `balance.view`); lọc theo ngày vận hành/tầng/loại/trạng thái, tìm phòng/khách/mã; dòng tổng quan bấm để lọc; bảng chi tiết bên phải với thao tác theo quyền (đặt phòng, nhận, thêm dịch vụ, gia hạn, chuyển, thu tiền, trả phòng, giao dọn, báo bảo trì) dạng form nội tuyến; điện thoại tự chuyển sang danh sách, mặt bằng cuộn/phóng to.
- **Lịch phòng**: hàng = phòng, cột = ngày, xem ngày/tuần/tháng; thanh lượt ở; tạo đặt phòng từ khoảng trống; kéo thanh sang phòng khác để chuyển (xem trước tồn & giá trước khi xác nhận); đổi ngày có xem trước.
- **Đặt phòng**: nhiều phòng, khách đoàn, theo loại hoặc phòng cụ thể, nguồn khách 5 loại, giữ chỗ có hạn tự giải phóng, xác nhận, hủy (chọn từng phòng, phí theo chính sách), không đến, thêm phòng, phân phòng, lịch sử thay đổi.
- **Lễ tân**: nhận phòng (chặn phòng chưa sạch trừ quyền ngoại lệ + lý do), khách đại diện và khách cùng phòng, giấy tờ mã hóa theo quyền, gia hạn/rút ngắn, chuyển phòng/đổi loại (giữ giá hoặc tính lại), phụ thu nhận sớm/trả muộn, trả phòng có xem trước quyết toán, ghi công nợ có quyền + lý do, xuất CSV khách lưu trú.
- **Tiền**: cọc, thu nhiều lần, hoàn tiền, nhiều phương thức, giảm giá theo quyền, dòng đảo, tách/gộp hồ sơ, công nợ khách/công ty/đại lý, đối soát khoản khách báo chuyển khoản, ca làm việc mở/chốt/bàn giao, sổ thu chi có bút toán đảo, phiếu thu/bảng kê in được.
- **Giá**: giá ngày thường, cuối tuần, lễ, mùa; kế hoạch giá (% điều chỉnh, % cọc, chính sách hủy); phụ thu người/giường; thứ tự ưu tiên rõ ràng; giá chụp từng đêm.
- **Buồng phòng & kỹ thuật**: tự chuyển Bẩn khi trả phòng, giao việc, checklist, kiểm tra trước khi Sạch, báo hỏng có chặn bán theo khoảng ngày, đồ thất lạc.
- **Dịch vụ & kho**: danh mục dịch vụ (minibar, giặt ủi, ăn uống, đưa đón, thuê xe, Spa, Coffee, Yoga), ghi vào hồ sơ hoặc bán lẻ, hủy có lịch sử; kho minibar/vật tư/đồ vải, nhập/xuất/kiểm kê/điều chỉnh/hỏng/mất, cảnh báo tồn thấp, trừ kho không lặp.
- **Khách hàng**: hồ sơ, lịch sử lưu trú, VIP, sở thích, công ty/đại lý/đầu mối, công nợ, phản hồi/khiếu nại, tìm kiếm, cảnh báo trùng và gộp hồ sơ.
- **Nhân sự & phân quyền**: 6 vai trò mặc định, ma trận 41 quyền chỉnh được, phân quyền theo cơ sở, phân ca.
- **Báo cáo**: doanh thu phòng/dịch vụ, công suất, ADR, RevPAR, đến/đi/hủy/không đến, nguồn khách, loại phòng, công nợ, thu theo phương thức, bàn giao ca, ghi rõ cách tính; xuất CSV (Excel) và in/PDF.
- **Website**: 14 trang + đặt phòng 5 bước + tra cứu; cùng tồn và bảng giá với admin; QR chuyển khoản khi đã cấu hình; SEO như mục 1.4.
- **Hệ thống**: nhật ký thao tác, sao lưu SQLite tự động, cấu hình khách sạn/giờ nhận trả/chính sách/mẫu thông báo/nội dung website, trạng thái tích hợp trung thực.

### Tự động hóa & giảm thao tác (bổ sung 20/11/2026)

- **Hệ thống tự làm** (bật/tắt ở Cấu hình → Tự động hóa, nhật ký ghi người thực hiện = "Hệ thống"): giải phóng giữ chỗ hết hạn; sang ngày hôm sau tự đánh dấu khách không đến và giải phóng phòng (phí không đến tùy chọn); mỗi ngày tạo việc dọn cho phòng đang ở; tự giao việc dọn cho nhân viên buồng phòng trong ca đang ít việc nhất (cả việc phát sinh ngay khi khách trả phòng); tự xác nhận đặt phòng khi nhận cọc/webhook; cảnh báo hàng sắp hết. Kiểm thử: `test_daily_automation_marks_no_show_creates_stayover_cleaning_and_assigns`.
- **"Việc hôm nay"** (trang đầu): khách đến (nhận phòng/xác nhận ngay tại chỗ), khách trả phòng (trả phòng có xem trước quyết toán ngay tại chỗ), phòng cần dọn, giữ chỗ chờ cọc, cảnh báo, doanh thu; tự làm mới mỗi phút.
- **Menu gom 4 nhóm**: Việc hôm nay · Lễ tân (Sơ đồ & lịch phòng, Đặt phòng, Khách hàng) · Vận hành (Buồng phòng & bảo trì, Dịch vụ & kho) · Quản lý (Tài chính & ca, Báo cáo, Nhân sự & quyền, Cấu hình). Kho gộp vào trang Dịch vụ (đường dẫn cũ `/admin/kho` tự chuyển).
- **Tìm nhanh Ctrl+K** ở mọi trang: số phòng, tên khách, mã đặt phòng, chức năng → nhấn Enter để mở.
- **Dịch vụ dạng thẻ có ảnh**: bấm thẻ → chọn phòng đang ở → số lượng → ghi phí (trừ kho minibar tự động). Ảnh lấy từ Wikimedia Commons với giấy phép CC0 / Public domain / CC BY / CC BY-SA, đã tải về `frontend/public/images/services/` và ghi nguồn trên từng thẻ (danh sách đầy đủ: `credits.json`). Đây là ảnh minh họa chung, không phải ảnh dịch vụ thật của khách sạn — nên thay bằng ảnh thật khi có (Sửa thẻ → tải ảnh). Dịch vụ mới chưa có ảnh tự dùng ảnh mặc định của nhóm.
- **Liên kết chéo**: thẻ việc dọn và phòng trong đặt phòng mở thẳng phòng đó trên sơ đồ; hồ sơ khách có nút "Đặt phòng cho khách này".

- **Mã đặt phòng = số điện thoại khách** (chuẩn hóa về dạng 0xxxxxxxxx, +84 được đổi về 0). Mã không trùng vĩnh viễn nên lần đặt sau của cùng số điện thoại thêm một chữ cái: `0905123456`, `0905123456B`, `0905123456C`… Không có số điện thoại thì dùng mã `GLGxxxxxx`. Webhook ngân hàng nhận ra mã này trong nội dung chuyển khoản. Tra cứu trên website với mã dạng số điện thoại **bắt buộc nhập email** (để người chỉ biết số điện thoại không xem được đặt phòng). Kiểm thử: `test_booking_code_is_guest_phone_and_unique`.

### Chờ tích hợp (cần nhà cung cấp/thông tin truy cập) — xem [tich-hop.md](tich-hop.md)

Email (cần SMTP), webhook ngân hàng (cần bộ chuyển đổi theo nhà cung cấp), Zalo OA/ZNS, hóa đơn điện tử, OTA/channel manager, cổng thanh toán thẻ/ví, khai báo lưu trú trực tiếp.

### Giai đoạn 3 — mới có nền tảng

- Đa cơ sở: dữ liệu và phân quyền đã theo `property_id`; chưa có giao diện tạo cơ sở mới (thêm qua seed/CSDL). Hồ sơ khách hàng và bài viết website đang dùng chung toàn chuỗi.
- Combo Hotel–Spa–Coffee–Yoga: lưu cấu hình combo, chưa bán.
- Chưa làm: hội viên/tích điểm, chăm sóc khách hàng tự động, trợ lý AN NA.

## 3. Giới hạn đã biết

- Đặt theo loại phòng được tự phân phòng cụ thể ngay khi tạo (để khóa tồn chắc chắn). Có thể xảy ra "phân mảnh": tổng số phòng đủ nhưng không phòng nào trống liền cả khoảng; lễ tân xử lý bằng chuyển phòng giữa kỳ.
- Giá theo giờ: chỉ có cờ cấu hình và trường giá giờ trên loại phòng, chưa có luồng đặt theo giờ.
- Lịch phòng chưa hỗ trợ kéo giãn thanh để đổi ngày (dùng nút "Đổi ngày" có xem trước).
- Xuất Excel dạng CSV UTF-8; PDF qua chức năng in của trình duyệt.
- Quy tắc giá chỉ tắt được, chưa có thao tác xóa.
- SQLite phù hợp một máy chủ, lượng ghi vừa phải; vận hành nhiều quầy nên dùng MySQL/MariaDB.
- Webhook ngân hàng nhận định dạng chuẩn hóa nội bộ; cần viết bộ chuyển đổi khi chọn nhà cung cấp.
- Chưa thử giao diện trên trình duyệt thật và thiết bị di động thật (mục 1.4).

## 4. Thông tin cần khách sạn bổ sung

| Thông tin | Đang dùng | Nơi chỉnh |
| --- | --- | --- |
| **Mặt bằng thật**: số tầng, số phòng mỗi tầng, thứ tự phòng, vị trí cầu thang/thang máy/lối vào, hướng mặt tiền, có sân trong/thông tầng không | Sơ đồ minh họa 3 tầng, có cảnh báo trên màn hình | Cấu hình → Phòng & sơ đồ (đánh dấu "đã khớp thực tế" sau khi chỉnh) |
| Số phòng thật (VD 201…) và phòng nào thuộc loại nào | 201–208, 301–308, 401–406 giả định | Cấu hình → Phòng & sơ đồ |
| Loại giường, sức chứa phòng đơn/đôi, tiện nghi, mô tả, ảnh thật từng loại phòng | Giường "Đang cập nhật"; sức chứa tạm (đơn 2, đôi 3, gia đình 2 NL + 2 TE theo yêu cầu) | Cấu hình → Phòng & sơ đồ → Loại phòng |
| Giờ nhận/trả phòng | 14:00 / 12:00 (tạm) | Cấu hình → Khách sạn |
| % cọc, chính sách hủy/hoàn tiền, phí không đến | Cọc 30%, hủy miễn phí trước 48 giờ, phí 100% đêm đầu (tạm) | Cấu hình → Giá & chính sách |
| Giá cuối tuần, lễ, mùa; mức phụ thu thêm người/trẻ em/giường phụ/nhận sớm/trả muộn | Chưa có (chỉ giá tham chiếu theo yêu cầu) | Cấu hình → Giá & chính sách / Khách sạn |
| Số điện thoại, email, Zalo, Facebook, nội dung giới thiệu, chính sách quyền riêng tư | Trống hoặc nội dung mẫu có ghi chú "cần xác nhận" | Cấu hình → Khách sạn / Website |
| Tài khoản ngân hàng nhận QR (mã BIN, số TK, tên chủ TK) | Chưa bật | Cấu hình → Thanh toán & tích hợp |
| Danh mục & đơn giá dịch vụ, hàng minibar, tồn đầu kỳ | Dữ liệu demo | Dịch vụ, Kho |
| SMTP, Zalo OA, nhà cung cấp hóa đơn điện tử, channel manager | Chưa có | [tich-hop.md](tich-hop.md) |

Ảnh website: dùng 4 ảnh thật được cung cấp (mặt tiền, cổng GLG Hotel Wellness, Mộc Spa, hàng rào tre/khu Kids), đã nén WebP 1920px và 960px. Ảnh thứ năm (sách và ấm trà) không phải ảnh khách sạn nên không dùng. Các ảnh minh họa do AI tạo trong bản trước đã được gỡ bỏ, và chế độ dữ liệu giả lập (tự báo đặt phòng thành công khi backend tắt) cũng đã bỏ.
