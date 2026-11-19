'use client';

import { FormEvent, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Clock, Copy, Hourglass, QrCode } from 'lucide-react';
import { api } from '@/lib/api';
import { dateTimeVN, dateVN, errorText, money } from '@/lib/format';
import { Notice } from '@/components/ui';

export type PublicBooking = {
  code: string; status: string; status_label: string; guest_name: string; hold_expires_at: string | null;
  rooms: { room_type: string; slug: string; check_in: string; check_out: string; adults: number; children: number; status: string }[];
  total: number; paid: number; pending_claims: number; deposit_required: number; deposit_remaining: number;
  policy: { rate_plan?: string | null; description?: string | null; deposit_percent?: number } | null;
  payment: { qr: string; bank_name: string; account_number: string; account_name: string; amount: number; message: string } | null;
};

function StatusBadge({ b }: { b: PublicBooking }) {
  const cls = b.status === 'hold' ? 'b-amber' : b.status === 'confirmed' || b.status === 'checked_in' ? 'b-sage' : 'b-neutral';
  const Icon = b.status === 'hold' ? Hourglass : b.status === 'confirmed' ? CheckCircle2 : Clock;
  return <span className={`badge ${cls}`}><Icon aria-hidden />{b.status_label}</span>;
}

function Qr({ text }: { text: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(text, { margin: 1, width: 400, errorCorrectionLevel: 'M' }).then(setSrc).catch(() => setSrc('')); }, [text]);
  return src ? <img src={src} alt="Mã QR chuyển khoản VietQR" width={200} height={200} /> : <div className="skeleton" style={{ width: 200, height: 200 }} />;
}

function CopyText({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}
      aria-label={`Sao chép ${value}`}><Copy size={14} aria-hidden /> {done ? 'Đã chép' : 'Chép'}</button>
  );
}

export function BookingSummary({ booking, contact, onUpdate }: { booking: PublicBooking; contact: string; onUpdate: (b: PublicBooking) => void }) {
  const b = booking;
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function claim(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setNotice(null);
    try {
      const updated = await api<PublicBooking>(`/public/bookings/${encodeURIComponent(b.code)}/transfer-notice`, 'POST', {
        contact, amount: Number(f.get('amount')), reference: String(f.get('reference') || '') || undefined,
      });
      onUpdate(updated);
      setNotice({ kind: 'ok', text: 'Đã gửi thông báo chuyển khoản. Khách sạn sẽ đối soát và xác nhận — khoản này chưa được ghi nhận là đã thanh toán.' });
    } catch (err) {
      setNotice({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  const waiting = b.status === 'hold' || b.status === 'confirmed';
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="card card-pad stack">
        <div className="row-between"><span className="eyebrow">Mã đặt phòng</span><StatusBadge b={b} /></div>
        <div className="row"><span className="confirm-code">{b.code}</span><CopyText value={b.code} /></div>
        <p>Khách đặt: <strong>{b.guest_name}</strong></p>
        {b.status === 'hold' && b.hold_expires_at && (
          <Notice kind="warn">Phòng đang được <strong>giữ chỗ đến {dateTimeVN(b.hold_expires_at)}</strong>. Sau thời điểm này, nếu khách sạn chưa nhận được tiền cọc, giữ chỗ sẽ tự hủy.</Notice>
        )}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Loại phòng</th><th>Nhận</th><th>Trả</th><th>Khách</th></tr></thead>
            <tbody>{b.rooms.map((r, i) => (
              <tr key={i}><td>{r.room_type}</td><td>{dateVN(r.check_in)}</td><td>{dateVN(r.check_out)}</td><td>{r.adults} NL{r.children ? ` · ${r.children} TE` : ''}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <dl className="dl" style={{ maxWidth: 420 }}>
          <dt>Tổng tiền</dt><dd>{money(b.total)}</dd>
          <dt>Tiền cọc yêu cầu</dt><dd>{money(b.deposit_required)}</dd>
          <dt>Đã ghi nhận thanh toán</dt><dd>{money(b.paid)}</dd>
          {b.pending_claims > 0 && <><dt>Đang chờ đối soát</dt><dd>{money(b.pending_claims)}</dd></>}
          <dt className="total">Cọc còn lại</dt><dd className="total">{money(b.deposit_remaining)}</dd>
        </dl>
        {b.policy?.description && <p className="small muted"><strong>Chính sách ({b.policy.rate_plan}):</strong> {b.policy.description}</p>}
      </div>

      {waiting && b.deposit_remaining > 0 && (b.payment ? (
        <div className="card card-pad stack">
          <h2 className="serif" style={{ fontSize: 24 }}><QrCode size={20} aria-hidden /> Thanh toán cọc bằng chuyển khoản</h2>
          <div className="qr-box">
            <Qr text={b.payment.qr} />
            <dl className="dl" style={{ gridTemplateColumns: 'auto 1fr' }}>
              <dt>Ngân hàng</dt><dd>{b.payment.bank_name || '—'}</dd>
              <dt>Số tài khoản</dt><dd>{b.payment.account_number} <CopyText value={b.payment.account_number} /></dd>
              <dt>Chủ tài khoản</dt><dd>{b.payment.account_name || '—'}</dd>
              <dt>Số tiền</dt><dd><strong>{money(b.payment.amount)}</strong></dd>
              <dt>Nội dung</dt><dd><strong>{b.payment.message}</strong> <CopyText value={b.payment.message} /></dd>
            </dl>
          </div>
          <p className="small muted">Vui lòng giữ đúng nội dung chuyển khoản để khách sạn đối soát. Đặt phòng chỉ được xác nhận khi khách sạn ghi nhận tiền về tài khoản.</p>
          <form className="stack" onSubmit={claim}>
            <h3 style={{ fontSize: 16 }}>Tôi đã chuyển khoản</h3>
            <div className="form-grid">
              <label className="field"><span>Số tiền đã chuyển (đ)</span><input className="input" name="amount" type="number" min={1000} step={1000} required defaultValue={b.deposit_remaining} /></label>
              <label className="field"><span>Mã giao dịch (nếu có)</span><input className="input" name="reference" maxLength={120} /></label>
            </div>
            <button className="btn btn-bronze" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi thông báo chuyển khoản'}</button>
          </form>
        </div>
      ) : (
        <Notice kind="info">Khách sạn sẽ liên hệ để hướng dẫn thanh toán tiền cọc, hoặc bạn có thể thanh toán tại quầy lễ tân. Đặt phòng chỉ được xác nhận sau khi khách sạn ghi nhận khoản cọc.</Notice>
      ))}
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
    </div>
  );
}
