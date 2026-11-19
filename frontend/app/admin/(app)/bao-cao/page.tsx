'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Download, Info, Printer } from 'lucide-react';
import { PageHead, RequirePerm } from '@/components/admin/shell';
import { Can } from '@/components/admin/session';
import { BookingBadge } from '@/components/admin/badges';
import { Empty, ErrorState, Loading, useLoad } from '@/components/ui';
import { get, qs } from '@/lib/api';
import { dateTimeVN, dateVN, money, SOURCES, todayISO } from '@/lib/format';
import { formValues } from '@/components/admin/modules/common';

type Summary = {
  period: { from: string; to: string; days: number }; rooms: number; room_nights_available: number; room_nights_blocked: number; room_nights_sold: number;
  room_nights_on_books: number; on_books_revenue: number; occupancy: number; room_revenue: number; service_revenue: number; other_revenue: number;
  discounts: number; total_revenue: number; adr: number; revpar: number; collected_net: number;
  collections: { method: string; deposit: number; payment: number; refund: number; net: number }[]; cashbook: { income: number; expense: number };
  arrivals: number; departures: number; new_bookings: number; cancellations: number; no_shows: number;
};
type ByType = { room_type: string; rooms: number; available: number; sold: number; revenue: number; occupancy: number; adr: number; revpar: number };
type BySource = { source: string; bookings: number; room_nights: number; room_value: number; cancelled: number; no_show: number };
type ShiftRow = { id: number; opened_at: string; closed_at: string | null; opening_cash: number; expected_cash: number | null; counted_cash: number | null; difference: number | null; user: { name: string } | null; receiver: { name: string } | null };
type Report = { summary: Summary; by_room_type: ByType[]; by_source: BySource[]; shifts: ShiftRow[]; method_notes: string[] };
type Receivable = { booking_id: number; code: string; status: string; customer: string | null; bill_to: string | null; balance: number; age_days: number };

const monthStart = () => todayISO().slice(0, 8) + '01';

export default function ReportsPage() {
  const [period, setPeriod] = useState({ from: monthStart(), to: todayISO() });
  const d = useLoad(() => get<Report>('/admin/reports/summary' + qs(period)), [period]);
  const rec = useLoad(() => get<Receivable[]>('/admin/reports/receivables'), []);
  const presets: [string, () => { from: string; to: string }][] = [
    ['Hôm nay', () => ({ from: todayISO(), to: todayISO() })],
    ['7 ngày', () => ({ from: todayISO(-6), to: todayISO() })],
    ['Tháng này', () => ({ from: monthStart(), to: todayISO() })],
    ['30 ngày', () => ({ from: todayISO(-29), to: todayISO() })],
  ];
  const exportUrl = (type: string) => `/api/admin/reports/export/${type}${qs(period)}`;

  return (
    <RequirePerm perm="reports.view">
      <div className="page">
        <PageHead title="Báo cáo" sub={`Kỳ báo cáo ${dateVN(period.from)} – ${dateVN(period.to)} (theo ngày vận hành, gồm cả hai đầu)`}>
          <button className="btn no-print" onClick={() => window.print()}><Printer size={15} /> In / Lưu PDF</button>
        </PageHead>
        <form className="filters card card-pad no-print" key={period.from + period.to} onSubmit={e => { e.preventDefault(); setPeriod(formValues(e.currentTarget) as typeof period); }}>
          <label className="field"><span>Từ ngày</span><input className="input" type="date" name="from" defaultValue={period.from} required /></label>
          <label className="field"><span>Đến ngày</span><input className="input" type="date" name="to" defaultValue={period.to} required /></label>
          <button className="btn btn-primary">Xem</button>
          {presets.map(([l, f]) => <button key={l} type="button" className="btn btn-sm btn-ghost" onClick={() => setPeriod(f())}>{l}</button>)}
        </form>
        <Can perm="reports.export">
          <div className="row no-print"><span className="small muted">Xuất Excel (CSV UTF-8):</span>
            {[['summary', 'Tổng hợp'], ['room-types', 'Loại phòng'], ['sources', 'Nguồn khách'], ['payments', 'Khoản thu'], ['receivables', 'Công nợ']].map(([t, l]) =>
              <a key={t} className="btn btn-sm" href={exportUrl(t)}><Download size={14} /> {l}</a>)}
          </div>
        </Can>

        {d.loading ? <Loading /> : d.error || !d.data ? <ErrorState error={d.error} onRetry={d.reload} /> : <ReportBody r={d.data} />}

        <div className="card">
          <div className="card-head"><h2>Công nợ hiện tại</h2>{rec.data && <strong className="num">{money(rec.data.reduce((s, x) => s + x.balance, 0))}</strong>}</div>
          {rec.loading ? <Loading /> : rec.error ? <ErrorState error={rec.error} onRetry={rec.reload} /> : !rec.data?.length ? <Empty title="Không có công nợ" /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Mã</th><th>Khách</th><th>Người chịu công nợ</th><th>Trạng thái</th><th className="right">Tuổi nợ</th><th className="right">Còn phải thu</th></tr></thead>
              <tbody>{rec.data.map(x => <tr key={x.booking_id}><td><Link href={`/admin/dat-phong/${x.booking_id}`}>{x.code}</Link></td><td>{x.customer}</td><td>{x.bill_to ?? '—'}</td>
                <td><BookingBadge status={x.status} /></td><td className="right num">{x.age_days} ngày</td><td className="right num">{money(x.balance)}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      </div>
    </RequirePerm>
  );
}

function ReportBody({ r }: { r: Report }) {
  const s = r.summary;
  const kpis: [string, string, string?][] = [
    ['Công suất phòng', `${s.occupancy}%`, `${s.room_nights_sold}/${s.room_nights_available} phòng-đêm`],
    ['ADR', money(s.adr), 'Giá phòng bình quân/đêm bán'],
    ['RevPAR', money(s.revpar), 'Doanh thu phòng/phòng-đêm khả dụng'],
    ['Doanh thu phòng', money(s.room_revenue)],
    ['Doanh thu dịch vụ', money(s.service_revenue)],
    ['Phụ thu & phí', money(s.other_revenue)],
    ['Giảm giá/điều chỉnh', money(s.discounts)],
    ['Tổng doanh thu', money(s.total_revenue)],
    ['Tiền đã thu (ròng)', money(s.collected_net), 'Cọc + thanh toán − hoàn'],
    ['Đã đặt (tương lai)', money(s.on_books_revenue), `${s.room_nights_on_books} phòng-đêm chưa nhận`],
  ];
  const maxRev = Math.max(1, ...r.by_room_type.map(t => t.revenue));
  return <>
    <div className="kpis">{kpis.map(([l, v, sub]) => <div key={l} className="kpi"><span>{l}</span><strong>{v}</strong>{sub && <small>{sub}</small>}</div>)}</div>
    <div className="kpis">
      {[['Khách đến', s.arrivals], ['Khách đi', s.departures], ['Đặt phòng mới', s.new_bookings], ['Hủy', s.cancellations], ['Không đến', s.no_shows],
        ['Phòng-đêm bị chặn', s.room_nights_blocked], ['Thu khác (sổ thu chi)', money(s.cashbook.income)], ['Chi (sổ thu chi)', money(s.cashbook.expense)]].map(([l, v]) =>
        <div key={String(l)} className="kpi"><span>{l}</span><strong>{v}</strong></div>)}
    </div>
    <div className="grid-2">
      <div className="card">
        <div className="card-head"><h2>Hiệu quả theo loại phòng</h2></div>
        <div className="card-pad stack">
          {r.by_room_type.map(t => (
            <div key={t.room_type} className="mod-bar"><span>{t.room_type}</span>
              <div className="mod-bar-track" aria-hidden><div className="mod-bar-fill" style={{ width: `${(t.revenue / maxRev) * 100}%` }} /></div>
              <span className="num right">{money(t.revenue)}</span></div>
          ))}
        </div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Loại</th><th className="right">Phòng</th><th className="right">Khả dụng</th><th className="right">Đã bán</th><th className="right">Công suất</th><th className="right">ADR</th><th className="right">RevPAR</th></tr></thead>
          <tbody>{r.by_room_type.map(t => <tr key={t.room_type}><td>{t.room_type}</td><td className="right num">{t.rooms}</td><td className="right num">{t.available}</td>
            <td className="right num">{t.sold}</td><td className="right num">{t.occupancy}%</td><td className="right num">{money(t.adr)}</td><td className="right num">{money(t.revpar)}</td></tr>)}</tbody>
        </table></div>
      </div>
      <div className="card">
        <div className="card-head"><h2>Hiệu quả nguồn khách</h2><span className="tiny muted">theo đặt phòng tạo trong kỳ</span></div>
        {!r.by_source.length ? <Empty title="Không có đặt phòng mới trong kỳ" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Nguồn</th><th className="right">Đặt phòng</th><th className="right">Phòng-đêm</th><th className="right">Giá trị phòng</th><th className="right">Hủy</th><th className="right">Không đến</th></tr></thead>
            <tbody>{r.by_source.map(x => <tr key={x.source}><td>{SOURCES[x.source] ?? x.source}</td><td className="right num">{x.bookings}</td><td className="right num">{x.room_nights}</td>
              <td className="right num">{money(Number(x.room_value))}</td><td className="right num">{x.cancelled}</td><td className="right num">{x.no_show}</td></tr>)}</tbody>
          </table></div>
        )}
        <div className="card-head"><h2>Tiền thu theo phương thức</h2></div>
        {!s.collections.length ? <Empty title="Chưa có khoản thu" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Phương thức</th><th className="right">Cọc</th><th className="right">Thanh toán</th><th className="right">Hoàn</th><th className="right">Ròng</th></tr></thead>
            <tbody>{s.collections.map(c => <tr key={c.method}><td>{c.method}</td><td className="right num">{money(c.deposit)}</td><td className="right num">{money(c.payment)}</td>
              <td className="right num">{money(c.refund)}</td><td className="right num"><strong>{money(c.net)}</strong></td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </div>
    <div className="card">
      <div className="card-head"><h2>Bàn giao ca trong kỳ</h2></div>
      {!r.shifts.length ? <Empty title="Không có ca" /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Nhân viên</th><th>Mở</th><th>Chốt</th><th className="right">Dự kiến</th><th className="right">Thực đếm</th><th className="right">Lệch</th><th>Bàn giao</th></tr></thead>
          <tbody>{r.shifts.map(x => <tr key={x.id}><td>{x.user?.name}</td><td className="nowrap">{dateTimeVN(x.opened_at)}</td><td className="nowrap">{x.closed_at ? dateTimeVN(x.closed_at) : 'Đang mở'}</td>
            <td className="right num">{money(x.expected_cash)}</td><td className="right num">{money(x.counted_cash)}</td><td className="right num">{x.difference == null ? '—' : money(x.difference)}</td><td>{x.receiver?.name ?? '—'}</td></tr>)}</tbody>
        </table></div>
      )}
    </div>
    <div className="card card-pad">
      <h2 style={{ fontSize: 15, marginBottom: 8 }}><Info size={15} /> Cách tính</h2>
      <ul className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>{r.method_notes.map(n => <li key={n}>{n}</li>)}</ul>
    </div>
  </>;
}
