import { BarChart3, BedDouble, CalendarRange, ConciergeBell, LayoutDashboard, Settings, Sparkles, UserCog, Users, Wallet } from 'lucide-react';

export type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; perms: string[] };
// Menu gom theo luồng công việc; mỗi mục hiện khi người dùng có ít nhất một quyền liên quan.
export const NAV: { title: string; items: NavItem[] }[] = [
  { title: '', items: [{ href: '/admin', label: 'Việc hôm nay', icon: LayoutDashboard, perms: ['dashboard.view'] }] },
  { title: 'Lễ tân', items: [
    { href: '/admin/lich-phong', label: 'Sơ đồ & lịch phòng', icon: CalendarRange, perms: ['rooms.view'] },
    { href: '/admin/dat-phong', label: 'Đặt phòng', icon: BedDouble, perms: ['bookings.view'] },
    { href: '/admin/khach-hang', label: 'Khách hàng', icon: Users, perms: ['guests.view'] },
  ] },
  { title: 'Vận hành', items: [
    { href: '/admin/buong-phong', label: 'Buồng phòng & bảo trì', icon: Sparkles, perms: ['housekeeping.view'] },
    { href: '/admin/dich-vu', label: 'Dịch vụ & kho', icon: ConciergeBell, perms: ['services.post', 'inventory.view'] },
  ] },
  { title: 'Quản lý', items: [
    { href: '/admin/tai-chinh', label: 'Tài chính & ca', icon: Wallet, perms: ['payments.view'] },
    { href: '/admin/bao-cao', label: 'Báo cáo', icon: BarChart3, perms: ['reports.view'] },
    { href: '/admin/nhan-su', label: 'Nhân sự & quyền', icon: UserCog, perms: ['staff.view'] },
    { href: '/admin/cau-hinh', label: 'Cấu hình', icon: Settings, perms: ['rooms.view', 'settings.manage'] },
  ] },
];

