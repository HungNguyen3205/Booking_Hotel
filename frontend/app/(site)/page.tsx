import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Clock, MapPin } from 'lucide-react';
import { getSite, SITE_URL } from '@/lib/site-api';
import { JsonLd, Unavailable } from '@/components/site/common';
import { AmenityIcon } from '@/components/site/AmenityIcon';
import { SearchForm } from '@/components/site/SearchForm';
import { RoomExplorer } from '@/components/site/RoomExplorer';

export const revalidate = 60;

export const metadata: Metadata = {
  title: { absolute: 'GLG HOTEL & SPA · Khách sạn boutique tại 1081 Ngô Quyền, Đà Nẵng' },
  description: 'Khách sạn boutique gần gũi thiên nhiên tại 1081 Ngô Quyền, Đà Nẵng: phòng đơn, phòng đôi, phòng gia đình, Mộc Spa. Xem phòng trống và đặt trực tiếp.',
  alternates: { canonical: '/' },
};

/** Tách phần cuối tiêu đề thành chữ nghiêng làm điểm nhấn: "… để nghỉ lại / giữa nhịp sống Đà Nẵng". */
function HeroTitle({ text }: { text: string }) {
  const i = text.indexOf(' giữa ');
  if (i < 0) return <h1 className="hero-title"><span className="line">{text}</span></h1>;
  return <h1 className="hero-title"><span className="line">{text.slice(0, i)}</span> <em className="line">{text.slice(i + 1)}</em></h1>;
}

// Ảnh minh họa cho tiện ích có ảnh thật tương ứng; tiện ích khác hiển thị bằng chữ, không mượn ảnh.
const AMENITY_PHOTO: Record<string, { src: string; alt: string }> = {
  spa: { src: '/images/glg/moc-spa.webp', alt: 'Lối vào Mộc Spa Massage: bảng gỗ khắc chữ, mái lá và nhà chim gỗ' },
  kids: { src: '/images/glg/khu-kids.webp', alt: 'Cửa khu vui chơi Kids trang trí hình phi hành gia trên hàng rào tre' },
};

export default async function HomePage() {
  const data = await getSite();
  const site = data?.site;
  const hotel = data?.hotel;
  const amenities = site?.amenities ?? [];
  const featured = amenities.filter(a => AMENITY_PHOTO[a.icon]);
  const quiet = amenities.filter(a => !AMENITY_PHOTO[a.icon]);

  const jsonLd = data && {
    '@context': 'https://schema.org', '@type': 'Hotel', name: hotel!.name, url: SITE_URL,
    address: { '@type': 'PostalAddress', streetAddress: hotel!.address?.split(',')[0]?.trim() ?? '1081 Ngô Quyền', addressLocality: 'Đà Nẵng', addressCountry: 'VN' },
    ...(hotel!.phone && { telephone: hotel!.phone }), ...(hotel!.email && { email: hotel!.email }),
    checkinTime: hotel!.check_in_time, checkoutTime: hotel!.check_out_time, currenciesAccepted: hotel!.currency,
    image: (site?.gallery ?? []).map(g => `${SITE_URL}${g.url}`), ...(site?.map_url && { hasMap: site.map_url }),
  };

  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}

      {/* Ấn tượng */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-media">
          <Image src="/images/glg/cong-wellness.webp" alt="Cổng tre và bảng gỗ GLG Hotel Wellness giữa tán cây xanh" fill preload sizes="100vw" className="hero-img" />
        </div>
        <div className="wrap hero-inner">
          <div className="hero-kicker line">{site?.tagline ?? 'Hotel · Spa · Wellness'}<span className="kicker-addr"> — 1081 Ngô Quyền, Đà Nẵng</span></div>
          <div id="hero-title"><HeroTitle text={site?.hero_title ?? 'GLG HOTEL & SPA'} /></div>
          {site?.hero_subtitle && <p className="hero-sub line">{site.hero_subtitle}</p>}
        </div>
        <div className="wrap hero-search"><SearchForm /></div>
      </section>

      {/* 01 — Cảm nhận không gian */}
      <section className="chapter chapter-space" aria-labelledby="ch-space">
        <div className="wrap space-grid">
          <div className="space-text reveal">
            <div className="chapter-no"><span>01</span> Không gian</div>
            <h2 id="ch-space">Tre, gỗ, kính<br /><em>và rất nhiều cây xanh.</em></h2>
            <p className="lead">{site?.about ?? 'GLG HOTEL & SPA nằm tại 1081 Ngô Quyền, Đà Nẵng.'}</p>
            <p>Mặt tiền kính phủ cây xanh, cổng tre và bảng gỗ khắc chữ — một nhịp chậm lại ngay khi bước qua cửa.</p>
            <Link className="link-arrow" href="/gioi-thieu">Câu chuyện GLG <ArrowRight size={15} aria-hidden /></Link>
          </div>
          <figure className="space-media">
            <div className="space-main reveal-clip">
              <Image src="/images/glg/mat-tien.webp" alt="Mặt tiền GLG HOTEL & SPA: mặt kính đan ô cây xanh tại góc đường Ngô Quyền" fill sizes="(max-width: 900px) 100vw, 620px" />
            </div>
            <div className="space-inset reveal">
              <Image src="/images/glg/chi-tiet-bang-go.webp" alt="Bảng gỗ khắc chữ GLG Hotel Wellness treo dưới mái lá" fill sizes="(max-width: 900px) 55vw, 300px" />
            </div>
            <figcaption>Mặt tiền tại 1081 Ngô Quyền · bảng gỗ ở cổng vào</figcaption>
          </figure>
        </div>
      </section>

      {/* 02 — Khám phá phòng */}
      <section className="chapter chapter-rooms" aria-labelledby="ch-rooms">
        <div className="bamboo-edge" aria-hidden />
        <div className="wrap">
          <div className="chapter-head reveal">
            <div className="chapter-no light"><span>02</span> Phòng nghỉ</div>
            <h2 id="ch-rooms">Chọn một góc <em>cho riêng mình</em></h2>
            <Link className="link-light" href="/phong">Tất cả loại phòng <ArrowRight size={15} aria-hidden /></Link>
          </div>
          {!data ? <Unavailable what="danh sách phòng" /> : data.room_types.length === 0
            ? <p className="muted">Thông tin loại phòng đang được cập nhật.</p>
            : <RoomExplorer rooms={data.room_types} />}
        </div>
      </section>

      {/* 03 — Trải nghiệm */}
      {amenities.length > 0 && (
        <section className="chapter" aria-labelledby="ch-exp">
          <div className="wrap">
            <div className="chapter-head reveal">
              <div className="chapter-no"><span>03</span> Trải nghiệm</div>
              <h2 id="ch-exp">Thư giãn ngay <em>trong khuôn viên</em></h2>
              <Link className="link-arrow" href="/tien-ich">Tiện ích &amp; dịch vụ <ArrowRight size={15} aria-hidden /></Link>
            </div>
            <div className="exp-grid">
              {featured.map((a, i) => (
                <article key={a.title} className={`exp-card ${i === 0 ? 'exp-lead' : ''} reveal`}>
                  <div className="exp-photo"><Image src={AMENITY_PHOTO[a.icon].src} alt={AMENITY_PHOTO[a.icon].alt} fill sizes={i === 0 ? '(max-width: 900px) 100vw, 640px' : '(max-width: 900px) 100vw, 400px'} /></div>
                  <div className="exp-body"><h3>{a.title}</h3>{a.text && <p>{a.text}</p>}</div>
                </article>
              ))}
              {quiet.map(a => (
                <article key={a.title} className="exp-quiet reveal">
                  <AmenityIcon name={a.icon} />
                  <h3>{a.title}</h3>{a.text && <p>{a.text}</p>}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Khoảng nghỉ thị giác */}
      <section className="pause" aria-label="Chất liệu GLG">
        <div className="pause-media"><Image src="/images/glg/hang-rao-tre.webp" alt="" fill sizes="100vw" /></div>
        <div className="wrap pause-inner reveal">
          <p className="pause-quote">“Một khoảng xanh để nghỉ lại <em>giữa nhịp sống Đà Nẵng.</em>”</p>
        </div>
      </section>

      {/* 04 — Thư viện */}
      {site && site.gallery.length > 0 && (
        <section className="chapter" aria-labelledby="ch-gallery">
          <div className="wrap">
            <div className="chapter-head reveal">
              <div className="chapter-no"><span>04</span> Thư viện</div>
              <h2 id="ch-gallery">Những chi tiết <em>làm nên GLG</em></h2>
              <Link className="link-arrow" href="/thu-vien-anh">Xem thư viện ảnh <ArrowRight size={15} aria-hidden /></Link>
            </div>
            <div className="mosaic">
              <figure className="m-a"><Image src="/images/glg/mat-tien.webp" alt="Toàn cảnh mặt tiền GLG với hàng cây xanh dọc phố" fill sizes="(max-width: 900px) 100vw, 560px" /><figcaption>Mặt tiền</figcaption></figure>
              <figure className="m-b"><Image src="/images/glg/chi-tiet-nha-chim.webp" alt="Những ngôi nhà chim gỗ nhiều màu treo dưới mái lá" fill sizes="(max-width: 900px) 50vw, 280px" /><figcaption>Nhà chim gỗ</figcaption></figure>
              <figure className="m-c"><Image src="/images/glg/chi-tiet-tre.webp" alt="Hàng rào tre và dây leo xanh" fill sizes="(max-width: 900px) 50vw, 280px" /><figcaption>Hàng rào tre</figcaption></figure>
              <figure className="m-d"><Image src="/images/glg/chi-tiet-moc-spa.webp" alt="Bảng gỗ Mộc Spa Massage khắc chữ" fill sizes="(max-width: 900px) 100vw, 560px" /><figcaption>Mộc Spa</figcaption></figure>
            </div>
          </div>
        </section>
      )}

      {/* 05 — Ghé thăm + lời mời đặt phòng (nối thẳng vào footer) */}
      <section className="chapter chapter-visit" aria-labelledby="ch-visit">
        <div className="wrap visit-grid">
          <div className="reveal">
            <div className="chapter-no light"><span>05</span> Ghé thăm</div>
            <h2 id="ch-visit">Hẹn bạn ở <em>1081 Ngô Quyền</em></h2>
            <ul className="visit-list">
              {hotel?.address && <li><MapPin size={18} aria-hidden /><span>{hotel.address}</span></li>}
              {hotel && <li><Clock size={18} aria-hidden /><span>Nhận phòng từ {hotel.check_in_time} · Trả phòng trước {hotel.check_out_time}</span></li>}
            </ul>
            <div className="row">
              {site?.map_url && <a className="btn btn-ghost-light" href={site.map_url} target="_blank" rel="noopener noreferrer">Mở bản đồ</a>}
              <Link className="link-light" href="/chinh-sach">Chính sách đặt &amp; hủy phòng <ArrowRight size={15} aria-hidden /></Link>
            </div>
          </div>
          <div className="visit-book reveal">
            <h3>Chọn ngày cho khoảng xanh của bạn</h3>
            <SearchForm className="stacked" />
            <p className="tiny">Đặt trực tiếp với khách sạn. Giá theo từng đêm được hiển thị trước khi xác nhận.</p>
          </div>
        </div>
      </section>
    </>
  );
}
