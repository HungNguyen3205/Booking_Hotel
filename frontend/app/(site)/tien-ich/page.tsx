import type { Metadata } from 'next';
import Image from 'next/image';
import { getSite } from '@/lib/site-api';
import { PageHero, Unavailable } from '@/components/site/common';
import { AmenityIcon } from '@/components/site/AmenityIcon';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Tiện ích & dịch vụ',
  description: 'Tiện ích và dịch vụ tại GLG HOTEL & SPA Đà Nẵng: Mộc Spa massage, coffee, khu đọc sách, gym, yoga, khu vui chơi trẻ em.',
  alternates: { canonical: '/tien-ich' },
};

export default async function AmenitiesPage() {
  const data = await getSite();
  return (
    <>
      <PageHero eyebrow="Tiện ích" title="Tiện ích & dịch vụ" intro="Dịch vụ phát sinh trong thời gian lưu trú được ghi vào hồ sơ thanh toán của bạn tại quầy lễ tân." />
      <section className="wrap" style={{ paddingBottom: 48 }}>
        {!data ? <Unavailable what="danh sách tiện ích" /> : data.site.amenities.length === 0
          ? <p className="muted">Thông tin tiện ích đang được cập nhật.</p>
          : <div className="amenity-grid">{data.site.amenities.map(a => (
            <div className="amenity" key={a.title}><AmenityIcon name={a.icon} /><h2 style={{ fontSize: 18 }}>{a.title}</h2>{a.text && <p>{a.text}</p>}</div>
          ))}</div>}
      </section>
      <section className="wrap split" style={{ paddingBottom: 72 }}>
        <div className="photo"><Image src="/images/glg/moc-spa.webp" alt="Bảng gỗ Mộc Spa Massage và biển Massage thư giãn toàn thân" fill sizes="(max-width: 960px) 100vw, 600px" /></div>
        <div className="prose"><h2>Mộc Spa</h2><p>Không gian spa và massage ngay trong khuôn viên khách sạn. Liên hệ lễ tân để biết danh mục dịch vụ và đặt lịch.</p></div>
      </section>
    </>
  );
}
