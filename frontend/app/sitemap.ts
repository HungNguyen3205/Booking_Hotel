import type { MetadataRoute } from 'next';
import { getPosts, getSite, SITE_URL } from '@/lib/site-api';

export const revalidate = 3600;

// Chỉ các trang công khai. Không gồm /admin, /api, trạng thái xác nhận hay trang tra cứu.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [site, articles, offers] = await Promise.all([getSite(), getPosts('article'), getPosts('offer')]);
  const statics: [string, number, MetadataRoute.Sitemap[number]['changeFrequency']][] = [
    ['/', 1, 'weekly'], ['/phong', 0.9, 'weekly'], ['/dat-phong', 0.8, 'monthly'], ['/tien-ich', 0.7, 'monthly'],
    ['/thu-vien-anh', 0.6, 'monthly'], ['/uu-dai', 0.6, 'weekly'], ['/bai-viet', 0.5, 'weekly'], ['/gioi-thieu', 0.6, 'monthly'],
    ['/lien-he', 0.7, 'yearly'], ['/chinh-sach', 0.4, 'yearly'], ['/quyen-rieng-tu', 0.3, 'yearly'],
  ];
  return [
    ...statics.map(([path, priority, changeFrequency]) => ({ url: `${SITE_URL}${path}`, priority, changeFrequency })),
    ...(site?.room_types ?? []).map(t => ({ url: `${SITE_URL}/phong/${t.slug}`, lastModified: t.updated_at, priority: 0.8, changeFrequency: 'monthly' as const })),
    ...[...(articles ?? []), ...(offers ?? [])].map(p => ({ url: `${SITE_URL}/bai-viet/${p.slug}`, lastModified: p.updated_at, priority: 0.5 })),
  ];
}
