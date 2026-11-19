import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPost, SITE_URL } from '@/lib/site-api';
import { JsonLd, Paragraphs } from '@/components/site/common';
import { dateVN } from '@/lib/format';

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPost(slug);
  if (!p) return { title: 'Bài viết', robots: { index: false } };
  return {
    title: p.title,
    description: p.excerpt ?? p.body.slice(0, 155),
    alternates: { canonical: `/bai-viet/${p.slug}` },
    openGraph: { type: 'article', title: p.title, ...(p.cover && { images: [{ url: p.cover, alt: p.cover_alt ?? '' }] }) },
  };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const p = await getPost(slug);
  if (!p) notFound();
  return (
    <article className="wrap-narrow" style={{ paddingBlock: '40px 72px' }}>
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Article', headline: p.title, datePublished: p.published_at, dateModified: p.updated_at,
        mainEntityOfPage: `${SITE_URL}/bai-viet/${p.slug}`, publisher: { '@type': 'Organization', name: 'GLG HOTEL & SPA' },
        ...(p.cover && { image: p.cover.startsWith('http') ? p.cover : `${SITE_URL}${p.cover}` }) }} />
      <nav className="breadcrumb" aria-label="Đường dẫn"><Link href="/">Trang chủ</Link> / <Link href={p.type === 'offer' ? '/uu-dai' : '/bai-viet'}>{p.type === 'offer' ? 'Ưu đãi' : 'Bài viết'}</Link></nav>
      <h1 className="serif" style={{ fontSize: 'clamp(32px,5vw,48px)', marginBlock: '12px' }}>{p.title}</h1>
      <p className="tiny muted"><time dateTime={p.published_at}>{dateVN(p.published_at)}</time>
        {p.type === 'offer' && p.valid_to && ` · Áp dụng đến ${dateVN(p.valid_to)}`}</p>
      {p.cover && <div className="photo" style={{ borderRadius: 10, margin: '24px 0' }}><Image src={p.cover} alt={p.cover_alt ?? ''} fill priority
        sizes="(max-width: 860px) 100vw, 820px" unoptimized={!p.cover.startsWith('/images/')} /></div>}
      <div className="prose" style={{ marginTop: 20 }}><Paragraphs text={p.body} /></div>
      <p style={{ marginTop: 32 }}><Link className="btn btn-primary" href="/dat-phong">Đặt phòng</Link></p>
    </article>
  );
}
