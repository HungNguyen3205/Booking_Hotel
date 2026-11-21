'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';

export type AlbumImage = { url: string; alt: string };

/**
 * Bố cục so le trên lưới 12 cột, luôn kín hàng:
 *  1 ảnh: tràn ngang · 2 ảnh: hai nửa · 4 ảnh: lớn trái + (ngang, 2 nhỏ) phải
 *  3 hoặc ≥5 ảnh: lớn trái + 2 ảnh dọc phải, phần còn lại hàng 3 ảnh; hàng cuối lẻ giãn ra.
 * Bấm ảnh mở xem lớn (←/→ chuyển ảnh, Esc đóng).
 */
function tileClass(i: number, n: number) {
  if (n === 1) return 'tile-full';
  if (n === 2) return 'tile-half';
  if (n === 4) return ['tile-hero6', 'tile-wide', 'tile-quarter', 'tile-quarter'][i];
  if (i === 0) return 'tile-hero';
  if (i < 3) return 'tile-side';
  const rest = n - 3;
  const rem = rest % 3;
  const k = i - 3;
  if (rem === 1 && k === rest - 1) return 'tile-strip';
  if (rem === 2 && k >= rest - 2) return 'tile-wide';
  return 'tile-side';
}

const src = (url: string) => ({ unoptimized: !url.startsWith('/images/') });

export function GalleryAlbum({ title, note, href, hrefLabel, images, eager = false }: {
  title: string; note?: string; href?: string; hrefLabel?: string; images: AlbumImage[]; eager?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const n = images.length;

  const go = useCallback((d: number) => setOpen(o => (o === null ? o : (o + d + n) % n)), [n]);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open !== null && !el.open) el.showModal();
    if (open === null && el.open) el.close();
    // Khóa cuộn trang phía sau khi đang xem ảnh lớn
    document.documentElement.style.overflow = open !== null ? 'hidden' : '';
    return () => { document.documentElement.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, go]);

  if (!n) return null;
  const cur = open !== null ? images[open] : null;

  return (
    <section className="album">
      <header className="album-head">
        <div>
          <h2>{title}</h2>
          {note && <p>{note}</p>}
        </div>
        {href && <Link href={href} className="link-arrow">{hrefLabel ?? 'Xem chi tiết'} <ArrowRight size={15} aria-hidden /></Link>}
      </header>

      <div className="album-grid">
        {images.map((img, i) => (
          <button key={img.url} type="button" className={`album-tile ${tileClass(i, n)}`} onClick={() => setOpen(i)}
            aria-label={`Xem ảnh lớn: ${img.alt}`}>
            <Image src={img.url} alt={img.alt} fill {...src(img.url)} loading={eager && i === 0 ? 'eager' : undefined}
              sizes={i === 0 ? '(max-width: 760px) 100vw, 760px' : '(max-width: 760px) 50vw, 380px'} />
            <span className="album-cap">{img.alt}</span>
            <span className="album-zoom" aria-hidden><Expand size={15} /></span>
          </button>
        ))}
      </div>

      <dialog ref={dialog} className="lightbox" onClose={() => setOpen(null)} onClick={e => { if (e.target === e.currentTarget) setOpen(null); }}
        aria-label={cur ? cur.alt : title}>
        {cur && (
          <>
            <div className="lightbox-stage">
              <Image key={cur.url} src={cur.url} alt={cur.alt} fill sizes="100vw" loading="eager" {...src(cur.url)} />
            </div>
            <div className="lightbox-bar">
              <span className="lightbox-count">{(open ?? 0) + 1} / {n}</span>
              <p>{cur.alt}</p>
            </div>
            {n > 1 && <>
              <button type="button" className="lightbox-nav prev" onClick={() => go(-1)} aria-label="Ảnh trước"><ChevronLeft size={26} /></button>
              <button type="button" className="lightbox-nav next" onClick={() => go(1)} aria-label="Ảnh sau"><ChevronRight size={26} /></button>
            </>}
            <button type="button" className="lightbox-close" onClick={() => setOpen(null)} aria-label="Đóng" autoFocus><X size={22} /></button>
          </>
        )}
      </dialog>
    </section>
  );
}
