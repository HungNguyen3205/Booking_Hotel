import Image from 'next/image';
import { BedDouble, Users } from 'lucide-react';
import type { RoomType } from '@/lib/site-api';

/**
 * Hình đại diện loại phòng. Có ảnh thật thì dùng ảnh; chưa có thì hiển thị "tấm phòng" bằng chữ
 * (diện tích, sức chứa, giường) trên nền nan tre — không dùng ảnh khác thay ảnh phòng để tránh gây hiểu nhầm.
 */
export function RoomPlate({ t, sizes = '(max-width: 900px) 100vw, 640px', priority = false, compact = false }: {
  t: RoomType; sizes?: string; priority?: boolean; compact?: boolean;
}) {
  const img = t.images?.[0];
  if (img) {
    return (
      <div className="room-plate has-photo">
        <Image src={img.url} alt={img.alt} fill sizes={sizes} priority={priority} unoptimized={!img.url.startsWith('/images/')} />
      </div>
    );
  }
  return (
    <div className={`room-plate ${compact ? 'compact' : ''}`} role="img" aria-label={`${t.name}: ${t.area} m², tối đa ${t.max_occupancy} khách. Ảnh phòng thực tế đang được cập nhật.`}>
      <div className="plate-inner" aria-hidden>
        <span className="plate-area">{t.area}<small>m²</small></span>
        <span className="plate-name">{t.name}</span>
        <span className="plate-facts"><span><Users size={14} /> {t.max_occupancy} khách</span><span><BedDouble size={14} /> {t.bed ?? 'Giường đang cập nhật'}</span></span>
      </div>
      <span className="plate-note" aria-hidden>Ảnh phòng thực tế đang cập nhật</span>
    </div>
  );
}
