'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, BedDouble, Maximize, Users } from 'lucide-react';
import type { RoomType } from '@/lib/site-api';
import { money } from '@/lib/format';
import { RoomPlate } from './RoomPlate';

/**
 * Khám phá phòng: chọn loại phòng ở danh sách, khung bên phải chuyển cảnh mượt.
 * Mỗi mục là link thật tới trang loại phòng (SEO, không JS vẫn dùng được); JS chỉ thêm xem nhanh.
 */
export function RoomExplorer({ rooms }: { rooms: RoomType[] }) {
  const [active, setActive] = useState(0);
  const t = rooms[active];
  return (
    <div className="explorer">
      <ol className="explorer-list" aria-label="Loại phòng">
        {rooms.map((r, i) => (
          <li key={r.id}>
            <Link href={`/phong/${r.slug}`} aria-current={i === active ? 'true' : undefined}
              className={`explorer-item ${i === active ? 'on' : ''}`}
              onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)}
              onClick={e => { if (i !== active) { e.preventDefault(); setActive(i); } }}>
              <span className="explorer-no">0{i + 1}</span>
              <span className="explorer-name">{r.name}</span>
              <span className="explorer-meta">{r.area} m² · từ {money(r.base_rate)}</span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="explorer-stage" aria-live="polite">
        {rooms.map((r, i) => (
          <div key={r.id} className={`stage-slide ${i === active ? 'on' : ''}`} aria-hidden={i !== active}>
            <RoomPlate t={r} sizes="(max-width: 900px) 100vw, 620px" />
          </div>
        ))}
        <div className="stage-card" key={t.id}>
          <h3>{t.name}</h3>
          {t.short_description && <p>{t.short_description}</p>}
          <ul className="stage-facts">
            <li><Maximize size={15} aria-hidden /> {t.area} m²</li>
            <li><Users size={15} aria-hidden /> {t.max_adults} người lớn{t.max_children ? ` + ${t.max_children} trẻ em` : ''}</li>
            <li><BedDouble size={15} aria-hidden /> {t.bed ?? 'Giường: đang cập nhật'}</li>
          </ul>
          <div className="stage-price">Từ <strong>{money(t.base_rate)}</strong> / đêm <span>giá tham khảo ngày thường</span></div>
          <div className="row">
            <Link className="btn btn-bronze" href={`/dat-phong?room=${t.slug}`}>Đặt {t.name.toLowerCase()}</Link>
            <Link className="link-light" href={`/phong/${t.slug}`}>Xem chi tiết <ArrowRight size={15} aria-hidden /></Link>
          </div>
        </div>
      </div>
    </div>
  );
}
