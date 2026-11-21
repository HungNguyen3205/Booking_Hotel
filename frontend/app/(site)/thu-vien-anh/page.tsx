import type { Metadata } from 'next';
import { getSite } from '@/lib/site-api';
import { PageHero, Unavailable } from '@/components/site/common';
import { GalleryAlbum } from '@/components/site/GalleryAlbum';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Thư viện ảnh',
  description: 'Hình ảnh thực tế của GLG HOTEL & SPA tại Đà Nẵng: mặt tiền cây xanh, cổng tre Wellness, Mộc Spa, khuôn viên và phòng nghỉ.',
  alternates: { canonical: '/thu-vien-anh' },
};

export default async function GalleryPage() {
  const data = await getSite();
  const gallery = data?.site.gallery ?? [];
  const rooms = (data?.room_types ?? []).filter(t => (t.images ?? []).length > 0);
  const empty = gallery.length === 0 && rooms.length === 0;
  return (
    <>
      <PageHero eyebrow="Hình ảnh" title="Thư viện ảnh" intro="Ảnh chụp thực tế tại GLG HOTEL & SPA. Bấm vào ảnh để xem lớn." />
      <div className="wrap albums" style={{ paddingBottom: 80 }}>
        {!data ? <Unavailable what="thư viện ảnh" /> : empty ? <p className="muted">Chưa có ảnh.</p> : (
          <>
            {gallery.length > 0 && <GalleryAlbum title="Khuôn viên & tiện ích" images={gallery} eager />}
            {rooms.map(t => (
              <GalleryAlbum key={t.id} title={t.name} note={`${t.area} m² · tối đa ${t.max_occupancy} khách`}
                href={`/phong/${t.slug}`} hrefLabel="Xem phòng" images={t.images ?? []} />
            ))}
          </>
        )}
      </div>
    </>
  );
}
