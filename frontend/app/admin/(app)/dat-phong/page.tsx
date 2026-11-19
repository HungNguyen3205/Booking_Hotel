'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarPlus, Search, Star } from 'lucide-react';
import { get, qs } from '@/lib/api';
import { BOOKING_STATUS, dateVN, money, SOURCES } from '@/lib/format';
import { Empty, ErrorState, Loading, useLoad } from '@/components/ui';
import { PageHead, RequirePerm } from '@/components/admin/shell';
import { useSession } from '@/components/admin/session';
import { BookingBadge } from '@/components/admin/badges';

type Row = {
  id: number; code: string; status: string; source: string; group_name: string | null; hold_expires_at: string | null; created_at: string; balance?: number;
  customer: { id: number; full_name: string; phone: string | null; vip: boolean };
  bill_to: { id: number; full_name: string } | null;
  stays: { id: number; status: string; check_in: string; check_out: string; adults: number; children: number; room: { number: string } | null; type: { name: string; code: string } }[];
};
type Page = { data: Row[]; current_page: number; last_page: number; total: number };

const VIEWS = { all: 'Tất cả', arrivals: 'Đến hôm nay', departures: 'Đi hôm nay', in_house: 'Đang ở', holds: 'Giữ chỗ' } as const;

function Bookings() {
  const { can } = useSession();
  const params = useSearchParams();
  const [view, setView] = useState<keyof typeof VIEWS>((params.get('view') as keyof typeof VIEWS) ?? 'all');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useLoad(() => get<Page>(`/admin/bookings${qs({ view: view === 'all' ? '' : view, q: term, status, source, page })}`),
    [view, term, status, source, page]);

  return (
    <div className="page">
      <PageHead title="Đặt phòng" sub={data ? `${data.total} đặt phòng` : undefined}>
        {can('bookings.create') && <Link className="btn btn-primary" href="/admin/dat-phong/moi"><CalendarPlus size={16} /> Tạo đặt phòng</Link>}
      </PageHead>
      <div className="row-between">
        <div className="tabs" role="tablist">
          {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map(v => <button key={v} role="tab" className="tab" aria-selected={view === v} onClick={() => { setView(v); setPage(1); }}>{VIEWS[v]}</button>)}
        </div>
        <form className="filters" onSubmit={e => { e.preventDefault(); setTerm(q.trim()); setPage(1); }}>
          <span className="search"><Search size={15} /><input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Mã, tên khách, SĐT, đoàn" aria-label="Tìm đặt phòng" /></span>
          <select className="select" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} aria-label="Trạng thái">
            <option value="">Mọi trạng thái</option>{Object.entries(BOOKING_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="select" value={source} onChange={e => { setSource(e.target.value); setPage(1); }} aria-label="Nguồn">
            <option value="">Mọi nguồn</option>{Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn">Tìm</button>
        </form>
      </div>
      <div className="card">
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Loading /> : !data?.data.length ? <Empty title="Không có đặt phòng phù hợp" /> : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Mã</th><th>Khách</th><th>Phòng</th><th>Ngày</th><th>Trạng thái</th><th>Nguồn</th>{can('balance.view') && <th className="right">Còn phải thu</th>}</tr></thead>
                <tbody>
                  {data.data.map(b => {
                    const first = b.stays.reduce((m, s) => (s.check_in < m ? s.check_in : m), b.stays[0]?.check_in ?? '');
                    const last = b.stays.reduce((m, s) => (s.check_out > m ? s.check_out : m), b.stays[0]?.check_out ?? '');
                    return (
                      <tr key={b.id}>
                        <td><Link href={`/admin/dat-phong/${b.id}`}><strong>{b.code}</strong></Link>{b.group_name && <div className="tiny muted">{b.group_name}</div>}</td>
                        <td>{b.customer.vip && <Star size={12} aria-label="VIP" />} {b.customer.full_name}<div className="tiny muted">{b.customer.phone}</div></td>
                        <td>{b.stays.map(s => <div key={s.id} className="small">{s.room?.number ?? 'Chưa phân'} · {s.type.code}</div>)}</td>
                        <td className="nowrap small">{dateVN(first, true)} → {dateVN(last, true)}</td>
                        <td><BookingBadge status={b.status} />{b.status === 'hold' && b.hold_expires_at && <div className="tiny muted">hết hạn {new Date(b.hold_expires_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>}</td>
                        <td className="small">{SOURCES[b.source]}</td>
                        {can('balance.view') && <td className="right num">{money(b.balance)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Trước</button>
              <span className="small">Trang {data.current_page}/{data.last_page}</span>
              <button className="btn btn-sm" disabled={page >= data.last_page} onClick={() => setPage(p => p + 1)}>Sau</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function BookingsPage() {
  return <RequirePerm perm="bookings.view"><Suspense fallback={<Loading />}><Bookings /></Suspense></RequirePerm>;
}
