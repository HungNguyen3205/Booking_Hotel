'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Crown, Plus, Search } from 'lucide-react';
import { PageHead, RequirePerm } from '@/components/admin/shell';
import { Can } from '@/components/admin/session';
import { Empty, ErrorState, Loading, useLoad } from '@/components/ui';
import { get, qs } from '@/lib/api';
import { CreateCustomer, Customer, KIND_LABEL, KindBadge } from '@/components/admin/modules/customers';
import { Paged, Pager, formValues } from '@/components/admin/modules/common';

export default function CustomersPage() {
  const [filters, setFilters] = useState({ q: '', kind: '', vip: false });
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const list = useLoad(() => get<Paged<Customer>>('/admin/customers' + qs({ q: filters.q, kind: filters.kind, vip: filters.vip ? 1 : null, page })), [filters, page]);

  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formValues(e.currentTarget, [], ['vip']);
    setPage(1);
    setFilters({ q: String(v.q ?? ''), kind: String(v.kind ?? ''), vip: Boolean(v.vip) });
  }

  return (
    <RequirePerm perm="guests.view">
      <div className="page">
        <PageHead title="Khách hàng" sub="Hồ sơ khách lẻ, công ty, đại lý — tìm theo tên, số điện thoại, email hoặc số giấy tờ.">
          <Can perm="guests.manage"><button className="btn btn-primary" onClick={() => setCreating(v => !v)}><Plus size={16} /> Thêm hồ sơ</button></Can>
        </PageHead>
        {creating && <CreateCustomer onDone={() => { setCreating(false); list.reload(); }} onCancel={() => setCreating(false)} />}
        <form className="filters card card-pad" onSubmit={search}>
          <label className="field grow"><span>Tìm kiếm</span><input className="input" name="q" defaultValue={filters.q} placeholder="Tên, SĐT, email, số giấy tờ" /></label>
          <label className="field"><span>Loại</span>
            <select className="select" name="kind" defaultValue={filters.kind}><option value="">Tất cả</option>
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="check"><input type="checkbox" name="vip" defaultChecked={filters.vip} /> Chỉ VIP</label>
          <button className="btn"><Search size={15} /> Tìm</button>
        </form>
        <div className="card">
          {list.loading ? <Loading /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data?.data.length ? <Empty title="Không có hồ sơ phù hợp" /> : (
            <>
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Họ tên</th><th>Loại</th><th>Điện thoại</th><th>Email</th><th>Thuộc</th><th className="right">Lượt đặt</th></tr></thead>
                <tbody>{list.data.data.map(c => (
                  <tr key={c.id}>
                    <td><Link href={`/admin/khach-hang/${c.id}`}><strong>{c.full_name}</strong></Link>{c.vip && <> <span className="badge b-bronze"><Crown aria-hidden />VIP</span></>}</td>
                    <td><KindBadge kind={c.kind} /></td>
                    <td className="nowrap">{c.phone ?? '—'}</td><td>{c.email ?? '—'}</td>
                    <td>{c.company?.full_name ?? '—'}</td><td className="right num">{c.bookings_count ?? 0}</td>
                  </tr>))}</tbody>
              </table></div>
              <Pager page={list.data.current_page} last={list.data.last_page} onPage={setPage} />
            </>
          )}
        </div>
      </div>
    </RequirePerm>
  );
}

