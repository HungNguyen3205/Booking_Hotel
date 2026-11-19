'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, GripVertical, Star, Wrench, X } from 'lucide-react';
import { get } from '@/lib/api';
import { addDays, dateVN, diffDays, money, weekday } from '@/lib/format';
import { Empty, ErrorState, Loading, Notice } from '@/components/ui';
import { BookingBadge } from './badges';
import { useSession } from './session';
import { DatesForm, MoveForm } from './stay-actions';

type CalRoom = { id: number; number: string; room_type_id: number; floor_id: number; housekeeping: string; type: { id: number; name: string; code: string }; floor: { id: number; name: string; level: number } };
type Segment = { room_id: number; stay_id: number; start: string; end: string; booking_id: number; code: string; status: string; guest: string | null; vip: boolean;
  adults: number; children: number; check_in: string; check_out: string; balance: number | null };
type Block = { id: number; room_id: number; type: string; start_date: string; end_date: string; reason: string; released_at: string | null };
type CalData = { from: string; to: string; today: string; rooms: CalRoom[]; segments: Segment[]; blocks: Block[]; show_balance: boolean };

const SPANS = { day: 1, week: 7, month: 31 } as const;
type Span = keyof typeof SPANS;

type Panel = null | { kind: 'segment'; seg: Segment; action?: 'dates' | 'move'; moveTo?: number } | { kind: 'new'; room: CalRoom; start: string; end: string };

export function RoomCalendar({ start, typeId, query, onChanged }: { start: string; typeId: number | ''; query: string; onChanged: () => void }) {
  const { can } = useSession();
  const [span, setSpan] = useState<Span>('week');
  const [from, setFrom] = useState(start);
  const [data, setData] = useState<CalData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [pick, setPick] = useState<{ roomId: number; date: string } | null>(null);
  const [dragging, setDragging] = useState<Segment | null>(null);
  const days = SPANS[span];
  const to = addDays(from, days - 1);

  useEffect(() => setFrom(start), [start]);
  const seq = useRef(0);
  const load = async () => {
    const id = ++seq.current;
    setError(null);
    try { const res = await get<CalData>(`/admin/calendar?from=${from}&to=${to}`); if (id === seq.current) setData(res); }
    catch (e) { if (id === seq.current) setError(e); }
  };
  useEffect(() => { setData(null); load(); }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => { load(); onChanged(); };

  const dates = useMemo(() => Array.from({ length: days }, (_, i) => addDays(from, i)), [from, days]);
  const rooms = useMemo(() => (data?.rooms ?? []).filter(r => (!typeId || r.room_type_id === typeId) && (!query
    || r.number.includes(query) || data!.segments.some(s => s.room_id === r.id && (s.guest?.toLowerCase().includes(query.toLowerCase()) || s.code.toLowerCase().includes(query.toLowerCase()))))),
  [data, typeId, query]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Loading />;

  const col = (iso: string) => diffDays(from, iso);
  // Thanh lượt ở: từ giữa ô ngày nhận (chiều) tới giữa ô ngày trả (trưa) — khách trả và khách đến cùng ngày hiển thị nối tiếp, không chồng.
  const barStyle = (startIso: string, endIso: string): React.CSSProperties | null => {
    const a = Math.max(col(startIso) + 0.5, 0);
    const b = Math.min(col(endIso) + 0.5, days);
    if (b <= 0 || a >= days || b <= a) return null;
    return { left: `${(a / days) * 100}%`, width: `calc(${((b - a) / days) * 100}% - 3px)` };
  };
  const occupied = (roomId: number, a: string, b: string) => data.segments.some(s => s.room_id === roomId && s.start < b && s.end > a)
    || data.blocks.some(k => k.room_id === roomId && !k.released_at && k.start_date < b && k.end_date > a);

  function clickCell(room: CalRoom, date: string) {
    if (!can('bookings.create') || date < data!.today) return;
    if (!pick || pick.roomId !== room.id || date < pick.date) { setPick({ roomId: room.id, date }); setPanel(null); return; }
    const end = addDays(date, 1);
    setPick(null);
    if (occupied(room.id, pick.date, end)) { setPanel({ kind: 'new', room, start: pick.date, end: '' }); return; }
    setPanel({ kind: 'new', room, start: pick.date, end });
  }

  const floors = Array.from(new Map(rooms.map(r => [r.floor.id, r.floor])).values()).sort((a, b) => a.level - b.level);

  return (
    <div className="cal-layout">
      <div className="card cal-card">
        <div className="map-toolbar">
          <div className="row">
            <button className="icon-btn" onClick={() => setFrom(addDays(from, -days))} aria-label="Trước"><ChevronLeft size={18} /></button>
            <strong className="small">{dateVN(from)}{days > 1 ? ` – ${dateVN(to)}` : ''}</strong>
            <button className="icon-btn" onClick={() => setFrom(addDays(from, days))} aria-label="Sau"><ChevronRight size={18} /></button>
            <button className="btn btn-sm btn-ghost" onClick={() => setFrom(data.today)}>Hôm nay</button>
          </div>
          <div className="tabs" role="tablist" aria-label="Phạm vi">
            {(Object.keys(SPANS) as Span[]).map(s => <button key={s} role="tab" className="tab" aria-selected={span === s} onClick={() => setSpan(s)}>{{ day: 'Ngày', week: 'Tuần', month: 'Tháng' }[s]}</button>)}
          </div>
        </div>
        {pick && <div className="plan-note">Đã chọn ngày nhận {dateVN(pick.date, true)} — bấm ô ngày cuối cùng ở lại (cùng hàng) để tạo đặt phòng. <button className="btn btn-ghost btn-sm" onClick={() => setPick(null)}>Bỏ chọn</button></div>}
        {!rooms.length ? <Empty title="Không có phòng phù hợp" /> : (
          <div className="cal-scroll">
            <div className="cal" style={{ ['--days' as string]: days, minWidth: days > 7 ? 110 + days * 44 : undefined }}>
              <div className="cal-head">
                <div className="cal-roomcol">Phòng</div>
                <div className="cal-days">
                  {dates.map(d => <div key={d} className={`cal-day ${d === data.today ? 'today' : ''} ${['T7', 'CN'].includes(weekday(d)) ? 'weekend' : ''}`}>
                    <span>{weekday(d)}</span><strong>{d.slice(8)}</strong></div>)}
                </div>
              </div>
              {floors.map(f => (
                <div key={f.id}>
                  <div className="cal-floor">{f.name}</div>
                  {rooms.filter(r => r.floor.id === f.id).map(r => (
                    <div key={r.id} className={`cal-row ${dragging && dragging.room_id !== r.id ? 'droppable' : ''}`}
                      onDragOver={e => { if (dragging && dragging.room_id !== r.id) e.preventDefault(); }}
                      onDrop={e => { e.preventDefault(); if (dragging && dragging.room_id !== r.id) setPanel({ kind: 'segment', seg: dragging, action: 'move', moveTo: r.id }); setDragging(null); }}>
                      <div className="cal-roomcol"><strong>{r.number}</strong><span className="tiny muted">{r.type.code}</span></div>
                      <div className="cal-days cal-cells">
                        {dates.map(d => (
                          <button key={d} type="button" className={`cal-cell ${d === data.today ? 'today' : ''} ${pick?.roomId === r.id && pick.date === d ? 'picked' : ''}`}
                            onClick={() => clickCell(r, d)} aria-label={`Phòng ${r.number} ngày ${dateVN(d)}`} tabIndex={-1} />
                        ))}
                        {data.blocks.filter(b => b.room_id === r.id).map(b => {
                          const st = barStyle(b.start_date, b.end_date);
                          return st && <div key={`b${b.id}`} className="cal-bar bar-block" style={st} title={b.reason}><Wrench size={11} /> {b.type === 'maintenance' ? 'Bảo trì' : 'Ngừng bán'}</div>;
                        })}
                        {data.segments.filter(s => s.room_id === r.id).map(s => {
                          const st = barStyle(s.start, s.end);
                          return st && (
                            <button key={`${s.stay_id}-${s.start}`} type="button" className={`cal-bar bar-${s.status}`} style={st}
                              draggable={can('frontdesk.move') && ['hold', 'confirmed', 'checked_in'].includes(s.status)}
                              onDragStart={() => setDragging(s)} onDragEnd={() => setDragging(null)}
                              onClick={() => setPanel({ kind: 'segment', seg: s })}
                              title={`${s.code} · ${s.guest ?? ''} · ${dateVN(s.check_in, true)}–${dateVN(s.check_out, true)}`}>
                              {can('frontdesk.move') && <GripVertical size={11} aria-hidden />}{s.vip && <Star size={11} aria-label="VIP" />}
                              <span className="bar-text">{s.guest ?? s.code}</span>
                              {data.show_balance && (s.balance ?? 0) > 0 && <span className="bar-due">{money(s.balance)}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="legend">
          <span><i className="sw bar-hold" /> Giữ chỗ</span><span><i className="sw bar-confirmed" /> Xác nhận</span><span><i className="sw bar-checked_in" /> Đang ở</span>
          <span><i className="sw bar-checked_out" /> Đã trả</span><span><i className="sw bar-block" /> <Wrench size={11} /> Bảo trì/ngừng bán</span>
          {can('frontdesk.move') && <span><GripVertical size={12} /> Kéo thanh sang phòng khác để chuyển (kiểm tra tồn & giá trước khi xác nhận)</span>}
        </div>
      </div>

      <aside className="card detail-panel">
        {!panel && <div className="state"><CalendarPlus size={26} /><strong>Lịch phòng</strong><span className="small">Bấm thanh đặt phòng để xem/đổi ngày/chuyển phòng. Bấm ô ngày trống (ngày nhận rồi ngày cuối) để tạo đặt phòng.</span></div>}
        {panel?.kind === 'new' && (
          <div className="panel-body">
            <div className="row-between"><h2 className="panel-title">Tạo đặt phòng</h2><button className="icon-btn" onClick={() => setPanel(null)} aria-label="Đóng"><X size={16} /></button></div>
            {panel.end ? <>
              <p>Phòng <strong>{panel.room.number}</strong> ({panel.room.type.name})<br />Nhận {dateVN(panel.start)} → Trả {dateVN(panel.end)} · {diffDays(panel.start, panel.end)} đêm</p>
              <Link className="btn btn-primary" href={`/admin/dat-phong/moi?room_id=${panel.room.id}&room_type_id=${panel.room.room_type_id}&check_in=${panel.start}&check_out=${panel.end}`}>
                <CalendarPlus size={16} /> Tiếp tục đặt phòng</Link>
              <p className="tiny muted">Giá và tồn được kiểm tra lại khi lưu.</p>
            </> : <Notice kind="error">Khoảng ngày đã chọn có lượt ở hoặc lịch chặn. Chọn khoảng khác.</Notice>}
          </div>
        )}
        {panel?.kind === 'segment' && (
          <div className="panel-body">
            <div className="row-between"><h2 className="panel-title">{panel.seg.code}</h2><button className="icon-btn" onClick={() => setPanel(null)} aria-label="Đóng"><X size={16} /></button></div>
            <div className="row"><BookingBadge status={panel.seg.status} /></div>
            <p><strong>{panel.seg.guest}</strong><br /><span className="small">Phòng {data.rooms.find(r => r.id === panel.seg.room_id)?.number} · {dateVN(panel.seg.check_in)} → {dateVN(panel.seg.check_out)} · {panel.seg.adults} NL{panel.seg.children ? ` + ${panel.seg.children} TE` : ''}</span></p>
            {data.show_balance && <p className="small">Còn phải thu (cả đặt phòng): <strong>{money(panel.seg.balance)}</strong></p>}
            <div className="panel-actions">
              {can('bookings.view') && <Link className="btn btn-sm" href={`/admin/dat-phong/${panel.seg.booking_id}`}>Mở đặt phòng</Link>}
              {can('frontdesk.extend') && ['hold', 'confirmed', 'checked_in'].includes(panel.seg.status) && <button className="btn btn-sm" onClick={() => setPanel({ ...panel, action: 'dates', moveTo: undefined })}>Đổi ngày</button>}
              {can('frontdesk.move') && ['hold', 'confirmed', 'checked_in'].includes(panel.seg.status) && <button className="btn btn-sm" onClick={() => setPanel({ ...panel, action: 'move' })}>Chuyển phòng</button>}
            </div>
            {panel.action === 'dates' && <DatesForm stay={{ id: panel.seg.stay_id, status: panel.seg.status, check_in: panel.seg.check_in, check_out: panel.seg.check_out }}
              onDone={() => { setPanel(null); refresh(); }} onCancel={() => setPanel({ ...panel, action: undefined })} />}
            {panel.action === 'move' && <MoveForm key={panel.moveTo ?? 0} stay={{ id: panel.seg.stay_id, status: panel.seg.status }} presetRoomId={panel.moveTo}
              onDone={() => { setPanel(null); refresh(); }} onCancel={() => setPanel({ ...panel, action: undefined })} />}
          </div>
        )}
      </aside>
    </div>
  );
}
