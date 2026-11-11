export type Room = {
  id: number; number?: string; name: string; description: string; image: string | null;
  price: number; capacity: number; area: number; bed: string; active?: boolean;
};
export type Status = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
export type Booking = {
  code: string; room_name: string; check_in: string; check_out: string; guests: number;
  total: number; status: Status; paid_at: string | null;
};
export type User = { id: number; name: string; email: string; role: 'admin' | 'staff' };
export type Session = { csrf: string; user: User | null };
export const statusLabels: Record<Status, string> = {
  pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', checked_in: 'Đang lưu trú',
  checked_out: 'Đã trả phòng', cancelled: 'Đã hủy',
};
export const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
export const errorText = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.';
export function hotelDate(offset = 0) {
  const date = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
}
export function dateLabel(date: string) {
  return date.split('-').reverse().join('/');
}
export async function api<T>(path: string, method = 'GET', body?: unknown, csrf?: string): Promise<T> {
  const response = await fetch('/api' + path, {
    method, cache: 'no-store',
    headers: { Accept: 'application/json', ...(body !== undefined && {'Content-Type': 'application/json'}), ...(csrf && {'X-CSRF-TOKEN': csrf}) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const fields = Object.values(payload?.errors ?? {}).flat();
    const message = {401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 419: 'Phiên làm việc đã hết hạn. Vui lòng tải lại trang.', 429: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.'}[response.status as 401 | 419 | 429];
    throw new Error(message || fields[0] as string || payload?.message || 'Không thể kết nối với hệ thống.');
  }
  return payload as T;
}
