import type { Metadata } from 'next';
import Image from 'next/image';
import { getSite } from '@/lib/site-api';
import { PageHero, Unavailable } from '@/components/site/common';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Thư viện ảnh',
  description: 'Hình ảnh thực tế của GLG HOTEL & SPA tại Đà Nẵng: mặt tiền cây xanh, cổng tre Wellness, Mộc Spa và khuôn viên.',
  alternates: { canonical: '/thu-vien-anh' },
};

export default async function GalleryPage() {
  const data = await getSite();
  const gallery = data?.site.gallery ?? [];
  const rooms = (data?.room_types ?? []).flatMap(t => (t.images ?? []).map(i => ({ ...i, caption: t.name })));
  return (
    <>
      <PageHero eyebrow="Hình ảnh" title="Thư viện ảnh" intro="Ảnh chụp thực tế tại khách sạn. Ảnh từng loại phòng sẽ được bổ sung khi khách sạn cập nhật." />
      <section className="wrap" style={{ paddingBottom: 72 }}>
        {!data ? <Unavailable what="thư viện ảnh" /> : gallery.length + rooms.length === 0 ? <p className="muted">Chưa có ảnh.</p> : (
          <div className="gallery">
            {[...gallery.map(g => ({ ...g, caption: g.alt })), ...rooms].map(g => (
              <figure key={g.url}>
                <div className="photo"><Image src={g.url} alt={g.alt} fill sizes="(max-width: 700px) 100vw, 400px" unoptimized={!g.url.startsWith('/images/')} /></div>
                <figcaption>{g.caption}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
