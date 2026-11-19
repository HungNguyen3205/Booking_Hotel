'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeftRight, ConciergeBell, CreditCard, FilePlus2, Percent, Printer, Undo2, XCircle } from 'lucide-react';
import { post } from '@/lib/api';
import { dateTimeVN, dateVN, LINE_TYPE, money, PAYMENT_KIND } from '@/lib/format';
import { Field, Notice, useAction } from '@/components/ui';
import { useSession } from './session';
import { PaymentForm, RefundForm, ServiceForm, useOptions } from './stay-actions';
import type { BookingDetail, Folio, FolioLine } from './types';

type Action = null | 'service' | 'line' | 'pay' | 'refund' | 'new' | 'move' | { void: FolioLine };

export function FolioPanel({ detail, folio, onChanged }: { detail: BookingDetail; folio: Folio; onChanged: () => void }) {
  const { can } = useSession();
  const options = useOptions();
  const [action, setAction] = useState<Action>(null);
  const done = () => { setAction(null); onChanged(); };
  const nights = detail.booking.stays.flatMap(s => s.nights.filter(n => n.folio_id === folio.id).map(n => ({ ...n, room: s.room?.number })));
  const activeNights = nights.filter(n => !n.void);
  const t = folio.totals;
  const open = folio.status === 'open';
  const methodName = (code: string) => options?.payment_methods.find(m => m.code === code)?.name ?? code;
  const stayIdForService = detail.booking.stays.find(s => s.status === 'checked_in')?.id ?? detail.booking.stays[0]?.id;

  return (
    <section className="card">
      <div className="card-head">
        <h3>{folio.name} {folio.status === 'closed' && <span className="badge b-neutral">Đã đóng</span>}</h3>
        <div className="row no-print">
          <Link className="btn btn-sm btn-ghost" href={`/admin/in/bang-ke/${folio.id}`} target="_blank"><Printer size={14} /> Bảng kê</Link>
        </div>
      </div>
      <div className="card-pad stack">
        <div className="grid-2">
          <dl className="dl">
            <dt>Tiền phòng ({activeNights.length} đêm)</dt><dd>{money(t.room)}</dd>
            <dt>Dịch vụ</dt><dd>{money(t.services)}</dd>
            <dt>Phụ thu / phí</dt><dd>{money(t.surcharges)}</dd>
            <dt>Giảm giá / điều chỉnh</dt><dd>{money(t.discounts)}</dd>
            <dt className="total">Tổng phát sinh</dt><dd className="total">{money(t.charges)}</dd>
          </dl>
          <dl className="dl">
            <dt>Tiền cọc đã thu</dt><dd>{money(t.deposits)}</dd>
            <dt>Thanh toán</dt><dd>{money(t.payments)}</dd>
            <dt>Đã hoàn</dt><dd>{t.refunds ? `−${money(t.refunds)}` : money(0)}</dd>
            <dt className="total">Còn phải thu</dt><dd className="total" style={{ color: t.balance > 0 ? 'var(--red-ink)' : t.balance < 0 ? 'var(--blue-ink)' : 'var(--green-ok)' }}>
              {t.balance < 0 ? `Thu thừa ${money(-t.balance)}` : money(t.balance)}</dd>
          </dl>
        </div>

        {open && (
          <div className="panel-actions no-print">
            {can('services.post') && stayIdForService && <button className="btn btn-sm" onClick={() => setAction('service')}><ConciergeBell size={14} /> Thêm dịch vụ</button>}
            {(can('services.post') || can('discounts.apply')) && <button className="btn btn-sm" onClick={() => setAction('line')}><Percent size={14} /> Phụ thu / giảm giá</button>}
            {can('payments.collect') && <button className="btn btn-sm btn-primary" onClick={() => setAction('pay')}><CreditCard size={14} /> Thu tiền</button>}
            {can('payments.refund') && t.paid > 0 && <button className="btn btn-sm" onClick={() => setAction('refund')}><Undo2 size={14} /> Hoàn tiền</button>}
            {can('folios.split') && <button className="btn btn-sm" onClick={() => setAction('new')}><FilePlus2 size={14} /> Tạo hồ sơ tách</button>}
            {can('folios.split') && detail.folios.length > 1 && <button className="btn btn-sm" onClick={() => setAction('move')}><ArrowLeftRight size={14} /> Chuyển khoản mục</button>}
          </div>
        )}
        {action === 'service' && stayIdForService && <ServiceForm folioId={folio.id} stayId={stayIdForService} onDone={done} onCancel={() => setAction(null)} />}
        {action === 'line' && <LineForm folioId={folio.id} onDone={done} onCancel={() => setAction(null)} />}
        {action === 'pay' && <PaymentForm bookingId={detail.booking.id} folioId={folio.id} balance={t.balance}
          defaultKind={['hold', 'confirmed'].includes(detail.booking.status) ? 'deposit' : 'payment'} onDone={done} onCancel={() => setAction(null)} />}
        {action === 'refund' && <RefundForm bookingId={detail.booking.id} folioId={folio.id} paid={t.paid} onDone={done} onCancel={() => setAction(null)} />}
        {action === 'new' && <NewFolioForm bookingId={detail.booking.id} onDone={done} onCancel={() => setAction(null)} />}
        {action === 'move' && <MoveItemsForm detail={detail} folio={folio} nights={activeNights} onDone={done} onCancel={() => setAction(null)} />}
        {action && typeof action === 'object' && 'void' in action && <VoidForm line={action.void} onDone={done} onCancel={() => setAction(null)} />}

        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Ngày</th><th>Khoản</th><th className="right">SL</th><th className="right">Thành tiền</th><th>Người ghi</th><th /></tr></thead>
            <tbody>
              {activeNights.length > 0 && (
                <tr><td className="nowrap small">{dateVN(activeNights[0].night, true)}–{dateVN(activeNights[activeNights.length - 1].night, true)}</td>
                  <td>Tiền phòng {[...new Set(activeNights.map(n => n.room).filter(Boolean))].join(', ')} <span className="tiny muted">(giá đã chụp từng đêm)</span></td>
                  <td className="right">{activeNights.length}</td><td className="right num">{money(t.room)}</td><td /><td /></tr>
              )}
              {folio.lines.map(l => (
                <tr key={l.id} className={l.voided_at ? 'void' : ''}>
                  <td className="nowrap small">{dateVN(l.business_date, true)}</td>
                  <td>{LINE_TYPE[l.type] ?? l.type}: {l.description}{l.reason && <div className="tiny muted">Lý do: {l.reason}</div>}</td>
                  <td className="right">{l.quantity}</td><td className="right num">{money(l.amount)}</td>
                  <td className="small">{l.poster?.name ?? 'Hệ thống'}</td>
                  <td className="right no-print">{open && !l.voided_at && !l.reverses_id && can('services.void') &&
                    <button className="btn btn-sm btn-ghost" onClick={() => setAction({ void: l })} title="Hủy bằng dòng đảo"><XCircle size={14} /> Hủy</button>}</td>
                </tr>
              ))}
              {!activeNights.length && !folio.lines.length && <tr><td colSpan={6} className="muted small">Chưa có khoản phát sinh.</td></tr>}
            </tbody>
          </table>
        </div>

        {can('payments.view') && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Số phiếu</th><th>Thời điểm</th><th>Loại</th><th>Phương thức</th><th className="right">Số tiền</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {folio.payments.length === 0 && <tr><td colSpan={7} className="muted small">Chưa có khoản thu.</td></tr>}
                {folio.payments.map(p => (
                  <tr key={p.id} className={p.status === 'cancelled' || p.status === 'failed' ? 'void' : ''}>
                    <td className="small">{p.receipt_no ?? '—'}</td>
                    <td className="small nowrap">{dateTimeVN(p.paid_at)}</td>
                    <td>{PAYMENT_KIND[p.kind]}</td>
                    <td className="small">{methodName(p.method)}{p.reference && <div className="tiny muted">{p.reference}</div>}{p.provider && <div className="tiny muted">qua {p.provider}</div>}</td>
                    <td className="right num">{p.kind === 'refund' ? '−' : ''}{money(p.amount)}</td>
                    <td className="small">{{ completed: 'Đã ghi nhận', pending: 'Chờ đối soát', failed: 'Không khớp', cancelled: 'Đã thay thế' }[p.status] ?? p.status}
                      {p.receiver && <div className="tiny muted">{p.receiver.name}</div>}</td>
                    <td className="no-print">{p.status === 'completed' && <Link className="btn btn-sm btn-ghost" href={`/admin/in/phieu-thu/${p.id}`} target="_blank"><Printer size={14} /></Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="tiny muted">Phiếu thu/bảng kê là chứng từ nội bộ, không phải hóa đơn điện tử. Hóa đơn điện tử chưa kết nối nhà cung cấp.</p>
      </div>
    </section>
  );
}

function LineForm({ folioId, onDone, onCancel }: { folioId: number; onDone: () => void; onCancel: () => void }) {
  const { can } = useSession();
  const { busy, run } = useAction();
  const [type, setType] = useState(can('discounts.apply') ? 'discount' : 'surcharge');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const signed = (type === 'surcharge' ? 1 : -1) * Math.abs(Number(amount));
  return (
    <form className="inline-form" onSubmit={async e => {
      e.preventDefault();
      const ok = await run(() => post(`/admin/folios/${folioId}/lines`, { type, description, amount: signed, reason: reason || undefined }), 'Đã ghi khoản.');
      if (ok) onDone();
    }}>
      <div className="row-between"><h4>Phụ thu / giảm giá / điều chỉnh</h4><button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Đóng</button></div>
      <div className="form-grid">
        <Field label="Loại"><select className="select" value={type} onChange={e => setType(e.target.value)}>
          {can('services.post') && <option value="surcharge">Phụ thu (+)</option>}
          {can('discounts.apply') && <option value="discount">Giảm giá (−)</option>}
          {can('services.void') && <option value="adjustment">Điều chỉnh giảm (−)</option>}
        </select></Field>
        <Field label="Số tiền (đ)"><input className="input num" type="number" min={1000} step={1000} value={amount} onChange={e => setAmount(e.target.value)} required /></Field>
      </div>
      <Field label="Nội dung"><input className="input" value={description} onChange={e => setDescription(e.target.value)} required maxLength={200} /></Field>
      <Field label={type === 'surcharge' ? 'Ghi chú (tùy chọn)' : 'Lý do (bắt buộc)'}><input className="input" value={reason} onChange={e => setReason(e.target.value)} required={type !== 'surcharge'} /></Field>
      <button className="btn btn-primary" disabled={busy}>Ghi {money(signed)}</button>
    </form>
  );
}

function VoidForm({ line, onDone, onCancel }: { line: FolioLine; onDone: () => void; onCancel: () => void }) {
  const { busy, run } = useAction();
  const [reason, setReason] = useState('');
  return (
    <form className="inline-form" onSubmit={async e => {
      e.preventDefault();
      const ok = await run(() => post(`/admin/folio-lines/${line.id}/void`, { reason }), 'Đã hủy khoản bằng dòng đảo.');
      if (ok) onDone();
    }}>
      <div className="row-between"><h4>Hủy khoản: {line.description} ({money(line.amount)})</h4><button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Đóng</button></div>
      <Notice kind="info">Khoản gốc được giữ lại; hệ thống tạo dòng đảo âm. Minibar được hoàn kho đúng một lần.</Notice>
      <Field label="Lý do"><input className="input" value={reason} onChange={e => setReason(e.target.value)} required minLength={3} /></Field>
      <button className="btn btn-danger" disabled={busy}>Xác nhận hủy khoản</button>
    </form>
  );
}

function NewFolioForm({ bookingId, onDone, onCancel }: { bookingId: number; onDone: () => void; onCancel: () => void }) {
  const { busy, run } = useAction();
  const [name, setName] = useState('Thanh toán riêng');
  return (
    <form className="inline-form" onSubmit={async e => {
      e.preventDefault();
      const ok = await run(() => post(`/admin/bookings/${bookingId}/folios`, { name }), 'Đã tạo hồ sơ thanh toán mới.');
      if (ok) onDone();
    }}>
      <div className="row-between"><h4>Tạo hồ sơ thanh toán tách</h4><button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Đóng</button></div>
      <Field label="Tên hồ sơ" hint="Ví dụ: Công ty trả tiền phòng, khách tự trả dịch vụ."><input className="input" value={name} onChange={e => setName(e.target.value)} required /></Field>
      <button className="btn btn-primary" disabled={busy}>Tạo hồ sơ</button>
    </form>
  );
}

function MoveItemsForm({ detail, folio, nights, onDone, onCancel }: { detail: BookingDetail; folio: Folio; nights: { id: number; night: string; amount: number; room?: string }[]; onDone: () => void; onCancel: () => void }) {
  const { busy, run } = useAction();
  const targets = detail.folios.filter(f => f.id !== folio.id && f.status === 'open');
  const [to, setTo] = useState(targets[0]?.id ?? 0);
  const [lineIds, setLineIds] = useState<number[]>([]);
  const [nightIds, setNightIds] = useState<number[]>([]);
  const [paymentIds, setPaymentIds] = useState<number[]>([]);
  const [reason, setReason] = useState('');
  const toggle = (list: number[], set: (v: number[]) => void, id: number) => set(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  return (
    <form className="inline-form" onSubmit={async e => {
      e.preventDefault();
      const ok = await run(async () => { await post(`/admin/folios/${folio.id}/move`, { to_folio_id: to, line_ids: lineIds, night_ids: nightIds, payment_ids: paymentIds, reason }); return true; }, 'Đã chuyển khoản mục.');
      if (ok) onDone();
    }}>
      <div className="row-between"><h4>Chuyển khoản mục sang hồ sơ khác</h4><button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Đóng</button></div>
      {!targets.length ? <Notice kind="warn">Chưa có hồ sơ đích đang mở.</Notice> : <>
        <Field label="Hồ sơ đích"><select className="select" value={to} onChange={e => setTo(Number(e.target.value))}>{targets.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
        <div className="stack-sm">
          {nights.map(n => <label key={`n${n.id}`} className="check"><input type="checkbox" checked={nightIds.includes(n.id)} onChange={() => toggle(nightIds, setNightIds, n.id)} /> Đêm {dateVN(n.night, true)} phòng {n.room} · {money(n.amount)}</label>)}
          {folio.lines.filter(l => !l.reverses_id).map(l => <label key={`l${l.id}`} className="check"><input type="checkbox" checked={lineIds.includes(l.id)} onChange={() => toggle(lineIds, setLineIds, l.id)} /> {l.description} · {money(l.amount)}</label>)}
          {folio.payments.filter(p => p.status === 'completed').map(p => <label key={`p${p.id}`} className="check"><input type="checkbox" checked={paymentIds.includes(p.id)} onChange={() => toggle(paymentIds, setPaymentIds, p.id)} /> {PAYMENT_KIND[p.kind]} {money(p.amount)} ({p.receipt_no})</label>)}
        </div>
        <Field label="Lý do"><input className="input" value={reason} onChange={e => setReason(e.target.value)} required /></Field>
        <button className="btn btn-primary" disabled={busy || (!lineIds.length && !nightIds.length && !paymentIds.length)}>Chuyển</button>
      </>}
    </form>
  );
}
