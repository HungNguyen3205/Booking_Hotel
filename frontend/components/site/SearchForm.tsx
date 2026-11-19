'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { addDays, todayISO } from '@/lib/format';

/** Biểu mẫu GET thật tới /dat-phong — hoạt động cả khi JavaScript chưa tải. */
export function SearchForm({ room, className = '' }: { room?: string; className?: string }) {
  // Giá trị mặc định có ngay từ HTML máy chủ (không chờ JS) để form dùng được trước khi tải xong
  const [checkIn, setCheckIn] = useState(() => todayISO());
  const [checkOut, setCheckOut] = useState(() => todayISO(1));
  const [adults, setAdults] = useState('2');
  const [children, setChildren] = useState('0');
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    // Máy chậm: khách có thể đã gõ trước khi JS chạy — giữ giá trị khách đã nhập, không ghi đè
    const f = form.current;
    const ci = f?.elements.namedItem('check_in') as HTMLInputElement | null;
    const co = f?.elements.namedItem('check_out') as HTMLInputElement | null;
    // value khác defaultValue (giá trị trong HTML) nghĩa là khách đã thao tác trước khi JS chạy
    const touched = !!ci && !!co && (ci.value !== ci.defaultValue || co.value !== co.defaultValue);
    const typed = ci?.value || '';
    if (f && touched && typed >= todayISO()) {
      setCheckIn(typed);
      setCheckOut((f.elements.namedItem('check_out') as HTMLInputElement).value || addDays(typed, 1));
      setAdults((f.elements.namedItem('adults') as HTMLSelectElement).value);
      setChildren((f.elements.namedItem('children') as HTMLSelectElement).value);
      return;
    }
    // Điền lại ngày/số khách đã chọn trong phiên (nếu còn hợp lệ)
    let saved: { check_in?: string; check_out?: string; adults?: number; children?: number } = {};
    try { saved = JSON.parse(window.sessionStorage.getItem('glg.stay') ?? '{}'); } catch { /* bỏ qua */ }
    const ok = saved.check_in && saved.check_in >= todayISO() && saved.check_out && saved.check_out > saved.check_in;
    if (!ok) return;
    setCheckIn(saved.check_in!);
    setCheckOut(saved.check_out!);
    if (saved.adults) setAdults(String(saved.adults));
    if (saved.children != null) setChildren(String(saved.children));
  }, []);
  const min = todayISO();
  return (
    <form ref={form} action="/dat-phong" method="get" className={`search-bar ${className}`} aria-label="Tìm phòng trống">
      {room && <input type="hidden" name="room" value={room} />}
      <label className="field"><span>Nhận phòng</span>
        <input className="input" type="date" name="check_in" required min={min} value={checkIn} suppressHydrationWarning
          onChange={e => { setCheckIn(e.target.value); if (checkOut <= e.target.value) setCheckOut(addDays(e.target.value, 1)); }} /></label>
      <label className="field"><span>Trả phòng</span>
        <input className="input" type="date" name="check_out" suppressHydrationWarning required min={checkIn ? addDays(checkIn, 1) : min} value={checkOut}
          onChange={e => setCheckOut(e.target.value)} /></label>
      <label className="field"><span>Người lớn</span>
        <select className="select" name="adults" value={adults} onChange={e => setAdults(e.target.value)}>{[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n}>{n}</option>)}</select></label>
      <label className="field"><span>Trẻ em</span>
        <select className="select" name="children" value={children} onChange={e => setChildren(e.target.value)}>{[0, 1, 2, 3, 4].map(n => <option key={n}>{n}</option>)}</select></label>
      <button className="btn btn-primary"><Search size={16} aria-hidden /> Tìm phòng</button>
    </form>
  );
}
