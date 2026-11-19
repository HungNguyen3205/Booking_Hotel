import Image from 'next/image';
import Link from 'next/link';
import { AlertTriangle, BedDouble, ImageOff, Leaf, Mail, MapPin, Maximize, Phone, Users } from 'lucide-react';
import type { RoomType, SiteData } from '@/lib/site-api';
import { money } from '@/lib/format';

export function Footer({ site }: { site: SiteData | null }) {
  const h = site?.hotel;
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="cols">
          <div className="stack">
            <Link href="/" className="logo"><span className="logo-mark" aria-hidden><Leaf size={17} /></span>
              <span><strong>GLG HOTEL &amp; SPA</strong><small>{site?.site.tagline ?? 'Hotel · Spa · Wellness'}</small></span></Link>
            <ul>
              {h?.address && <li><MapPin size={14} aria-hidden /> {h.address}</li>}
              {h?.phone && <li><Phone size={14} aria-hidden /> <a href={`tel:${h.phone.replace(/\s/g, '')}`}>{h.phone}</a></li>}
              {h?.email && <li><Mail size={14} aria-hidden /> <a href={`mailto:${h.email}`}>{h.email}</a></li>}
            </ul>
          </div>
          <div>
            <h2>Khám phá</h2>
            <ul>
              <li><Link href="/phong">Loại phòng</Link></li>
              <li><Link href="/tien-ich">Tiện ích &amp; dịch vụ</Link></li>
              <li><Link href="/thu-vien-anh">Thư viện ảnh</Link></li>
              <li><Link href="/uu-dai">Ưu đãi</Link></li>
              <li><Link href="/bai-viet">Bài viết</Link></li>
            </ul>
          </div>
          <div>
            <h2>Hỗ trợ</h2>
            <ul>
              <li><Link href="/dat-phong">Đặt phòng</Link></li>
              <li><Link href="/tra-cuu">Tra cứu đặt phòng</Link></li>
              <li><Link href="/chinh-sach">Chính sách đặt &amp; hủy phòng</Link></li>
              <li><Link href="/quyen-rieng-tu">Quyền riêng tư</Link></li>
              <li><Link href="/lien-he">Liên hệ &amp; vị trí</Link></li>
            </ul>
          </div>
        </div>
        <div className="legal">
          <span>© {new Date().getFullYear()} GLG HOTEL &amp; SPA</span>
          {h && <span>Nhận phòng từ {h.check_in_time} · Trả phòng trước {h.check_out_time}</span>}
        </div>
      </div>
    </footer>
  );
}

export function Unavailable({ what = 'nội dung' }: { what?: string }) {
  return (
    <div className="state state-error" role="alert">
      <AlertTriangle size={28} aria-hidden />
      <strong>Chưa tải được {what}</strong>
      <span className="small">Hệ thống đang bận hoặc đang cập nhật. Vui lòng thử lại sau ít phút.</span>
    </div>
  );
}

export function PhotoPlaceholder({ label = 'Ảnh phòng thực tế đang được cập nhật' }: { label?: string }) {
  return <div className="photo-placeholder" role="img" aria-label={label}><div><ImageOff size={26} aria-hidden /><div>{label}</div></div></div>;
}

export function Paragraphs({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return <>{text.split(/\n{1,}/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</>;
}

export function capacityText(t: RoomType) {
  return `Tối đa ${t.max_adults} người lớn${t.max_children ? `, ${t.max_children} trẻ em` : ''} (tổng ${t.max_occupancy} khách)`;
}

export function RoomCard({ t, headingLevel = 3 }: { t: RoomType; headingLevel?: 2 | 3 }) {
  const img = t.images?.[0];
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <article className="room-card">
      {img ? (
        <div className="photo"><Image src={img.url} alt={img.alt} fill sizes="(max-width: 700px) 100vw, 380px" unoptimized={!img.url.startsWith("/images/")} /></div>
      ) : <PhotoPlaceholder />}
      <div className="room-card-body">
        <H><Link href={`/phong/${t.slug}`}>{t.name}</Link></H>
        <div className="facts">
          <span><Maximize size={15} aria-hidden /> {t.area} m²</span>
          <span><Users size={15} aria-hidden /> {t.max_occupancy} khách</span>
          <span><BedDouble size={15} aria-hidden /> {t.bed ?? 'Giường: đang cập nhật'}</span>
        </div>
        {t.short_description && <p className="muted small">{t.short_description}</p>}
        <p className="price">Từ <strong>{money(t.base_rate)}</strong> / đêm</p>
      </div>
    </article>
  );
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

export function PageHero({ eyebrow, title, intro }: { eyebrow?: string; title: string; intro?: string }) {
  return (
    <section className="page-hero">
      <div className="wrap">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
    </section>
  );
}
