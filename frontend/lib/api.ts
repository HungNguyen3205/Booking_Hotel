'use client';

// API client phía trình duyệt. Next.js chuyển tiếp /api/* sang Laravel nên cookie phiên và CSRF cùng origin.
// Không có chế độ giả lập: khi backend không phản hồi, giao diện hiển thị lỗi thật.

export class ApiError extends Error {
  constructor(message: string, public status: number, public fields: Record<string, string[]> = {}) {
    super(message);
  }
}

let csrfToken = '';
let propertyId = '';

export function setCsrf(token: string) {
  csrfToken = token;
}
export function setPropertyId(id: number | string) {
  propertyId = String(id);
}

async function ensureCsrf() {
  if (!csrfToken) {
    const s = await fetch('/api/session', { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (s.ok) csrfToken = (await s.json()).csrf;
  }
}

const STATUS_TEXT: Record<number, string> = {
  401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy dữ liệu.',
  419: 'Phiên làm việc đã hết hạn. Vui lòng tải lại trang.',
  429: 'Thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  503: 'Dịch vụ chưa được cấu hình hoặc đang tạm ngưng.',
};

export async function api<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (method !== 'GET') await ensureCsrf();
  let response: Response;
  try {
    response = await fetch('/api' + path, {
      method,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && !(body instanceof FormData) && { 'Content-Type': 'application/json' }),
        ...(csrfToken && { 'X-CSRF-TOKEN': csrfToken }),
        ...(propertyId && { 'X-Property-Id': propertyId }),
      },
      ...(body !== undefined && { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError('Không kết nối được máy chủ. Kiểm tra mạng hoặc backend.', 0);
  }
  if (response.status === 419 && method !== 'GET') {
    csrfToken = '';
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const fields = (payload?.errors ?? {}) as Record<string, string[]>;
    const first = Object.values(fields).flat()[0];
    const message = first || (response.status >= 500 ? 'Máy chủ gặp lỗi. Vui lòng thử lại.' : payload?.message) || STATUS_TEXT[response.status] || 'Có lỗi xảy ra.';
    if (response.status === 401 && typeof window !== 'undefined' && window.location.pathname.startsWith('/admin') && !path.startsWith('/login')) {
      window.dispatchEvent(new CustomEvent('glg:unauthorized'));
    }
    throw new ApiError(message, response.status, fields);
  }
  return payload as T;
}

export const get = <T,>(path: string) => api<T>(path);
export const post = <T,>(path: string, body: unknown = {}) => api<T>(path, 'POST', body);
export const put = <T,>(path: string, body: unknown = {}) => api<T>(path, 'PUT', body);
export const patch = <T,>(path: string, body: unknown = {}) => api<T>(path, 'PATCH', body);
export const del = <T,>(path: string) => api<T>(path, 'DELETE');

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
