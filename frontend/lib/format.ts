// Định dạng & nhãn dùng chung cho website và admin. Tiền luôn là số nguyên VND.

export const TZ = 'Asia/Ho_Chi_Minh';

const vnd = new Intl.NumberFormat('vi-VN');
export const money = (value: number | null | undefined) => (value == null ? '—' : `${vnd.format(Math.round(value))}đ`);

export function todayISO(offset = 0): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date(Date.now() + offset * 86400000));
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** 2026-11-19 -> 19/11/2026 (hoặc 19/11 khi short) */
export function dateVN(iso: string | null | undefined, short = false): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return short ? `${d}/${m}` : `${d}/${m}/${y}`;
}

export function dateTimeVN(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .format(new Date(iso));
}

export function timeVN(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];

export const BOOKING_STATUS: Record<string, string> = {
  hold: 'Giữ chỗ', confirmed: 'Xác nhận', checked_in: 'Đã nhận phòng', checked_out: 'Đã trả phòng', cancelled: 'Đã hủy', no_show: 'Không đến',
};
export const HOUSEKEEPING: Record<string, string> = { dirty: 'Bẩn', cleaning: 'Đang dọn', inspecting: 'Chờ kiểm tra', clean: 'Sạch' };
export const AVAILABILITY: Record<string, string> = { active: 'Hoạt động', maintenance: 'Bảo trì', out_of_service: 'Ngừng bán' };
export const OCCUPANCY: Record<string, string> = {
  vacant: 'Trống', occupied: 'Đang ở', arriving: 'Sắp đến', departing: 'Sắp trả', reserved: 'Đã đặt',
};
export const SOURCES: Record<string, string> = { direct: 'Trực tiếp', phone: 'Điện thoại', website: 'Website', agent: 'Đại lý', ota: 'OTA' };
export const PAYMENT_KIND: Record<string, string> = { deposit: 'Cọc', payment: 'Thanh toán', refund: 'Hoàn tiền' };
export const LINE_TYPE: Record<string, string> = { service: 'Dịch vụ', surcharge: 'Phụ thu', discount: 'Giảm giá', adjustment: 'Điều chỉnh', fee: 'Phí' };

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.';
}
