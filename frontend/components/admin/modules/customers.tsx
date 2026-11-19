'use client';

import { useState } from 'react';
import { Building2, User, Users } from 'lucide-react';
import { Notice, useAction, useLoad } from '@/components/ui';
import { ApiError, get, post } from '@/lib/api';
import { Paged, formValues } from './common';

export type Customer = {
  id: number; kind: 'guest' | 'company' | 'agent'; full_name: string; phone: string | null; email: string | null; tax_code: string | null;
  nationality: string | null; vip: boolean; bookings_count?: number; company: { id: number; full_name: string } | null;
};

export const KIND_LABEL: Record<string, string> = { guest: 'Khách lẻ', company: 'Công ty', agent: 'Đại lý' };

export function KindBadge({ kind }: { kind: string }) {
  const Icon = kind === 'guest' ? User : kind === 'company' ? Building2 : Users;
  return <span className={`badge ${kind === 'guest' ? 'b-neutral' : 'b-blue'}`}><Icon aria-hidden />{KIND_LABEL[kind] ?? kind}</span>;
}

export function CreateCustomer({ onDone, onCancel }: { onDone: (c: Customer) => void; onCancel: () => void }) {
  const { busy, run } = useAction();
  const [dup, setDup] = useState('');
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const companies = useLoad(() => get<Paged<Customer>>('/admin/customers?kind=company'), []);

  async function save(body: Record<string, unknown>) {
    setDup('');
    try {
      const c = await post<Customer>('/admin/customers', body);
      onDone(c);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { setDup(e.message); setPayload(body); return; }
      await run(() => Promise.reject(e));
    }
  }

  return (
    <form className="inline-form" onSubmit={e => { e.preventDefault(); save(formValues(e.currentTarget, ['company_id'], ['vip'])); }}>
      <h4>Hồ sơ mới</h4>
      <div className="form-grid">
        <label className="field"><span>Loại</span><select className="select" name="kind" defaultValue="guest">
          {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field"><span>Họ tên / Tên đơn vị</span><input className="input" name="full_name" required maxLength={160} /></label>
        <label className="field"><span>Điện thoại</span><input className="input" name="phone" inputMode="tel" /></label>
        <label className="field"><span>Email</span><input className="input" name="email" type="email" /></label>
        <label className="field"><span>Mã số thuế</span><input className="input" name="tax_code" /></label>
        <label className="field"><span>Quốc tịch</span><input className="input" name="nationality" /></label>
        <label className="field"><span>Thuộc công ty/đại lý</span><select className="select" name="company_id"><option value="">—</option>
          {companies.data?.data.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label>
      </div>
      <label className="check"><input type="checkbox" name="vip" /> Khách VIP</label>
      {dup && <Notice kind="warn">{dup}
        <div className="row" style={{ marginTop: 6 }}><button type="button" className="btn btn-sm" disabled={busy} onClick={() => payload && save({ ...payload, allow_duplicate: true })}>Vẫn tạo hồ sơ mới</button></div>
      </Notice>}
      <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Lưu hồ sơ</button><button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Hủy</button></div>
    </form>
  );
}
