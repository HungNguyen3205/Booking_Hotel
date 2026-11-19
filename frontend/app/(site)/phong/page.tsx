import type { Metadata } from 'next';
import { getSite } from '@/lib/site-api';
import { PageHero, RoomCard, Unavailable } from '@/components/site/common';
import { SearchForm } from '@/components/site/SearchForm';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Loại phòng',
  description: 'Các loại phòng tại GLG HOTEL & SPA Đà Nẵng: diện tích, sức chứa, giá tham khảo theo đêm. Kiểm tra phòng trống và đặt trực tiếp.',
  alternates: { canonical: '/phong' },
};

export default async function RoomsPage() {
  const data = await getSite();
  return (
    <>
      <PageHero eyebrow="Phòng nghỉ" title="Loại phòng" intro="Giá hiển thị là giá tham khảo theo đêm; giá chính xác theo ngày và số khách được tính khi bạn chọn ngày lưu trú." />
      <section className="wrap" style={{ marginBottom: 32 }}><SearchForm /></section>
      <section className="wrap" style={{ paddingBottom: 72 }}>
        {!data ? <Unavailable what="danh sách phòng" /> : data.room_types.length === 0
          ? <p className="muted">Thông tin loại phòng đang được cập nhật.</p>
          : <div className="room-grid">{data.room_types.map(t => <RoomCard key={t.id} t={t} headingLevel={2} />)}</div>}
      </section>
    </>
  );
}
