import Image from 'next/image';
import Link from 'next/link';
import type { PostSummary } from '@/lib/site-api';
import { dateVN } from '@/lib/format';

export function PostList({ posts, offer = false }: { posts: PostSummary[]; offer?: boolean }) {
  return (
    <div className="post-grid">
      {posts.map(p => (
        <article className="post-card" key={p.slug}>
          {p.cover && <div className="photo"><Image src={p.cover} alt={p.cover_alt ?? ''} fill sizes="(max-width: 700px) 100vw, 380px"
            unoptimized={!p.cover.startsWith('/images/')} /></div>}
          <div className="body">
            <h2><Link href={`/bai-viet/${p.slug}`}>{p.title}</Link></h2>
            {p.excerpt && <p className="muted small">{p.excerpt}</p>}
            <p className="tiny muted">
              {offer && (p.valid_from || p.valid_to)
                ? `Áp dụng ${p.valid_from ? `từ ${dateVN(p.valid_from)}` : ''} ${p.valid_to ? `đến ${dateVN(p.valid_to)}` : ''}`
                : <time dateTime={p.published_at}>{dateVN(p.published_at)}</time>}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}
