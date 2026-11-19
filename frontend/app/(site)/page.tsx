import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Clock, MapPin } from 'lucide-react';
import { getSite, SITE_URL } from '@/lib/site-api';
import { JsonLd, RoomCard, Unavailable } from '@/components/site/common';
import { AmenityIcon } from '@/components/site/AmenityIcon';
import { SearchForm } from '@/components/site/SearchForm';

export const revalidate = 60;

export const metadata: Metadata = {
  title: { absolute: 'GLG HOTEL & SPA · Khách sạn boutique tại 1081 Ngô Quyền, Đà Nẵng' },
  description: 'Khách sạn boutique gần gũi thiên nhiên tại 1081 Ngô Quyền, Đà Nẵng: phòng đơn, phòng đôi, phòng gia đình, Mộc Spa. Xem phòng trống và đặt trực tiếp.',
  alternates: { canonical: '/' },
};

export default async function HomePage() {
  const data = await getSite();
  const site = data?.site;
  const hotel = data?.hotel;

  const jsonLd = data && {
    '@context': 'https://schema.org',
    '@type': 'Hotel',
    name: hotel!.name,
    url: SITE_URL,
    address: { '@type': 'PostalAddress', streetAddress: hotel!.address?.split(',')[0]?.trim() ?? '1081 Ngô Quyền', addressLocality: 'Đà Nẵng', addressCountry: 'VN' },
    ...(hotel!.phone && { telephone: hotel!.phone }),
    ...(hotel!.email && { email: hotel!.email }),
    checkinTime: hotel!.check_in_time,
    checkoutTime: hotel!.check_out_time,
    currenciesAccepted: hotel!.currency,
    image: (site?.gallery ?? []).map(g => `${SITE_URL}${g.url}`),
    ...(site?.map_url && { hasMap: site.map_url }),
  };

  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <section className="hero">
        <Image src="/images/glg/mat-tien.webp" alt="Mặt tiền GLG HOTEL & SPA với mặt kính phủ cây xanh tại góc đường Ngô Quyền, Đà Nẵng"
          fill priority sizes="100vw" className="hero-img" />
        <div className="wrap hero-inner">
          <div className="eyebrow">{site?.tagline ?? 'Hotel · Spa · Wellness'} · Đà Nẵng</div>
          <h1>{site?.hero_title ?? 'GLG HOTEL & SPA'}</h1>
          {site?.hero_subtitle && <p>{site.hero_subtitle}</p>}
          <div className="row"><Link className="btn btn-bronze" href="/dat-phong">Đặt phòng trực tiếp</Link>
            <Link className="btn" href="/phong">Xem các loại phòng</Link></div>
        </div>
      </section>

      <div className="wrap search-float"><SearchForm /></div>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div><div className="eyebrow">Phòng nghỉ</div><h2>Chọn không gian cho chuyến đi</h2></div>
            <Link className="link-arrow" href="/phong">Tất cả loại phòng <ArrowRight size={15} aria-hidden /></Link>
          </div>
          {!data ? <Unavailable what="danh sách phòng" /> : data.room_types.length === 0
            ? <p className="muted">Thông tin loại phòng đang được cập nhật.</p>
            : <div className="room-grid">{data.room_types.map(t => <RoomCard key={t.id} t={t} />)}</div>}
        </div>
      </section>

      {site && site.amenities.length > 0 && (
        <section className="section section-alt">
          <div className="wrap">
            <div className="section-head">
              <div><div className="eyebrow">Tiện ích</div><h2>Thư giãn ngay trong khuôn viên</h2></div>
              <Link className="link-arrow" href="/tien-ich">Tiện ích &amp; dịch vụ <ArrowRight size={15} aria-hidden /></Link>
            </div>
            <div className="amenity-grid">
              {site.amenities.map(a => (
                <div className="amenity" key={a.title}><AmenityIcon name={a.icon} /><h3>{a.title}</h3>{a.text && <p>{a.text}</p>}</div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="wrap split">
          <div className="photo"><Image src="/images/glg/moc-spa.webp" alt="Lối vào Mộc Spa Massage với bảng gỗ khắc chữ và trang trí tre"
            fill sizes="(max-width: 960px) 100vw, 600px" /></div>
          <div className="stack">
            <div className="eyebrow">Về GLG</div>
            <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,40px)' }}>Tre, gỗ, kính và cây xanh</h2>
            {site?.about && <p className="muted">{site.about}</p>}
            <div className="row">
              <Link className="link-arrow" href="/gioi-thieu">Giới thiệu <ArrowRight size={15} aria-hidden /></Link>
              <Link className="link-arrow" href="/thu-vien-anh">Thư viện ảnh <ArrowRight size={15} aria-hidden /></Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="wrap split">
          <div className="stack">
            <div className="eyebrow">Vị trí</div>
            <h2 className="serif" style={{ fontSize: 'clamp(28px,4vw,40px)' }}>Ghé thăm chúng tôi</h2>
            <ul className="contact-list">
              {hotel?.address && <li><MapPin size={18} aria-hidden /><span>{hotel.address}</span></li>}
              {hotel && <li><Clock size={18} aria-hidden /><span>Nhận phòng từ {hotel.check_in_time} · Trả phòng trước {hotel.check_out_time}</span></li>}
            </ul>
            <div className="row">
              {site?.map_url && <a className="btn" href={site.map_url} target="_blank" rel="noopener noreferrer">Mở bản đồ</a>}
              <Link className="btn btn-primary" href="/lien-he">Liên hệ</Link>
            </div>
          </div>
          <div className="photo"><Image src="/images/glg/cong-wellness.webp" alt="Cổng tre và bảng gỗ GLG Hotel Wellness giữa cây xanh"
            fill sizes="(max-width: 960px) 100vw, 520px" /></div>
        </div>
      </section>
    </>
  );
}
