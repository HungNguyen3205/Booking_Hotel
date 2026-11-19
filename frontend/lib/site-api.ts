// Gọi API công khai từ Server Components để nội dung chính được render sẵn cho công cụ tìm kiếm.

export const BACKEND = (process.env.HOTEL_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');

export type RoomType = {
  id: number; slug: string; name: string; short_description: string | null; description: string | null; area: number; bed: string | null;
  base_adults: number; max_adults: number; max_children: number; max_occupancy: number; max_extra_beds: number; base_rate: number;
  amenities: string[] | null; images: { url: string; alt: string }[] | null; seo_title: string | null; seo_description: string | null; updated_at: string;
};
export type RatePlan = {
  id: number; name: string; description: string | null; includes_breakfast: boolean; deposit_percent: number;
  refundable: boolean | null; free_cancel_hours: number | null; policy: string | null;
};
export type SiteData = {
  hotel: { name: string; address: string | null; phone: string | null; email: string | null; check_in_time: string; check_out_time: string; timezone: string; currency: string };
  site: {
    tagline: string; hero_title: string; hero_subtitle: string; about: string; map_url: string; zalo: string; facebook: string;
    amenities: { icon: string; title: string; text: string }[]; gallery: { url: string; alt: string }[];
  };
  policies: { booking: string; cancellation: string; privacy: string };
  room_types: RoomType[];
  rate_plans: RatePlan[];
  payment_qr_enabled: boolean;
};
export type PostSummary = { slug: string; title: string; excerpt: string | null; cover: string | null; cover_alt: string | null;
  valid_from: string | null; valid_to: string | null; published_at: string; updated_at: string };
export type Post = PostSummary & { type: 'article' | 'offer'; body: string };

async function fetchJson<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const res = await fetch(`${BACKEND}/api/public${path}`, { headers: { Accept: 'application/json' }, next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // backend tạm thời không truy cập được: trang hiển thị trạng thái lỗi rõ ràng
  }
}

export const getSite = () => fetchJson<SiteData>('/site');
export const getRoomType = (slug: string) => fetchJson<RoomType>(`/room-types/${encodeURIComponent(slug)}`);
export const getPosts = (type: 'article' | 'offer' = 'article') => fetchJson<PostSummary[]>(`/posts?type=${type}`);
export const getPost = (slug: string) => fetchJson<Post>(`/posts/${encodeURIComponent(slug)}`);
