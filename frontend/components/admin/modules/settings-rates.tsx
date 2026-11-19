'use client';

import { useState } from 'react';
import { CheckCircle2, ListOrdered, Pencil, Plus, XCircle } from 'lucide-react';
import { useSession } from '@/components/admin/session';
import { Empty, ErrorState, Loading, Notice, useAction, useLoad } from '@/components/ui';
import { get, post, put } from '@/lib/api';
import { dateVN, money } from '@/lib/format';
import { formValues } from './common';

type Type = { id: number; name: string; code: string; base_rate: number };
type Plan = { id: number; code: string; name: string; description: string | null; cancellation_policy_id: number | null; deposit_percent: number; adjust_percent: number;
  includes_breakfast: boolean; public: boolean; active: boolean; sort: number };
type Rule = { id: number; room_type_id: number; rate_plan_id: number | null; kind: string; name: string; start_date: string | null; end_date: string | null;
  days_of_week: number[] | null; price: number; priority: number; active: boolean };
type Policy = { id: number; name: string; description: string; free_cancel_hours: number; late_cancel_fee_percent: number; no_show_fee_percent: number; refundable: boolean };
type Data = { room_types: Type[]; rate_plans: Plan[]; rules: Rule[]; policies: Policy[]; precedence: string[] };

const KINDS: Record<string, string> = { weekend: 'Cuối tuần', season: 'Theo mùa', holiday: 'Ngày lễ' };
const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const Active = ({ on }: { on: boolean }) => on ? <span className="badge b-sage"><CheckCircle2 aria-hidden />Bật</span> : <span className="badge b-neutral"><XCircle aria-hidden />Tắt</span>;

export function RatesSetup() {
  const { can } = useSession();
  const d = useLoad(() => get<Data>('/admin/setup/rates'), []);
  const { busy, run } = useAction();
  const [rule, setRule] = useState<Rule | 'new' | null>(null);
  const [kind, setKind] = useState('weekend');
  const [plan, setPlan] = useState<Plan | 'new' | null>(null);
  const [policy, setPolicy] = useState<Policy | 'new' | null>(null);
  const [baseEdit, setBaseEdit] = useState<number | null>(null);
  const manage = can('rates.manage');

  if (d.loading) return <Loading />;
  if (d.error || !d.data) return <ErrorState error={d.error} onRetry={d.reload} />;
  const { room_types, rate_plans, rules, policies, precedence } = d.data;
  const reload = () => d.reload(true);
  const typeName = (id: number) => room_types.find(t => t.id === id)?.name ?? '#' + id;
  const planName = (id: number | null) => id ? rate_plans.find(p => p.id === id)?.name ?? '#' + id : 'Mọi kế hoạch';
  const cancel = (fn: () => void) => <button type="button" className="btn btn-ghost btn-sm" onClick={fn}>Hủy</button>;

  return (
    <div className="mod-section">
      <div className="card card-pad">
        <h2 style={{ fontSize: 15, marginBottom: 8 }}><ListOrdered size={15} /> Thứ tự ưu tiên khi nhiều mức giá trùng một đêm</h2>
        <ol className="small" style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 3 }}>{precedence.map(p => <li key={p}>{p}</li>)}</ol>
        <p className="tiny muted" style={{ marginTop: 8 }}>Giá từng đêm được chụp vào đặt phòng lúc tạo; đổi bảng giá không làm thay đổi đặt phòng đã có.</p>
      </div>

      <div className="card">
        <div className="card-head"><h2>Giá cơ sở (ngày thường)</h2></div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Loại phòng</th><th className="right">Giá/đêm</th><th /></tr></thead>
          <tbody>{room_types.map(t => (
            <tr key={t.id}><td>{t.name}</td>
              <td className="right">{baseEdit === t.id ? (
                <form className="row" style={{ justifyContent: 'flex-end' }} onSubmit={async e => {
                  e.preventDefault();
                  const v = formValues(e.currentTarget, ['base_rate']);
                  const full = await get<{ room_types: Record<string, unknown>[] }>('/admin/setup/rooms');
                  const cur = full.room_types.find(x => x.id === t.id)!;
                  const { id: _id, rooms_count: _c, property_id: _p, created_at: _a, updated_at: _u, ...rest } = cur;
                  const ok = await run(() => put(`/admin/setup/room-types/${t.id}`, { ...rest, base_rate: v.base_rate, reason: v.reason }), 'Đã đổi giá cơ sở');
                  if (ok !== undefined) { setBaseEdit(null); reload(); }
                }}>
                  <input className="input" style={{ width: 130 }} type="number" step={1000} min={0} name="base_rate" defaultValue={t.base_rate} required />
                  <input className="input" style={{ width: 220 }} name="reason" required minLength={3} placeholder="Lý do đổi giá" />
                  <button className="btn btn-primary btn-sm" disabled={busy}>Lưu</button>{cancel(() => setBaseEdit(null))}
                </form>) : <span className="num">{money(t.base_rate)}</span>}</td>
              <td className="right">{manage && baseEdit !== t.id && <button className="btn btn-sm btn-ghost" onClick={() => setBaseEdit(t.id)}><Pencil size={14} /> Sửa</button>}</td></tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Quy tắc giá: cuối tuần, mùa, lễ</h2>{manage && <button className="btn btn-sm" onClick={() => { setRule('new'); setKind('weekend'); }}><Plus size={14} /> Thêm</button>}</div>
        {rule && manage && (
          <div className="card-pad"><form className="inline-form" onSubmit={async e => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const v = formValues(e.currentTarget, ['room_type_id', 'rate_plan_id', 'price', 'priority'], ['active']);
            const body = { ...v, kind, days_of_week: kind === 'weekend' ? fd.getAll('dow').map(Number) : null,
              start_date: kind === 'weekend' ? (v.start_date || null) : v.start_date, end_date: kind === 'weekend' ? (v.end_date || null) : v.end_date };
            delete (body as Record<string, unknown>).dow;
            const ok = await run(() => rule === 'new' ? post('/admin/setup/rate-rules', body) : put(`/admin/setup/rate-rules/${rule.id}`, body), 'Đã lưu quy tắc giá');
            if (ok !== undefined) { setRule(null); reload(); }
          }}>
            <div className="form-grid">
              <label className="field"><span>Loại quy tắc</span><select className="select" value={kind} onChange={e => setKind(e.target.value)}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="field"><span>Tên</span><input className="input" name="name" defaultValue={rule === 'new' ? '' : rule.name} required /></label>
              <label className="field"><span>Loại phòng</span><select className="select" name="room_type_id" defaultValue={rule === 'new' ? undefined : rule.room_type_id}>{room_types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <label className="field"><span>Kế hoạch giá</span><select className="select" name="rate_plan_id" defaultValue={rule === 'new' ? '' : rule.rate_plan_id ?? ''}><option value="">Mọi kế hoạch</option>{rate_plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <label className="field"><span>Giá/đêm (đ)</span><input className="input" type="number" step={1000} min={0} name="price" defaultValue={rule === 'new' ? '' : rule.price} required /></label>
              <label className="field"><span>Ưu tiên (cao thắng)</span><input className="input" type="number" min={0} max={1000} name="priority" defaultValue={rule === 'new' ? 0 : rule.priority} /></label>
              <label className="field"><span>Từ ngày{kind === 'weekend' ? ' (tùy chọn)' : ''}</span><input className="input" type="date" name="start_date" defaultValue={rule === 'new' ? '' : rule.start_date?.slice(0, 10) ?? ''} required={kind !== 'weekend'} /></label>
              <label className="field"><span>Đến ngày (gồm){kind === 'weekend' ? ' (tùy chọn)' : ''}</span><input className="input" type="date" name="end_date" defaultValue={rule === 'new' ? '' : rule.end_date?.slice(0, 10) ?? ''} required={kind !== 'weekend'} /></label>
            </div>
            {kind === 'weekend' && <div className="row"><span className="small">Áp dụng các ngày:</span>{DOW.map((l, i) =>
              <label key={i} className="check"><input type="checkbox" name="dow" value={i} defaultChecked={rule === 'new' ? i === 5 || i === 6 : rule.days_of_week?.includes(i)} /> {l}</label>)}</div>}
            <label className="check"><input type="checkbox" name="active" defaultChecked={rule === 'new' ? true : rule.active} /> Đang áp dụng</label>
            <input className="input" name="reason" required minLength={3} placeholder="Lý do thay đổi giá (bắt buộc, ghi nhật ký)" />
            <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Lưu</button>{cancel(() => setRule(null))}</div>
          </form></div>
        )}
        {!rules.length ? <Empty title="Chưa có quy tắc — mọi đêm dùng giá cơ sở" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Tên</th><th>Loại</th><th>Phòng</th><th>Kế hoạch</th><th>Áp dụng</th><th className="right">Giá</th><th className="right">Ưu tiên</th><th>Trạng thái</th><th /></tr></thead>
            <tbody>{rules.map(r => <tr key={r.id}>
              <td><strong>{r.name}</strong></td><td>{KINDS[r.kind]}</td><td>{typeName(r.room_type_id)}</td><td>{planName(r.rate_plan_id)}</td>
              <td className="small">{r.days_of_week?.length ? r.days_of_week.map(i => DOW[i]).join(', ') : ''}{r.start_date ? ` ${dateVN(r.start_date)} → ${dateVN(r.end_date)}` : ''}</td>
              <td className="right num">{money(r.price)}</td><td className="right num">{r.priority}</td><td><Active on={r.active} /></td>
              <td className="right">{manage && <button className="btn btn-sm btn-ghost" onClick={() => { setRule(r); setKind(r.kind); }}><Pencil size={14} /></button>}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h2>Kế hoạch giá</h2>{manage && <button className="btn btn-sm" onClick={() => setPlan('new')}><Plus size={14} /> Thêm</button>}</div>
          {plan && manage && (
            <div className="card-pad"><form className="inline-form" onSubmit={async e => {
              e.preventDefault();
              const body = formValues(e.currentTarget, ['cancellation_policy_id', 'deposit_percent', 'adjust_percent', 'sort'], ['includes_breakfast', 'public', 'active']);
              const ok = await run(() => plan === 'new' ? post('/admin/setup/rate-plans', body) : put(`/admin/setup/rate-plans/${plan.id}`, body), 'Đã lưu kế hoạch giá');
              if (ok !== undefined) { setPlan(null); reload(); }
            }}>
              <div className="form-grid">
                <label className="field"><span>Mã</span><input className="input" name="code" defaultValue={plan === 'new' ? '' : plan.code} required /></label>
                <label className="field"><span>Tên</span><input className="input" name="name" defaultValue={plan === 'new' ? '' : plan.name} required /></label>
                <label className="field"><span>Cọc (%)</span><input className="input" type="number" min={0} max={100} name="deposit_percent" defaultValue={plan === 'new' ? 30 : plan.deposit_percent} required /></label>
                <label className="field"><span>Điều chỉnh so với giá (%)</span><input className="input" type="number" min={-90} max={200} name="adjust_percent" defaultValue={plan === 'new' ? 0 : plan.adjust_percent} required /></label>
                <label className="field"><span>Chính sách hủy</span><select className="select" name="cancellation_policy_id" defaultValue={plan === 'new' ? '' : plan.cancellation_policy_id ?? ''}><option value="">Không có</option>{policies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                <label className="field"><span>Thứ tự</span><input className="input" type="number" name="sort" defaultValue={plan === 'new' ? 0 : plan.sort} /></label>
              </div>
              <textarea className="textarea" name="description" defaultValue={plan === 'new' ? '' : plan.description ?? ''} placeholder="Mô tả" />
              <div className="row">
                <label className="check"><input type="checkbox" name="includes_breakfast" defaultChecked={plan !== 'new' && plan.includes_breakfast} /> Gồm ăn sáng</label>
                <label className="check"><input type="checkbox" name="public" defaultChecked={plan === 'new' || plan.public} /> Bán trên website</label>
                <label className="check"><input type="checkbox" name="active" defaultChecked={plan === 'new' || plan.active} /> Đang dùng</label>
              </div>
              <input className="input" name="reason" required minLength={3} placeholder="Lý do (bắt buộc)" />
              <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Lưu</button>{cancel(() => setPlan(null))}</div>
            </form></div>
          )}
          <div className="list">{rate_plans.map(p => (
            <div key={p.id} className="list-item"><div><strong>{p.name}</strong> <span className="tiny muted">{p.code}</span>
              <div className="small muted">Cọc {p.deposit_percent}% · điều chỉnh {p.adjust_percent}% · {p.includes_breakfast ? 'gồm ăn sáng' : 'không gồm ăn sáng'} · {p.public ? 'website' : 'nội bộ'}</div></div>
              <div className="row"><Active on={p.active} />{manage && <button className="btn btn-sm btn-ghost" onClick={() => setPlan(p)}><Pencil size={14} /></button>}</div></div>))}</div>
        </div>

        <div className="card">
          <div className="card-head"><h2>Chính sách hủy & hoàn tiền</h2>{manage && <button className="btn btn-sm" onClick={() => setPolicy('new')}><Plus size={14} /> Thêm</button>}</div>
          {policy && manage && (
            <div className="card-pad"><form className="inline-form" onSubmit={async e => {
              e.preventDefault();
              const body = formValues(e.currentTarget, ['free_cancel_hours', 'late_cancel_fee_percent', 'no_show_fee_percent'], ['refundable']);
              const ok = await run(() => policy === 'new' ? post('/admin/setup/policies', body) : put(`/admin/setup/policies/${policy.id}`, body), 'Đã lưu chính sách');
              if (ok !== undefined) { setPolicy(null); reload(); }
            }}>
              <label className="field"><span>Tên</span><input className="input" name="name" defaultValue={policy === 'new' ? '' : policy.name} required /></label>
              <div className="form-grid">
                <label className="field"><span>Hủy miễn phí trước (giờ)</span><input className="input" type="number" min={0} name="free_cancel_hours" defaultValue={policy === 'new' ? 48 : policy.free_cancel_hours} required /></label>
                <label className="field"><span>Phí hủy muộn (% đêm đầu)</span><input className="input" type="number" min={0} max={100} name="late_cancel_fee_percent" defaultValue={policy === 'new' ? 100 : policy.late_cancel_fee_percent} required /></label>
                <label className="field"><span>Phí không đến (% đêm đầu)</span><input className="input" type="number" min={0} max={100} name="no_show_fee_percent" defaultValue={policy === 'new' ? 100 : policy.no_show_fee_percent} required /></label>
              </div>
              <textarea className="textarea" name="description" required defaultValue={policy === 'new' ? '' : policy.description} placeholder="Nội dung chính sách hiển thị cho khách" />
              <label className="check"><input type="checkbox" name="refundable" defaultChecked={policy === 'new' || policy.refundable} /> Cho phép hoàn tiền cọc</label>
              <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Lưu</button>{cancel(() => setPolicy(null))}</div>
            </form></div>
          )}
          <div className="list">{policies.map(p => (
            <div key={p.id} className="list-item" style={{ display: 'grid', gap: 4 }}>
              <div className="row-between"><strong>{p.name}</strong>{manage && <button className="btn btn-sm btn-ghost" onClick={() => setPolicy(p)}><Pencil size={14} /></button>}</div>
              <span className="small">Miễn phí trước {p.free_cancel_hours} giờ · hủy muộn {p.late_cancel_fee_percent}% · không đến {p.no_show_fee_percent}% · {p.refundable ? 'có hoàn cọc' : 'không hoàn cọc'}</span>
              <span className="small muted">{p.description}</span>
            </div>))}</div>
          {!manage && <Notice kind="info">Chỉ người có quyền “Sửa giá, kế hoạch giá, chính sách” mới chỉnh được.</Notice>}
        </div>
      </div>
    </div>
  );
}
