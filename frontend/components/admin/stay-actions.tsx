'use client';

import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Eye } from 'lucide-react';
import { get, post } from '@/lib/api';
import { addDays, dateVN, errorText, money, todayISO } from '@/lib/format';
import { Field, Notice, useAction } from '@/components/ui';
import { useSession } from './session';
import { HousekeepingBadge } from './badges';
import type { Options, ServiceItem } from './types';

// Các form thao tác lễ tân dùng chung cho bảng chi tiết phòng và trang đặt phòng.
// Mỗi thao tác thay đổi giá/tồn đều "xem trước" và gửi kèm expected_delta để backend kiểm tra lại khi xác nhận.

let optionsPromise: Promise<Options> | null = null;
export function useOptions() {
  const [options, setOptions] = useState<Options | null>(null);
  useEffect(() => {
    optionsPromise ??= get<Options>('/admin/bookings/options').catch(e => { optionsPromise = null; throw e; });
    optionsPromise.then(setOptions).catch(() => undefined);
  }, []);
  return options;
}

function FormBox({ title, onCancel, children, onSubmit }: { title: string; onCancel: () => void; children: ReactNode; onSubmit: (e: FormEvent) => void }) {
  return (
    <form className="inline-form" onSubmit={e => { e.preventDefault(); e.stopPropagation(); onSubmit(e); }}>
      <div className="row-between"><h4>{title}</h4><button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Đóng</button></div>
      {children}
    </form>
  );
}

type Done = () => void;

export function CheckInForm({ stayId, roomNumber, housekeeping, onDone, onCancel }: { stayId: number; roomNumber?: string; housekeeping?: string; onDone: Done; onCancel: () => void }) {
  const { can } = useSession();
  const options = useOptions();
  const { busy, run } = useAction();
  const [reason, setReason] = useState('');
  const [early, setEarly] = useState(false);
  const dirty = housekeeping && housekeeping !== 'clean';
  const blocked = dirty && !can('frontdesk.override_dirty');
  return (
    <FormBox title={`Nhận phòng ${roomNumber ?? ''}`} onCancel={onCancel} onSubmit={async () => {
      const ok = await run(() => post(`/admin/stays/${stayId}/check-in`, { override_reason: dirty ? reason : undefined, early_fee: early }), 'Đã nhận phòng.');
      if (ok) onDone();
    }}>
      {dirty && (
        <Notice kind={blocked ? 'error' : 'warn'}>
          Phòng chưa sẵn sàng: <HousekeepingBadge status={housekeeping!} />.{' '}
          {blocked ? 'Cần người có quyền ngoại lệ hoặc chờ buồng phòng hoàn tất.' : 'Nhận phòng ngoại lệ phải ghi lý do và sẽ được lưu nhật ký.'}
        </Notice>
      )}
      {dirty && !blocked && <Field label="Lý do nhận phòng chưa sẵn sàng"><input className="input" value={reason} onChange={e => setReason(e.target.value)} required /></Field>}
      {(options?.surcharges.early_check_in ?? 0) > 0 && (
        <label className="check"><input type="checkbox" checked={early} onChange={e => setEarly(e.target.checked)} /> Phụ thu nhận sớm ({money(options!.surcharges.early_check_in)})</label>
      )}
      <button className="btn btn-primary" disabled={busy || !!blocked}><Check size={16} /> Xác nhận nhận phòng</button>
    </FormBox>
  );
}

export function PaymentForm({ bookingId, folioId, balance, defaultKind = 'payment', onDone, onCancel, title }: {
  bookingId: number; folioId?: number; balance: number; defaultKind?: 'deposit' | 'payment'; onDone: Done; onCancel: () => void; title?: string;
}) {
  const options = useOptions();
  const { busy, run } = useAction();
  const [kind, setKind] = useState(defaultKind);
  const [method, setMethod] = useState('');
  const [amount, setAmount] = useState(String(Math.max(0, balance)));
  const [reference, setReference] = useState('');
  useEffect(() => { if (!method && options?.payment_methods[0]) setMethod(options.payment_methods[0].code); }, [options, method]);
  return (
    <FormBox title={title ?? 'Thu tiền'} onCancel={onCancel} onSubmit={async () => {
      const ok = await run(() => post(`/admin/bookings/${bookingId}/payments`, { folio_id: folioId, kind, method, amount: Number(amount), reference: reference || undefined }),
        `Đã ghi nhận ${money(Number(amount))}.`);
      if (ok) onDone();
    }}>
      <p className="small muted">Còn phải thu: <strong>{money(balance)}</strong>. Chỉ ghi nhận khi đã nhận tiền thực tế.</p>
      <div className="form-grid">
        <Field label="Loại"><select className="select" value={kind} onChange={e => setKind(e.target.value as 'deposit' | 'payment')}>
          <option value="deposit">Tiền cọc</option><option value="payment">Thanh toán</option></select></Field>
        <Field label="Phương thức"><select className="select" value={method} onChange={e => setMethod(e.target.value)} required>
          {options?.payment_methods.map(m => <option key={m.code} value={m.code}>{m.name}</option>)}</select></Field>
        <Field label="Số tiền (đ)"><input className="input num" type="number" min={1} step={1000} value={amount} onChange={e => setAmount(e.target.value)} required /></Field>
        <Field label="Mã giao dịch / tham chiếu"><input className="input" value={reference} onChange={e => setReference(e.target.value)} /></Field>
      </div>
      <button className="btn btn-primary" disabled={busy || !method}><Check size={16} /> Ghi nhận khoản thu</button>
    </FormBox>
  );
}

export function RefundForm({ bookingId, folioId, paid, onDone, onCancel }: { bookingId: number; folioId?: number; paid: number; onDone: Done; onCancel: () => void }) {
  const options = useOptions();
  const { busy, run } = useAction();
  const [method, setMethod] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => { if (!method && options?.payment_methods[0]) setMethod(options.payment_methods[0].code); }, [options, method]);
  return (
    <FormBox title="Hoàn tiền" onCancel={onCancel} onSubmit={async () => {
      const ok = await run(() => post(`/admin/bookings/${bookingId}/refunds`, { folio_id: folioId, method, amount: Number(amount), reason }), 'Đã ghi nhận hoàn tiền.');
      if (ok) onDone();
    }}>
      <p className="small muted">Đã thu của hồ sơ: <strong>{money(paid)}</strong>. Hoàn tiền tạo phiếu chi, không xóa khoản thu cũ.</p>
      <div className="form-grid">
        <Field label="Phương thức"><select className="select" value={method} onChange={e => setMethod(e.target.value)}>
          {options?.payment_methods.map(m => <option key={m.code} value={m.code}>{m.name}</option>)}</select></Field>
        <Field label="Số tiền (đ)"><input className="input num" type="number" min={1} step={1000} max={paid} value={amount} onChange={e => setAmount(e.target.value)} required /></Field>
      </div>
      <Field label="Lý do hoàn tiền"><input className="input" value={reason} onChange={e => setReason(e.target.value)} required minLength={3} /></Field>
      <button className="btn btn-danger" disabled={busy}>Xác nhận hoàn tiền</button>
    </FormBox>
  );
}

type CheckoutQuote = { overdue: boolean; early: boolean; new_check_out: string; void_nights: string[]; voided_amount: number; late_fee: number;
  balance_before: number; balance_after: number; others_in_house: boolean };

export function CheckOutForm({ stayId, bookingId, roomNumber, hasBillTo = false, onDone, onCancel }: {
  stayId: number; bookingId: number; roomNumber?: string; balance?: number; othersInHouse?: boolean; hasBillTo?: boolean; onDone: Done; onCancel: () => void;
}) {
  const { can } = useSession();
  const options = useOptions();
  const { busy, run } = useAction();
  const [late, setLate] = useState(false);
  const [debt, setDebt] = useState(false);
  const [reason, setReason] = useState('');
  const [paying, setPaying] = useState(false);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [error, setError] = useState('');
  const load = () => { setError(''); setQuote(null); return post<CheckoutQuote>(`/admin/stays/${stayId}/check-out/quote`, { late_fee: late }).then(setQuote).catch(e => setError(errorText(e))); };
  useEffect(() => { load(); }, [stayId, late]); // eslint-disable-line react-hooks/exhaustive-deps
  const balance = quote?.balance_after ?? 0;
  const needsSettle = !!quote && balance > 0 && !quote.others_in_house;
  return (
    <FormBox title={`Trả phòng ${roomNumber ?? ''}`} onCancel={onCancel} onSubmit={async () => {
      if (!quote) return;
      const ok = await run(() => post(`/admin/stays/${stayId}/check-out`, { late_fee: late, settle_later: debt, reason: debt ? reason : undefined, expected_balance: quote.balance_after }),
        'Đã trả phòng. Phòng chuyển sang cần dọn.');
      if (ok) onDone();
    }}>
      {error && <Notice kind="error">{error}</Notice>}
      {!quote && !error && <p className="small muted">Đang tính quyết toán…</p>}
      {quote?.overdue && <Notice kind="error">Khách đã ở quá ngày trả. Gia hạn thêm đêm trước khi trả phòng.</Notice>}
      {quote?.early && <Notice kind="info">Trả sớm: hủy {quote.void_nights.length} đêm chưa ở ({quote.void_nights.map(n => dateVN(n, true)).join(', ')}) — giảm {money(quote.voided_amount)}. Ngày trả mới {dateVN(quote.new_check_out)}.</Notice>}
      {quote && !quote.overdue && (needsSettle
        ? <Notice kind="warn">Còn phải thu sau điều chỉnh: <strong>{money(balance)}</strong>. Thu đủ trước khi trả phòng hoặc ghi công nợ.</Notice>
        : <Notice kind="ok">{quote.others_in_house ? 'Đặt phòng còn phòng khác đang ở — quyết toán khi trả phòng cuối.'
          : balance < 0 ? `Khách đã trả thừa ${money(-balance)} — hoàn tiền trong hồ sơ thanh toán sau khi trả phòng.` : 'Đã thanh toán đủ.'}</Notice>)}
      {needsSettle && can('payments.collect') && !paying && <button type="button" className="btn" onClick={() => setPaying(true)}>Thu {money(balance)} ngay</button>}
      {paying && <PaymentForm key={balance} bookingId={bookingId} balance={balance} onDone={() => { setPaying(false); load(); }} onCancel={() => setPaying(false)} />}
      {(options?.surcharges.late_check_out ?? 0) > 0 && (
        <label className="check"><input type="checkbox" checked={late} onChange={e => setLate(e.target.checked)} /> Phụ thu trả muộn ({money(options!.surcharges.late_check_out)})</label>
      )}
      {needsSettle && (can('frontdesk.debt_checkout') || hasBillTo) && (
        <>
          <label className="check"><input type="checkbox" checked={debt} onChange={e => setDebt(e.target.checked)} /> Ghi công nợ, thu sau{hasBillTo ? ' (công ty/đại lý chịu công nợ)' : ''}</label>
          {debt && <Field label="Lý do ghi công nợ"><input className="input" value={reason} onChange={e => setReason(e.target.value)} required /></Field>}
        </>
      )}
      <button className="btn btn-primary" disabled={busy || !quote || quote.overdue || (needsSettle && !debt)}><Check size={16} /> Xác nhận trả phòng</button>
    </FormBox>
  );
}

type DatesQuote = { ok: boolean; conflicts: string[]; alternatives: { id: number; number: string }[]; added: { night: string; amount: number; label: string }[];
  removed: string[]; removed_amount: number; delta: number };

export function DatesForm({ stay, onDone, onCancel }: { stay: { id: number; status: string; check_in: string; check_out: string }; onDone: Done; onCancel: () => void }) {
  const { busy, run } = useAction();
  const inHouse = stay.status === 'checked_in';
  const [checkIn, setCheckIn] = useState(stay.check_in);
  const [checkOut, setCheckOut] = useState(inHouse ? addDays(stay.check_out, 1) : stay.check_out);
  const [reason, setReason] = useState('');
  const [quote, setQuote] = useState<DatesQuote | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setQuote(null); }, [checkIn, checkOut]);
  async function preview() {
    setError('');
    try { setQuote(await post<DatesQuote>(`/admin/stays/${stay.id}/dates/quote`, { check_in: checkIn, check_out: checkOut })); } catch (e) { setError(errorText(e)); }
  }
  return (
    <FormBox title={inHouse ? 'Gia hạn / đổi ngày trả' : 'Đổi ngày lưu trú'} onCancel={onCancel} onSubmit={async () => {
      if (!quote) return preview();
      const ok = await run(() => post(`/admin/stays/${stay.id}/dates`, { check_in: checkIn, check_out: checkOut, reason: reason || undefined, expected_delta: quote.delta }),
        'Đã cập nhật ngày lưu trú.');
      if (ok) onDone();
    }}>
      <div className="form-grid">
        <Field label="Nhận phòng"><input className="input" type="date" value={checkIn} disabled={inHouse} min={todayISO()} onChange={e => setCheckIn(e.target.value)} /></Field>
        <Field label="Trả phòng"><input className="input" type="date" value={checkOut} min={addDays(checkIn, 1)} onChange={e => setCheckOut(e.target.value)} /></Field>
      </div>
      <Field label="Lý do (tùy chọn)"><input className="input" value={reason} onChange={e => setReason(e.target.value)} /></Field>
      {error && <Notice kind="error">{error}</Notice>}
      {quote && (quote.ok ? (
        <Notice kind="info">
          {quote.added.length > 0 && <div>Thêm {quote.added.length} đêm: {quote.added.map(n => `${dateVN(n.night, true)} ${money(n.amount)}`).join(', ')}</div>}
          {quote.removed.length > 0 && <div>Bớt {quote.removed.length} đêm (−{money(quote.removed_amount)})</div>}
          <div>Chênh lệch: <strong>{quote.delta >= 0 ? '+' : ''}{money(quote.delta)}</strong></div>
        </Notice>
      ) : (
        <Notice kind="error">
          Phòng đã có lượt khác vào đêm {quote.conflicts.map(n => dateVN(n, true)).join(', ')}.
          {quote.alternatives.length > 0 ? ` Phòng cùng loại còn trống cả khoảng: ${quote.alternatives.map(r => r.number).join(', ')} — dùng "Chuyển phòng".` : ' Không còn phòng cùng loại trống cả khoảng.'}
        </Notice>
      ))}
      <div className="row">
        {!quote && <button className="btn btn-primary" disabled={busy}><Eye size={16} /> Kiểm tra tồn & giá</button>}
        {quote?.ok && <button className="btn btn-primary" disabled={busy}><Check size={16} /> Xác nhận thay đổi</button>}
      </div>
    </FormBox>
  );
}

type FreeRoom = { id: number; number: string; room_type_id: number; type: string; housekeeping: string; same_type: boolean };
type MoveQuote = { ok: boolean; room: { number: string; type: string; housekeeping: string }; from: string; to: string; type_changed: boolean;
  current_amount: number; new_amount: number; delta: number; message: string | null };

export function MoveForm({ stay, presetRoomId, onDone, onCancel }: { stay: { id: number; status: string }; presetRoomId?: number; onDone: Done; onCancel: () => void }) {
  const { can } = useSession();
  const { busy, run } = useAction();
  const [rooms, setRooms] = useState<FreeRoom[] | null>(null);
  const [roomId, setRoomId] = useState<number | ''>(presetRoomId ?? '');
  const [reprice, setReprice] = useState(false);
  const [reason, setReason] = useState('');
  const [override, setOverride] = useState('');
  const [quote, setQuote] = useState<MoveQuote | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { get<FreeRoom[]>(`/admin/stays/${stay.id}/free-rooms`).then(setRooms).catch(e => setError(errorText(e))); }, [stay.id]);
  useEffect(() => { setQuote(null); setError(''); }, [roomId, reprice]);
  const selected = rooms?.find(r => r.id === roomId);
  const presetMissing = presetRoomId && rooms && !rooms.some(r => r.id === presetRoomId);
  async function preview() {
    try { setQuote(await post<MoveQuote>(`/admin/stays/${stay.id}/move/quote`, { room_id: roomId, reprice })); } catch (e) { setError(errorText(e)); }
  }
  const needOverride = stay.status === 'checked_in' && selected && selected.housekeeping !== 'clean';
  return (
    <FormBox title="Chuyển phòng / đổi loại phòng" onCancel={onCancel} onSubmit={async () => {
      if (!quote) return preview();
      const ok = await run(() => post(`/admin/stays/${stay.id}/move`, { room_id: roomId, reprice, reason, override_reason: needOverride ? override : undefined, expected_delta: quote.delta }),
        'Đã chuyển phòng.');
      if (ok) onDone();
    }}>
      {presetMissing && <Notice kind="error">Phòng được chọn không trống cho các đêm còn lại.</Notice>}
      {!rooms && !error && <p className="small muted">Đang tìm phòng trống…</p>}
      {rooms && rooms.length === 0 && <Notice kind="warn">Không có phòng nào trống cho các đêm còn lại.</Notice>}
      {rooms && rooms.length > 0 && (
        <Field label="Phòng đích (chỉ hiện phòng trống cả khoảng)">
          <select className="select" value={roomId} onChange={e => setRoomId(Number(e.target.value) || '')} required>
            <option value="">— Chọn phòng —</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.number} · {r.type}{r.same_type ? '' : ' (khác loại)'} · {r.housekeeping === 'clean' ? 'Sạch' : 'Chưa sạch'}</option>)}
          </select>
        </Field>
      )}
      {selected && !selected.same_type && (
        <label className="check"><input type="checkbox" checked={reprice} onChange={e => setReprice(e.target.checked)} /> Tính lại giá theo loại phòng mới (bỏ chọn = giữ giá, nâng hạng miễn phí)</label>
      )}
      <Field label="Lý do chuyển phòng"><input className="input" value={reason} onChange={e => setReason(e.target.value)} required minLength={3} /></Field>
      {needOverride && (can('frontdesk.override_dirty')
        ? <Field label="Lý do chuyển vào phòng chưa sạch"><input className="input" value={override} onChange={e => setOverride(e.target.value)} required /></Field>
        : <Notice kind="error">Phòng đích chưa sạch. Cần quyền ngoại lệ.</Notice>)}
      {error && <Notice kind="error">{error}</Notice>}
      {quote && (quote.ok
        ? <Notice kind="info">Chuyển {dateVN(quote.from, true)}–{dateVN(quote.to, true)} sang phòng {quote.room.number} ({quote.room.type}). Tiền phòng các đêm còn lại: {money(quote.current_amount)} → {money(quote.new_amount)} (<strong>{quote.delta >= 0 ? '+' : ''}{money(quote.delta)}</strong>)</Notice>
        : <Notice kind="error">{quote.message}</Notice>)}
      <div className="row">
        {!quote && <button className="btn btn-primary" disabled={busy || !roomId}><Eye size={16} /> Kiểm tra & xem giá</button>}
        {quote?.ok && <button className="btn btn-primary" disabled={busy || (needOverride && !can('frontdesk.override_dirty'))}><ArrowRight size={16} /> Xác nhận chuyển</button>}
      </div>
    </FormBox>
  );
}

export function ServiceForm({ folioId, stayId, onDone, onCancel }: { folioId: number; stayId?: number; onDone: Done; onCancel: () => void }) {
  const { busy, run } = useAction();
  const [data, setData] = useState<{ services: ServiceItem[]; categories: Record<string, string> } | null>(null);
  const [error, setError] = useState('');
  const [serviceId, setServiceId] = useState<number | ''>('');
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  useEffect(() => {
    get<{ services: ServiceItem[]; categories: Record<string, string> }>('/admin/services').then(setData).catch(e => setError(errorText(e)));
  }, []);
  const svc = data?.services.find(s => s.id === serviceId);
  const groups = data ? Object.entries(data.categories).map(([k, label]) => [label, data.services.filter(s => s.active && s.category === k)] as const).filter(([, l]) => l.length) : [];
  return (
    <FormBox title="Thêm dịch vụ vào hồ sơ" onCancel={onCancel} onSubmit={async () => {
      const ok = await run(() => post(`/admin/folios/${folioId}/services`, { service_id: serviceId, quantity: Number(qty), stay_id: stayId, note: note || undefined }),
        'Đã ghi phí dịch vụ.');
      if (ok) onDone();
    }}>
      {error && <Notice kind="error">{error}</Notice>}
      {data && data.services.length === 0 && <Notice kind="warn">Chưa có dịch vụ trong danh mục.</Notice>}
      <div className="form-grid">
        <Field label="Dịch vụ">
          <select className="select" value={serviceId} onChange={e => setServiceId(Number(e.target.value) || '')} required>
            <option value="">— Chọn —</option>
            {groups.map(([label, list]) => <optgroup key={label} label={label}>{list.map(s => <option key={s.id} value={s.id}>{s.name} · {money(s.price)}/{s.unit}</option>)}</optgroup>)}
          </select>
        </Field>
        <Field label="Số lượng"><input className="input num" type="number" min={1} max={100} value={qty} onChange={e => setQty(e.target.value)} required /></Field>
      </div>
      <Field label="Ghi chú"><input className="input" value={note} onChange={e => setNote(e.target.value)} maxLength={200} /></Field>
      {svc && <p className="small">Thành tiền: <strong>{money(svc.price * Number(qty || 0))}</strong>{svc.item && ` · Tồn kho: ${svc.item.on_hand} ${svc.item.unit}`}</p>}
      <button className="btn btn-primary" disabled={busy || !serviceId}><Check size={16} /> Ghi phí</button>
    </FormBox>
  );
}

export function MaintenanceForm({ roomId, roomNumber, onDone, onCancel }: { roomId: number; roomNumber: string; onDone: Done; onCancel: () => void }) {
  const { can } = useSession();
  const { busy, run } = useAction();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [block, setBlock] = useState(false);
  const [type, setType] = useState('maintenance');
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO(1));
  return (
    <FormBox title={`Báo hỏng / bảo trì phòng ${roomNumber}`} onCancel={onCancel} onSubmit={async () => {
      const ok = await run(() => post('/admin/maintenance', { room_id: roomId, title, description: description || undefined, block,
        block_type: type, block_start: start, block_end: end }), block ? 'Đã báo hỏng và chặn bán phòng.' : 'Đã báo hỏng.');
      if (ok) onDone();
    }}>
      <Field label="Sự cố"><input className="input" value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} /></Field>
      <Field label="Mô tả"><textarea className="textarea" value={description} onChange={e => setDescription(e.target.value)} /></Field>
      {can('maintenance.manage') && (
        <>
          <label className="check"><input type="checkbox" checked={block} onChange={e => setBlock(e.target.checked)} /> Chặn bán phòng trong thời gian sửa</label>
          {block && (
            <div className="form-grid">
              <Field label="Loại"><select className="select" value={type} onChange={e => setType(e.target.value)}><option value="maintenance">Bảo trì</option><option value="out_of_service">Ngừng bán</option></select></Field>
              <Field label="Từ ngày"><input className="input" type="date" value={start} min={todayISO()} onChange={e => setStart(e.target.value)} /></Field>
              <Field label="Đến ngày (không gồm)"><input className="input" type="date" value={end} min={addDays(start, 1)} onChange={e => setEnd(e.target.value)} /></Field>
            </div>
          )}
        </>
      )}
      <button className="btn btn-primary" disabled={busy}><AlertTriangle size={16} /> Gửi báo hỏng</button>
    </FormBox>
  );
}

export function HousekeepingForm({ roomId, roomNumber, current, onDone, onCancel }: { roomId: number; roomNumber: string; current: string; onDone: Done; onCancel: () => void }) {
  const { busy, run } = useAction();
  const [status, setStatus] = useState(current === 'clean' ? 'dirty' : 'clean');
  const [reason, setReason] = useState('');
  return (
    <FormBox title={`Trạng thái buồng phòng ${roomNumber}`} onCancel={onCancel} onSubmit={async () => {
      const ok = await run(() => post(`/admin/rooms/${roomId}/housekeeping`, { status, reason }), 'Đã cập nhật trạng thái buồng.');
      if (ok) onDone();
    }}>
      <p className="small">Hiện tại: <HousekeepingBadge status={current} /></p>
      <Field label="Chuyển sang"><select className="select" value={status} onChange={e => setStatus(e.target.value)}>
        <option value="dirty">Bẩn — tạo việc dọn</option><option value="cleaning">Đang dọn</option><option value="inspecting">Chờ kiểm tra</option><option value="clean">Sạch — sẵn sàng</option></select></Field>
      <Field label="Lý do"><input className="input" value={reason} onChange={e => setReason(e.target.value)} required minLength={3} /></Field>
      <button className="btn btn-primary" disabled={busy}><Check size={16} /> Cập nhật</button>
    </FormBox>
  );
}
