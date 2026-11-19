'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Leaf, Menu, X } from 'lucide-react';

const NAV = [
  { href: '/phong', label: 'Phòng' },
  { href: '/tien-ich', label: 'Tiện ích' },
  { href: '/thu-vien-anh', label: 'Thư viện ảnh' },
  { href: '/uu-dai', label: 'Ưu đãi' },
  { href: '/gioi-thieu', label: 'Giới thiệu' },
  { href: '/lien-he', label: 'Liên hệ' },
];

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="logo" aria-label="GLG HOTEL & SPA — Trang chủ">
          <span className="logo-mark" aria-hidden><Leaf size={17} /></span>
          <span><strong>GLG HOTEL &amp; SPA</strong><small>Đà Nẵng</small></span>
        </Link>
        <button className="icon-btn menu-toggle" aria-expanded={open} aria-controls="site-nav" aria-label={open ? 'Đóng menu' : 'Mở menu'} onClick={() => setOpen(o => !o)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
        <nav id="site-nav" className={`site-nav ${open ? 'open' : ''}`} aria-label="Điều hướng chính">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} aria-current={pathname.startsWith(n.href) ? 'page' : undefined}>{n.label}</Link>
          ))}
          <Link href="/tra-cuu" aria-current={pathname.startsWith('/tra-cuu') ? 'page' : undefined}>Tra cứu đặt phòng</Link>
          <Link href="/dat-phong" className="btn btn-primary btn-sm">Đặt phòng</Link>
        </nav>
      </div>
    </header>
  );
}
