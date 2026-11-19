import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRoomType, getSite, SITE_URL } from '@/lib/site-api';
import { capacityText, JsonLd, Paragraphs, PhotoPlaceholder, RoomCard } from '@/components/site/common';
import { SearchForm } from '@/components/site/SearchForm';
import { money } from '@/lib/format';

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await getRoomType(slug);
  if (!t) return { title: 'Loại phòng', robots: { index: false } };
  return {
    title: t.seo_title || `${t.name} ${t.area} m²`,
    description: t.seo_description || t.short_description || `${t.name} tại GLG HOTEL & SPA Đà Nẵng: ${t.area} m², ${capacityText(t).toLowerCase()}.`,
    alternates: { canonical: `/phong/${t.slug}` },
    openGraph: t.images?.[0] ? { images: [{ url: t.images[0].url, alt: t.images[0].alt }] } : undefined,
  };
}

export default async function RoomTypePage({ params }: Props) {
  const { slug } = await params;
  const [t, site] = await Promise.all([getRoomType(slug), getSite()]);
  if (!t) notFound();
  const others = (site?.room_types ?? []).filter(r => r.id !== t.id);
  const images = t.images ?? [];

  return (
    <>
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'HotelRoom', name: t.name, url: `${SITE_URL}/phong/${t.slug}`,
        ...(t.description && { description: t.description }),
        floorSize: { '@type': 'QuantitativeValue', value: t.area, unitCode: 'MTK' },
        occupancy: { '@type': 'QuantitativeValue', maxValue: t.max_occupancy },
        ...(t.bed && { bed: t.bed }),
        ...(images.length && { image: images.map(i => (i.url.startsWith('http') ? i.url : `${SITE_URL}${i.url}`)) }),
        containedInPlace: { '@type': 'Hotel', name: site?.hotel.name ?? 'GLG HOTEL & SPA', url: SITE_URL },
      }} />
      <section className="page-hero">
        <div className="wrap">
          <nav className="breadcrumb" aria-label="Đường dẫn"><Link href="/">Trang chủ</Link> / <Link href="/phong">Loại phòng</Link> / <span>{t.name}</span></nav>
          <h1>{t.name}</h1>
          {t.short_description && <p>{t.short_description}</p>}
        </div>
      </section>
      <section className="wrap detail" style={{ paddingBottom: 56 }}>
        <div className="stack" style={{ gap: 24 }}>
          {images.length ? (
            <div className="gallery">
              {images.map(img => <figure key={img.url}><div className="photo"><Image src={img.url} alt={img.alt} fill sizes="(max-width: 700px) 100vw, 400px"
                unoptimized={!img.url.startsWith('/images/')} /></div></figure>)}
            </div>
          ) : <PhotoPlaceholder />}
          <dl className="spec">
            <div><dt>Diện tích</dt><dd>{t.area} m²</dd></div>
            <div><dt>Giường</dt><dd>{t.bed ?? 'Đang cập nhật'}</dd></div>
            <div><dt>Sức chứa</dt><dd>{t.max_adults} người lớn{t.max_children ? ` + ${t.max_children} trẻ em` : ''}</dd></div>
            <div><dt>Tổng khách tối đa</dt><dd>{t.max_occupancy}</dd></div>
          </dl>
          <div className="prose"><h2>Mô tả</h2><Paragraphs text={t.description ?? 'Nội dung mô tả đang được cập nhật.'} /></div>
          <div className="stack">
            <h2 className="serif" style={{ fontSize: 26 }}>Tiện nghi</h2>
            {t.amenities?.length ? <ul className="chips">{t.amenities.map(a => <li key={a}>{a}</li>)}</ul>
              : <p className="muted">Danh sách tiện nghi đang được cập nhật.</p>}
          </div>
        </div>
        <aside className="card sticky-card" aria-label="Đặt phòng">
          <p className="price">Từ <strong>{money(t.base_rate)}</strong> / đêm</p>
          <p className="tiny muted">Giá tham khảo ngày thường. Giá theo ngày, cuối tuần, lễ và phụ thu (nếu có) được tính chính xác ở bước chọn ngày.</p>
          <Link className="btn btn-primary btn-block" href={`/dat-phong?room=${t.slug}`}>Đặt {t.name}</Link>
          <p className="tiny muted">{capacityText(t)}.</p>
        </aside>
      </section>
      <section className="section section-alt">
        <div className="wrap stack" style={{ gap: 20 }}>
          <h2 className="serif" style={{ fontSize: 28 }}>Kiểm tra phòng trống</h2>
          <SearchForm room={t.slug} />
        </div>
      </section>
      {others.length > 0 && (
        <section className="section">
          <div className="wrap">
            <div className="section-head"><h2>Loại phòng khác</h2></div>
            <div className="room-grid">{others.map(r => <RoomCard key={r.id} t={r} />)}</div>
          </div>
        </section>
      )}
    </>
  );
}
