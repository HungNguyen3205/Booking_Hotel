import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getSite } from '@/lib/site-api';
import { PageHero, Paragraphs, Unavailable } from '@/components/site/common';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Giới thiệu',
  description: 'Giới thiệu GLG HOTEL & SPA tại 1081 Ngô Quyền, Đà Nẵng — khách sạn boutique với mặt kính phủ cây xanh, cổng tre và Mộc Spa.',
  alternates: { canonical: '/gioi-thieu' },
};

export default async function AboutPage() {
  const data = await getSite();
  return (
    <>
      <PageHero eyebrow="Về chúng tôi" title="Giới thiệu GLG HOTEL & SPA" intro={data?.hotel.address ?? undefined} />
      <section className="wrap split" style={{ paddingBottom: 72 }}>
        <div className="prose">
          {data ? <Paragraphs text={data.site.about} /> : <Unavailable what="nội dung giới thiệu" />}
          <p><Link className="link-arrow" href="/phong">Xem các loại phòng</Link></p>
        </div>
        <div className="photo"><Image src="/images/glg/hang-rao-tre.webp" alt="Hàng rào tre, cây xanh và lối vào khu vui chơi Kids tại GLG"
          fill sizes="(max-width: 960px) 100vw, 520px" /></div>
      </section>
    </>
  );
}
