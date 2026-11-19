'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Plus, Trash2, UserCheck } from 'lucide-react';
import { ApiError, get, post, qs } from '@/lib/api';
import { addDays, diffDays, errorText, money, todayISO } from '@/lib/format';
import { Field, Loading, Notice, useToast } from '@/components/ui';
import { PageHead, RequirePerm } from '@/components/admin/shell';
import { useOptions } from '@/components/admin/stay-actions';
import type { Customer } from '@/components/admin/types';

type QuoteType = { id: number; name: string; code: string; max_adults: number; max_children: number; max_occupancy: number; available: number;
  free_rooms: { id: number; number: string; housekeeping: string }[]; total: number };
type RoomRow = { key: number; check_in: string; check_out: string; room_type_id: number | ''; room_id: number | ''; adults: number; children: number; extra_beds: number };

let rowKey = 1;

function NewBooking() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const options = useOptions();
  const ci = params.get('check_in') ?? todayISO();
  const [rows, setRows] = useState<RoomRow[]>([{
    key: rowKey++, check_in: ci, check_out: params.get('check_out') ?? addDays(ci, 1),
    room_type_id: Number(params.get('room_type_id')) || '', room_id: Number(params.get('room_id')) || '', adults: 2, children: 0, extra_beds: 0,
  }]);
  const [quotes, setQuotes] = useState<Record<string, QuoteType[] | 'error'>>({});
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState<Customer[]>([]);
  const [guest, setGuest] = useState({ full_name: '', phone: '', email: '', nationality: '' });
  const [company, setCompany] = useState<Customer | null>(null);
  const [companyQ, setCompanyQ] = useState('');
  const [companies, setCompanies] = useState<Customer[]>([]);
  const [form, setForm] = useState({ source: 'phone', status: 'confirmed', hold_minutes: '', rate_plan_id: '', group_name: '', special_requests: '', internal_notes: '', source_ref: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const planId = form.rate_plan_id || String(options?.rate_plans[0]?.id ?? '');
  const quoteKey = (r: RoomRow) => `${r.check_in}|${r.check_out}|${planId}|${r.adults}|${r.children}`;

  useEffect(() => {
    rows.forEach(r => {
      const k = quoteKey(r);
      if (quotes[k] || r.check_out <= r.check_in || !planId) return;
      setQuotes(q => ({ ...q, [k]: q[k] ?? [] }));
      get<{ types: QuoteType[] }>(`/admin/availability${qs({ check_in: r.check_in, check_out: r.check_out, rate_plan_id: planId, adults: r.adults, children: r.children })}`)
        .then(res => setQuotes(q => ({ ...q, [k]: res.types })))
        .catch(() => setQuotes(q => ({ ...q, [k]: 'error' })));
      // lỗi không được lưu vĩnh viễn: nút 'thử lại' xóa khóa để tải lại
    });
  }, [rows, planId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = Number(params.get('customer_id'));
    if (id) get<{ customer: Customer }>(`/admin/customers/${id}`).then(r => (r.customer.kind === 'guest' ? setCustomer(r.customer) : setCompany(r.customer))).catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (search.trim().length < 2) { setMatches([]); return; }
    const t = setTimeout(() => get<{ data: Customer[] }>(`/admin/customers${qs({ q: search.trim(), kind: 'guest' })}`).then(r => setMatches(r.data.slice(0, 6))).catch(() => setMatches([])), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if (companyQ.trim().length < 2) { setCompanies([]); return; }
    const t = setTimeout(() => Promise.all([get<{ data: Customer[] }>(`/admin/customers${qs({ q: companyQ.trim(), kind: 'company' })}`),
      get<{ data: Customer[] }>(`/admin/customers${qs({ q: companyQ.trim(), kind: 'agent' })}`)]).then(([a, b]) => setCompanies([...a.data, ...b.data].slice(0, 6))).catch(() => setCompanies([])), 250);
    return () => clearTimeout(t);
  }, [companyQ]);

  const update = (key: number, patch: Partial<RoomRow>) => setRows(list => list.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const total = useMemo(() => rows.reduce((sum, r) => {
    const q = quotes[quoteKey(r)];
    const t = Array.isArray(q) ? q.find(x => x.id === r.room_type_id) : undefined;
    return sum + (t?.total ?? 0);
  }, 0), [rows, quotes]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!customer && !guest.full_name.trim()) { setError('Nhập tên khách hoặc chọn hồ sơ có sẵn.'); return; }
    setBusy(true);
    try {
      const res = await post<{ id: number; code: string }>('/admin/bookings', {
        source: form.source, source_ref: form.source_ref || undefined, status: form.status,
        hold_minutes: form.status === 'hold' && form.hold_minutes ? Number(form.hold_minutes) : undefined,
        rate_plan_id: planId ? Number(planId) : undefined,
        customer_id: customer?.id, customer: customer ? undefined : { ...guest, email: guest.email || undefined, phone: guest.phone || undefined },
        bill_to_id: company?.id, group_name: form.group_name || undefined, special_requests: form.special_requests || undefined, internal_notes: form.internal_notes || undefined,
        stays: rows.map(r => ({ room_type_id: r.room_type_id, room_id: r.room_id || undefined, check_in: r.check_in, check_out: r.check_out,
          adults: r.adults, children: r.children, extra_beds: r.extra_beds })),
      });
      toast('ok', `Đã tạo đặt phòng ${res.code}.`);
      router.push(`/admin/dat-phong/${res.id}`);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? `${err.message} Danh sách phòng trống đã được làm mới.` : errorText(err));
      setQuotes({});
      setBusy(false);
    }
  }

  return (
    <form className="page" onSubmit={submit}>
      <PageHead title="Tạo đặt phòng" sub="Có thể đặt theo loại phòng (hệ thống tự phân phòng, đổi được sau) hoặc chọn phòng cụ thể." />
      {error && <Notice kind="error">{error}</Notice>}
      <div className="grid-2">
        <section className="card card-pad stack">
          <h2 className="small" style={{ fontSize: 15 }}>Khách đặt phòng</h2>
          {customer ? (
            <div className="row-between stay-card"><span><UserCheck size={15} /> <strong>{customer.full_name}</strong> <span className="muted small">{customer.phone} {customer.email}</span></span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCustomer(null)}>Đổi</button></div>
          ) : (
            <>
              <Field label="Tìm hồ sơ có sẵn (tên, SĐT, email)" hint="Tránh tạo trùng hồ sơ khách quen."><input className="input" value={search} onChange={e => setSearch(e.target.value)} /></Field>
              {matches.length > 0 && <div className="list card">{matches.map(m => <button type="button" key={m.id} className="list-item btn-ghost" style={{ border: 0, textAlign: 'left' }}
                onClick={() => { setCustomer(m); setSearch(''); }}><span>{m.full_name}</span><span className="muted small">{m.phone} {m.email}</span></button>)}</div>}
              <div className="form-grid">
                <Field label="Họ tên khách mới"><input className="input" value={guest.full_name} onChange={e => setGuest({ ...guest, full_name: e.target.value })} /></Field>
                <Field label="Số điện thoại"><input className="input" value={guest.phone} onChange={e => setGuest({ ...guest, phone: e.target.value })} inputMode="tel" /></Field>
                <Field label="Email"><input className="input" type="email" value={guest.email} onChange={e => setGuest({ ...guest, email: e.target.value })} /></Field>
                <Field label="Quốc tịch"><input className="input" value={guest.nationality} onChange={e => setGuest({ ...guest, nationality: e.target.value })} /></Field>
              </div>
            </>
          )}
          <Field label="Công ty / đại lý chịu công nợ (tùy chọn)">
            {company ? <div className="row-between stay-card"><strong>{company.full_name}</strong><button type="button" className="btn btn-sm btn-ghost" onClick={() => setCompany(null)}>Bỏ</button></div>
              : <input className="input" value={companyQ} onChange={e => setCompanyQ(e.target.value)} placeholder="Gõ tên công ty/đại lý" />}
          </Field>
          {!company && companies.length > 0 && <div className="list card">{companies.map(c => <button type="button" key={c.id} className="list-item btn-ghost" style={{ border: 0, textAlign: 'left' }}
            onClick={() => { setCompany(c); setCompanyQ(''); }}><span>{c.full_name}</span><span className="muted small">{c.kind === 'agent' ? 'Đại lý' : 'Công ty'}</span></button>)}</div>}
        </section>

        <section className="card card-pad stack">
          <h2 className="small" style={{ fontSize: 15 }}>Thông tin đặt phòng</h2>
          <div className="form-grid">
            <Field label="Nguồn khách"><select className="select" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
              {Object.entries(options?.sources ?? {}).filter(([k]) => k !== 'website').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Mã tham chiếu (OTA/đại lý)"><input className="input" value={form.source_ref} onChange={e => setForm({ ...form, source_ref: e.target.value })} /></Field>
            <Field label="Trạng thái"><select className="select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="confirmed">Xác nhận ngay</option><option value="hold">Giữ chỗ (chờ cọc)</option></select></Field>
            {form.status === 'hold' && <Field label="Giữ chỗ (phút)" hint={`Mặc định ${options?.settings.hold_minutes_staff ?? '…'} phút, tự giải phóng khi hết hạn.`}>
              <input className="input" type="number" min={5} value={form.hold_minutes} onChange={e => setForm({ ...form, hold_minutes: e.target.value })} /></Field>}
            <Field label="Kế hoạch giá"><select className="select" value={planId} onChange={e => setForm({ ...form, rate_plan_id: e.target.value })}>
              {options?.rate_plans.map(p => <option key={p.id} value={p.id}>{p.name} · cọc {p.deposit_percent}%</option>)}</select></Field>
            <Field label="Tên đoàn (nếu có)"><input className="input" value={form.group_name} onChange={e => setForm({ ...form, group_name: e.target.value })} /></Field>
          </div>
          <Field label="Yêu cầu đặc biệt"><textarea className="textarea" value={form.special_requests} onChange={e => setForm({ ...form, special_requests: e.target.value })} /></Field>
          <Field label="Ghi chú nội bộ"><textarea className="textarea" value={form.internal_notes} onChange={e => setForm({ ...form, internal_notes: e.target.value })} /></Field>
        </section>
      </div>

      <section className="card card-pad stack">
        <div className="row-between"><h2 className="small" style={{ fontSize: 15 }}>Phòng ({rows.length})</h2>
          <button type="button" className="btn btn-sm" onClick={() => setRows(list => [...list, { ...list[list.length - 1], key: rowKey++, room_id: '' }])}><Plus size={14} /> Thêm phòng</button></div>
        {rows.map(r => {
          const q = quotes[quoteKey(r)];
          const types = Array.isArray(q) ? q : [];
          const t = types.find(x => x.id === r.room_type_id);
          const usedElsewhere = rows.filter(o => o.key !== r.key && o.room_id).map(o => o.room_id);
          return (
            <div key={r.key} className="new-room">
              <Field label="Nhận phòng"><input className="input" type="date" value={r.check_in} min={todayISO()} onChange={e => update(r.key, { check_in: e.target.value, room_id: '', check_out: e.target.value >= r.check_out ? addDays(e.target.value, 1) : r.check_out })} /></Field>
              <Field label="Trả phòng"><input className="input" type="date" value={r.check_out} min={addDays(r.check_in, 1)} onChange={e => update(r.key, { check_out: e.target.value, room_id: '' })} /></Field>
              <Field label="Loại phòng">
                <select className="select" value={r.room_type_id} onChange={e => update(r.key, { room_type_id: Number(e.target.value) || '', room_id: '' })} required>
                  <option value="">— Chọn —</option>
                  {types.map(x => <option key={x.id} value={x.id} disabled={x.available === 0}>{x.name} · còn {x.available}</option>)}
                </select>
              </Field>
              <Field label="Phòng cụ thể">
                <select className="select" value={r.room_id} onChange={e => update(r.key, { room_id: Number(e.target.value) || '' })}>
                  <option value="">Tự phân phòng</option>
                  {t?.free_rooms.filter(fr => !usedElsewhere.includes(fr.id)).map(fr => <option key={fr.id} value={fr.id}>{fr.number}{fr.housekeeping !== 'clean' ? ' (chưa sạch)' : ''}</option>)}
                </select>
              </Field>
              <Field label="Người lớn"><input className="input num" type="number" min={1} max={t?.max_adults ?? 10} value={r.adults} onChange={e => update(r.key, { adults: Math.max(1, Number(e.target.value) || 1) })} /></Field>
              <Field label="Trẻ em"><input className="input num" type="number" min={0} max={t?.max_children ?? 10} value={r.children} onChange={e => update(r.key, { children: Math.max(0, Number(e.target.value) || 0) })} /></Field>
              <div className="stack-sm">
                <span className="small">{diffDays(r.check_in, r.check_out)} đêm · <strong>{t ? money(t.total) : '—'}</strong></span>
                {q === 'error' && <span className="field-error">Không tải được tồn phòng <button type="button" className="btn btn-sm btn-ghost" onClick={() => setQuotes(x => { const n = { ...x }; delete n[quoteKey(r)]; return n; })}>Thử lại</button></span>}
                {rows.length > 1 && <button type="button" className="btn btn-sm btn-danger" onClick={() => setRows(list => list.filter(x => x.key !== r.key))}><Trash2 size={14} /> Bỏ</button>}
              </div>
            </div>
          );
        })}
        <div className="row-between">
          <p>Tạm tính: <strong className="num">{money(total)}</strong> <span className="small muted">(giá chụp theo từng đêm khi lưu; phụ thu cấu hình áp dụng tự động)</span></p>
          <button className="btn btn-primary" disabled={busy || !rows.every(r => r.room_type_id)}><Check size={16} /> {busy ? 'Đang lưu…' : 'Lưu đặt phòng'}</button>
        </div>
      </section>
    </form>
  );
}

export default function NewBookingPage() {
  return <RequirePerm perm="bookings.create"><Suspense fallback={<Loading />}><NewBooking /></Suspense></RequirePerm>;
}
