'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, BedDouble, Bot, Boxes, Brush, CalendarCheck, CheckCircle2, Clock, DoorOpen, Hourglass, LogIn, LogOut, Percent, RefreshCw, Star, Wallet, Wrench,
} from 'lucide-react';
import { get, post, qs } from '@/lib/api';
import { addDays, dateVN, money, SOURCES, timeVN, todayISO } from '@/lib/format';
import { ChartCard, OccupancyChart, RevenueChart, RoomStatusChart, SourcesChart, Swatch } from '@/components/admin/charts';
import { ErrorState, Loading, Notice, useAction, useLoad } from '@/components/ui';
import { PageHead, RequirePerm } from '@/components/admin/shell';
import { useSession } from '@/components/admin/session';
import { BookingBadge, HousekeepingBadge } from '@/components/admin/badges';
import { CheckInForm, CheckOutForm } from '@/components/admin/stay-actions';

type TodoStay = { stay_id: number; booking_id: number; code: string; status: string; guest: string | null; phone: string | null; vip: boolean; room: string | null;
  room_id: number | null; housekeeping: string | null; type: string; check_in: string; check_out: string; adults: number; children: number; balance?: number | null; overdue?: boolean };
type Dashboard = {
  today: string; rooms_total: number; in_house: number; arrivals: number; arrived: number; departures: number; departed: number;
  vacant_ready: number; dirty: number; blocked: number; occupancy_today: number; holds: number; new_bookings: number; tasks_open: number; tickets_open: number; claims_pending: number;
  alerts: { level: string; text: string; booking_id?: number }[];
  todo: {
    arrivals: TodoStay[]; departures: TodoStay[];
    holds: { booking_id: number; code: string; guest: string | null; hold_expires_at: string | null; deposit_required: number }[];
    cleaning: { id: number; room: string; room_id: number; status: string; type: string; priority: string; assignee: string | null; arrival_today: boolean }[];
    low_stock: { id: number; name: string; unit: string; on_hand: number; min_stock: number }[];
  };
  automation: { date: string; holds_released: number; no_shows: number; stayover_tasks: number; assigned: number; errors: string[] } | null;
  period?: { room_revenue: number; service_revenue: number; other_revenue: number; discounts: number; total_revenue: number; occupancy: number; adr: number; revpar: number;
    collected_net: number; room_nights_sold: number; room_nights_available: number; on_books_revenue: number };
  receivables_total?: number;
  trend?: { date: string; room_revenue: number; service_revenue: number; occupancy: number }[];
  charts?: {
    room_status: { occupied: number; ready: number; dirty: number; blocked: number };
    forecast: { date: string; sold: number; available: number; occupancy: number }[];
    sources?: { source: string; bookings: number; cancelled: number; room_value: number }[];
  };
};

const PRESETS = { today: 'Hôm nay', '7d': '7 ngày', month: 'Tháng này' } as const;

function Today() {
  const { can, user, property } = useSession();
  const [preset, setPreset] = useState<keyof typeof PRESETS>('today');
  const today = todayISO();
  const from = preset === 'today' ? today : preset === '7d' ? addDays(today, -6) : `${today.slice(0, 8)}01`;
  const { data, error, loading, reload } = useLoad(() => get<Dashboard>(`/admin/dashboard${qs({ from, to: today })}`), [from]);
  const [open, setOpen] = useState<string | null>(null);
  const { busy, run } = useAction();
  const refresh = () => { setOpen(null); reload(true); };
  useEffect(() => { const t = setInterval(() => reload(true), 60000); return () => clearInterval(t); }, [reload]); // tự làm mới mỗi phút

  if (error) return <div className="page"><ErrorState error={error} onRetry={() => reload()} /></div>;
  if (loading && !data) return <div className="page"><Loading /></div>;
  if (!data) return null;
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false }).format(new Date()));
  const greet = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const a = data.automation;
  const t = data.todo;

  return (
    <div className="page">
      <PageHead title={`${greet}, ${user.name}`} sub={`${property.name} · Ngày vận hành ${dateVN(today)}`}>
        {can('revenue.view') && <div className="tabs" role="tablist">{(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map(p =>
          <button key={p} role="tab" className="tab" aria-selected={preset === p} onClick={() => setPreset(p)}>{PRESETS[p]}</button>)}</div>}
        <button className="btn btn-sm" onClick={() => reload()} aria-label="Làm mới"><RefreshCw size={14} /></button>
      </PageHead>

      {a && (
        <div className="auto-card" role="status">
          <Bot size={22} aria-hidden />
          <div>
            <strong>Hệ thống đã tự xử lý hôm nay</strong>
            <div className="auto-stats">
              <span>{a.holds_released} giữ chỗ hết hạn được giải phóng</span><span>{a.no_shows} lượt không đến</span>
              <span>{a.stayover_tasks} việc dọn phòng đang ở</span><span>{a.assigned} việc đã tự giao</span>
            </div>
            {a.errors.length > 0 && <div className="small">Cần xem lại: {a.errors.join('; ')}</div>}
            {can('settings.manage') && <div className="small" style={{ marginTop: 4 }}><Link href="/admin/cau-hinh?tab=automation">Điều chỉnh tự động hóa →</Link></div>}
          </div>
        </div>
      )}

      <div className="kpis">
        <Kpi href="/admin/lich-phong" icon={Percent} tone="moss" label="Công suất hôm nay" value={`${data.occupancy_today}%`} sub={`${data.in_house}/${data.rooms_total - data.blocked} phòng bán được`} />
        <Kpi href="/admin/lich-phong" icon={DoorOpen} label="Trống sẵn sàng" value={data.vacant_ready} />
        <Kpi href="/admin/dat-phong?view=arrivals" icon={LogIn} tone="blue" label="Khách đến" value={`${data.arrived}/${data.arrived + data.arrivals}`} sub="đã nhận / tổng" />
        <Kpi href="/admin/dat-phong?view=departures" icon={LogOut} tone="bronze" label="Khách đi" value={`${data.departed}/${data.departed + data.departures}`} sub="đã trả / tổng" />
        <Kpi href="/admin/buong-phong" icon={Brush} tone="amber" label="Cần dọn" value={data.dirty} sub={`${data.tasks_open} việc đang mở`} />
        <Kpi href="/admin/buong-phong" icon={Wrench} tone="grey" label="Bảo trì / ngừng bán" value={data.blocked} sub={`${data.tickets_open} sự cố mở`} />
      </div>

      {data.charts && <Charts charts={data.charts} trend={data.trend} />}

      <div className="todo-grid">
        {/* Khách đến */}
        <section className="card">
          <div className="card-head"><div className="todo-head"><LogIn size={17} /><h2>Khách đến hôm nay</h2><span className="count">{t.arrivals.length}</span></div>
            {can('bookings.view') && <Link className="small" href="/admin/dat-phong?view=arrivals">Tất cả →</Link>}</div>
          {t.arrivals.length === 0 ? <div className="todo-empty"><CheckCircle2 size={16} /> Không còn khách chờ nhận phòng.</div> : t.arrivals.map(s => (
            <div key={s.stay_id} className="todo-item">
              <div className="todo-row">
                <span className={`todo-room ${!s.room ? 'none' : s.housekeeping !== 'clean' ? 'warn' : ''}`}>{s.room ?? 'Chưa phân'}</span>
                <div className="todo-main"><strong>{s.vip && <Star size={12} aria-label="VIP" />} {s.guest}</strong>
                  <span>{s.code} · {s.type} · {s.adults} NL{s.children ? ` + ${s.children} TE` : ''} · trả {dateVN(s.check_out, true)}</span></div>
                {s.housekeeping && s.housekeeping !== 'clean' && <HousekeepingBadge status={s.housekeeping} />}
                {s.status === 'hold' ? (can('bookings.edit') && <button className="btn btn-sm" disabled={busy}
                  onClick={async () => { if (await run(() => post(`/admin/bookings/${s.booking_id}/confirm`), `Đã xác nhận ${s.code}.`)) refresh(); }}><CalendarCheck size={14} /> Xác nhận</button>)
                  : can('frontdesk.checkin') && s.room && <button className="btn btn-sm btn-primary" onClick={() => setOpen(open === `in${s.stay_id}` ? null : `in${s.stay_id}`)}><LogIn size={14} /> Nhận phòng</button>}
              </div>
              {open === `in${s.stay_id}` && <CheckInForm stayId={s.stay_id} roomNumber={s.room ?? ''} housekeeping={s.housekeeping ?? 'clean'} onDone={refresh} onCancel={() => setOpen(null)} />}
            </div>
          ))}
        </section>

        {/* Khách đi */}
        <section className="card">
          <div className="card-head"><div className="todo-head"><LogOut size={17} /><h2>Khách trả phòng</h2><span className="count">{t.departures.length}</span></div>
            {can('bookings.view') && <Link className="small" href="/admin/dat-phong?view=departures">Tất cả →</Link>}</div>
          {t.departures.length === 0 ? <div className="todo-empty"><CheckCircle2 size={16} /> Không còn khách cần trả phòng hôm nay.</div> : t.departures.map(s => (
            <div key={s.stay_id} className="todo-item">
              <div className="todo-row">
                <span className={`todo-room ${s.overdue ? 'warn' : ''}`}>{s.room}</span>
                <div className="todo-main"><strong>{s.guest}</strong>
                  <span>{s.code}{s.balance != null && <> · còn phải thu <b style={{ color: s.balance > 0 ? 'var(--red-ink)' : 'var(--green-ok)' }}>{money(s.balance)}</b></>}</span></div>
                {s.overdue && <span className="badge b-red"><AlertTriangle size={12} /> Quá hạn trả</span>}
                {can('frontdesk.checkout') && !s.overdue && <button className="btn btn-sm btn-bronze" onClick={() => setOpen(open === `out${s.stay_id}` ? null : `out${s.stay_id}`)}><LogOut size={14} /> Trả phòng</button>}
                {s.overdue && <Link className="btn btn-sm" href={`/admin/dat-phong/${s.booking_id}`}>Gia hạn / xử lý</Link>}
              </div>
              {open === `out${s.stay_id}` && <CheckOutForm stayId={s.stay_id} bookingId={s.booking_id} roomNumber={s.room ?? ''} onDone={refresh} onCancel={() => setOpen(null)} />}
            </div>
          ))}
        </section>

        {/* Buồng phòng */}
        {can('housekeeping.view') && (
          <section className="card">
            <div className="card-head"><div className="todo-head"><Brush size={17} /><h2>Phòng cần dọn</h2><span className="count">{t.cleaning.length}</span></div>
              <Link className="small" href="/admin/buong-phong">Mở buồng phòng →</Link></div>
            {t.cleaning.length === 0 ? <div className="todo-empty"><CheckCircle2 size={16} /> Tất cả phòng đã sạch.</div> : t.cleaning.map(c => (
              <div key={c.id} className="todo-item">
                <div className="todo-row">
                  <span className={`todo-room ${c.arrival_today ? 'warn' : ''}`}>{c.room}</span>
                  <div className="todo-main"><strong>{{ open: 'Chờ dọn', in_progress: 'Đang dọn', inspecting: 'Chờ kiểm tra' }[c.status] ?? c.status}</strong>
                    <span>{c.type === 'stayover' ? 'Phòng đang ở' : 'Sau trả phòng'} · {c.assignee ? `Giao: ${c.assignee}` : 'Chưa giao'}</span></div>
                  {c.arrival_today && <span className="badge b-blue"><LogIn size={12} /> Có khách đến</span>}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Giữ chỗ */}
        {can('bookings.view') && (
          <section className="card">
            <div className="card-head"><div className="todo-head"><Hourglass size={17} /><h2>Giữ chỗ chờ cọc</h2><span className="count">{t.holds.length}</span></div>
              <Link className="small" href="/admin/dat-phong?view=holds">Tất cả →</Link></div>
            {t.holds.length === 0 ? <div className="todo-empty"><CheckCircle2 size={16} /> Không có giữ chỗ đang chờ.</div> : t.holds.map(h => (
              <div key={h.booking_id} className="todo-item">
                <div className="todo-row">
                  <span className="todo-room none"><Clock size={16} /></span>
                  <div className="todo-main"><strong>{h.guest}</strong><span>{h.code} · hết hạn {timeVN(h.hold_expires_at)} · cọc {money(h.deposit_required)}</span></div>
                  <Link className="btn btn-sm" href={`/admin/dat-phong/${h.booking_id}`}>Thu cọc</Link>
                  {can('bookings.edit') && <button className="btn btn-sm" disabled={busy}
                    onClick={async () => { if (await run(() => post(`/admin/bookings/${h.booking_id}/confirm`), `Đã xác nhận ${h.code}.`)) refresh(); }}>Xác nhận</button>}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>

      <section className="card">
        <div className="card-head"><div className="todo-head"><AlertTriangle size={17} /><h2>Cảnh báo</h2></div></div>
        <div className="card-pad stack">
          {data.claims_pending > 0 && <Notice kind="warn">{data.claims_pending} khoản khách báo đã chuyển khoản đang chờ đối soát. {can('payments.view') && <Link href="/admin/tai-chinh">Đối soát →</Link>}</Notice>}
          {t.low_stock.length > 0 && <Notice kind="warn"><Boxes size={14} /> Sắp hết hàng: {t.low_stock.map(i => `${i.name} (còn ${i.on_hand} ${i.unit})`).join(', ')}. <Link href="/admin/dich-vu?tab=kho">Nhập kho →</Link></Notice>}
          {data.alerts.map((al, i) => <Notice key={i} kind={al.level === 'high' ? 'error' : 'warn'}>{al.text} {al.booking_id && <Link href={`/admin/dat-phong/${al.booking_id}`}>Xem →</Link>}</Notice>)}
          {data.alerts.length === 0 && data.claims_pending === 0 && t.low_stock.length === 0 && <Notice kind="ok">Không có cảnh báo. Mọi thứ đang ổn.</Notice>}
        </div>
      </section>

      {data.period && (
        <section className="card">
          <div className="card-head"><div className="todo-head"><Wallet size={17} /><h2>Doanh thu & công nợ · {PRESETS[preset]}</h2></div>{can('reports.view') && <Link className="small" href="/admin/bao-cao">Báo cáo chi tiết →</Link>}</div>
          <div className="card-pad grid-2">
            <dl className="dl">
              <dt>Doanh thu phòng</dt><dd>{money(data.period.room_revenue)}</dd>
              <dt>Doanh thu dịch vụ</dt><dd>{money(data.period.service_revenue)}</dd>
              <dt>Phụ thu / phí</dt><dd>{money(data.period.other_revenue)}</dd>
              <dt>Giảm giá / điều chỉnh</dt><dd>{money(data.period.discounts)}</dd>
              <dt className="total">Tổng doanh thu</dt><dd className="total">{money(data.period.total_revenue)}</dd>
            </dl>
            <dl className="dl">
              <dt>Công suất kỳ</dt><dd>{data.period.occupancy}% ({data.period.room_nights_sold}/{data.period.room_nights_available})</dd>
              <dt>ADR / RevPAR</dt><dd>{money(data.period.adr)} / {money(data.period.revpar)}</dd>
              <dt>Tiền đã thu ròng</dt><dd>{money(data.period.collected_net)}</dd>
              <dt>Đã đặt chưa ở (trong kỳ)</dt><dd>{money(data.period.on_books_revenue)}</dd>
              <dt className="total">Công nợ hiện tại</dt><dd className="total">{money(data.receivables_total)}</dd>
            </dl>
          </div>
        </section>
      )}
    </div>
  );
}

function Kpi({ href, icon: Icon, label, value, sub, tone }: { href: string; icon: typeof BedDouble; label: string; value: number | string; sub?: string; tone?: string }) {
  return <Link className={`kpi ${tone ? `tone-${tone}` : ''}`} href={href}><span><Icon aria-hidden /> {label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</Link>;
}

function Charts({ charts, trend }: { charts: NonNullable<Dashboard['charts']>; trend?: Dashboard['trend'] }) {
  const f = charts.forecast;
  const avg = f.length ? Math.round(f.reduce((a, p) => a + p.occupancy, 0) / f.length) : 0;
  return (
    <div className={`viz chart-grid ${trend ? "" : "no-rev"}`}>
      {trend && (
        <ChartCard title="Doanh thu 14 ngày gần nhất" sub={`Tổng ${money(trend.reduce((a, p) => a + p.room_revenue + p.service_revenue, 0))}`}
          legend={<><Swatch c="var(--s1)" label="Phòng" /><Swatch c="var(--s2)" label="Dịch vụ & phụ thu" /></>}
          table={<table className="table"><thead><tr><th>Ngày</th><th className="num">Phòng</th><th className="num">Dịch vụ & phụ thu</th><th className="num">Công suất</th></tr></thead>
            <tbody>{trend.map(p => <tr key={p.date}><td>{dateVN(p.date)}</td><td className="num">{money(p.room_revenue)}</td><td className="num">{money(p.service_revenue)}</td><td className="num">{p.occupancy}%</td></tr>)}</tbody></table>}>
          <RevenueChart points={trend} />
        </ChartCard>
      )}
      <ChartCard title="Tình trạng phòng hôm nay">
        <RoomStatusChart status={charts.room_status} />
      </ChartCard>
      <ChartCard title="Công suất đã đặt 14 đêm tới" sub={`Trung bình ${avg}% · tính cả giữ chỗ và đặt chưa gán phòng`}
        table={<table className="table"><thead><tr><th>Đêm</th><th className="num">Đã đặt</th><th className="num">Bán được</th><th className="num">Công suất</th></tr></thead>
          <tbody>{f.map(p => <tr key={p.date}><td>{dateVN(p.date)}</td><td className="num">{p.sold}</td><td className="num">{p.available}</td><td className="num">{p.occupancy}%</td></tr>)}</tbody></table>}>
        <OccupancyChart points={f} />
      </ChartCard>
      {charts.sources && (
        <ChartCard title="Nguồn đặt phòng · 30 ngày" sub="Số đơn tạo mới theo kênh">
          <SourcesChart rows={charts.sources} labels={SOURCES} />
        </ChartCard>
      )}
    </div>
  );
}

const FALLBACK: [string, string][] = [['rooms.view', '/admin/lich-phong'], ['housekeeping.view', '/admin/buong-phong'], ['bookings.view', '/admin/dat-phong'],
  ['services.post', '/admin/dich-vu'], ['payments.view', '/admin/tai-chinh'], ['reports.view', '/admin/bao-cao'], ['inventory.view', '/admin/dich-vu?tab=kho']];

export default function DashboardPage() {
  const { can } = useSession();
  const router = useRouter();
  const target = can('dashboard.view') ? null : FALLBACK.find(([perm]) => can(perm))?.[1];
  useEffect(() => { if (target) router.replace(target); }, [target, router]);
  if (target) return <Loading />;
  return <RequirePerm perm="dashboard.view"><Today /></RequirePerm>;
}
