'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { addDays, todayISO } from '@/lib/format';

/** Biểu mẫu GET thật tới /dat-phong — hoạt động cả khi JavaScript chưa tải. */
export function SearchForm({ room, className = '' }: { room?: string; className?: string }) {
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  useEffect(() => {
    setCheckIn(todayISO());
    setCheckOut(todayISO(1));
  }, []);
  const min = todayISO();
  return (
    <form action="/dat-phong" method="get" className={`search-bar ${className}`} aria-label="Tìm phòng trống">
      {room && <input type="hidden" name="room" value={room} />}
      <label className="field"><span>Nhận phòng</span>
        <input className="input" type="date" name="check_in" required min={min} value={checkIn}
          onChange={e => { setCheckIn(e.target.value); if (checkOut <= e.target.value) setCheckOut(addDays(e.target.value, 1)); }} /></label>
      <label className="field"><span>Trả phòng</span>
        <input className="input" type="date" name="check_out" required min={checkIn ? addDays(checkIn, 1) : min} value={checkOut}
          onChange={e => setCheckOut(e.target.value)} /></label>
      <label className="field"><span>Người lớn</span>
        <select className="select" name="adults" defaultValue="2">{[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n}>{n}</option>)}</select></label>
      <label className="field"><span>Trẻ em</span>
        <select className="select" name="children" defaultValue="0">{[0, 1, 2, 3, 4].map(n => <option key={n}>{n}</option>)}</select></label>
      <button className="btn btn-primary"><Search size={16} aria-hidden /> Tìm phòng</button>
    </form>
  );
}
