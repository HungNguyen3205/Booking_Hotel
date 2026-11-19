'use client';

import Link from 'next/link';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Package, Play, Plus, ThumbsDown, ThumbsUp, Wrench } from 'lucide-react';
import { PageHead, RequirePerm } from '@/components/admin/shell';
import { Can, useSession } from '@/components/admin/session';
import { HousekeepingBadge } from '@/components/admin/badges';
import { Empty, ErrorState, Loading, Notice, useAction, useLoad } from '@/components/ui';
import { get, patch, post } from '@/lib/api';
import { dateTimeVN, dateVN, HOUSEKEEPING, todayISO, addDays } from '@/lib/format';
import { Tabs, ReasonForm, formValues } from '@/components/admin/modules/common';

type Task = {
  id: number; status: string; type: string; priority: string; note: string | null; assigned_to: number | null;
  checklist: { label: string; done: boolean }[] | null; started_at: string | null; finished_at: string | null; updated_at: string;
  room: { id: number; number: string; housekeeping: string; floor: { name: string } | null }; assignee: { id: number; name: string } | null;
};
type Ticket = { id: number; title: string; description: string | null; severity: string; status: string; resolution: string | null; created_at: string;
  room: { id: number; number: string } | null; assignee: { name: string } | null; reporter: { name: string } | null;
  block: { id: number; type: string; start_date: string; end_date: string; released_at: string | null } | null };
type Lost = { id: number; description: string; status: string; note: string | null; found_at: string; room: { number: string } | null };
type Room = { id: number; number: string; housekeeping: string; archived_at: string | null };

const TASK_STATUS: Record<string, [string, string]> = {
  open: ['Chờ dọn', 'b-amber'], in_progress: ['Đang dọn', 'b-blue'], inspecting: ['Chờ kiểm tra', 'b-bronze'], done: ['Hoàn thành', 'b-sage'], cancelled: ['Đã hủy', 'b-neutral'],
};
const TICKET_STATUS: Record<string, [string, string]> = {
  open: ['Mới báo', 'b-amber'], in_progress: ['Đang xử lý', 'b-blue'], resolved: ['Đã xử lý', 'b-sage'], cancelled: ['Đã hủy', 'b-neutral'],
};
const SEVERITY: Record<string, string> = { low: 'Thấp', normal: 'Bình thường', high: 'Cao' };
const LOST_STATUS: Record<string, string> = { stored: 'Đang lưu giữ', returned: 'Đã trả khách', disposed: 'Đã xử lý/thanh lý' };

export default function HousekeepingPage() {
  const { can } = useSession();
  const [tab, setTab] = useState<'tasks' | 'rooms' | 'maintenance' | 'lost'>('tasks');
  return (
    <RequirePerm perm="housekeeping.view">
      <div className="page">
        <PageHead title="Buồng phòng" sub="Bẩn → Đang dọn → Chờ kiểm tra → Sạch. Trạng thái buồng độc lập với trạng thái lưu trú." />
        <Tabs value={tab} onChange={setTab} tabs={[
          { key: 'tasks', label: 'Việc dọn' },
          { key: 'rooms', label: 'Trạng thái buồng', show: can('housekeeping.manage') },
          { key: 'maintenance', label: 'Sự cố & bảo trì' },
          { key: 'lost', label: 'Đồ thất lạc' },
        ]} />
        {tab === 'tasks' && <TasksTab />}
        {tab === 'rooms' && <RoomsTab />}
        {tab === 'maintenance' && <MaintenanceTab />}
        {tab === 'lost' && <LostTab />}
      </div>
    </RequirePerm>
  );
}

function TasksTab() {
  const { can, user } = useSession();
  const [mine, setMine] = useState(false);
  const d = useLoad(() => get<{ tasks: Task[]; staff: { id: number; name: string }[] }>(`/admin/housekeeping/tasks${mine ? '?mine=1' : ''}`), [mine]);
  const { busy, run } = useAction();
  const [finishing, setFinishing] = useState<number | null>(null);
  const [checks, setChecks] = useState<{ label: string; done: boolean }[]>([]);
  const [failing, setFailing] = useState<number | null>(null);

  const act = async (fn: () => Promise<unknown>, msg: string) => { const ok = await run(fn, msg); if (ok !== undefined) d.reload(true); return ok; };
  const canWork = (t: Task) => can('housekeeping.manage') || (can('housekeeping.work') && (t.assigned_to == null || t.assigned_to === user.id));

  return (
    <div className="mod-section">
      <div className="row"><label className="check"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} /> Chỉ việc của tôi</label></div>
      <div className="card">
        {d.loading ? <Loading /> : d.error ? <ErrorState error={d.error} onRetry={d.reload} /> : !d.data?.tasks.length ? <Empty title="Không có việc dọn nào"><CheckCircle2 size={14} /> Tất cả phòng đã sẵn sàng.</Empty> : (
          <div className="list">{d.data.tasks.map(t => {
            const [label, cls] = TASK_STATUS[t.status] ?? [t.status, 'b-neutral'];
            return (
              <div key={t.id} className="list-item" style={{ display: 'grid', gap: 8 }}>
                <div className="row-between">
                  <div className="row"><Link href={`/admin/lich-phong?room=${t.room.id}`} title="Xem trên sơ đồ"><strong style={{ fontSize: 17 }}>Phòng {t.room.number}</strong></Link><span className="muted small">{t.room.floor?.name}</span>
                    <HousekeepingBadge status={t.room.housekeeping} /><span className={`badge ${cls}`}><ClipboardCheck aria-hidden />{label}</span></div>
                  <span className="small muted">{t.note}{t.finished_at ? ` · xong ${dateTimeVN(t.finished_at)}` : ''}</span>
                </div>
                <div className="row">
                  {can('housekeeping.manage') && !['done', 'cancelled'].includes(t.status) ? (
                    <label className="row small">Người làm:
                      <select className="select" style={{ width: 'auto' }} value={t.assigned_to ?? ''} disabled={busy}
                        onChange={e => act(() => post(`/admin/housekeeping/tasks/${t.id}/assign`, { user_id: e.target.value ? Number(e.target.value) : null }), 'Đã giao việc')}>
                        <option value="">Chưa giao</option>{d.data!.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select></label>
                  ) : <span className="small muted">Người làm: {t.assignee?.name ?? 'Chưa giao'}</span>}
                  <div className="grow" />
                  {t.status === 'open' && canWork(t) && <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => act(() => post(`/admin/housekeeping/tasks/${t.id}/start`), 'Bắt đầu dọn')}><Play size={14} /> Bắt đầu dọn</button>}
                  {t.status === 'in_progress' && canWork(t) && finishing !== t.id && <button className="btn btn-sm btn-primary" onClick={() => { setFinishing(t.id); setChecks((t.checklist ?? []).map(c => ({ ...c }))); }}><CheckCircle2 size={14} /> Báo dọn xong</button>}
                  {t.status === 'inspecting' && can('housekeeping.inspect') && failing !== t.id && <>
                    <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => act(() => post(`/admin/housekeeping/tasks/${t.id}/inspect`, { passed: true }), `Phòng ${t.room.number} sạch, sẵn sàng bán`)}><ThumbsUp size={14} /> Đạt — Sạch</button>
                    <button className="btn btn-sm btn-danger" onClick={() => setFailing(t.id)}><ThumbsDown size={14} /> Chưa đạt</button>
                  </>}
                </div>
                {finishing === t.id && (
                  <form className="inline-form" onSubmit={async e => {
                    e.preventDefault();
                    const note = String(new FormData(e.currentTarget).get('note') || '') || null;
                    const ok = await act(() => post(`/admin/housekeeping/tasks/${t.id}/finish`, { checklist: checks, note }), 'Đã báo dọn xong');
                    if (ok !== undefined) setFinishing(null);
                  }}>
                    <h4>Checklist phòng {t.room.number}</h4>
                    <div className="mod-check-list">{checks.map((c, i) => (
                      <label key={i} className="check"><input type="checkbox" checked={c.done} onChange={e => setChecks(list => list.map((x, j) => j === i ? { ...x, done: e.target.checked } : x))} /> {c.label}</label>
                    ))}</div>
                    <input className="input" name="note" placeholder="Ghi chú (tùy chọn)" />
                    {checks.some(c => !c.done) && <Notice kind="warn">Cần hoàn thành đủ checklist trước khi báo xong.</Notice>}
                    <div className="row"><button className="btn btn-primary btn-sm" disabled={busy || checks.some(c => !c.done)}>Xác nhận dọn xong</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFinishing(null)}>Hủy</button></div>
                  </form>
                )}
                {failing === t.id && <ReasonForm label="Điểm chưa đạt" placeholder="Ví dụ: phòng tắm còn bẩn" confirm="Trả về dọn lại" danger busy={busy}
                  onCancel={() => setFailing(null)} onSubmit={async note => { const ok = await act(() => post(`/admin/housekeeping/tasks/${t.id}/inspect`, { passed: false, note }), 'Đã trả về dọn lại'); if (ok !== undefined) setFailing(null); }} />}
              </div>
            );
          })}</div>
        )}
      </div>
    </div>
  );
}

function RoomsTab() {
  const d = useLoad(() => get<{ rooms: Room[] }>('/admin/setup/rooms'), []);
  const { busy, run } = useAction();
  const [editing, setEditing] = useState<{ id: number; status: string } | null>(null);
  if (d.loading) return <Loading />;
  if (d.error || !d.data) return <ErrorState error={d.error} onRetry={d.reload} />;
  return (
    <div className="card">
      <div className="card-head"><h2>Đặt trạng thái buồng trực tiếp</h2><span className="small muted">Dành cho giám sát; mọi thay đổi cần lý do và được ghi nhật ký.</span></div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Phòng</th><th>Hiện tại</th><th>Đặt thành</th></tr></thead>
        <tbody>{d.data.rooms.filter(r => !r.archived_at).map(r => (
          <tr key={r.id}>
            <td><strong>{r.number}</strong></td>
            <td><HousekeepingBadge status={r.housekeeping} /></td>
            <td>{editing?.id === r.id
              ? <ReasonForm label={`Phòng ${r.number}: ${HOUSEKEEPING[r.housekeeping]} → ${HOUSEKEEPING[editing.status]}`} confirm="Cập nhật" busy={busy} onCancel={() => setEditing(null)}
                  onSubmit={async reason => { const ok = await run(() => post(`/admin/rooms/${r.id}/housekeeping`, { status: editing.status, reason }), 'Đã cập nhật'); if (ok !== undefined) { setEditing(null); d.reload(true); } }} />
              : <div className="row">{Object.entries(HOUSEKEEPING).filter(([k]) => k !== r.housekeeping).map(([k, l]) =>
                  <button key={k} className="btn btn-sm" onClick={() => setEditing({ id: r.id, status: k })}>{l}</button>)}</div>}
            </td>
          </tr>))}</tbody>
      </table></div>
    </div>
  );
}

function MaintenanceTab() {
  const { can } = useSession();
  const d = useLoad(() => get<Ticket[]>('/admin/maintenance'), []);
  const rooms = useLoad(() => get<{ rooms: Room[] }>('/admin/setup/rooms'), []);
  const staff = useLoad(() => can('maintenance.manage') ? get<{ tasks: unknown; staff: { id: number; name: string }[] }>('/admin/housekeeping/tasks') : Promise.resolve(null), []);
  const { busy, run } = useAction();
  const [reporting, setReporting] = useState(false);
  const [block, setBlock] = useState(false);
  const [updating, setUpdating] = useState<number | null>(null);

  return (
    <div className="mod-section">
      <Can perm="maintenance.report">
        <div className="row"><button className="btn btn-primary" onClick={() => setReporting(v => !v)}><Plus size={15} /> Báo hỏng</button></div>
        {reporting && (
          <form className="inline-form" onSubmit={async e => {
            e.preventDefault();
            const body = formValues(e.currentTarget, ['room_id'], ['block']);
            const ok = await run(() => post('/admin/maintenance', body), 'Đã ghi nhận sự cố');
            if (ok !== undefined) { setReporting(false); d.reload(true); }
          }}>
            <h4>Báo hỏng / sự cố</h4>
            <div className="form-grid">
              <label className="field"><span>Phòng</span><select className="select" name="room_id"><option value="">Khu vực chung</option>
                {rooms.data?.rooms.filter(r => !r.archived_at).map(r => <option key={r.id} value={r.id}>{r.number}</option>)}</select></label>
              <label className="field"><span>Tiêu đề</span><input className="input" name="title" required maxLength={200} placeholder="Ví dụ: Điều hòa không lạnh" /></label>
              <label className="field"><span>Mức độ</span><select className="select" name="severity" defaultValue="normal">{Object.entries(SEVERITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            </div>
            <textarea className="textarea" name="description" placeholder="Mô tả chi tiết" />
            {can('maintenance.manage') && <>
              <label className="check"><input type="checkbox" name="block" checked={block} onChange={e => setBlock(e.target.checked)} /> Chặn bán phòng trong thời gian sửa</label>
              {block && <div className="form-grid">
                <label className="field"><span>Loại chặn</span><select className="select" name="block_type"><option value="maintenance">Bảo trì</option><option value="out_of_service">Ngừng bán</option></select></label>
                <label className="field"><span>Từ ngày</span><input className="input" type="date" name="block_start" defaultValue={todayISO()} required /></label>
                <label className="field"><span>Đến ngày (không gồm)</span><input className="input" type="date" name="block_end" defaultValue={addDays(todayISO(), 1)} required /></label>
              </div>}
              {block && <Notice kind="info">Nếu phòng đã có đặt phòng trong khoảng này, hệ thống sẽ từ chối và nêu mã đặt phòng để chuyển khách trước.</Notice>}
            </>}
            <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Gửi báo hỏng</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setReporting(false)}>Hủy</button></div>
          </form>
        )}
      </Can>
      <div className="card">
        {d.loading ? <Loading /> : d.error ? <ErrorState error={d.error} onRetry={d.reload} /> : !d.data?.length ? <Empty title="Chưa có sự cố" /> : (
          <div className="list">{d.data.map(t => {
            const [label, cls] = TICKET_STATUS[t.status] ?? [t.status, 'b-neutral'];
            return (
              <div key={t.id} className="list-item" style={{ display: 'grid', gap: 6 }}>
                <div className="row-between">
                  <div className="row"><Wrench size={15} aria-hidden /><strong>{t.title}</strong><span className="muted small">{t.room ? `Phòng ${t.room.number}` : 'Khu vực chung'}</span>
                    <span className={`badge ${cls}`}>{label}</span>{t.severity === 'high' && <span className="badge b-red"><AlertTriangle aria-hidden />Mức cao</span>}</div>
                  <span className="small muted">{dateTimeVN(t.created_at)} · {t.reporter?.name ?? ''}</span>
                </div>
                {t.description && <p className="small">{t.description}</p>}
                {t.block && <span className="small"><span className="badge b-neutral"><Wrench aria-hidden />{t.block.type === 'maintenance' ? 'Bảo trì' : 'Ngừng bán'}</span> {dateVN(t.block.start_date)} → {dateVN(t.block.end_date)}{t.block.released_at ? ' (đã mở bán lại)' : ''}</span>}
                {t.resolution && <Notice kind="ok">{t.resolution}</Notice>}
                {can('maintenance.manage') && !['resolved', 'cancelled'].includes(t.status) && (updating === t.id ? (
                  <form className="inline-form" onSubmit={async e => {
                    e.preventDefault();
                    const body = formValues(e.currentTarget, ['assigned_to'], ['release_block']);
                    const ok = await run(() => patch(`/admin/maintenance/${t.id}`, body), 'Đã cập nhật sự cố');
                    if (ok !== undefined) { setUpdating(null); d.reload(true); }
                  }}>
                    <div className="form-grid">
                      <label className="field"><span>Trạng thái</span><select className="select" name="status" defaultValue={t.status}>{Object.entries(TICKET_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
                      <label className="field"><span>Người xử lý</span><select className="select" name="assigned_to"><option value="">—</option>{staff.data?.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                    </div>
                    <input className="input" name="resolution" placeholder="Kết quả xử lý (bắt buộc khi đóng sự cố)" />
                    {t.block && !t.block.released_at && <label className="check"><input type="checkbox" name="release_block" defaultChecked /> Mở bán lại phòng từ hôm nay</label>}
                    <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Lưu</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setUpdating(null)}>Hủy</button></div>
                  </form>
                ) : <div><button className="btn btn-sm" onClick={() => setUpdating(t.id)}>Cập nhật xử lý</button></div>)}
              </div>
            );
          })}</div>
        )}
      </div>
    </div>
  );
}

function LostTab() {
  const { can } = useSession();
  const d = useLoad(() => get<Lost[]>('/admin/lost-items'), []);
  const rooms = useLoad(() => get<{ rooms: Room[] }>('/admin/setup/rooms'), []);
  const { busy, run } = useAction();
  const [adding, setAdding] = useState(false);
  const [changing, setChanging] = useState<{ id: number; status: string } | null>(null);
  return (
    <div className="mod-section">
      <div className="row"><button className="btn btn-primary" onClick={() => setAdding(v => !v)}><Package size={15} /> Ghi nhận đồ thất lạc</button></div>
      {adding && (
        <form className="inline-form" onSubmit={async e => {
          e.preventDefault();
          const ok = await run(() => post('/admin/lost-items', formValues(e.currentTarget, ['room_id'])), 'Đã ghi nhận');
          if (ok !== undefined) { setAdding(false); d.reload(true); }
        }}>
          <div className="form-grid">
            <label className="field"><span>Phòng</span><select className="select" name="room_id"><option value="">Khu vực chung</option>{rooms.data?.rooms.map(r => <option key={r.id} value={r.id}>{r.number}</option>)}</select></label>
            <label className="field"><span>Mô tả đồ vật</span><input className="input" name="description" required maxLength={300} /></label>
            <label className="field"><span>Ghi chú</span><input className="input" name="note" placeholder="Nơi cất giữ…" /></label>
          </div>
          <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Lưu</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Hủy</button></div>
        </form>
      )}
      <div className="card">
        {d.loading ? <Loading /> : d.error ? <ErrorState error={d.error} onRetry={d.reload} /> : !d.data?.length ? <Empty title="Chưa có đồ thất lạc" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Thời gian</th><th>Phòng</th><th>Đồ vật</th><th>Trạng thái</th><th>Ghi chú</th><th /></tr></thead>
            <tbody>{d.data.map(l => (
              <tr key={l.id}>
                <td className="nowrap">{dateTimeVN(l.found_at)}</td><td>{l.room?.number ?? '—'}</td><td>{l.description}</td>
                <td><span className={`badge ${l.status === 'stored' ? 'b-amber' : 'b-sage'}`}><Package aria-hidden />{LOST_STATUS[l.status]}</span></td>
                <td className="small">{l.note}</td>
                <td>{can('housekeeping.manage') && l.status === 'stored' && (changing?.id === l.id
                  ? <ReasonForm label={LOST_STATUS[changing.status]} placeholder="Ghi chú (người nhận, cách xử lý…)" confirm="Lưu" busy={busy} onCancel={() => setChanging(null)}
                      onSubmit={async note => { const ok = await run(() => patch(`/admin/lost-items/${l.id}`, { status: changing.status, note }), 'Đã cập nhật'); if (ok !== undefined) { setChanging(null); d.reload(true); } }} />
                  : <div className="row"><button className="btn btn-sm" onClick={() => setChanging({ id: l.id, status: 'returned' })}>Đã trả khách</button>
                      <button className="btn btn-sm" onClick={() => setChanging({ id: l.id, status: 'disposed' })}>Thanh lý</button></div>)}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
