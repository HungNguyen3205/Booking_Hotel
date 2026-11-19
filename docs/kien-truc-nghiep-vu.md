# Kiến trúc, cơ sở dữ liệu và nghiệp vụ

## 1. Kiến trúc

```
Trình duyệt ──► Next.js (frontend/)
                 ├─ app/(site)/**      Website công khai, Server Components render sẵn nội dung (SEO)
                 ├─ app/admin/**       Trang quản trị (client), không lập chỉ mục
                 └─ rewrite /api/* ──► Laravel (backend/)
                                         ├─ routes/web.php            API: /api/public/*, /api/admin/*, /api/webhooks/*
                                         ├─ Http/Middleware            auth (session) · property (cơ sở) · perm:<quyền>
                                         ├─ Http/Controllers           kiểm tra đầu vào, phạm vi cơ sở
                                         ├─ Services/                  toàn bộ nghiệp vụ, chạy trong transaction
                                         └─ Models/ + migrations       SQLite / MySQL
```

| Service | Trách nhiệm |
| --- | --- |
| `AvailabilityService` | Tồn phòng dùng chung cho admin và website; giữ/giải phóng phòng-đêm; tự hủy giữ chỗ quá hạn |
| `PricingService` | Giá từng đêm theo quy tắc, % kế hoạch giá, phụ thu; tiền cọc |
| `BookingService` | Tạo đặt phòng nhiều phòng, xác nhận, giữ chỗ, hủy, không đến, phân phòng |
| `FrontDeskService` | Nhận/trả phòng, gia hạn/đổi ngày, chuyển phòng/đổi loại phòng |
| `FolioService` | Hồ sơ thanh toán: phí, giảm giá, dòng đảo, thu/hoàn tiền, tách/gộp, đối soát |
| `HousekeepingService` | Bẩn → Đang dọn → Chờ kiểm tra → Sạch, giao việc, checklist |
| `RoomBlockService` | Bảo trì / ngừng bán theo khoảng ngày |
| `InventoryService` | Nhập/xuất/kiểm kê/điều chỉnh/hỏng/mất, bán minibar trừ kho một lần |
| `ReportService` | Doanh thu, công suất, ADR, RevPAR, nguồn khách, công nợ |
| `NotificationService`, `VietQr` | Thông báo theo kênh đã cấu hình; chuỗi VietQR tạo cục bộ |
| `Audit` | Nhật ký thao tác (người, thời điểm, lý do, thay đổi đã lọc dữ liệu nhạy cảm) |

**Phân quyền**: 41 quyền theo hành động (`app/Support/Permissions.php`), 6 vai trò mặc định (Chủ, Quản lý, Lễ tân, Kế toán, Buồng phòng, Kỹ thuật) lưu trong bảng `roles`, sửa được ở Nhân sự. Mỗi route admin gắn middleware `perm:*`; các ngoại lệ (nhận phòng chưa sạch, trả phòng khi còn nợ, xem số giấy tờ) kiểm tra thêm trong service. Người dùng chỉ thao tác trên cơ sở được gán (`property_user`, header `X-Property-Id`). Giao diện chỉ ẩn nút — backend luôn kiểm tra lại.

## 2. Cơ sở dữ liệu (rút gọn)

| Nhóm | Bảng |
| --- | --- |
| Hệ thống | `properties`, `users`, `roles`, `property_user`, `settings`, `audit_logs`, `sessions`, `cache`, `write_gate` |
| Phòng & giá | `floors` (kích thước sơ đồ, mốc định hướng), `room_types`, `rooms` (tọa độ/kích thước/hướng cửa trên sơ đồ, trạng thái buồng), `room_blocks`, `rate_plans`, `rate_rules`, `cancellation_policies` |
| Đặt phòng | `customers` (khách, công ty, đại lý), `bookings`, `stays` (mỗi phòng một lượt ở), `stay_guests`, `stay_nights` (giá chụp từng đêm), `room_nights` (khóa tồn) |
| Tiền | `folios`, `folio_lines`, `payments`, `payment_methods`, `shifts`, `cash_entries`, `webhook_events` |
| Vận hành | `housekeeping_tasks`, `maintenance_tickets`, `lost_items`, `services`, `service_packages`, `inventory_items`, `inventory_movements`, `staff_shifts`, `feedback`, `notifications_outbox`, `posts` |

Tiền là số nguyên VND (`bigInteger`). Số giấy tờ tùy thân được mã hóa (`encrypted` cast, khóa `APP_KEY`), kèm HMAC để kiểm tra trùng mà không lộ số.

## 3. Mô hình trạng thái (ba trục độc lập)

| Trục | Lưu ở | Giá trị |
| --- | --- | --- |
| Đặt phòng / lưu trú | `stays.status` (đặt phòng = tổng hợp các lượt ở) | Giữ chỗ → Xác nhận → Đã nhận phòng → Đã trả phòng; nhánh Hủy, Không đến |
| Buồng phòng | `rooms.housekeeping` | Bẩn → Đang dọn → Chờ kiểm tra → Sạch (bỏ bước kiểm tra nếu tắt `require_inspection`) |
| Khả năng sử dụng | `room_blocks` theo ngày | Hoạt động / Bảo trì / Ngừng bán |

Một phòng có thể đồng thời "có khách đến hôm nay" và "Bẩn". Sơ đồ tô màu theo ưu tiên: chặn bán > đang ở > sắp đến > cần dọn > trống sẵn sàng, và luôn kèm chữ + biểu tượng.

## 4. Quy tắc tồn phòng và chống bán trùng

- Lượt ở chiếm các **đêm** `[check_in, check_out)`. Ngày trả không tính đêm → khách trước trả và khách sau nhận cùng ngày không xung đột tồn. Việc nhận phòng vẫn bị chặn cho tới khi khách trước đã trả phòng và phòng **Sạch** (trừ người có quyền ngoại lệ + lý do).
- `room_nights(room_id, night)` là **khóa chính**: một phòng-đêm chỉ thuộc một lượt ở hoặc một khoảng chặn. Mọi thao tác tạo/đổi ngày/chuyển phòng/chặn chạy trong transaction; lần ghi trùng bị CSDL từ chối và trả 409.
- SQLite: giao dịch giành khóa ghi ngay từ đầu (`ImmediateSQLiteConnection`) nên yêu cầu đồng thời xếp hàng thay vì lỗi. MySQL: khóa chính InnoDB đảm bảo tương tự.
- Đặt theo loại phòng: hệ thống tự phân một phòng trống cụ thể (`room_locked = false`) để khóa tồn ngay; lễ tân đổi phòng cùng loại bất kỳ lúc nào trước khi nhận phòng.
- Website và admin gọi cùng `AvailabilityService::byType/freeRooms` → tồn luôn nhất quán. Website chỉ thấy "còn phòng/hết phòng" và tối đa "còn 5", không thấy số phòng, tên khách hay trạng thái nội bộ.
- Giữ chỗ có hạn (`hold_expires_at`, mặc định 120 phút, cấu hình được). Hết hạn → tự hủy, giải phóng phòng-đêm, hủy giá các đêm, ghi nhật ký. Thu cọc hoặc webhook báo có → tự xác nhận.

## 5. Giá

Giá mỗi đêm chọn theo thứ tự (`PricingService`):

1. Quy tắc có `priority` cao hơn thắng.
2. Cùng priority: **Lễ > Mùa > Cuối tuần**.
3. Cùng loại: quy tắc gắn riêng kế hoạch giá > quy tắc dùng chung.
4. Cùng hết: quy tắc tạo sau thắng.
5. Không khớp: giá cơ sở (ngày thường) của loại phòng.

Sau đó áp dụng `% điều chỉnh` của kế hoạch giá, làm tròn (mặc định 1.000đ), cộng phụ thu thêm người lớn/trẻ em/giường phụ theo đêm. Kết quả từng đêm được **chụp** vào `stay_nights` (giá, phụ thu, nhãn quy tắc) — đổi bảng giá sau đó không làm sai lịch sử. Gia hạn: đêm thêm tính theo bảng giá hiện hành; đêm cũ giữ giá đã chụp. Đổi loại phòng: chọn giữ giá (nâng hạng) hoặc tính lại.

Website gửi `expected_total`; nếu giá đổi giữa lúc xem và lúc đặt → 409 "giá đã thay đổi". Lễ tân gửi `expected_delta` khi xác nhận gia hạn/chuyển phòng đã xem trước.

## 6. Tiền: phân biệt rõ các khái niệm

| Khái niệm | Cách tính |
| --- | --- |
| Phát sinh (charges) | Đêm phòng chưa hủy + dòng phí (dịch vụ, phụ thu, phí hủy/no-show, giảm giá âm, điều chỉnh, dòng đảo) |
| Tiền cọc | Khoản thu loại `deposit` |
| Đã thu | Cọc + thanh toán − hoàn tiền, chỉ khoản `completed` |
| Còn phải thu | Phát sinh − Đã thu |
| Doanh thu | Ghi nhận theo **đêm ở** (phòng) và **ngày phát sinh** (dịch vụ), chỉ lượt đã nhận/đã trả phòng |
| Công nợ | Đặt phòng đã nhận/đã trả/đã hủy còn phải thu > 0, theo người chịu (khách, công ty, đại lý) |

- Không xóa giao dịch: hủy phí bằng **dòng đảo**, sửa thu chi bằng **bút toán đảo**, hoàn tiền bằng **phiếu chi**.
- Thu vượt số còn phải thu bị chặn; hoàn vượt số đã thu bị chặn; giảm giá vượt tổng phát sinh bị chặn.
- Khách bấm "đã chuyển khoản" chỉ tạo khoản **chờ đối soát** (`pending`), không tính vào đã thu cho tới khi nhân viên đối soát hoặc webhook ngân hàng hợp lệ.
- Tiền mặt yêu cầu ca đang mở. Chốt ca: tiền dự kiến = đầu ca + thu tiền mặt − hoàn/chi tiền mặt; lệch phải ghi lý do.
- Phiếu thu/bảng kê là chứng từ nội bộ. Hệ thống **không** phát hành hóa đơn điện tử (chưa kết nối nhà cung cấp).

## 7. Báo cáo — cách tính

- Kỳ báo cáo theo ngày vận hành (Asia/Ho_Chi_Minh), gồm cả ngày đầu và ngày cuối.
- Phòng-đêm khả dụng = số phòng đang sử dụng × số ngày − phòng-đêm bị chặn (bảo trì/ngừng bán). **Phòng ngừng bán/bảo trì bị loại khỏi mẫu số** và báo cáo riêng.
- Công suất = đã bán ÷ khả dụng; ADR = doanh thu phòng ÷ phòng-đêm đã bán; RevPAR = doanh thu phòng ÷ phòng-đêm khả dụng.
- Doanh thu dịch vụ gồm cả bán dịch vụ lẻ (khách không lưu trú) ghi qua sổ thu.
- Đặt phòng tương lai (giữ chỗ/xác nhận) báo riêng là "đã đặt chưa ở", không tính doanh thu.
- Xuất CSV UTF-8 (mở bằng Excel) và in/lưu PDF từ trình duyệt.

## 8. Sơ đồ chữ U

- Mỗi tầng có `map_width × map_height` và danh sách mốc (`landmarks`: hành lang, sân trong, cầu thang, thang máy, lối vào, mặt tiền, quầy, kho…). Mỗi phòng có `map_x/y/w/h`, `wing` (trái/đáy/phải) và `door_side` (cạnh có cửa, vẽ bằng vạch đậm). Không gắn bố cục vào mã nguồn.
- Dữ liệu ban đầu là **sơ đồ minh họa** (`layout_confirmed = false`, giao diện hiện cảnh báo): 3 tầng (2, 3, 4), mỗi tầng ba dãy theo chữ U, khoảng giữa để trống trung tính. Số tầng, vị trí cầu thang và thứ tự phòng là giả định cho tới khi có mặt bằng thật.
- Mặt bằng và lịch phòng đọc cùng `rooms`, `stays`, `room_nights`, `room_blocks`.
