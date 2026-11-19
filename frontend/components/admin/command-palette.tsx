'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BedDouble, CalendarPlus, CornerDownLeft, DoorOpen, Search, User, Zap } from 'lucide-react';
import { get, qs } from '@/lib/api';
import { BOOKING_STATUS, OCCUPANCY } from '@/lib/format';
import { useSession } from './session';
import { NAV } from './nav';
import type { RoomMapData } from './types';

type Hit = { key: string; group: string; label: string; hint?: string; href: string; icon: typeof Search };

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Tìm nhanh toàn hệ thống: chức năng, phòng, đặt phòng, khách hàng. Ctrl+K để mở. */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { can } = useSession();
  const [q, setQ] = useState('');
  const [rooms, setRooms] = useState<RoomMapData['rooms']>([]);
  const [remote, setRemote] = useState<Hit[]>([]);
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { if (can('rooms.view')) get<RoomMapData>('/admin/room-map').then(d => setRooms(d.rooms)).catch(() => undefined); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRemote([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      const out: Hit[] = [];
      const [b, c] = await Promise.all([
        can('bookings.view') ? get<{ data: { id: number; code: string; status: string; customer: { full_name: string } }[] }>(`/admin/bookings${qs({ q: term })}`).catch(() => null) : null,
        can('guests.view') ? get<{ data: { id: number; full_name: string; phone: string | null; kind: string }[] }>(`/admin/customers${qs({ q: term })}`).catch(() => null) : null,
      ]);
      b?.data.slice(0, 5).forEach(x => out.push({ key: `b${x.id}`, group: 'Đặt phòng', label: `${x.code} · ${x.customer.full_name}`, hint: BOOKING_STATUS[x.status], href: `/admin/dat-phong/${x.id}`, icon: BedDouble }));
      c?.data.slice(0, 5).forEach(x => out.push({ key: `c${x.id}`, group: 'Khách hàng', label: x.full_name, hint: x.phone ?? (x.kind === 'company' ? 'Công ty' : x.kind === 'agent' ? 'Đại lý' : ''), href: `/admin/khach-hang/${x.id}`, icon: User }));
      if (alive) setRemote(out);
    }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const hits = useMemo(() => {
    const term = strip(q.trim());
    const actions: Hit[] = [
      ...(can('bookings.create') ? [{ key: 'a-new', group: 'Thao tác nhanh', label: 'Tạo đặt phòng mới', href: '/admin/dat-phong/moi', icon: CalendarPlus }] : []),
      ...(can('bookings.view') ? [{ key: 'a-arr', group: 'Thao tác nhanh', label: 'Khách đến hôm nay', href: '/admin/dat-phong?view=arrivals', icon: Zap },
        { key: 'a-dep', group: 'Thao tác nhanh', label: 'Khách đi hôm nay', href: '/admin/dat-phong?view=departures', icon: Zap }] : []),
      ...(can('shifts.manage') ? [{ key: 'a-shift', group: 'Thao tác nhanh', label: 'Mở / chốt ca', href: '/admin/tai-chinh', icon: Zap }] : []),
      ...NAV.flatMap(g => g.items).filter(i => i.perms.some(p => can(p))).map(i => ({ key: `n${i.href}`, group: 'Chức năng', label: i.label, href: i.href, icon: i.icon })),
    ];
    const local = actions.filter(a => !term || strip(a.label).includes(term));
    const roomHits: Hit[] = term ? rooms.filter(r => r.number.includes(term) || strip(r.current?.guest ?? '').includes(term) || strip(r.arriving?.guest ?? '').includes(term))
      .slice(0, 6).map(r => ({ key: `r${r.id}`, group: 'Phòng', label: `Phòng ${r.number} · ${r.type_name}`, hint: `${OCCUPANCY[r.occupancy]}${r.current?.guest ? ` · ${r.current.guest}` : ''}`,
        href: `/admin/lich-phong?room=${r.id}`, icon: DoorOpen })) : [];
    return [...roomHits, ...remote, ...local].slice(0, 14);
  }, [q, rooms, remote, can]);

  useEffect(() => setIndex(0), [q]);
  const go = (h?: Hit) => { if (!h) return; onClose(); router.push(h.href); };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Tìm nhanh" onMouseDown={e => e.stopPropagation()}>
        <div className="palette-input">
          <Search size={18} aria-hidden />
          <input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Số phòng, tên khách, mã đặt phòng, chức năng…"
            onKeyDown={e => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(hits.length - 1, i + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
              if (e.key === 'Enter') go(hits[index]);
            }} aria-label="Tìm nhanh" />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" role="listbox">
          {hits.length === 0 && <li className="palette-empty">Không tìm thấy. Thử số phòng (VD 205), tên khách hoặc mã đặt phòng (số điện thoại khách)</li>}
          {hits.map((h, i) => {
            const Icon = h.icon;
            const showGroup = i === 0 || hits[i - 1].group !== h.group;
            return (
              <li key={h.key} role="option" aria-selected={i === index}>
                {showGroup && <div className="palette-group">{h.group}</div>}
                <button className={`palette-item ${i === index ? 'on' : ''}`} onMouseEnter={() => setIndex(i)} onClick={() => go(h)}>
                  <Icon size={16} aria-hidden /><span className="grow">{h.label}</span>{h.hint && <span className="muted small">{h.hint}</span>}
                  {i === index ? <CornerDownLeft size={14} aria-hidden /> : <ArrowRight size={14} aria-hidden className="muted" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
