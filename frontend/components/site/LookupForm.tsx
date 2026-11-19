'use client';

import { FormEvent, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { errorText } from '@/lib/format';
import { Notice } from '@/components/ui';
import { BookingSummary, PublicBooking } from './BookingSummary';

export function LookupForm() {
  const [booking, setBooking] = useState<PublicBooking | null>(null);
  const [contact, setContact] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const c = String(f.get('contact')).trim();
    setBusy(true);
    setError('');
    setBooking(null);
    try {
      setBooking(await api<PublicBooking>('/public/bookings/lookup', 'POST', { code: String(f.get('code')).trim().toUpperCase(), contact: c }));
      setContact(c);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <form className="card card-pad form-grid" onSubmit={submit} style={{ alignItems: 'end' }}>
        <label className="field"><span>Mã đặt phòng</span><input className="input" name="code" required maxLength={20} placeholder="Số điện thoại đã đặt (VD 0905123456)" autoCapitalize="characters" /></label>
        <label className="field"><span>Email đã dùng khi đặt phòng</span><input className="input" name="contact" type="email" autoComplete="email" required maxLength={200} /></label>
        <button className="btn btn-primary" disabled={busy}><Search size={16} aria-hidden /> {busy ? 'Đang tra cứu…' : 'Tra cứu'}</button>
      </form>
      {error && <Notice kind="error">{error}</Notice>}
      {booking && <BookingSummary booking={booking} contact={contact} onUpdate={setBooking} />}
    </div>
  );
}
