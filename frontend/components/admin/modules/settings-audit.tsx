'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Empty, ErrorState, Loading, useLoad } from '@/components/ui';
import { get, qs } from '@/lib/api';
import { dateTimeVN } from '@/lib/format';
import { Paged, Pager, formValues } from './common';

type Log = { id: number; action: string; subject_type: string | null; subject_id: number | null; summary: string; reason: string | null;
  changes: Record<string, unknown> | null; ip: string | null; created_at: string; user: { name: string } | null };

const GROUPS: Record<string, string> = { '': 'Tất cả', booking: 'Đặt phòng', stay: 'Lưu trú', payment: 'Thanh toán', folio: 'Hồ sơ thanh toán', housekeeping: 'Buồng phòng',
  maintenance: 'Bảo trì', room: 'Chặn phòng', rates: 'Giá', setup: 'Phòng & sơ đồ', settings: 'Cấu hình', staff: 'Nhân sự', role: 'Phân quyền', shift: 'Ca', cash: 'Thu chi',
  inventory: 'Kho', customer: 'Khách hàng', report: 'Xuất báo cáo', guests: 'Xuất khách lưu trú', auth: 'Đăng nhập' };

export function AuditLog() {
  const [f, setF] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const d = useLoad(() => get<Paged<Log>>('/admin/audit' + qs({ ...f, page })), [f, page]);
  return (
    <div className="mod-section">
      <form className="filters card card-pad" onSubmit={e => { e.preventDefault(); setPage(1); setF(formValues(e.currentTarget) as Record<string, string>); }}>
        <label className="field grow"><span>Tìm trong nội dung / lý do</span><input className="input" name="q" defaultValue={f.q} /></label>
        <label className="field"><span>Nhóm thao tác</span><select className="select" name="action" defaultValue={f.action ?? ''}>{Object.entries(GROUPS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <button className="btn"><Search size={15} /> Lọc</button>
      </form>
      <div className="card">
        {d.loading ? <Loading /> : d.error ? <ErrorState error={d.error} onRetry={d.reload} /> : !d.data?.data.length ? <Empty title="Không có bản ghi" /> : (<>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Thời điểm</th><th>Người thực hiện</th><th>Thao tác</th><th>Nội dung</th><th>Lý do</th></tr></thead>
            <tbody>{d.data.data.map(l => <tr key={l.id}>
              <td className="nowrap">{dateTimeVN(l.created_at)}</td><td>{l.user?.name ?? 'Hệ thống'}</td><td className="tiny muted nowrap">{l.action}</td>
              <td>{l.subject_type === 'Booking' && l.subject_id ? <Link href={`/admin/dat-phong/${l.subject_id}`}>{l.summary}</Link> : l.summary}
                {l.changes && <div><button className="btn btn-ghost btn-sm" onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? 'Ẩn chi tiết' : 'Chi tiết thay đổi'}</button>
                  {open === l.id && <pre className="tiny" style={{ whiteSpace: 'pre-wrap', background: '#faf8f3', padding: 8, borderRadius: 4, margin: 0 }}>{JSON.stringify(l.changes, null, 2)}</pre>}</div>}</td>
              <td className="small">{l.reason ?? '—'}</td></tr>)}</tbody>
          </table></div>
          <Pager page={d.data.current_page} last={d.data.last_page} onPage={setPage} />
        </>)}
      </div>
    </div>
  );
}
