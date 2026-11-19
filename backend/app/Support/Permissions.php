<?php
namespace App\Support;

/**
 * Danh mục quyền theo hành động. Backend kiểm tra bằng middleware `perm:<key>`
 * và trong service cho các ngoại lệ (nhận phòng chưa sạch, ghi nợ...).
 * Vai trò được lưu trong bảng roles và chỉnh được ở Cấu hình → Phân quyền.
 */
final class Permissions
{
    public const GROUPS = [
        'Tổng quan' => [
            'dashboard.view' => 'Xem tổng quan',
            'revenue.view' => 'Xem doanh thu',
            'balance.view' => 'Xem khoản còn phải thu trên sơ đồ/lịch',
        ],
        'Phòng & giá' => [
            'rooms.view' => 'Xem sơ đồ, lịch phòng',
            'rooms.manage' => 'Quản lý tầng, phòng, loại phòng, sơ đồ, ngừng bán',
            'rates.manage' => 'Sửa giá, kế hoạch giá, chính sách',
        ],
        'Đặt phòng & lễ tân' => [
            'bookings.view' => 'Xem đặt phòng',
            'bookings.create' => 'Tạo đặt phòng',
            'bookings.edit' => 'Sửa, xác nhận, phân phòng',
            'bookings.cancel' => 'Hủy đặt phòng, đánh dấu không đến',
            'frontdesk.checkin' => 'Nhận phòng',
            'frontdesk.checkout' => 'Trả phòng',
            'frontdesk.move' => 'Chuyển phòng, đổi loại phòng',
            'frontdesk.extend' => 'Gia hạn, đổi ngày lưu trú',
            'frontdesk.override_dirty' => 'Ngoại lệ: nhận phòng chưa sẵn sàng',
            'frontdesk.debt_checkout' => 'Trả phòng khi còn nợ (ghi công nợ)',
        ],
        'Khách hàng' => [
            'guests.view' => 'Xem hồ sơ khách',
            'guests.manage' => 'Thêm, sửa, gộp hồ sơ khách',
            'guests.documents' => 'Xem/sửa số giấy tờ tùy thân',
            'guests.export' => 'Xuất danh sách lưu trú',
        ],
        'Buồng phòng & kỹ thuật' => [
            'housekeeping.view' => 'Xem công việc buồng phòng',
            'housekeeping.work' => 'Nhận và hoàn thành việc dọn',
            'housekeeping.manage' => 'Giao việc, đặt trạng thái buồng',
            'housekeeping.inspect' => 'Kiểm tra phòng trước khi sẵn sàng',
            'maintenance.report' => 'Báo hỏng',
            'maintenance.manage' => 'Xử lý sửa chữa, chặn phòng bảo trì',
        ],
        'Dịch vụ' => [
            'services.post' => 'Ghi phí dịch vụ',
            'services.void' => 'Hủy/điều chỉnh khoản phí',
            'services.manage' => 'Quản lý danh mục dịch vụ',
        ],
        'Tài chính' => [
            'payments.view' => 'Xem thanh toán, hồ sơ thanh toán',
            'payments.collect' => 'Thu cọc, thu tiền',
            'payments.refund' => 'Hoàn tiền',
            'discounts.apply' => 'Giảm giá',
            'folios.split' => 'Tách/gộp hồ sơ thanh toán',
            'shifts.manage' => 'Mở ca, chốt ca, bàn giao',
            'cashbook.manage' => 'Ghi thu chi',
        ],
        'Kho' => [
            'inventory.view' => 'Xem tồn kho',
            'inventory.manage' => 'Nhập, xuất, kiểm kê, điều chỉnh',
        ],
        'Nhân sự' => [
            'staff.view' => 'Xem nhân sự, lịch ca',
            'staff.manage' => 'Quản lý tài khoản, phân ca, phân quyền',
        ],
        'Báo cáo & hệ thống' => [
            'reports.view' => 'Xem báo cáo',
            'reports.export' => 'Xuất dữ liệu',
            'audit.view' => 'Xem nhật ký thao tác',
            'settings.manage' => 'Cấu hình khách sạn, tích hợp, nội dung website',
        ],
    ];

    /** @return string[] */
    public static function all(): array
    {
        return array_merge(...array_map('array_keys', array_values(self::GROUPS)));
    }

    public const ROLES = [
        'owner' => ['Chủ khách sạn', ['*']],
        'manager' => ['Quản lý', [
            'dashboard.view', 'revenue.view', 'balance.view', 'rooms.view', 'rooms.manage', 'rates.manage',
            'bookings.view', 'bookings.create', 'bookings.edit', 'bookings.cancel',
            'frontdesk.checkin', 'frontdesk.checkout', 'frontdesk.move', 'frontdesk.extend', 'frontdesk.override_dirty', 'frontdesk.debt_checkout',
            'guests.view', 'guests.manage', 'guests.documents', 'guests.export',
            'housekeeping.view', 'housekeeping.manage', 'housekeeping.inspect', 'maintenance.report', 'maintenance.manage',
            'services.post', 'services.void', 'services.manage',
            'payments.view', 'payments.collect', 'payments.refund', 'discounts.apply', 'folios.split', 'shifts.manage', 'cashbook.manage',
            'inventory.view', 'inventory.manage', 'staff.view', 'staff.manage', 'reports.view', 'reports.export', 'audit.view',
        ]],
        'receptionist' => ['Lễ tân', [
            'dashboard.view', 'balance.view', 'rooms.view', 'bookings.view', 'bookings.create', 'bookings.edit', 'bookings.cancel',
            'frontdesk.checkin', 'frontdesk.checkout', 'frontdesk.move', 'frontdesk.extend',
            'guests.view', 'guests.manage', 'guests.documents', 'housekeeping.view', 'maintenance.report',
            'services.post', 'payments.view', 'payments.collect', 'shifts.manage', 'inventory.view',
        ]],
        'accountant' => ['Kế toán', [
            'dashboard.view', 'revenue.view', 'balance.view', 'rooms.view', 'bookings.view', 'guests.view',
            'services.void', 'payments.view', 'payments.collect', 'payments.refund', 'folios.split', 'shifts.manage', 'cashbook.manage',
            'inventory.view', 'inventory.manage', 'reports.view', 'reports.export',
        ]],
        'housekeeping' => ['Buồng phòng', [
            'rooms.view', 'housekeeping.view', 'housekeeping.work', 'housekeeping.inspect', 'maintenance.report', 'services.post', 'inventory.view',
        ]],
        'technician' => ['Kỹ thuật', [
            'rooms.view', 'housekeeping.view', 'maintenance.report', 'maintenance.manage',
        ]],
    ];
}
