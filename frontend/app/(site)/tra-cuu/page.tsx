import type { Metadata } from 'next';
import { LookupForm } from '@/components/site/LookupForm';
import { PageHero } from '@/components/site/common';

export const metadata: Metadata = {
  title: 'Tra cứu đặt phòng',
  description: 'Tra cứu trạng thái đặt phòng tại GLG HOTEL & SPA bằng mã đặt phòng và email hoặc số điện thoại.',
  alternates: { canonical: '/tra-cuu' },
  robots: { index: false, follow: true },
};

export default function LookupPage() {
  return (
    <>
      <PageHero eyebrow="Đặt phòng" title="Tra cứu đặt phòng" intro="Nhập mã đặt phòng cùng email hoặc số điện thoại đã dùng khi đặt." />
      <section className="wrap-narrow" style={{ paddingBottom: 72 }}><LookupForm /></section>
    </>
  );
}
