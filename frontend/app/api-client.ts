import { handleMockRequest } from './mock-data';

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
  try {
    const response = await fetch('/api' + path, {
      method,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(csrf && { 'X-CSRF-TOKEN': csrf }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return await response.json();
    }

    // Nếu backend đang online nhưng trả mã lỗi 4xx hợp lệ (trừ 404)
    if (response.status >= 400 && response.status < 500 && response.status !== 404) {
      const payload = await response.json().catch(() => null);
      if (payload && (payload.errors || payload.message)) {
        const fields = Object.values(payload?.errors ?? {}).flat();
        const message =
          {
            401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
            419: 'Phiên làm việc đã hết hạn. Vui lòng tải lại trang.',
            429: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.',
          }[response.status as 401 | 419 | 429];
        throw new Error(message || (fields[0] as string) || payload?.message || 'Có lỗi xảy ra.');
      }
    }
  } catch (error: any) {
    // Nếu là lỗi nghiệp vụ do throw ở trên, rethrow
    if (
      error instanceof Error &&
      !error.message.includes('fetch') &&
      !error.message.includes('Failed') &&
      !error.message.includes('NetworkError')
    ) {
      throw error;
    }
  }

  // Tự động chuyển sang Mock Data khi Backend chưa online hoặc deploy độc lập
  return handleMockRequest<T>(path, method, body);
}
