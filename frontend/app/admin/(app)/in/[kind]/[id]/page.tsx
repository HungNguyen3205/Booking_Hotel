'use client';

import { use } from 'react';
import { Printer } from 'lucide-react';
import { get } from '@/lib/api';
import { dateTimeVN, dateVN, LINE_TYPE, money, PAYMENT_KIND } from '@/lib/format';
import { ErrorState, Loading, useLoad } from '@/components/ui';
import { RequirePerm } from '@/components/admin/shell';

type Hotel = { name: string; address: string | null; phone: string | null; email: string | null };
type Receipt = { hotel: Hotel; note: string; payment: { receipt_no: string; kind: string; method: string; amount: number; reference: string | null; note: string | null; paid_at: string;
  receiver: { name: string } | null; booking: { code: string; customer: { full_name: string; phone: string | null; address: string | null; tax_code: string | null }; stays: { room: { number: string } | null }[] } } };
type Statement = { hotel: Hotel; note: string; totals: { room: number; services: number; surcharges: number; discounts: number; charges: number; paid: number; balance: number; deposits: number; payments: number; refunds: number };
  folio: { name: string; booking: { code: string; customer: { full_name: string; phone: string | null; address: string | null; tax_code: string | null } }; bill_to: { full_name: string; tax_code: string | null; address: string | null } | null;
    nights: { id: number; night: string; amount: number; rate_label: string; void: boolean }[]; lines: { id: number; business_date: string; type: string; description: string; quantity: number; amount: number }[];
    payments: { id: number; receipt_no: string | null; kind: string; method: string; amount: number; status: string; paid_at: string }[] } };

function HotelHead({ hotel, title }: { hotel: Hotel; title: string }) {
  return (
    <div className="row-between" style={{ alignItems: 'flex-start', borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
      <div><strong style={{ letterSpacing: '.05em' }}>{hotel.name}</strong><div className="small">{[hotel.address, hotel.phone, hotel.email].filter(Boolean).join(' · ')}</div></div>
      <h1 className="serif" style={{ fontSize: 24 }}>{title}</h1>
    </div>
  );
}

function ReceiptView({ id }: { id: string }) {
  const { data, error, reload } = useLoad(() => get<Receipt>(`/admin/payments/${id}/receipt`), [id]);
  if (error) return <ErrorState error={error} onRetry={() => reload()} />;
  if (!data) return <Loading />;
  const p = data.payment;
  return (
    <div className="card card-pad stack print-doc">
      <HotelHead hotel={data.hotel} title={p.kind === 'refund' ? 'PHIẾU CHI' : 'PHIẾU THU'} />
      <dl className="dl" style={{ gridTemplateColumns: '180px 1fr' }}>
        <dt>Số phiếu</dt><dd style={{ textAlign: 'left' }}>{p.receipt_no}</dd>
        <dt>Thời điểm</dt><dd style={{ textAlign: 'left' }}>{dateTimeVN(p.paid_at)}</dd>
        <dt>Khách hàng</dt><dd style={{ textAlign: 'left' }}>{p.booking.customer.full_name} {p.booking.customer.phone}</dd>
        <dt>Đặt phòng</dt><dd style={{ textAlign: 'left' }}>{p.booking.code} · phòng {p.booking.stays.map(s => s.room?.number).filter(Boolean).join(', ')}</dd>
        <dt>Nội dung</dt><dd style={{ textAlign: 'left' }}>{PAYMENT_KIND[p.kind]}{p.note ? ` — ${p.note}` : ''}</dd>
        <dt>Phương thức</dt><dd style={{ textAlign: 'left' }}>{p.method}{p.reference ? ` · Mã GD ${p.reference}` : ''}</dd>
        <dt className="total">Số tiền</dt><dd className="total" style={{ textAlign: 'left' }}>{money(p.amount)}</dd>
        <dt>Người lập</dt><dd style={{ textAlign: 'left' }}>{p.receiver?.name ?? 'Hệ thống (webhook)'}</dd>
      </dl>
      <div className="grid-2" style={{ textAlign: 'center', marginTop: 24 }}><div>Người nộp/nhận tiền<br /><br /><br /></div><div>Người lập phiếu<br /><br /><br /></div></div>
      <p className="tiny muted">{data.note}</p>
    </div>
  );
}

function StatementView({ id }: { id: string }) {
  const { data, error, reload } = useLoad(() => get<Statement>(`/admin/folios/${id}/statement`), [id]);
  if (error) return <ErrorState error={error} onRetry={() => reload()} />;
  if (!data) return <Loading />;
  const f = data.folio;
  const t = data.totals;
  const bill = f.bill_to ?? f.booking.customer;
  return (
    <div className="card card-pad stack print-doc">
      <HotelHead hotel={data.hotel} title="BẢNG KÊ THANH TOÁN" />
      <p className="small">Đặt phòng <strong>{f.booking.code}</strong> · {f.name}<br />Khách: {f.booking.customer.full_name}{f.bill_to && <> · Bên thanh toán: {f.bill_to.full_name}</>}{bill.tax_code && ` · MST ${bill.tax_code}`}</p>
      <table className="table">
        <thead><tr><th>Ngày</th><th>Nội dung</th><th className="right">SL</th><th className="right">Thành tiền</th></tr></thead>
        <tbody>
          {f.nights.filter(n => !n.void).map(n => <tr key={`n${n.id}`}><td>{dateVN(n.night)}</td><td>Tiền phòng — {n.rate_label}</td><td className="right">1</td><td className="right num">{money(n.amount)}</td></tr>)}
          {f.lines.map(l => <tr key={`l${l.id}`}><td>{dateVN(l.business_date)}</td><td>{LINE_TYPE[l.type]}: {l.description}</td><td className="right">{l.quantity}</td><td className="right num">{money(l.amount)}</td></tr>)}
        </tbody>
      </table>
      <dl className="dl" style={{ maxWidth: 380, marginLeft: 'auto' }}>
        <dt>Tổng phát sinh</dt><dd>{money(t.charges)}</dd>
        <dt>Đã thu (cọc + thanh toán − hoàn)</dt><dd>{money(t.paid)}</dd>
        <dt className="total">Còn phải thu</dt><dd className="total">{money(t.balance)}</dd>
      </dl>
      <p className="small">Các khoản thu: {f.payments.filter(p => p.status === 'completed').map(p => `${p.receipt_no} ${PAYMENT_KIND[p.kind]} ${money(p.amount)}`).join('; ') || 'chưa có'}</p>
      <p className="tiny muted">{data.note}</p>
    </div>
  );
}

export default function PrintPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = use(params);
  return (
    <RequirePerm perm="payments.view">
      <div className="page" style={{ maxWidth: 820 }}>
        <div className="row no-print"><button className="btn btn-primary" onClick={() => window.print()}><Printer size={16} /> In / lưu PDF</button></div>
        {kind === 'phieu-thu' ? <ReceiptView id={id} /> : kind === 'bang-ke' ? <StatementView id={id} /> : <p>Không có mẫu in này.</p>}
      </div>
    </RequirePerm>
  );
}
