'use client';

import { FormEvent, useState } from 'react';
import { Mail, Phone, Search, TicketCheck } from 'lucide-react';
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
      <form className="lookup-card" onSubmit={submit} aria-labelledby="lookup-title">
        <div className="lookup-head">
          <span className="lookup-badge" aria-hidden><TicketCheck size={22} /></span>
          <div>
            <h2 id="lookup-title">Tìm đặt phòng của bạn</h2>
            <p>Nhập mã đặt phòng và email bạn đã dùng khi đặt.</p>
          </div>
        </div>
        <div className="lookup-fields">
          <label className="field">
            <span>Mã đặt phòng</span>
            <span className="input-icon"><Phone size={17} aria-hidden />
              <input className="input" name="code" required maxLength={20} placeholder="VD: 0905123456" autoCapitalize="characters" autoComplete="off" inputMode="text" /></span>
            <small>Thường là số điện thoại bạn đã dùng khi đặt phòng.</small>
          </label>
          <label className="field">
            <span>Email</span>
            <span className="input-icon"><Mail size={17} aria-hidden />
              <input className="input" name="contact" type="email" autoComplete="email" required maxLength={200} placeholder="ten@email.com" /></span>
            <small>Email bạn đã nhập khi đặt phòng.</small>
          </label>
        </div>
        <div className="lookup-actions">
          <button className="btn btn-primary" disabled={busy}><Search size={17} aria-hidden /> {busy ? 'Đang tra cứu…' : 'Tra cứu đặt phòng'}</button>
        </div>
      </form>
      {error && <Notice kind="error">{error}</Notice>}
      {booking && <BookingSummary booking={booking} contact={contact} onUpdate={setBooking} />}
    </div>
  );
}
