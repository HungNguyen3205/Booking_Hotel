'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Leaf, Menu, X } from 'lucide-react';

const NAV = [
  { href: '/phong', label: 'Phòng nghỉ' },
  { href: '/tien-ich', label: 'Trải nghiệm' },
  { href: '/thu-vien-anh', label: 'Thư viện' },
  { href: '/uu-dai', label: 'Ưu đãi' },
  { href: '/gioi-thieu', label: 'Câu chuyện' },
  { href: '/lien-he', label: 'Liên hệ' },
];

/** Trang chủ: header trong suốt trên ảnh hero, có nền khi cuộn. Nút Đặt phòng luôn hiện (cả điện thoại). */
export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const overlay = pathname === '/';
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className={`site-header ${overlay && !scrolled && !open ? 'is-overlay' : 'is-solid'}`}>
      <div className="wrap header-row">
        <Link href="/" className="logo" title="Về trang chủ">
          <span className="logo-mark" aria-hidden><Leaf size={17} /></span>
          <span><strong>GLG</strong><small>Hotel &amp; Spa · Đà Nẵng</small></span>
        </Link>
        <nav id="site-nav" className={`site-nav ${open ? 'open' : ''}`} aria-label="Điều hướng chính">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} aria-current={pathname.startsWith(n.href) ? 'page' : undefined}>{n.label}</Link>
          ))}
          <Link href="/tra-cuu" aria-current={pathname.startsWith('/tra-cuu') ? 'page' : undefined}>Tra cứu đặt phòng</Link>
        </nav>
        <div className="header-actions">
          <Link href="/dat-phong" className="btn btn-bronze btn-sm header-cta">Đặt phòng</Link>
          <button ref={toggle} className="icon-btn menu-toggle" aria-expanded={open} aria-controls="site-nav" aria-label={open ? 'Đóng menu' : 'Mở menu'} onClick={() => setOpen(o => !o)}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
    </header>
  );
}
