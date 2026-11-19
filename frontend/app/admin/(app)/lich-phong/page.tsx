'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BedDouble, Brush, CalendarDays, CalendarPlus, DoorOpen, LayoutGrid, LogIn, LogOut, Search, Wrench } from 'lucide-react';
import { todayISO } from '@/lib/format';
import { ErrorState, Loading } from '@/components/ui';
import { PageHead, RequirePerm } from '@/components/admin/shell';
import { useSession } from '@/components/admin/session';
import { MapFilter, MapView, useRoomMap } from '@/components/admin/room-map';
import { RoomCalendar } from '@/components/admin/room-calendar';

function RoomBoard() {
  const { can } = useSession();
  const params = useSearchParams();
  const [date, setDate] = useState(params.get('date') ?? todayISO());
  const [view, setView] = useState<'map' | 'calendar'>(params.get('view') === 'calendar' ? 'calendar' : 'map');
  const [filter, setFilter] = useState<MapFilter>('all');
  const [typeId, setTypeId] = useState<number | ''>('');
  const [query, setQuery] = useState('');
  const { data, error, reload } = useRoomMap(date);

  const kpis: { key: MapFilter; label: string; icon: typeof DoorOpen; value?: number }[] = [
    { key: 'vacant_ready', label: 'Trống sẵn sàng', icon: DoorOpen, value: data?.summary.vacant_ready },
    { key: 'occupied', label: 'Đang ở', icon: BedDouble, value: data?.summary.occupied },
    { key: 'arriving', label: 'Sắp đến', icon: LogIn, value: data?.summary.arriving },
    { key: 'departing', label: 'Sắp trả', icon: LogOut, value: data?.summary.departing },
    { key: 'dirty', label: 'Cần dọn', icon: Brush, value: data?.summary.dirty },
    { key: 'blocked', label: 'Bảo trì / ngừng bán', icon: Wrench, value: data?.summary.blocked },
  ];

  return (
    <div className="page">
      <PageHead title="Lịch phòng" sub="Sơ đồ mặt bằng và lịch phòng dùng chung một nguồn dữ liệu tồn phòng.">
        <div className="tabs" role="tablist" aria-label="Chế độ">
          <button role="tab" className="tab" aria-selected={view === 'map'} onClick={() => setView('map')}><LayoutGrid size={13} /> Mặt bằng</button>
          <button role="tab" className="tab" aria-selected={view === 'calendar'} onClick={() => setView('calendar')}><CalendarDays size={13} /> Lịch</button>
        </div>
      </PageHead>

      <div className="card board-bar">
        <label className="field"><span>Ngày vận hành</span><input className="input" type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} /></label>
        <label className="field"><span>Loại phòng</span>
          <select className="select" value={typeId} onChange={e => setTypeId(Number(e.target.value) || '')}>
            <option value="">Tất cả</option>{data?.room_types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></label>
        <label className="field"><span>Trạng thái</span>
          <select className="select" value={filter} onChange={e => setFilter(e.target.value as MapFilter)}>
            <option value="all">Tất cả</option>{kpis.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select></label>
        <label className="field grow"><span>Tìm phòng / khách / mã</span>
          <span className="search"><Search size={15} aria-hidden /><input className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder="VD: 205, Nguyễn, 0905…" /></span></label>
        {can('bookings.create') && <Link className="btn btn-primary" href={`/admin/dat-phong/moi?check_in=${date}`}><CalendarPlus size={16} /> Tạo đặt phòng</Link>}
      </div>

      <div className="kpis" role="group" aria-label="Lọc nhanh theo trạng thái">
        {kpis.map(({ key, label, icon: Icon, value }) => (
          <button key={key} className="kpi" aria-pressed={filter === key} onClick={() => setFilter(filter === key ? 'all' : key)}>
            <span><Icon size={14} aria-hidden /> {label}</span><strong>{value ?? '—'}</strong>
          </button>
        ))}
      </div>

      {view === 'map' && (error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading label="Đang tải sơ đồ…" /> :
        <MapView key={params.get('room') ?? ''} initialRoom={Number(params.get('room')) || undefined} data={data} onChanged={reload} filter={filter} typeId={typeId} query={query.trim()} />)}
      {view === 'calendar' && <RoomCalendar start={date} typeId={typeId} query={query.trim()} onChanged={reload} />}
    </div>
  );
}

export default function RoomBoardPage() {
  return <RequirePerm perm="rooms.view"><Suspense fallback={<Loading />}><RoomBoard /></Suspense></RequirePerm>;
}
