'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { ChevronsLeft, ChevronsRight, LogOut, Menu, Plus, Search, X } from 'lucide-react';
import { dateVN, todayISO, weekday } from '@/lib/format';
import { useSession } from './session';
import { CommandPalette } from './command-palette';
import { NAV } from './nav';

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, property, can, logout, switchProperty } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [palette, setPalette] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => { try { setCollapsed(window.localStorage.getItem('glg.nav') === 'mini'); } catch { /* bỏ qua */ } }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const toggleMini = () => setCollapsed(c => { try { window.localStorage.setItem('glg.nav', c ? 'full' : 'mini'); } catch { /* bỏ qua */ } return !c; });
  const active = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href) || (href === '/admin/dich-vu' && pathname.startsWith('/admin/kho')));
  const today = todayISO();

  return (
    <div className={`admin ${collapsed ? 'nav-mini' : ''}`}>
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Menu quản trị">
        <div className="sidebar-brand">
          <span className="brand-mark"><img src="/images/glg/logo.webp" alt="" width={36} height={36} /></span>
          <div className="brand-text"><strong>GLG HOTEL &amp; SPA</strong><small>{property.name}</small></div>
          <button className="icon-btn sidebar-close" onClick={() => setOpen(false)} aria-label="Đóng menu"><X size={18} /></button>
        </div>
        {user.properties.length > 1 && !collapsed && (
          <select className="select property-switch" value={property.id} onChange={e => switchProperty(Number(e.target.value))} aria-label="Chọn cơ sở">
            {user.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <nav className="nav">
          {NAV.map(group => {
            const items = group.items.filter(i => i.perms.some(p => can(p)));
            if (!items.length) return null;
            return (
              <div key={group.title || 'home'} className="nav-group">
                {group.title && <div className="nav-title">{group.title}</div>}
                {items.map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} className={`nav-link ${active(href) ? 'active' : ''}`} aria-current={active(href) ? 'page' : undefined} title={collapsed ? label : undefined}>
                    <Icon size={18} aria-hidden /> <span className="nav-label">{label}</span>
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <button className="nav-link nav-collapse" onClick={toggleMini} aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}>
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />} <span className="nav-label">Thu gọn</span>
        </button>
        <div className="sidebar-user">
          <div className="avatar" aria-hidden>{user.name.slice(0, 1)}</div>
          <div className="grow user-text"><strong>{user.name}</strong><small>{user.role_name}</small></div>
          <button className="icon-btn" onClick={logout} title="Đăng xuất" aria-label="Đăng xuất"><LogOut size={17} /></button>
        </div>
      </aside>
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}
      <div className="admin-main">
        <header className="topbar">
          <button className="icon-btn topbar-menu" onClick={() => setOpen(true)} aria-label="Mở menu"><Menu size={20} /></button>
          <button className="search-trigger" onClick={() => setPalette(true)}>
            <Search size={16} aria-hidden /><span>Tìm phòng, khách, mã đặt phòng, chức năng…</span><kbd>Ctrl K</kbd>
          </button>
          <span className="topbar-date" title="Ngày vận hành">{weekday(today)}, {dateVN(today)}</span>
          {can('bookings.create') && <Link className="btn btn-primary btn-sm" href="/admin/dat-phong/moi"><Plus size={16} /> <span className="hide-sm">Đặt phòng</span></Link>}
        </header>
        {children}
      </div>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p className="muted small">{sub}</p>}</div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

/** Trang không đủ quyền (giao diện); backend vẫn trả 403 nếu gọi trực tiếp. */
export function Forbidden() {
  return <div className="page"><div className="card card-pad"><strong>Không có quyền truy cập</strong><p className="muted small">Tài khoản của bạn chưa được cấp quyền cho mục này.</p></div></div>;
}

export function RequirePerm({ perm, children }: { perm: string; children: ReactNode }) {
  const { can } = useSession();
  return can(perm) ? <>{children}</> : <Forbidden />;
}
