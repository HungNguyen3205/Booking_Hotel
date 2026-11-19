import type { Metadata } from 'next';
import { getSite } from '@/lib/site-api';
import { PageHero, Paragraphs, Unavailable } from '@/components/site/common';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Chính sách đặt & hủy phòng',
  description: 'Chính sách đặt phòng, đặt cọc, hủy và hoàn tiền tại GLG HOTEL & SPA Đà Nẵng.',
  alternates: { canonical: '/chinh-sach' },
};

export default async function PolicyPage() {
  const data = await getSite();
  return (
    <>
      <PageHero eyebrow="Chính sách" title="Chính sách đặt & hủy phòng" />
      <section className="wrap-narrow prose" style={{ paddingBottom: 72 }}>
        {!data ? <Unavailable what="chính sách" /> : (
          <>
            <h2>Đặt phòng</h2>
            <Paragraphs text={data.policies.booking} />
            <p>Giờ nhận phòng từ {data.hotel.check_in_time}, trả phòng trước {data.hotel.check_out_time}.</p>
            <h2>Hủy phòng &amp; hoàn tiền</h2>
            <Paragraphs text={data.policies.cancellation} />
            {data.rate_plans.length > 0 && <>
              <h2>Theo từng gói giá</h2>
              {data.rate_plans.map(p => (
                <div key={p.id} className="card card-pad stack-sm">
                  <strong>{p.name}</strong>
                  {p.description && <p className="small">{p.description}</p>}
                  <p className="small">Đặt cọc: {p.deposit_percent}% tổng tiền phòng{p.includes_breakfast ? ' · Bao gồm bữa sáng' : ''}.</p>
                  {p.policy && <p className="small">{p.policy}</p>}
                </div>
              ))}
            </>}
          </>
        )}
      </section>
    </>
  );
}
