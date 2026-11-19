import type { Metadata } from 'next';
import { getSite } from '@/lib/site-api';
import { PageHero, Paragraphs, Unavailable } from '@/components/site/common';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Quyền riêng tư',
  description: 'Cách GLG HOTEL & SPA thu thập, sử dụng và bảo vệ thông tin cá nhân của khách.',
  alternates: { canonical: '/quyen-rieng-tu' },
};

export default async function PrivacyPage() {
  const data = await getSite();
  return (
    <>
      <PageHero eyebrow="Chính sách" title="Quyền riêng tư" />
      <section className="wrap-narrow prose" style={{ paddingBottom: 72 }}>
        {data ? <Paragraphs text={data.policies.privacy} /> : <Unavailable what="chính sách quyền riêng tư" />}
      </section>
    </>
  );
}
