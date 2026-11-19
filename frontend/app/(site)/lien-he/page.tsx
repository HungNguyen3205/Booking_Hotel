import type { Metadata } from 'next';
import Image from 'next/image';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { getSite } from '@/lib/site-api';
import { PageHero, Unavailable } from '@/components/site/common';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Liên hệ & vị trí',
  description: 'Địa chỉ, giờ nhận/trả phòng và thông tin liên hệ GLG HOTEL & SPA tại 1081 Ngô Quyền, Đà Nẵng.',
  alternates: { canonical: '/lien-he' },
};

export default async function ContactPage() {
  const data = await getSite();
  const h = data?.hotel;
  const s = data?.site;
  return (
    <>
      <PageHero eyebrow="Liên hệ" title="Liên hệ & vị trí" />
      <section className="wrap split" style={{ paddingBottom: 72 }}>
        {!data ? <Unavailable what="thông tin liên hệ" /> : (
          <div className="stack" style={{ gap: 20 }}>
            <ul className="contact-list">
              {h?.address && <li><MapPin size={18} aria-hidden /><div><strong>Địa chỉ</strong><br />{h.address}</div></li>}
              {h?.phone && <li><Phone size={18} aria-hidden /><div><strong>Điện thoại</strong><br /><a href={`tel:${h.phone.replace(/\s/g, '')}`}>{h.phone}</a></div></li>}
              {h?.email && <li><Mail size={18} aria-hidden /><div><strong>Email</strong><br /><a href={`mailto:${h.email}`}>{h.email}</a></div></li>}
              {h && <li><Clock size={18} aria-hidden /><div><strong>Giờ nhận / trả phòng</strong><br />Nhận phòng từ {h.check_in_time} · Trả phòng trước {h.check_out_time}</div></li>}
            </ul>
            {!h?.phone && !h?.email && <p className="small muted">Số điện thoại và email liên hệ đang được khách sạn cập nhật.</p>}
            <div className="row">
              {s?.map_url && <a className="btn btn-primary" href={s.map_url} target="_blank" rel="noopener noreferrer"><MapPin size={16} aria-hidden /> Mở Google Maps</a>}
              {s?.zalo && <a className="btn" href={s.zalo.startsWith('http') ? s.zalo : `https://zalo.me/${s.zalo}`} target="_blank" rel="noopener noreferrer">Zalo</a>}
              {s?.facebook && <a className="btn" href={s.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>}
            </div>
          </div>
        )}
        <div className="photo"><Image src="/images/glg/mat-tien.webp" alt="Tòa nhà GLG HOTEL & SPA nhìn từ góc đường Ngô Quyền" fill sizes="(max-width: 960px) 100vw, 520px" /></div>
      </section>
    </>
  );
}
