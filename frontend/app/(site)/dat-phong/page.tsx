import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BookingFlow } from '@/components/site/BookingFlow';
import { Loading } from '@/components/ui';
import { PageHero } from '@/components/site/common';

export const metadata: Metadata = {
  title: 'Đặt phòng trực tiếp',
  description: 'Kiểm tra phòng trống theo ngày và số khách, xem tổng tiền, chính sách và đặt phòng trực tiếp tại GLG HOTEL & SPA Đà Nẵng.',
  alternates: { canonical: '/dat-phong' },
};

export default function BookingPage() {
  return (
    <>
      <PageHero eyebrow="Đặt phòng" title="Đặt phòng trực tiếp" intro="Chọn ngày và số khách để xem loại phòng còn trống, giá từng đêm và chính sách trước khi đặt." />
      <section className="wrap book-root" style={{ paddingBottom: 72 }}>
        <Suspense fallback={<Loading />}><BookingFlow /></Suspense>
      </section>
    </>
  );
}
