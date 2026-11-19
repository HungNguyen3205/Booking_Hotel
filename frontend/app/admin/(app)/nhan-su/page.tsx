'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Lock, Pencil, Plus, ShieldCheck, X } from 'lucide-react';
import { PageHead, RequirePerm } from '@/components/admin/shell';
import { useSession } from '@/components/admin/session';
import { Empty, ErrorState, Loading, Notice, useAction, useLoad } from '@/components/ui';
import { del, get, patch, post, put, qs } from '@/lib/api';
import { addDays, dateTimeVN, dateVN, todayISO, weekday } from '@/lib/format';
import { Tabs, formValues } from '@/components/admin/modules/common';

type User = { id: number; name: string; email: string; phone: string | null; role: string; active: boolean; last_login_at: string | null; role_model: { name: string } | null };
type Role = { key: string; name: string; permissions: string[]; system: boolean };
type Data = { users: User[]; roles: Role[]; permission_groups: Record<string, Record<string, string>> };
type Roster = { id: number; user_id: number; work_date: string; shift: string; starts_at: string; ends_at: string; note: string | null; user: { name: string } };

const SHIFTS: Record<string, [string, string, string]> = { morning: ['Ca sáng', '06:00', '14:00'], afternoon: ['Ca chiều', '14:00', '22:00'], night: ['Ca đêm', '22:00', '06:00'], custom: ['Ca tùy chỉnh', '08:00', '17:00'] };

export default function StaffPage() {
  const { can } = useSession();
  const [tab, setTab] = useState<'users' | 'roles' | 'roster'>('users');
  const d = useLoad(() => get<Data>('/admin/staff'), []);
  return (
    <RequirePerm perm="staff.view">
      <div className="page">
        <PageHead title="Nhân sự" sub="Tài khoản, vai trò & quyền theo hành động, phân ca." />
        <Tabs value={tab} onChange={setTab} tabs={[{ key: 'users', label: 'Tài khoản' }, { key: 'roles', label: 'Vai trò & quyền' }, { key: 'roster', label: 'Phân ca' }]} />
        {d.loading ? <Loading /> : d.error || !d.data ? <ErrorState error={d.error} onRetry={d.reload} /> : <>
          {tab === 'users' && <UsersTab data={d.data} reload={() => d.reload(true)} canManage={can('staff.manage')} />}
          {tab === 'roles' && <RolesTab data={d.data} reload={() => d.reload(true)} canManage={can('staff.manage')} />}
          {tab === 'roster' && <RosterTab users={d.data.users.filter(u => u.active)} canManage={can('staff.manage')} />}
        </>}
      </div>
    </RequirePerm>
  );
}

function UsersTab({ data, reload, canManage }: { data: Data; reload: () => void; canManage: boolean }) {
  const { user: me } = useSession();
  const { busy, run } = useAction();
  const [edit, setEdit] = useState<User | 'new' | null>(null);
  const roles = data.roles.filter(r => r.key !== 'owner' || me.role === 'owner');

  const form = (u: User | null) => (
    <form className="inline-form" onSubmit={async e => {
      e.preventDefault();
      const body = formValues(e.currentTarget, [], ['active']);
      if (u && !body.password) delete body.password;
      if (u?.id === me.id) { delete body.active; delete body.role; }
      const ok = await run(() => u ? patch(`/admin/staff/${u.id}`, body) : post('/admin/staff', body), 'Đã lưu tài khoản');
      if (ok !== undefined) { setEdit(null); reload(); }
    }}>
      <h4>{u ? `Sửa: ${u.name}` : 'Tài khoản mới'}</h4>
      <div className="form-grid">
        <label className="field"><span>Họ tên</span><input className="input" name="name" defaultValue={u?.name} required /></label>
        <label className="field"><span>Email đăng nhập</span><input className="input" type="email" name="email" defaultValue={u?.email} required /></label>
        <label className="field"><span>Điện thoại</span><input className="input" name="phone" defaultValue={u?.phone ?? ''} /></label>
        <label className="field"><span>Vai trò</span><select className="select" name="role" defaultValue={u?.role ?? 'receptionist'} disabled={u?.id === me.id}>
          {roles.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}</select></label>
        <label className="field"><span>{u ? 'Mật khẩu mới (để trống nếu giữ)' : 'Mật khẩu'}</span><input className="input" type="password" name="password" minLength={10} required={!u} autoComplete="new-password" /></label>
      </div>
      <label className="check"><input type="checkbox" name="active" defaultChecked={u?.active ?? true} disabled={u?.id === me.id} /> Đang hoạt động</label>
      {u?.id === me.id && <p className="small muted">Không tự đổi vai trò hoặc khóa tài khoản của chính mình.</p>}
      <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Lưu</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(null)}>Hủy</button></div>
    </form>
  );

  return (
    <div className="mod-section">
      {canManage && <div className="row"><button className="btn btn-primary" onClick={() => setEdit('new')}><Plus size={15} /> Thêm tài khoản</button></div>}
      {edit === 'new' && form(null)}
      <div className="card">
        {!data.users.length ? <Empty /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th /></tr></thead>
            <tbody>{data.users.map(u => edit !== 'new' && edit?.id === u.id ? <tr key={u.id}><td colSpan={6}>{form(u)}</td></tr> : (
              <tr key={u.id}>
                <td><strong>{u.name}</strong>{u.id === me.id && <span className="tiny muted"> (bạn)</span>}</td><td>{u.email}</td><td>{u.role_model?.name ?? u.role}</td>
                <td>{u.active ? <span className="badge b-sage"><CheckCircle2 aria-hidden />Hoạt động</span> : <span className="badge b-neutral"><Lock aria-hidden />Đã khóa</span>}</td>
                <td className="nowrap">{dateTimeVN(u.last_login_at)}</td>
                <td className="right">{canManage && (u.role !== 'owner' || me.role === 'owner') && <button className="btn btn-sm btn-ghost" onClick={() => setEdit(u)}><Pencil size={14} /> Sửa</button>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function RolesTab({ data, reload, canManage }: { data: Data; reload: () => void; canManage: boolean }) {
  const { busy, run } = useAction();
  const [key, setKey] = useState(data.roles.find(r => r.key !== 'owner')?.key ?? 'owner');
  const role = data.roles.find(r => r.key === key);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState('');
  const perms = key === '__new' ? (draft.__new ?? []) : (draft[key] ?? role?.permissions ?? []);
  const readOnly = !canManage || key === 'owner';
  const toggle = (p: string) => setDraft(d => ({ ...d, [key]: perms.includes(p) ? perms.filter(x => x !== p) : [...perms, p] }));

  return (
    <div className="mod-section">
      <div className="row">
        <select className="select" style={{ width: 'auto' }} value={key} onChange={e => setKey(e.target.value)}>
          {data.roles.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
          {canManage && <option value="__new">+ Vai trò mới…</option>}
        </select>
        {key === 'owner' && <span className="badge b-bronze"><ShieldCheck aria-hidden />Toàn quyền — không chỉnh sửa</span>}
      </div>
      {key === '__new' && <div className="form-grid">
        <label className="field"><span>Mã vai trò (chữ thường, gạch dưới)</span><input className="input" value={newKey} onChange={e => setNewKey(e.target.value)} pattern="[a-z_]{3,40}" /></label>
        <label className="field"><span>Tên hiển thị</span><input className="input" value={name} onChange={e => setName(e.target.value)} /></label>
      </div>}
      <Notice kind="info">Quyền được kiểm tra ở backend cho từng thao tác — ẩn nút trên giao diện chỉ để gọn. Thay đổi quyền được ghi nhật ký.</Notice>
      <div className="mod-perm-grid">
        {Object.entries(data.permission_groups).map(([group, items]) => (
          <div key={group} className="mod-perm-group">
            <strong>{group}</strong>
            {Object.entries(items).map(([p, label]) => (
              <label key={p} className="check small"><input type="checkbox" checked={key === 'owner' || perms.includes(p)} disabled={readOnly} onChange={() => toggle(p)} /> {label}</label>
            ))}
          </div>
        ))}
      </div>
      {!readOnly && <div className="row">
        <button className="btn btn-primary" disabled={busy || (key === '__new' && (!newKey || !name))} onClick={async () => {
          const k = key === '__new' ? newKey : key;
          const ok = await run(() => put(`/admin/roles/${k}`, { name: key === '__new' ? name : role?.name, permissions: perms }), 'Đã lưu quyền');
          if (ok !== undefined) { setDraft({}); if (key === '__new') setKey(k); reload(); }
        }}>Lưu quyền</button>
        {draft[key] && <button className="btn btn-ghost" onClick={() => setDraft(d => { const n = { ...d }; delete n[key]; return n; })}>Hoàn tác</button>}
      </div>}
    </div>
  );
}

function RosterTab({ users, canManage }: { users: User[]; canManage: boolean }) {
  const monday = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`).getUTCDay(); return addDays(iso, d === 0 ? -6 : 1 - d); };
  const [start, setStart] = useState(monday(todayISO()));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const d = useLoad(() => get<Roster[]>('/admin/roster' + qs({ from: start, to: days[6] })), [start]);
  const { busy, run } = useAction();
  const [adding, setAdding] = useState<{ user: number; date: string } | null>(null);
  const [shift, setShift] = useState('morning');

  return (
    <div className="mod-section">
      <div className="row">
        <button className="btn btn-sm" onClick={() => setStart(addDays(start, -7))}><ChevronLeft size={14} /> Tuần trước</button>
        <strong>{dateVN(start)} – {dateVN(days[6])}</strong>
        <button className="btn btn-sm" onClick={() => setStart(addDays(start, 7))}>Tuần sau <ChevronRight size={14} /></button>
      </div>
      {adding && canManage && (
        <form className="inline-form" onSubmit={async e => {
          e.preventDefault();
          const body = { ...formValues(e.currentTarget), user_id: adding.user, work_date: adding.date, shift };
          const ok = await run(() => post('/admin/roster', body), 'Đã phân ca');
          if (ok !== undefined) { setAdding(null); d.reload(true); }
        }}>
          <h4>Phân ca: {users.find(u => u.id === adding.user)?.name} · {weekday(adding.date)} {dateVN(adding.date)}</h4>
          <div className="form-grid">
            <label className="field"><span>Ca</span><select className="select" value={shift} onChange={e => setShift(e.target.value)}>{Object.entries(SHIFTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="field"><span>Bắt đầu</span><input key={shift + 's'} className="input" type="time" name="starts_at" defaultValue={SHIFTS[shift][1]} required /></label>
            <label className="field"><span>Kết thúc</span><input key={shift + 'e'} className="input" type="time" name="ends_at" defaultValue={SHIFTS[shift][2]} required /></label>
            <label className="field"><span>Ghi chú / việc giao</span><input className="input" name="note" /></label>
          </div>
          <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Lưu</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(null)}>Hủy</button></div>
        </form>
      )}
      {d.loading ? <Loading /> : d.error ? <ErrorState error={d.error} onRetry={d.reload} /> : (
        <div className="table-wrap">
          <div className="mod-roster">
            <div className="head">Nhân viên</div>
            {days.map(day => <div key={day} className="head">{weekday(day)} {dateVN(day, true)}</div>)}
            {users.map(u => (
              <RosterRow key={u.id} u={u} days={days} items={(d.data ?? []).filter(r => r.user_id === u.id)} canManage={canManage}
                onAdd={date => setAdding({ user: u.id, date })}
                onDelete={async id => { const ok = await run(() => del(`/admin/roster/${id}`).then(() => true), 'Đã bỏ phân ca'); if (ok) d.reload(true); }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RosterRow({ u, days, items, canManage, onAdd, onDelete }: { u: User; days: string[]; items: Roster[]; canManage: boolean; onAdd: (d: string) => void; onDelete: (id: number) => void }) {
  return <>
    <div><strong>{u.name}</strong><div className="tiny muted">{u.role_model?.name}</div></div>
    {days.map(day => (
      <div key={day}>
        {items.filter(r => r.work_date.slice(0, 10) === day).map(r => (
          <span key={r.id} className="mod-chip" title={r.note ?? ''}>{SHIFTS[r.shift]?.[0] ?? r.shift} {r.starts_at}–{r.ends_at}
            {canManage && <button onClick={() => onDelete(r.id)} aria-label="Bỏ ca"><X size={11} /></button>}</span>
        ))}
        {canManage && <button className="btn btn-ghost btn-sm" style={{ minHeight: 24, padding: '0 6px' }} onClick={() => onAdd(day)} aria-label={`Phân ca ${u.name} ${day}`}><Plus size={12} /></button>}
      </div>
    ))}
  </>;
}
