'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowUpDown, BedDouble, CalendarCheck, CalendarPlus, Clock, LogIn, LogOut, Pencil, Plus, Star, UserPlus, UserX, XCircle } from 'lucide-react';
import { get, patch, post } from '@/lib/api';
import { dateTimeVN, dateVN, diffDays, HOUSEKEEPING, money, SOURCES, todayISO } from '@/lib/format';
import { ErrorState, Field, Loading, Notice, useAction, useLoad } from '@/components/ui';
import { RequirePerm } from '@/components/admin/shell';
import { useSession } from '@/components/admin/session';
import { BookingBadge, HousekeepingBadge } from '@/components/admin/badges';
import { CheckInForm, CheckOutForm, DatesForm, MoveForm } from '@/components/admin/stay-actions';
import { FolioPanel } from '@/components/admin/folio-panel';
import type { BookingDetail, Stay } from '@/components/admin/types';

type BookingAction = null | 'cancel' | 'noshow' | 'hold' | 'edit' | 'add';
type StayAction = null | { stay: number; kind: 'checkin' | 'checkout' | 'dates' | 'move' | 'assign' | 'guest' };

function Detail({ id }: { id: string }) {
  const { can } = useSession();
  const { data, error, loading, reload } = useLoad(() => get<BookingDetail>(`/admin/bookings/${id}`), [id]);
  const [action, setAction] = useState<BookingAction>(null);
  const [stayAction, setStayAction] = useState<StayAction>(null);
  const { busy, run } = useAction();
  const done = () => { setAction(null); setStayAction(null); reload(true); };

  if (error) return <div className="page"><ErrorState error={error} onRetry={() => reload()} /></div>;
  if (loading && !data) return <div className="page"><Loading /></div>;
  if (!data) return null;
  const b = data.booking;
  const active = ['hold', 'confirmed'].includes(b.status);
  const first = b.stays.reduce((m, s) => (s.check_in < m ? s.check_in : m), b.stays[0]?.check_in ?? '');

  return (
    <div className="page">
      <div className="booking-head">
        <div className="stack-sm">
          <Link href="/admin/dat-phong" className="small muted">← Đặt phòng</Link>
          <div className="row"><h1 className="booking-code">{b.code}</h1><BookingBadge status={b.status} /></div>
          <p className="small muted">Nguồn {SOURCES[b.source]}{b.source_ref ? ` (${b.source_ref})` : ''} · tạo {dateTimeVN(b.created_at)}{b.creator ? ` bởi ${b.creator.name}` : ' qua website'}
            {b.rate_plan && ` · ${b.rate_plan.name}`}{b.group_name && ` · Đoàn: ${b.group_name}`}</p>
          {b.status === 'hold' && b.hold_expires_at && <Notice kind="warn"><Clock size={14} /> Giữ chỗ đến {dateTimeVN(b.hold_expires_at)} — hết hạn sẽ tự hủy và giải phóng phòng. Thu cọc hoặc xác nhận để giữ.</Notice>}
          {b.cancel_reason && <Notice kind="info">Lý do hủy/không đến: {b.cancel_reason}</Notice>}
        </div>
        <div className="panel-actions no-print">
          {b.status === 'hold' && can('bookings.edit') && <button className="btn btn-primary" disabled={busy} onClick={async () => { if (await run(() => post(`/admin/bookings/${b.id}/confirm`), 'Đã xác nhận đặt phòng.')) done(); }}><CalendarCheck size={16} /> Xác nhận</button>}
          {b.status === 'hold' && can('bookings.edit') && <button className="btn" onClick={() => setAction('hold')}><Clock size={16} /> Gia hạn giữ chỗ</button>}
          {['hold', 'confirmed', 'checked_in'].includes(b.status) && can('bookings.edit') && <button className="btn" onClick={() => setAction('add')}><Plus size={16} /> Thêm phòng</button>}
          {can('bookings.edit') && <button className="btn" onClick={() => setAction('edit')}><Pencil size={16} /> Sửa thông tin</button>}
          {active && can('bookings.cancel') && <button className="btn btn-danger" onClick={() => setAction('cancel')}><XCircle size={16} /> Hủy</button>}
          {b.status === 'confirmed' && can('bookings.cancel') && first <= todayISO() && <button className="btn btn-danger" onClick={() => setAction('noshow')}><UserX size={16} /> Không đến</button>}
        </div>
      </div>

      {action === 'cancel' && data.cancellation && <CancelForm data={data} mode="cancel" onDone={done} onCancel={() => setAction(null)} />}
      {action === 'noshow' && <CancelForm data={data} mode="no_show" onDone={done} onCancel={() => setAction(null)} />}
      {action === 'hold' && <HoldForm bookingId={b.id} onDone={done} onCancel={() => setAction(null)} />}
      {action === 'edit' && <EditForm data={data} onDone={done} onCancel={() => setAction(null)} />}
      {action === 'add' && <AddStayForm data={data} onDone={done} onCancel={() => setAction(null)} />}

      <div className="grid-2">
        <section className="card card-pad stack">
          <div className="row-between"><h2 style={{ fontSize: 15 }}>Khách đặt phòng</h2>{can('guests.view') && <Link className="small" href={`/admin/khach-hang/${b.customer.id}`}>Hồ sơ →</Link>}</div>
          <p><strong>{b.customer.vip && <Star size={13} aria-label="VIP" />} {b.customer.full_name}</strong><br />
            <span className="small">{[b.customer.phone, b.customer.email, b.customer.nationality].filter(Boolean).join(' · ') || 'Chưa có liên hệ'}</span></p>
          {b.bill_to && <p className="small">Công nợ do: <strong>{b.bill_to.full_name}</strong> ({b.bill_to.kind === 'agent' ? 'đại lý' : 'công ty'})</p>}
          {b.special_requests && <div><span className="field-label">Yêu cầu đặc biệt</span><p className="small">{b.special_requests}</p></div>}
          {b.internal_notes && <div><span className="field-label">Ghi chú nội bộ</span><p className="small">{b.internal_notes}</p></div>}
        </section>
        <section className="card card-pad stack">
          <h2 style={{ fontSize: 15 }}>Tiền & chính sách</h2>
          {can('payments.view') ? (
            <dl className="dl">
              <dt>Tổng phát sinh</dt><dd>{money(data.totals.charges)}</dd>
              <dt>Cọc yêu cầu ({b.deposit_percent}%)</dt><dd>{money(b.deposit_required)}</dd>
              <dt>Đã thu (cọc + thanh toán − hoàn)</dt><dd>{money(data.totals.paid)}</dd>
              {data.totals.pending_claims > 0 && <><dt>Khách báo đã chuyển (chờ đối soát)</dt><dd>{money(data.totals.pending_claims)}</dd></>}
              <dt className="total">Còn phải thu</dt><dd className="total">{money(data.totals.balance)}</dd>
            </dl>
          ) : <p className="small muted">Không có quyền xem tài chính.</p>}
          {data.cancellation && <p className="small muted">Chính sách hủy: {data.cancellation.explain}</p>}
          {data.payment_qr && data.totals.balance > 0 && <PaymentQr qr={data.payment_qr} />}
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h2>Phòng & lưu trú ({b.stays.length})</h2></div>
        <div className="card-pad stay-grid">
          {b.stays.map(s => <StayBox key={s.id} stay={s} data={data} action={stayAction?.stay === s.id ? stayAction.kind : null}
            setAction={kind => setStayAction(kind ? { stay: s.id, kind } : null)} onDone={done} />)}
        </div>
      </section>

      {can('payments.view') ? data.folios.map(f => <FolioPanel key={f.id} detail={data} folio={f} onChanged={() => reload(true)} />)
        : <Notice kind="info">Hồ sơ thanh toán chỉ hiển thị cho người có quyền xem thanh toán.</Notice>}

      <section className="card">
        <div className="card-head"><h2>Lịch sử thay đổi</h2></div>
        <div className="card-pad">
          {data.history.length === 0 ? <p className="muted small">Chưa có.</p> : (
            <ul className="timeline">{data.history.map(h => (
              <li key={h.id}><span className="muted">{dateTimeVN(h.created_at)}<br />{h.user?.name ?? 'Hệ thống / khách'}</span>
                <span>{h.summary}{h.reason && <span className="muted"> — Lý do: {h.reason}</span>}</span></li>
            ))}</ul>
          )}
        </div>
      </section>
    </div>
  );
}

function StayBox({ stay: s, data, action, setAction, onDone }: { stay: Stay; data: BookingDetail; action: string | null; setAction: (k: 'checkin' | 'checkout' | 'dates' | 'move' | 'assign' | 'guest' | null) => void; onDone: () => void }) {
  const { can } = useSession();
  const today = todayISO();
  const othersInHouse = data.booking.stays.some(o => o.id !== s.id && o.status === 'checked_in');
  const nights = s.nights;
  return (
    <div className="stay-box">
      <div className="row-between">
        <div className="row"><BedDouble size={16} />{s.room ? <Link href={`/admin/lich-phong?room=${s.room.id}`} title="Xem trên sơ đồ"><strong>Phòng {s.room.number}</strong></Link> : <strong>Chưa phân phòng</strong>}<span className="muted small">{s.type.name}{!s.room_locked && s.room ? ' · tự phân' : ''}</span>
          {s.room && <HousekeepingBadge status={s.room.housekeeping} />}</div>
        <BookingBadge status={s.status} />
      </div>
      <div className="small">Nhận {dateVN(s.check_in)}{s.checked_in_at && ` (thực tế ${dateTimeVN(s.checked_in_at)})`} → Trả {dateVN(s.check_out)}{s.checked_out_at && ` (thực tế ${dateTimeVN(s.checked_out_at)})`}
        {' · '}{diffDays(s.check_in, s.check_out)} đêm · {s.adults} NL{s.children ? ` + ${s.children} TE` : ''}{s.extra_beds ? ` + ${s.extra_beds} giường phụ` : ''}</div>
      {s.dirty_override_reason && <Notice kind="warn">Nhận phòng ngoại lệ khi phòng chưa sẵn sàng: {s.dirty_override_reason}</Notice>}
      {can('payments.view') && <div className="nights">{nights.map(n => <span key={n.id} className={`night ${n.void ? 'void' : ''}`} title={`${n.rate_label}${n.void_reason ? ` — ${n.void_reason}` : ''}`}>{dateVN(n.night, true)} {money(n.amount)}</span>)}</div>}
      <div className="small">Khách: {s.guests.map(g => `${g.full_name}${g.pivot?.is_primary ? ' (đại diện)' : ''}`).join(', ') || '—'}</div>
      <div className="panel-actions no-print">
        {s.status === 'confirmed' && s.check_in <= today && can('frontdesk.checkin') && <button className="btn btn-sm btn-primary" onClick={() => setAction('checkin')}><LogIn size={14} /> Nhận phòng</button>}
        {s.status === 'checked_in' && can('frontdesk.checkout') && <button className="btn btn-sm btn-bronze" onClick={() => setAction('checkout')}><LogOut size={14} /> Trả phòng</button>}
        {['hold', 'confirmed', 'checked_in'].includes(s.status) && can('frontdesk.extend') && <button className="btn btn-sm" onClick={() => setAction('dates')}><CalendarPlus size={14} /> {s.status === 'checked_in' ? 'Gia hạn' : 'Đổi ngày'}</button>}
        {['hold', 'confirmed'].includes(s.status) && can('bookings.edit') && <button className="btn btn-sm" onClick={() => setAction('assign')}><BedDouble size={14} /> Phân phòng</button>}
        {['hold', 'confirmed', 'checked_in'].includes(s.status) && can('frontdesk.move') && <button className="btn btn-sm" onClick={() => setAction('move')}><ArrowUpDown size={14} /> Chuyển / đổi loại</button>}
        {['confirmed', 'checked_in'].includes(s.status) && can('bookings.edit') && <button className="btn btn-sm" onClick={() => setAction('guest')}><UserPlus size={14} /> Khách cùng phòng</button>}
      </div>
      {action === 'checkin' && <CheckInForm stayId={s.id} roomNumber={s.room?.number} housekeeping={s.room?.housekeeping} onDone={onDone} onCancel={() => setAction(null)} />}
      {action === 'checkout' && <CheckOutForm stayId={s.id} bookingId={data.booking.id} hasBillTo={!!data.booking.bill_to} roomNumber={s.room?.number} balance={data.totals.balance} othersInHouse={othersInHouse} onDone={onDone} onCancel={() => setAction(null)} />}
      {action === 'dates' && <DatesForm stay={s} onDone={onDone} onCancel={() => setAction(null)} />}
      {action === 'move' && <MoveForm stay={s} onDone={onDone} onCancel={() => setAction(null)} />}
      {action === 'assign' && <AssignForm stay={s} onDone={onDone} onCancel={() => setAction(null)} />}
      {action === 'guest' && <GuestForm stay={s} onDone={onDone} onCancel={() => setAction(null)} />}
    </div>
  );
}

function AssignForm({ stay, onDone, onCancel }: { stay: Stay; onDone: () => void; onCancel: () => void }) {
  const { busy, run } = useAction();
  const [rooms, setRooms] = useState<{ id: number; number: string; same_type: boolean; housekeeping: string }[] | null>(null);
  const [roomId, setRoomId] = useState<number | ''>('');
  useEffect(() => { get<typeof rooms>(`/admin/stays/${stay.id}/free-rooms`).then(r => setRooms((r ?? []).filter(x => x.same_type))).catch(() => setRooms([])); }, [stay.id]);
  return (
    <form className="inline-form" onSubmit={async e => {
      e.preventDefault();
      if (await run(() => post(`/admin/stays/${stay.id}/assign-room`, { room_id: roomId }), 'Đã phân phòng.')) onDone();
    }}>
      <div className="row-between"><h4>Phân phòng cụ thể ({stay.type.name})</h4><button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Đóng</button></div>
      {rooms === null ? <p className="small muted">Đang tải…</p> : rooms.length === 0 ? <Notice kind="warn">Không còn phòng cùng loại trống cả khoảng. Dùng "Chuyển / đổi loại".</Notice> : (
        <Field label="Phòng trống cùng loại"><select className="select" value={roomId} onChange={e => setRoomId(Number(e.target.value) || '')} required>
          <option value="">— Chọn —</option>{rooms.map(r => <option key={r.id} value={r.id}>{r.number} · {HOUSEKEEPING[r.housekeeping]}</option>)}</select></Field>
      )}
      <button className="btn btn-primary" disabled={busy || !roomId}>Phân phòng</button>
    </form>
  );
}

function GuestForm({ stay, onDone, onCancel }: { stay: Stay; onDone: () => void; onCancel: () => void }) {
  const { can } = useSession();
  const { busy, run } = useAction();
  const [f, setF] = useState({ full_name: '', phone: '', nationality: '', date_of_birth: '', gender: '', id_type: 'cccd', id_number: '' });
  return (
    <form className="inline-form" onSubmit={async e => {
      e.preventDefault();
      const body = Object.fromEntries(Object.entries(f).filter(([k, v]) => v && (can('guests.documents') || !k.startsWith('id_'))));
      if (await run(() => post(`/admin/stays/${stay.id}/guests`, body), 'Đã thêm khách cùng phòng.')) onDone();
    }}>
      <div className="row-between"><h4>Thêm khách cùng phòng</h4><button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Đóng</button></div>
      <div className="form-grid">
        <Field label="Họ tên"><input className="input" value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} required /></Field>
        <Field label="Số điện thoại"><input className="input" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Quốc tịch"><input className="input" value={f.nationality} onChange={e => setF({ ...f, nationality: e.target.value })} /></Field>
        <Field label="Ngày sinh"><input className="input" type="date" value={f.date_of_birth} onChange={e => setF({ ...f, date_of_birth: e.target.value })} /></Field>
        <Field label="Giới tính"><select className="select" value={f.gender} onChange={e => setF({ ...f, gender: e.target.value })}><option value="">—</option><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option></select></Field>
        {can('guests.documents') && <>
          <Field label="Loại giấy tờ"><select className="select" value={f.id_type} onChange={e => setF({ ...f, id_type: e.target.value })}><option value="cccd">CCCD</option><option value="passport">Hộ chiếu</option><option value="other">Khác</option></select></Field>
          <Field label="Số giấy tờ" hint="Được mã hóa khi lưu."><input className="input" value={f.id_number} onChange={e => setF({ ...f, id_number: e.target.value })} autoComplete="off" /></Field>
        </>}
      </div>
      <button className="btn btn-primary" disabled={busy}>Thêm khách</button>
    </form>
  );
}

function CancelForm({ data, mode, onDone, onCancel }: { data: BookingDetail; mode: 'cancel' | 'no_show'; onDone: () => void; onCancel: () => void }) {
  const { busy, run } = useAction();
  const [reason, setReason] = useState('');
  const [fee, setFee] = useState(!!data.cancellation?.late);
  const cancellable = data.booking.stays.filter(s => ['hold', 'confirmed'].includes(s.status));
  const [ids, setIds] = useState<number[]>(cancellable.map(s => s.id));
  return (
    <form className="inline-form" onSubmit={async e => {
      e.preventDefault();
      const ok = await run(() => post(`/admin/bookings/${data.booking.id}/cancel`, { reason, mode, charge_fee: fee, stay_ids: ids.length === cancellable.length ? undefined : ids }),
        mode === 'no_show' ? 'Đã đánh dấu không đến, phòng được giải phóng.' : 'Đã hủy, phòng được giải phóng.');
      if (ok) onDone();
    }}>
      <div className="row-between"><h4>{mode === 'no_show' ? 'Đánh dấu khách không đến' : 'Hủy đặt phòng'}</h4><button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Đóng</button></div>
      {data.cancellation && <Notice kind={data.cancellation.late ? 'warn' : 'info'}>{data.cancellation.explain}{data.cancellation.fee > 0 && mode === 'cancel' && ` Phí đề xuất: ${money(data.cancellation.fee)}.`}</Notice>}
      {cancellable.length > 1 && <div className="stack-sm">{cancellable.map(s => <label key={s.id} className="check"><input type="checkbox" checked={ids.includes(s.id)}
        onChange={() => setIds(ids.includes(s.id) ? ids.filter(x => x !== s.id) : [...ids, s.id])} /> {s.room ? `Phòng ${s.room.number}` : s.type.name} · {dateVN(s.check_in, true)}–{dateVN(s.check_out, true)}</label>)}</div>}
      <label className="check"><input type="checkbox" checked={fee} onChange={e => setFee(e.target.checked)} /> Tính phí theo chính sách đã chụp khi đặt</label>
      <Field label="Lý do"><input className="input" value={reason} onChange={e => setReason(e.target.value)} required minLength={3} /></Field>
      <p className="tiny muted">Tiền cọc đã thu không tự hoàn — dùng "Hoàn tiền" trong hồ sơ thanh toán nếu cần (theo quyền).</p>
      <button className="btn btn-danger" disabled={busy || !ids.length}>Xác nhận</button>
    </form>
  );
}

function HoldForm({ bookingId, onDone, onCancel }: { bookingId: number; onDone: () => void; onCancel: () => void }) {
  const { busy, run } = useAction();
  const [minutes, setMinutes] = useState('60');
  const [reason, setReason] = useState('');
  return (
    <form className="inline-form" onSubmit={async e => { e.preventDefault(); if (await run(() => post(`/admin/bookings/${bookingId}/extend-hold`, { minutes: Number(minutes), reason }), 'Đã gia hạn giữ chỗ.')) onDone(); }}>
      <div className="row-between"><h4>Gia hạn giữ chỗ</h4><button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Đóng</button></div>
      <div className="form-grid">
        <Field label="Thêm (phút)"><input className="input" type="number" min={5} max={4320} value={minutes} onChange={e => setMinutes(e.target.value)} /></Field>
        <Field label="Lý do"><input className="input" value={reason} onChange={e => setReason(e.target.value)} required /></Field>
      </div>
      <button className="btn btn-primary" disabled={busy}>Gia hạn</button>
    </form>
  );
}

function EditForm({ data, onDone, onCancel }: { data: BookingDetail; onDone: () => void; onCancel: () => void }) {
  const { busy, run } = useAction();
  const b = data.booking;
  const [f, setF] = useState({ source_ref: b.source_ref ?? '', group_name: b.group_name ?? '', special_requests: b.special_requests ?? '', internal_notes: b.internal_notes ?? '' });
  return (
    <form className="inline-form" onSubmit={async e => { e.preventDefault(); if (await run(() => patch(`/admin/bookings/${b.id}`, f), 'Đã lưu thông tin.')) onDone(); }}>
      <div className="row-between"><h4>Sửa thông tin đặt phòng</h4><button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Đóng</button></div>
      <div className="form-grid">
        <Field label="Mã tham chiếu"><input className="input" value={f.source_ref} onChange={e => setF({ ...f, source_ref: e.target.value })} /></Field>
        <Field label="Tên đoàn"><input className="input" value={f.group_name} onChange={e => setF({ ...f, group_name: e.target.value })} /></Field>
      </div>
      <Field label="Yêu cầu đặc biệt"><textarea className="textarea" value={f.special_requests} onChange={e => setF({ ...f, special_requests: e.target.value })} /></Field>
      <Field label="Ghi chú nội bộ"><textarea className="textarea" value={f.internal_notes} onChange={e => setF({ ...f, internal_notes: e.target.value })} /></Field>
      <button className="btn btn-primary" disabled={busy}>Lưu</button>
    </form>
  );
}

function AddStayForm({ data, onDone, onCancel }: { data: BookingDetail; onDone: () => void; onCancel: () => void }) {
  const { busy, run } = useAction();
  const last = data.booking.stays[data.booking.stays.length - 1];
  const [f, setF] = useState({ check_in: last?.check_in ?? '', check_out: last?.check_out ?? '', room_type_id: '' as number | '', adults: 2, children: 0 });
  const [types, setTypes] = useState<{ id: number; name: string; available: number; total: number }[]>([]);
  useEffect(() => {
    if (f.check_out > f.check_in) get<{ types: typeof types }>(`/admin/availability?check_in=${f.check_in}&check_out=${f.check_out}&adults=${f.adults}&children=${f.children}&rate_plan_id=${data.booking.rate_plan?.id ?? ''}`).then(r => setTypes(r.types)).catch(() => setTypes([]));
  }, [f.check_in, f.check_out, f.adults, f.children]);
  const t = types.find(x => x.id === f.room_type_id);
  return (
    <form className="inline-form" onSubmit={async e => { e.preventDefault(); if (await run(() => post(`/admin/bookings/${data.booking.id}/stays`, f), 'Đã thêm phòng vào đặt phòng.')) onDone(); }}>
      <div className="row-between"><h4>Thêm phòng</h4><button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Đóng</button></div>
      <div className="form-grid">
        <Field label="Nhận"><input className="input" type="date" value={f.check_in} onChange={e => setF({ ...f, check_in: e.target.value })} /></Field>
        <Field label="Trả"><input className="input" type="date" value={f.check_out} onChange={e => setF({ ...f, check_out: e.target.value })} /></Field>
        <Field label="Loại phòng"><select className="select" value={f.room_type_id} onChange={e => setF({ ...f, room_type_id: Number(e.target.value) || '' })} required>
          <option value="">— Chọn —</option>{types.map(x => <option key={x.id} value={x.id} disabled={!x.available}>{x.name} · còn {x.available}</option>)}</select></Field>
        <Field label="Người lớn"><input className="input" type="number" min={1} value={f.adults} onChange={e => setF({ ...f, adults: Number(e.target.value) })} /></Field>
        <Field label="Trẻ em"><input className="input" type="number" min={0} value={f.children} onChange={e => setF({ ...f, children: Number(e.target.value) })} /></Field>
      </div>
      {t && <p className="small">Giá: <strong>{money(t.total)}</strong></p>}
      <button className="btn btn-primary" disabled={busy || !f.room_type_id}>Thêm</button>
    </form>
  );
}

function PaymentQr({ qr }: { qr: NonNullable<BookingDetail['payment_qr']> }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(qr.qr, { margin: 1, width: 280 }).then(setSrc).catch(() => setSrc('')); }, [qr.qr]);
  return (
    <div className="qr-box">
      {src ? <img src={src} alt={`Mã QR chuyển khoản ${money(qr.amount)}`} /> : <div className="skeleton" style={{ width: 140, height: 140 }} />}
      <div className="small stack-sm">
        <strong>QR chuyển khoản số còn phải thu</strong>
        <span>{qr.bank_name} · {qr.account_number}<br />{qr.account_name}</span>
        <span>Số tiền {money(qr.amount)} · Nội dung <code>{qr.message}</code></span>
        <span className="tiny muted">Chỉ ghi nhận khi đã đối soát sao kê hoặc có webhook ngân hàng.</span>
      </div>
    </div>
  );
}

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RequirePerm perm="bookings.view"><Detail id={id} /></RequirePerm>;
}
