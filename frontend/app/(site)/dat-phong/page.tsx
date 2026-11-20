import type { Metadata } from 'next';
import Image from 'next/image';
import { Suspense } from 'react';
import { BookingFlow } from '@/components/site/BookingFlow';
import { Loading } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Đặt phòng trực tiếp',
  description: 'Kiểm tra phòng trống theo ngày và số khách, xem tổng tiền, chính sách và đặt phòng trực tiếp tại GLG HOTEL & SPA Đà Nẵng.',
  alternates: { canonical: '/dat-phong' },
};

export default function BookingPage() {
  return (
    <>
      {/* Dải ảnh thật (cổng GLG Hotel Wellness) làm nền; khung tìm phòng dạng "vé lưu trú" nằm đè lên mép dưới.
          Không dùng ảnh hàng rào tre đầy đủ vì có bảng hiệu của cơ sở khác. */}
      <section className="book-hero">
        <div className="book-hero-media" aria-hidden>
          <Image src="/images/glg/cong-wellness.webp" alt="" fill sizes="100vw" fetchPriority="low" />
        </div>
        <div className="wrap book-hero-text">
          <div className="eyebrow">Đặt phòng trực tiếp</div>
          <h1>Giữ cho mình <em>một khoảng xanh</em></h1>
          <p>Chọn ngày và số khách, xem phòng còn trống cùng giá từng đêm, rồi hoàn tất ngay trên một trang.</p>
        </div>
      </section>
      <section className="wrap book-root">
        <Suspense fallback={<Loading />}><BookingFlow /></Suspense>
      </section>
    </>
  );
}
