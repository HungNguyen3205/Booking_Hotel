'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowUpDown, BedDouble, Brush, CalendarPlus, ConciergeBell, CreditCard, DoorOpen, Footprints, LogIn, LogOut, Minus, Plus,
  Search, Star, Users, Wrench, Building2, Map as MapIcon, List,
} from 'lucide-react';
import { get } from '@/lib/api';
import { dateVN, money, timeVN } from '@/lib/format';
import { Empty, ErrorState, Loading, Notice } from '@/components/ui';
import { AvailabilityBadge, BookingBadge, HousekeepingBadge, OccupancyBadge } from './badges';
import { useSession } from './session';
import { CheckInForm, CheckOutForm, DatesForm, HousekeepingForm, MaintenanceForm, MoveForm, PaymentForm, ServiceForm } from './stay-actions';
import type { BookingDetail, MapRoom, RoomMapData, StayCard } from './types';

export type MapFilter = 'all' | 'vacant_ready' | 'occupied' | 'arriving' | 'departing' | 'dirty' | 'blocked';

export function matches(room: MapRoom, filter: MapFilter): boolean {
  switch (filter) {
    case 'vacant_ready': return room.occupancy === 'vacant' && room.housekeeping === 'clean' && room.availability === 'active';
    case 'occupied': return room.occupancy === 'occupied' || (room.occupancy === 'departing' && room.current?.status === 'checked_in');
    case 'arriving': return !!room.arriving;
    case 'departing': return !!room.departing;
    case 'dirty': return room.housekeeping !== 'clean';
    case 'blocked': return room.availability !== 'active';
    default: return true;
  }
}

/** Lớp màu ô phòng theo thứ tự ưu tiên: chặn bán > đang ở > sắp đến > cần dọn > trống sẵn sàng. */
function tileClass(r: MapRoom): string {
  if (r.availability !== 'active') return 'tile-blocked';
  if (r.occupancy === 'occupied' || (r.occupancy === 'departing' && r.current?.status === 'checked_in')) return r.departing ? 'tile-occupied tile-departing' : 'tile-occupied';
  if (r.arriving || r.occupancy === 'reserved') return 'tile-arriving';
  if (r.housekeeping !== 'clean') return 'tile-dirty';
  return 'tile-vacant';
}

function RoomTile({ room, date, selected, showBalance, onSelect, style }: { room: MapRoom; date: string; selected: boolean; showBalance: boolean; onSelect: () => void; style?: React.CSSProperties }) {
  const stay = room.current ?? room.arriving;
  // Chỉ hiện ngày khi khác ngày đang xem (tránh lặp "Sắp đến · Đến 19/11")
  const when = room.departing && room.departing.check_out !== date ? ` ${dateVN(room.departing.check_out, true)}`
    : !room.departing && room.arriving && room.arriving.check_in !== date ? ` ${dateVN(room.arriving.check_in, true)}` : '';
  const [Icon, label] = room.availability !== 'active' ? [Wrench, room.availability === 'maintenance' ? 'Bảo trì' : 'Ngừng bán']
    : room.occupancy === 'departing' ? [LogOut, room.arriving ? 'Trả · có khách đến' : 'Sắp trả']
    : room.occupancy === 'occupied' ? [BedDouble, 'Đang ở']
    : room.arriving ? [LogIn, 'Sắp đến']
    : room.occupancy === 'reserved' ? [CalendarPlus, 'Đã đặt']
    : [DoorOpen, 'Trống'];
  const due = showBalance && stay && (stay.balance ?? 0) > 0 ? stay.balance : null;
  return (
    <button type="button" className={`tile ${tileClass(room)} door-${room.door_side} ${selected ? 'selected' : ''}`} style={style} onClick={onSelect}
      aria-pressed={selected} aria-label={`Phòng ${room.number}, ${room.type_name}, ${label}${stay?.guest ? `, ${stay.guest}` : ''}, buồng ${room.housekeeping_label}`}>
      <span className="tile-top"><strong className="tile-no">{room.number}</strong><span className="tile-type">{room.type_code}</span></span>
      <span className="tile-status"><Icon size={13} aria-hidden /> {label}{when}{stay && <span className="tile-pax"><Users size={12} aria-hidden /> {stay.adults + stay.children}</span>}</span>
      {stay?.guest && <span className="tile-guest">{stay.vip && <Star size={11} aria-label="VIP" />}{stay.guest}</span>}
      <span className="tile-foot">
        <span className={`tile-hk hk-${room.housekeeping}`}>{room.housekeeping === 'clean' ? '✓' : '●'} {room.housekeeping_label}</span>
        {due != null && <span className="tile-due" title="Còn phải thu">{money(due)}</span>}
      </span>
    </button>
  );
}

const LANDMARK_ICON: Record<string, string> = { stairs: '▤', elevator: '⇅', entrance: '⇣', facade: '⟷', reception: '◎', service: '▢' };

export function FloorPlan({ data, floorId, filter, typeId, query, selectedId, onSelect, zoom }: {
  data: RoomMapData; floorId: number; filter: MapFilter; typeId: number | ''; query: string; selectedId: number | null; onSelect: (id: number) => void; zoom: number;
}) {
  const floor = data.floors.find(f => f.id === floorId)!;
  const rooms = data.rooms.filter(r => r.floor_id === floorId);
  const visible = (r: MapRoom) => matches(r, filter) && (!typeId || r.room_type_id === typeId) && matchQuery(r, query);
  // Mặt bằng luôn vừa khung ở mức 100% (không cuộn ngang). Khung rộng >= PLAN_MIN_W: trải 100% như cũ, chữ giữ cỡ gốc.
  // Khung hẹp hơn: vẽ ở PLAN_MIN_W rồi thu nhỏ đồng đều cho vừa. Phóng to (+) mới cần cuộn.
  const box = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(PLAN_MIN_W);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => { if (el.clientWidth > 0) setAvail(el.clientWidth - 36); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const PLAN_W = Math.max(PLAN_MIN_W, avail);
  const scale = (avail / PLAN_W) * zoom;
  const planH = PLAN_W * (floor.map_height / floor.map_width);
  return (
    <div className="plan-scroll" ref={box} style={{ overflowX: zoom > 1 ? 'auto' : 'hidden' }}>
      <div className="plan-sizer" style={{ width: PLAN_W * scale, height: planH * scale }}>
      <div className="plan" style={{ width: PLAN_W, height: planH, transform: `scale(${scale})` }}>
        {(floor.landmarks ?? []).map((l, i) => (
          <div key={i} className={`landmark lm-${l.type}`} style={pos(l, floor)} aria-hidden={l.type === 'corridor'}>
            {l.type !== 'corridor' && <span>{LANDMARK_ICON[l.type] ?? ''} {l.label}</span>}
          </div>
        ))}
        {rooms.map(r => (
          <RoomTile key={r.id} room={r} date={data.date} showBalance={data.show_balance} selected={selectedId === r.id} onSelect={() => onSelect(r.id)}
            style={{ ...pos({ x: r.map_x, y: r.map_y, w: r.map_w, h: r.map_h }, floor), opacity: visible(r) ? 1 : 0.28 }} />
        ))}
      </div>
      </div>
    </div>
  );
}

/** Khổ nhỏ nhất mà ô phòng hiển thị đủ chữ; khung hẹp hơn thì thu nhỏ đồng đều thay vì cuộn ngang. */
const PLAN_MIN_W = 760;

function pos(b: { x: number; y: number; w: number; h: number }, f: { map_width: number; map_height: number }): React.CSSProperties {
  return { left: `${(b.x / f.map_width) * 100}%`, top: `${(b.y / f.map_height) * 100}%`, width: `${(b.w / f.map_width) * 100}%`, height: `${(b.h / f.map_height) * 100}%` };
}

function matchQuery(r: MapRoom, q: string) {
  if (!q) return true;
  const s = q.toLowerCase();
  return [r.number, r.current?.guest, r.current?.code, r.arriving?.guest, r.arriving?.code, r.next?.guest, r.next?.code].some(v => v?.toLowerCase().includes(s));
}

type Action = null | 'checkin' | 'checkout' | 'service' | 'dates' | 'move' | 'pay' | 'hk' | 'maint';

export function RoomPanel({ room, date, isToday, onChanged }: { room: MapRoom; date: string; isToday: boolean; onChanged: () => void }) {
  const { can } = useSession();
  const [action, setAction] = useState<Action>(null);
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const stay = room.current ?? room.arriving;
  useEffect(() => { setAction(null); }, [room.id]);
  const wanted = useRef<number | null>(null);
  const loadDetail = () => {
    if (!stay || !can('bookings.view')) return;
    const id = stay.booking_id;
    wanted.current = id;
    get<BookingDetail>(`/admin/bookings/${id}`).then(res => { if (wanted.current === id) setDetail(res); }).catch(() => undefined);
  };
  useEffect(() => {
    setDetail(null);
    wanted.current = null;
    loadDetail();
  }, [stay?.booking_id, stay?.stay_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = () => { setAction(null); onChanged(); loadDetail(); };
  const fullStay = detail?.booking.stays.find(s => s.id === stay?.stay_id);
  const folioId = detail?.folios[0]?.id;
  const othersInHouse = !!detail?.booking.stays.some(s => s.id !== stay?.stay_id && s.status === 'checked_in');
  const canCheckIn = isToday && room.arriving && room.arriving.status === 'confirmed' && can('frontdesk.checkin') && !(room.current && room.current.status === 'checked_in' && room.current.stay_id !== room.arriving.stay_id);
  const inHouse = room.current?.status === 'checked_in' ? room.current : null;

  return (
    <div className="panel-body">
      <div className="row-between">
        <div><h2 className="panel-title">Phòng {room.number}</h2><p className="muted small">{room.type_name}</p></div>
        <OccupancyBadge status={room.occupancy} />
      </div>
      <div className="row"><HousekeepingBadge status={room.housekeeping} /><AvailabilityBadge status={room.availability} />
        {room.task && <span className="badge b-neutral"><Brush size={12} /> Việc dọn: {room.task.assignee ?? 'chưa giao'}</span>}</div>
      {room.block && <Notice kind="warn">{room.availability === 'maintenance' ? 'Bảo trì' : 'Ngừng bán'} {dateVN(room.block.start, true)}–{dateVN(room.block.end, true)}: {room.block.reason}</Notice>}
      {room.notes && <p className="small muted">{room.notes}</p>}

      {[room.current, room.arriving && room.arriving.stay_id !== room.current?.stay_id ? room.arriving : null].filter(Boolean).map(s => <StaySummary key={s!.stay_id} s={s!} />)}
      {!stay && room.next && <div className="small muted">Lượt sắp tới: <Link href={`/admin/dat-phong/${room.next.booking_id}`}>{room.next.code}</Link> · {room.next.guest} · {dateVN(room.next.check_in, true)}–{dateVN(room.next.check_out, true)}</div>}
      {!stay && !room.next && <p className="small muted">Không có lượt đặt sắp tới.</p>}

      {detail && can('payments.view') && stay && (
        <dl className="dl">
          <dt>Tiền phòng</dt><dd>{money(detail.totals.room)}</dd>
          <dt>Dịch vụ & phụ thu</dt><dd>{money(detail.totals.services + detail.totals.surcharges)}</dd>
          {detail.totals.discounts !== 0 && <><dt>Giảm giá / điều chỉnh</dt><dd>{money(detail.totals.discounts)}</dd></>}
          <dt>Tiền cọc</dt><dd>{money(detail.totals.deposits)}</dd>
          <dt>Đã thanh toán</dt><dd>{money(detail.totals.payments - detail.totals.refunds)}</dd>
          <dt className="total">Còn phải thu</dt><dd className="total">{money(detail.totals.balance)}</dd>
        </dl>
      )}

      <div className="panel-actions">
        {room.occupancy === 'vacant' && room.availability === 'active' && can('bookings.create') && (
          <Link className="btn btn-primary btn-sm" href={`/admin/dat-phong/moi?room_id=${room.id}&room_type_id=${room.room_type_id}&check_in=${date}`}><CalendarPlus size={15} /> Đặt phòng</Link>
        )}
        {canCheckIn && <button className="btn btn-primary btn-sm" onClick={() => setAction('checkin')}><LogIn size={15} /> Nhận phòng</button>}
        {room.arriving?.status === 'hold' && <span className="small muted">Đang giữ chỗ — xác nhận ở trang đặt phòng trước khi nhận.</span>}
        {inHouse && folioId && can('services.post') && <button className="btn btn-sm" onClick={() => setAction('service')}><ConciergeBell size={15} /> Thêm dịch vụ</button>}
        {inHouse && can('frontdesk.extend') && <button className="btn btn-sm" onClick={() => setAction('dates')}><CalendarPlus size={15} /> Gia hạn</button>}
        {stay && can('frontdesk.move') && <button className="btn btn-sm" onClick={() => setAction('move')}><ArrowUpDown size={15} /> Chuyển phòng</button>}
        {stay && detail && can('payments.collect') && detail.totals.balance > 0 && <button className="btn btn-sm" onClick={() => setAction('pay')}><CreditCard size={15} /> Thu tiền</button>}
        {inHouse && isToday && can('frontdesk.checkout') && <button className="btn btn-sm btn-bronze" onClick={() => setAction('checkout')}><LogOut size={15} /> Trả phòng</button>}
        {can('housekeeping.manage') && <button className="btn btn-sm" onClick={() => setAction('hk')}><Brush size={15} /> Giao dọn / buồng</button>}
        {can('maintenance.report') && <button className="btn btn-sm" onClick={() => setAction('maint')}><Wrench size={15} /> Báo bảo trì</button>}
        {stay && can('bookings.view') && <Link className="btn btn-ghost btn-sm" href={`/admin/dat-phong/${stay.booking_id}`}>Mở đặt phòng →</Link>}
      </div>

      {action === 'checkin' && room.arriving && <CheckInForm stayId={room.arriving.stay_id} roomNumber={room.number} housekeeping={room.housekeeping} onDone={done} onCancel={() => setAction(null)} />}
      {action === 'checkout' && inHouse && <CheckOutForm stayId={inHouse.stay_id} bookingId={inHouse.booking_id} roomNumber={room.number}
        balance={detail?.totals.balance ?? inHouse.balance ?? 0} othersInHouse={othersInHouse} hasBillTo={!!detail?.booking.bill_to} onDone={done} onCancel={() => setAction(null)} />}
      {action === 'service' && folioId && inHouse && <ServiceForm folioId={folioId} stayId={inHouse.stay_id} onDone={done} onCancel={() => setAction(null)} />}
      {action === 'dates' && fullStay && <DatesForm stay={fullStay} onDone={done} onCancel={() => setAction(null)} />}
      {action === 'move' && stay && <MoveForm stay={{ id: stay.stay_id, status: stay.status }} onDone={done} onCancel={() => setAction(null)} />}
      {action === 'pay' && stay && detail && <PaymentForm bookingId={stay.booking_id} balance={detail.totals.balance}
        defaultKind={['hold', 'confirmed'].includes(detail.booking.status) ? 'deposit' : 'payment'} onDone={done} onCancel={() => setAction(null)} />}
      {action === 'hk' && <HousekeepingForm roomId={room.id} roomNumber={room.number} current={room.housekeeping} onDone={done} onCancel={() => setAction(null)} />}
      {action === 'maint' && <MaintenanceForm roomId={room.id} roomNumber={room.number} onDone={done} onCancel={() => setAction(null)} />}
    </div>
  );
}

function StaySummary({ s }: { s: StayCard }) {
  return (
    <div className="stay-card">
      <div className="row-between">
        <Link href={`/admin/dat-phong/${s.booking_id}`} className="stay-guest">{s.vip && <Star size={13} aria-label="VIP" />} {s.guest ?? 'Khách'}</Link>
        <BookingBadge status={s.status} />
      </div>
      <div className="small muted">{s.code} · <Users size={12} /> {s.adults} NL{s.children ? ` + ${s.children} TE` : ''}</div>
      <div className="small">Nhận {dateVN(s.check_in)}{s.checked_in_at ? ` (lúc ${timeVN(s.checked_in_at)})` : ''} → Trả {dateVN(s.check_out)}</div>
    </div>
  );
}

/** Danh sách dễ đọc cho điện thoại (cùng dữ liệu với mặt bằng). */
export function RoomList({ data, rooms, onSelect, selectedId }: { data: RoomMapData; rooms: MapRoom[]; onSelect: (id: number) => void; selectedId: number | null }) {
  if (!rooms.length) return <Empty title="Không có phòng phù hợp bộ lọc" />;
  const floors = data.floors.filter(f => rooms.some(r => r.floor_id === f.id));
  return (
    <div className="room-list">
      {floors.map(f => (
        <section key={f.id}>
          <h3 className="room-list-floor">{f.name}</h3>
          {rooms.filter(r => r.floor_id === f.id).map(r => {
            const s = r.current ?? r.arriving;
            return (
              <button key={r.id} className={`room-row ${tileClass(r)} ${selectedId === r.id ? 'selected' : ''}`} onClick={() => onSelect(r.id)}>
                <strong className="room-row-no">{r.number}</strong>
                <span className="grow">
                  <span className="row" style={{ gap: 6 }}><OccupancyBadge status={r.occupancy} /><HousekeepingBadge status={r.housekeeping} />{r.availability !== 'active' && <AvailabilityBadge status={r.availability} />}</span>
                  <span className="small">{r.type_name}{s ? ` · ${s.guest ?? ''} · ${dateVN(s.check_in, true)}–${dateVN(s.check_out, true)}` : ''}</span>
                </span>
                {data.show_balance && s && (s.balance ?? 0) > 0 && <span className="small num">{money(s.balance)}</span>}
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}

export function MapView({ data, onChanged, filter, typeId, query, initialRoom }: { data: RoomMapData; onChanged: () => void; filter: MapFilter; typeId: number | ''; query: string; initialRoom?: number }) {
  const preset = data.rooms.find(r => r.id === initialRoom);
  const [floorId, setFloorId] = useState<number>(preset?.floor_id ?? data.floors[0]?.id ?? 0);
  const [selectedId, setSelectedId] = useState<number | null>(preset?.id ?? null);
  const [mode, setMode] = useState<'plan' | 'list'>('plan');
  const [zoom, setZoom] = useState(1);
  const [hideNote, setHideNote] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches) setMode('list');
  }, []);
  useEffect(() => { if (!data.floors.some(f => f.id === floorId) && data.floors[0]) setFloorId(data.floors[0].id); }, [data.floors, floorId]);
  // Khi tìm kiếm khớp một phòng ở tầng khác, chuyển tầng
  const lastQuery = useRef('');
  useEffect(() => {
    if (query === lastQuery.current) return;
    lastQuery.current = query;
    if (!query) return;
    const hit = data.rooms.find(r => matchQuery(r, query));
    if (hit) { setFloorId(hit.floor_id); setSelectedId(hit.id); }
  }, [query, data.rooms]);
  const selected = data.rooms.find(r => r.id === selectedId) ?? null;
  const floor = data.floors.find(f => f.id === floorId);
  const listRooms = useMemo(() => data.rooms.filter(r => matches(r, filter) && (!typeId || r.room_type_id === typeId) && matchQuery(r, query)), [data.rooms, filter, typeId, query]);

  if (!data.floors.length) return <Empty title="Chưa cấu hình tầng và phòng">Vào Cấu hình → Phòng & sơ đồ để thêm.</Empty>;

  return (
    <div className="map-layout">
      <div className="card map-card">
        <div className="map-toolbar">
          <div className="tabs" role="tablist" aria-label="Chọn tầng">
            {data.floors.map(f => <button key={f.id} role="tab" className="tab" aria-selected={mode === 'plan' && f.id === floorId}
              onClick={() => { setFloorId(f.id); setMode('plan'); }}><Building2 size={13} /> {f.name}</button>)}
          </div>
          <div className="row">
            {mode === 'plan' && <>
              <button className="icon-btn" onClick={() => setZoom(z => Math.max(1, z - 0.25))} aria-label="Thu nhỏ" disabled={zoom <= 1}><Minus size={16} /></button>
              <button className="icon-btn" onClick={() => setZoom(z => Math.min(2.5, z + 0.25))} aria-label="Phóng to"><Plus size={16} /></button>
            </>}
            <div className="tabs" role="tablist" aria-label="Kiểu hiển thị">
              <button role="tab" className="tab" aria-selected={mode === 'plan'} onClick={() => setMode('plan')}><MapIcon size={13} /> Mặt bằng</button>
              <button role="tab" className="tab" aria-selected={mode === 'list'} onClick={() => setMode('list')}><List size={13} /> Danh sách</button>
            </div>
          </div>
        </div>
        {mode === 'plan' && floor && !floor.layout_confirmed && !hideNote && (
          <div className="plan-note"><AlertTriangle size={13} aria-hidden /> <span className="grow">Sơ đồ minh họa, chưa khớp mặt bằng thực tế — <a href="/admin/cau-hinh?tab=rooms">chỉnh ở Cấu hình</a></span>
            <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => setHideNote(true)} aria-label="Ẩn ghi chú">×</button></div>
        )}
        {mode === 'plan' && floor
          ? <FloorPlan data={data} floorId={floorId} filter={filter} typeId={typeId} query={query} selectedId={selectedId} onSelect={setSelectedId} zoom={zoom} />
          : <RoomList data={data} rooms={listRooms} onSelect={setSelectedId} selectedId={selectedId} />}
        <div className="legend" aria-label="Chú giải">
          <span><i className="sw sw-vacant" /> Trống sẵn sàng</span><span><i className="sw tile-occupied" /> Đang ở</span>
          <span><i className="sw tile-arriving" /> Sắp đến</span><span><i className="sw tile-departing-sw" /> Sắp trả</span>
          <span><i className="sw tile-dirty" /> Cần dọn</span><span><i className="sw tile-blocked" /> <Wrench size={11} /> Bảo trì/ngừng bán</span>
          <span><i className="sw sw-door" /> Cửa phòng</span>
        </div>
      </div>
      <aside className="card detail-panel" aria-live="polite">
        {selected ? <RoomPanel room={selected} date={data.date} isToday={data.is_today} onChanged={onChanged} />
          : <div className="state"><Search size={26} /><strong>Chọn một phòng</strong><span className="small">Bấm vào ô phòng để xem khách, tiền và thao tác.</span></div>}
      </aside>
    </div>
  );
}

export function useRoomMap(date: string) {
  const [data, setData] = useState<RoomMapData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const seq = useRef(0);
  const load = async () => {
    const id = ++seq.current;
    setError(null);
    try { const res = await get<RoomMapData>(`/admin/room-map?date=${date}`); if (id === seq.current) setData(res); }
    catch (e) { if (id === seq.current) setError(e); }
  };
  useEffect(() => { setData(null); load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, reload: load };
}

export { Loading, ErrorState };
