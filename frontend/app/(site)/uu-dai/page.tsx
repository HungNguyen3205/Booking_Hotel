import type { Metadata } from 'next';
import Link from 'next/link';
import { getPosts } from '@/lib/site-api';
import { PageHero, Unavailable } from '@/components/site/common';
import { PostList } from '@/components/site/PostList';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Ưu đãi',
  description: 'Các chương trình ưu đãi đang áp dụng khi đặt phòng trực tiếp tại GLG HOTEL & SPA Đà Nẵng.',
  alternates: { canonical: '/uu-dai' },
};

export default async function OffersPage() {
  const posts = await getPosts('offer');
  return (
    <>
      <PageHero eyebrow="Ưu đãi" title="Ưu đãi đang áp dụng" />
      <section className="wrap" style={{ paddingBottom: 72 }}>
        {posts === null ? <Unavailable what="danh sách ưu đãi" /> : posts.length === 0 ? (
          <div className="state"><strong>Hiện chưa có chương trình ưu đãi</strong>
            <span className="small">Bạn vẫn có thể <Link href="/dat-phong">đặt phòng trực tiếp</Link> với giá niêm yết.</span></div>
        ) : <PostList posts={posts} offer />}
      </section>
    </>
  );
}
