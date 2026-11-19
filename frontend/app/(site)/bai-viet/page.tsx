import type { Metadata } from 'next';
import { getPosts } from '@/lib/site-api';
import { PageHero, Unavailable } from '@/components/site/common';
import { PostList } from '@/components/site/PostList';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Bài viết',
  description: 'Tin tức và bài viết từ GLG HOTEL & SPA Đà Nẵng.',
  alternates: { canonical: '/bai-viet' },
};

export default async function PostsPage() {
  const posts = await getPosts('article');
  return (
    <>
      <PageHero eyebrow="Bài viết" title="Tin tức & cảm hứng" />
      <section className="wrap" style={{ paddingBottom: 72 }}>
        {posts === null ? <Unavailable what="bài viết" /> : posts.length === 0
          ? <div className="state"><strong>Chưa có bài viết</strong><span className="small">Nội dung đang được khách sạn chuẩn bị.</span></div>
          : <PostList posts={posts} />}
      </section>
    </>
  );
}
