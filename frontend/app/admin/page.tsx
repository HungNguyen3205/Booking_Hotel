'use client';

import { ArrowLeft, BedDouble, CalendarDays, ClipboardList, LayoutDashboard, LogOut, Plus, Users, Waves, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, Booking, dateLabel, errorText, money, Room, Session, Status, statusLabels, User } from '../api-client';

type Tab = 'dashboard' | 'bookings' | 'rooms' | 'staff';
type AdminBooking = Booking & {id: number; guest_name: string; email: string; phone: string; room: Room};
type Dashboard = {rooms: number; arrivals: number; occupied: number; pending: number; revenue: number};
type BookingPage = {data: AdminBooking[]; current_page: number; last_page: number};
type Editor = {kind: 'rooms'; item?: Room} | {kind: 'staff'; item?: User};

const tabs = [
  {id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard},
  {id: 'bookings', label: 'Đặt phòng', icon: ClipboardList},
  {id: 'rooms', label: 'Phòng nghỉ', icon: BedDouble},
  {id: 'staff', label: 'Nhân viên', icon: Users},
] as const;
const transitions: Record<Status, Status[]> = {
  pending: ['confirmed', 'cancelled'], confirmed: ['checked_in', 'cancelled'],
  checked_in: ['checked_out'], checked_out: [], cancelled: [],
};
const actions = {confirmed: 'Xác nhận', cancelled: 'Hủy đơn', checked_in: 'Nhận phòng', checked_out: 'Trả phòng'} as Partial<Record<Status, string>>;

export default function Admin() {
  const [session, setSession] = useState<Session>();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [bookings, setBookings] = useState<BookingPage>();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [filter, setFilter] = useState({q: '', status: '', page: 1});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorError, setEditorError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const user = session?.user;

  useEffect(() => {
    api<Session>('/session').then(setSession).catch(reason => setError(errorText(reason))).finally(() => setLoading(false));
  }, []);

  const load = useCallback(async (signal: {cancelled: boolean}) => {
    if (!user) return;
    try {
      if (tab === 'dashboard') {
        const data = await api<Dashboard>('/admin/dashboard');
        if (!signal.cancelled) setDashboard(data);
      } else if (tab === 'bookings') {
        const data = await api<BookingPage>('/admin/bookings?' + new URLSearchParams({...filter, page: String(filter.page)}));
        if (!signal.cancelled) setBookings(data);
      } else if (tab === 'rooms') {
        const data = await api<Room[]>('/admin/rooms');
        if (!signal.cancelled) setRooms(data);
      } else {
        const data = await api<User[]>('/admin/staff');
        if (!signal.cancelled) setStaff(data);
      }
    } catch (reason) {
      if (!signal.cancelled) setError(errorText(reason));
    } finally {
      if (!signal.cancelled) setLoading(false);
    }
  }, [tab, filter, user]);

  useEffect(() => {
    const signal = {cancelled: false};
    void load(signal);
    return () => { signal.cancelled = true; };
  }, [load]);

  useEffect(() => {
    if (editor) dialog.current?.showModal();
    else dialog.current?.close();
  }, [editor]);

  function navigate(nextTab: Tab) {
    if (nextTab === tab) return;
    setLoading(true);
    setError('');
    setSuccess('');
    setTab(nextTab);
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const {csrf} = session ?? await api<Session>('/session');
      setSession(await api<Session>('/login', 'POST', Object.fromEntries(new FormData(event.currentTarget)), csrf));
      setLoading(true);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    setError('');
    try {
      await api('/logout', 'POST', undefined, session?.csrf);
      setSession(await api<Session>('/session'));
      setTab('dashboard');
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function mutate(path: string, method: string, data?: unknown, inEditor = false) {
    setBusy(true);
    setError('');
    setEditorError('');
    setSuccess('');
    try {
      await api(path, method, data, session?.csrf);
      if (inEditor) setEditor(null);
      setSuccess('Đã lưu thay đổi.');
      await load({cancelled: false});
    } catch (reason) {
      if (inEditor) setEditorError(errorText(reason));
      else setError(errorText(reason));
    } finally { setBusy(false); }
  }

  function edit(nextEditor: Editor) {
    setEditorError('');
    setEditor(nextEditor);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const data = editor.kind === 'rooms' ? {...fields, active: fields.active === 'on'} : fields;
    void mutate('/admin/' + editor.kind + (editor.item ? '/' + editor.item.id : ''), editor.item ? 'PUT' : 'POST', data, true);
  }

  function remove(kind: 'rooms' | 'staff', item: Room | User) {
    if (window.confirm(`Xóa ${item.name}?`)) void mutate(`/admin/${kind}/${item.id}`, 'DELETE');
  }

  if (!user) return <main className="login">
    <div className="login-photo"><a className="brand" href="/"><span className="brand-icon"><Waves size={23}/></span><span>GLG HOTEL<small>ĐÀ NẴNG</small></span></a></div>
    <div className="login-content"><form className="stack login-form" onSubmit={authenticate}>
      <a className="back-link" href="/"><ArrowLeft size={17}/> Về trang khách sạn</a>
      <p className="eyebrow">GLG HOTEL</p><h1>Đăng nhập quản trị</h1>
      <label>Email<input name="email" type="email" autoComplete="username" required/></label>
      <label>Mật khẩu<input name="password" type="password" autoComplete="current-password" required/></label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <button className="button primary" disabled={busy || loading}>{busy || loading ? 'Đang tải…' : 'Đăng nhập'}</button>
    </form></div>
  </main>;

  const room = editor?.kind === 'rooms' ? editor.item : undefined;
  const employee = editor?.kind === 'staff' ? editor.item : undefined;
  return <div className="admin-shell">
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brand-icon"><Waves size={23}/></span><span>GLG HOTEL<small>VẬN HÀNH KHÁCH SẠN</small></span></a>
      <nav aria-label="Quản trị khách sạn">{tabs.filter(item => item.id !== 'staff' || user.role === 'admin').map(item =>
        <button key={item.id} disabled={busy} aria-current={tab === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={18}/>{item.label}</button>
      )}</nav>
      <button className="sidebar-logout" disabled={busy} onClick={logout}><LogOut size={18}/> Đăng xuất</button>
    </aside>
    <main className="admin-main">
      <header className="admin-heading">
        <div><p className="eyebrow">{user.role === 'admin' ? 'QUẢN TRỊ VIÊN' : 'LỄ TÂN'} · {user.name}</p><h1>{tabs.find(item => item.id === tab)?.label}</h1></div>
        {user.role === 'admin' && (tab === 'rooms' || tab === 'staff') && <button className="button primary" disabled={busy} onClick={() => edit({kind: tab})}><Plus size={18}/>{tab === 'rooms' ? 'Thêm phòng' : 'Thêm nhân viên'}</button>}
      </header>
      {error && <p className="notice error" role="alert">{error}</p>}
      {success && <p className="notice success" role="status">{success}</p>}
      {loading && <p className="notice" role="status">Đang tải dữ liệu…</p>}
      {tab === 'dashboard' && dashboard && <div className="stats">
        {[
          {name: 'Phòng mở bán', value: dashboard.rooms, icon: BedDouble},
          {name: 'Khách đến hôm nay', value: dashboard.arrivals, icon: CalendarDays},
          {name: 'Phòng đang có khách', value: dashboard.occupied, icon: Users},
          {name: 'Đơn chờ xác nhận', value: dashboard.pending, icon: ClipboardList},
          {name: 'Tiền thu hôm nay', value: money(dashboard.revenue), icon: LayoutDashboard},
        ].map(stat => <article key={stat.name}><stat.icon size={20}/><p>{stat.name}</p><strong>{stat.value}</strong></article>)}
      </div>}
      {tab === 'bookings' && <>
        <form className="filters" onSubmit={event => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          setLoading(true);
          setFilter({q: String(fields.get('q')), status: String(fields.get('status')), page: 1});
        }}>
          <input name="q" aria-label="Tìm đơn đặt phòng" placeholder="Mã đơn, tên khách, email…" defaultValue={filter.q}/>
          <select name="status" aria-label="Trạng thái" defaultValue={filter.status}><option value="">Mọi trạng thái</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
          <button className="button outline" disabled={busy}>Lọc đơn</button>
        </form>
        <div className="table-wrap"><table><thead><tr><th>Đơn / khách</th><th>Phòng</th><th>Nhận / trả</th><th>Tổng tiền</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>{bookings?.data.map(item => <tr key={item.id}>
            <td><strong>{item.code}</strong><small>{item.guest_name} · {item.guests} khách<br/>{item.email}<br/>{item.phone}</small></td>
            <td>{item.room?.number} · {item.room?.name}</td><td>{dateLabel(item.check_in)}<small>{dateLabel(item.check_out)}</small></td>
            <td>{money(item.total)}<small>{item.paid_at ? 'Đã thu' : 'Chưa thu'}</small></td>
            <td><span className={'badge ' + item.status}>{statusLabels[item.status]}</span></td>
            <td><div className="row-actions">
              {transitions[item.status].filter(status => status !== 'cancelled' || !item.paid_at).map(status => <button className="button outline" disabled={busy || (status === 'checked_out' && !item.paid_at)} key={status} onClick={() => {
                if (status !== 'cancelled' || window.confirm('Hủy đơn và giải phóng phòng?')) void mutate('/admin/bookings/' + item.id, 'PATCH', {status});
              }}>{actions[status]}</button>)}
              {!item.paid_at && ['confirmed', 'checked_in'].includes(item.status) && <button className="button outline" disabled={busy} onClick={() => {
                if (window.confirm(`Xác nhận đã thu ${money(item.total)}?`)) void mutate(`/admin/bookings/${item.id}/payment`, 'POST');
              }}>Ghi nhận thu tiền</button>}
            </div></td>
          </tr>)}</tbody></table>{bookings?.data.length === 0 && !loading && <p className="empty">Chưa có đơn phù hợp.</p>}</div>
        {bookings && bookings.last_page > 1 && <div className="pagination">
          <button className="button outline" disabled={busy || filter.page <= 1} onClick={() => setFilter({...filter, page: filter.page - 1})}>Trang trước</button>
          <span>{bookings.current_page} / {bookings.last_page}</span>
          <button className="button outline" disabled={busy || filter.page >= bookings.last_page} onClick={() => setFilter({...filter, page: filter.page + 1})}>Trang sau</button>
        </div>}
      </>}
      {tab === 'rooms' && <div className="table-wrap"><table><thead><tr><th>Số phòng</th><th>Tên phòng</th><th>Sức chứa</th><th>Giá / đêm</th><th>Trạng thái</th>{user.role === 'admin' && <th>Thao tác</th>}</tr></thead><tbody>
        {rooms.map(item => <tr key={item.id}><td>{item.number}</td><td><strong>{item.name}</strong><small>{item.area} m² · {item.bed}</small></td><td>{item.capacity} khách</td><td>{money(item.price)}</td><td><span className={'badge ' + (item.active ? 'confirmed' : 'cancelled')}>{item.active ? 'Mở bán' : 'Ngừng bán'}</span></td>
          {user.role === 'admin' && <td><div className="row-actions"><button className="button outline" disabled={busy} onClick={() => edit({kind: 'rooms', item})}>Sửa</button><button className="button outline danger" disabled={busy} onClick={() => remove('rooms', item)}>Xóa</button></div></td>}</tr>)}
      </tbody></table>{!rooms.length && !loading && <p className="empty">Chưa có phòng.</p>}</div>}
      {tab === 'staff' && <div className="table-wrap"><table><thead><tr><th>Họ và tên</th><th>Email</th><th>Vai trò</th><th>Thao tác</th></tr></thead><tbody>
        {staff.map(item => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.email}</td><td>Lễ tân</td><td><div className="row-actions"><button className="button outline" disabled={busy} onClick={() => edit({kind: 'staff', item})}>Sửa</button><button className="button outline danger" disabled={busy} onClick={() => remove('staff', item)}>Xóa</button></div></td></tr>)}
      </tbody></table>{!staff.length && !loading && <p className="empty">Chưa có nhân viên.</p>}</div>}

      <dialog ref={dialog} onClose={() => setEditor(null)} onCancel={event => { if (busy) event.preventDefault(); }} className="hotel-dialog">
        <button className="icon close" aria-label="Đóng" disabled={busy} onClick={() => setEditor(null)}><X size={21}/></button>
        {editor && <form className="stack" onSubmit={save}>
          <h2>{editor.item ? 'Sửa' : 'Thêm'} {editor.kind === 'rooms' ? 'phòng' : 'nhân viên'}</h2>
          {editor.kind === 'rooms' ? <>
            <div className="fields"><label>Số phòng<input name="number" required maxLength={20} defaultValue={room?.number}/></label><label>Tên phòng<input name="name" required maxLength={120} defaultValue={room?.name}/></label></div>
            <label>Mô tả<textarea name="description" required maxLength={1500} defaultValue={room?.description}/></label>
            <label>Đường dẫn ảnh<input name="image" maxLength={255} placeholder="https://…" defaultValue={room?.image ?? ''}/></label>
            <div className="fields"><label>Giá mỗi đêm (₫)<input name="price" type="number" min={1} max={100000000} required defaultValue={room?.price}/></label><label>Sức chứa<input name="capacity" type="number" min={1} max={12} required defaultValue={room?.capacity ?? 2}/></label></div>
            <div className="fields"><label>Diện tích (m²)<input name="area" type="number" min={1} max={10000} required defaultValue={room?.area}/></label><label>Loại giường<input name="bed" maxLength={100} required defaultValue={room?.bed}/></label></div>
            <label className="checkbox"><input name="active" type="checkbox" defaultChecked={room?.active ?? true}/> Mở bán</label>
          </> : <>
            <label>Họ và tên<input name="name" maxLength={120} required defaultValue={employee?.name}/></label>
            <label>Email<input name="email" type="email" maxLength={200} required defaultValue={employee?.email}/></label>
            <label>{employee ? 'Mật khẩu mới (tùy chọn)' : 'Mật khẩu'}<input name="password" autoComplete="new-password" type="password" minLength={12} maxLength={72} required={!employee}/></label>
          </>}
          {editorError && <p className="notice error" role="alert">{editorError}</p>}
          <button className="button primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
        </form>}
      </dialog>
    </main>
  </div>;
}
