'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Crown, GitMerge, MessageSquareWarning, Pencil } from 'lucide-react';
import { PageHead, RequirePerm } from '@/components/admin/shell';
import { Can, useSession } from '@/components/admin/session';
import { BookingBadge } from '@/components/admin/badges';
import { Empty, ErrorState, Loading, Notice, useAction, useLoad } from '@/components/ui';
import { get, patch, post } from '@/lib/api';
import { dateVN, dateTimeVN, money } from '@/lib/format';
import { formValues, ReasonForm } from '@/components/admin/modules/common';
import { KIND_LABEL, KindBadge } from '@/components/admin/modules/customers';

type Detail = {
  customer: Record<string, any> & { id: number; kind: string; full_name: string; vip: boolean };
  members: { id: number; full_name: string; phone: string | null; email: string | null }[];
  bookings: { id: number; code: string; status: string; created_at: string; balance: number | null;
    stays: { id: number; check_in: string; check_out: string; room: { number: string } | null; type: { name: string } | null }[] }[];
  debt: number | null;
  feedback: { id: number; type: string; rating: number | null; content: string; status: string; resolution: string | null; created_at: string }[];
  duplicates: { id: number; full_name: string; phone: string | null; email: string | null; kind: string }[];
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const d = useLoad(() => get<Detail>(`/admin/customers/${id}`), [id]);
  const { busy, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState<number | null>(null);
  const [fbOpen, setFbOpen] = useState(false);
  const [resolving, setResolving] = useState<number | null>(null);

  if (d.loading) return <div className="page"><Loading /></div>;
  if (d.error || !d.data) return <div className="page"><ErrorState error={d.error} onRetry={d.reload} /></div>;
  const { customer: c, bookings, members, feedback, duplicates, debt } = d.data;

  async function save(form: HTMLFormElement) {
    const body = formValues(form, ['company_id', 'credit_limit'], ['vip']);
    if (!can('guests.documents')) { delete body.id_type; delete body.id_number; }
    else if (!body.id_number) delete body.id_number; // để trống: giữ nguyên số giấy tờ
    const ok = await run(() => patch(`/admin/customers/${id}`, body), 'Đã lưu hồ sơ');
    if (ok) { setEditing(false); d.reload(true); }
  }

  return (
    <RequirePerm perm="guests.view">
      <div className="page">
        <Link href="/admin/khach-hang" className="small muted"><ArrowLeft size={14} /> Danh sách khách hàng</Link>
        <PageHead title={c.full_name} sub={<><KindBadge kind={c.kind} /> {c.vip && <span className="badge b-bronze"><Crown aria-hidden />VIP</span>}</>}>
          <Can perm="bookings.create"><Link className="btn btn-primary" href={`/admin/dat-phong/moi?customer_id=${c.id}`}>+ Đặt phòng cho {c.kind === 'guest' ? 'khách này' : 'đơn vị này'}</Link></Can>
          <Can perm="guests.manage"><button className="btn" onClick={() => setEditing(v => !v)}><Pencil size={15} /> Sửa hồ sơ</button></Can>
        </PageHead>

        <div className="mod-split">
          <div className="stack">
            {editing ? (
              <form className="inline-form" onSubmit={e => { e.preventDefault(); save(e.currentTarget); }}>
                <h4>Sửa hồ sơ</h4>
                <div className="form-grid">
                  <label className="field"><span>Loại</span><select className="select" name="kind" defaultValue={c.kind}>
                    {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                  <label className="field"><span>Họ tên</span><input className="input" name="full_name" defaultValue={c.full_name} required /></label>
                  <label className="field"><span>Điện thoại</span><input className="input" name="phone" defaultValue={c.phone ?? ''} /></label>
                  <label className="field"><span>Email</span><input className="input" name="email" type="email" defaultValue={c.email ?? ''} /></label>
                  <label className="field"><span>Quốc tịch</span><input className="input" name="nationality" defaultValue={c.nationality ?? ''} /></label>
                  <label className="field"><span>Ngày sinh</span><input className="input" type="date" name="date_of_birth" defaultValue={c.date_of_birth ?? ''} /></label>
                  <label className="field"><span>Giới tính</span><select className="select" name="gender" defaultValue={c.gender ?? ''}>
                    <option value="">—</option><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option></select></label>
                  <label className="field"><span>Địa chỉ</span><input className="input" name="address" defaultValue={c.address ?? ''} /></label>
                  <label className="field"><span>Mã số thuế</span><input className="input" name="tax_code" defaultValue={c.tax_code ?? ''} /></label>
                  {c.kind !== 'guest' && <label className="field"><span>Hạn mức công nợ (đ)</span><input className="input" type="number" min={0} name="credit_limit" defaultValue={c.credit_limit ?? 0} /></label>}
                  {can('guests.documents') && <>
                    <label className="field"><span>Loại giấy tờ</span><select className="select" name="id_type" defaultValue={c.id_type ?? ''}>
                      <option value="">—</option><option value="cccd">CCCD</option><option value="passport">Hộ chiếu</option><option value="other">Khác</option></select></label>
                    <label className="field"><span>Số giấy tờ</span><input className="input" name="id_number" placeholder={c.id_number ? 'Để trống để giữ nguyên' : ''} autoComplete="off" /></label>
                  </>}
                </div>
                <label className="field"><span>Sở thích</span><textarea className="textarea" name="preferences" defaultValue={c.preferences ?? ''} /></label>
                <label className="field"><span>Ghi chú</span><textarea className="textarea" name="notes" defaultValue={c.notes ?? ''} /></label>
                <label className="check"><input type="checkbox" name="vip" defaultChecked={c.vip} /> Khách VIP</label>
                <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Lưu</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Hủy</button></div>
              </form>
            ) : (
              <div className="card card-pad">
                <dl className="mod-kv">
                  <dt>Điện thoại</dt><dd>{c.phone ?? '—'}</dd>
                  <dt>Email</dt><dd>{c.email ?? '—'}</dd>
                  <dt>Quốc tịch</dt><dd>{c.nationality ?? '—'}</dd>
                  <dt>Ngày sinh</dt><dd>{dateVN(c.date_of_birth)}</dd>
                  <dt>Địa chỉ</dt><dd>{c.address ?? '—'}</dd>
                  {c.tax_code && <><dt>Mã số thuế</dt><dd>{c.tax_code}</dd></>}
                  {c.company && <><dt>Thuộc</dt><dd><Link href={`/admin/khach-hang/${c.company.id}`}>{c.company.full_name}</Link></dd></>}
                  {can('guests.documents')
                    ? <><dt>Giấy tờ</dt><dd>{c.id_type ? `${c.id_type.toUpperCase()} · ${c.id_number ?? '—'}` : '—'}</dd></>
                    : <><dt>Giấy tờ</dt><dd className="muted small">Không có quyền xem</dd></>}
                  <dt>Sở thích</dt><dd>{c.preferences ?? '—'}</dd>
                  <dt>Ghi chú</dt><dd>{c.notes ?? '—'}</dd>
                </dl>
              </div>
            )}

            <div className="card">
              <div className="card-head"><h2>Lịch sử lưu trú</h2>{debt != null && <span className={`badge ${debt > 0 ? 'b-amber' : 'b-sage'}`}>Công nợ: {money(debt)}</span>}</div>
              {!bookings.length ? <Empty title="Chưa có đặt phòng" /> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Mã</th><th>Phòng</th><th>Thời gian</th><th>Trạng thái</th>{debt != null && <th className="right">Còn phải thu</th>}</tr></thead>
                  <tbody>{bookings.map(b => (
                    <tr key={b.id}>
                      <td><Link href={`/admin/dat-phong/${b.id}`}><strong>{b.code}</strong></Link></td>
                      <td>{b.stays.map(s => `${s.room?.number ?? 'Chưa phân'} (${s.type?.name ?? ''})`).join(', ')}</td>
                      <td className="nowrap">{b.stays[0] ? `${dateVN(b.stays[0].check_in, true)} – ${dateVN(b.stays[b.stays.length - 1].check_out, true)}` : '—'}</td>
                      <td><BookingBadge status={b.status} /></td>
                      {debt != null && <td className="right num">{money(b.balance)}</td>}
                    </tr>))}</tbody>
                </table></div>
              )}
            </div>

            {c.kind !== 'guest' && (
              <div className="card">
                <div className="card-head"><h2>Đầu mối liên hệ</h2></div>
                {!members.length ? <Empty title="Chưa có liên hệ thuộc đơn vị này">Tạo hồ sơ khách và chọn “Thuộc công ty/đại lý”.</Empty> : (
                  <div className="list">{members.map(m => <Link key={m.id} className="list-item" href={`/admin/khach-hang/${m.id}`}><span>{m.full_name}</span><span className="muted small">{m.phone ?? m.email ?? ''}</span></Link>)}</div>
                )}
              </div>
            )}
          </div>

          <div className="stack">
            <div className="card">
              <div className="card-head"><h2>Có thể trùng hồ sơ</h2></div>
              {!duplicates.length ? <div className="card-pad small muted"><CheckCircle2 size={14} /> Không phát hiện hồ sơ trùng.</div> : (
                <div className="list">{duplicates.map(x => (
                  <div key={x.id} className="list-item" style={{ display: 'grid' }}>
                    <div className="row-between"><Link href={`/admin/khach-hang/${x.id}`}><strong>{x.full_name}</strong></Link><span className="small muted">#{x.id} · {x.phone ?? x.email ?? ''}</span></div>
                    <Can perm="guests.manage">{merging === x.id
                      ? <ReasonForm label={`Gộp #${x.id} vào hồ sơ này`} confirm="Gộp hồ sơ" busy={busy} onCancel={() => setMerging(null)}
                          extra={<p className="small muted">Toàn bộ đặt phòng, thanh toán, phản hồi của #{x.id} được chuyển sang hồ sơ này. Hồ sơ cũ được đánh dấu đã gộp, không xóa.</p>}
                          onSubmit={async reason => { const ok = await run(() => post(`/admin/customers/${id}/merge`, { merge_id: x.id, reason }), 'Đã gộp hồ sơ'); if (ok) { setMerging(null); d.reload(true); } }} />
                      : <button className="btn btn-sm" onClick={() => setMerging(x.id)}><GitMerge size={14} /> Gộp vào hồ sơ này</button>}</Can>
                  </div>))}</div>
              )}
            </div>

            <div className="card">
              <div className="card-head"><h2>Phản hồi & khiếu nại</h2>
                <Can perm="guests.manage"><button className="btn btn-sm" onClick={() => setFbOpen(v => !v)}><MessageSquareWarning size={14} /> Ghi nhận</button></Can></div>
              {fbOpen && (
                <div className="card-pad">
                  <form className="inline-form" onSubmit={async e => {
                    e.preventDefault();
                    const body = { ...formValues(e.currentTarget, ['rating']), customer_id: c.id };
                    const ok = await run(() => post('/admin/feedback', body), 'Đã ghi nhận');
                    if (ok) { setFbOpen(false); d.reload(true); }
                  }}>
                    <div className="form-grid">
                      <label className="field"><span>Loại</span><select className="select" name="type"><option value="feedback">Phản hồi</option><option value="complaint">Khiếu nại</option></select></label>
                      <label className="field"><span>Đánh giá (1–5)</span><input className="input" type="number" min={1} max={5} name="rating" /></label>
                    </div>
                    <textarea className="textarea" name="content" required placeholder="Nội dung" />
                    <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Lưu</button></div>
                  </form>
                </div>
              )}
              {!feedback.length ? <Empty title="Chưa có phản hồi" /> : (
                <div className="list">{feedback.map(f => (
                  <div key={f.id} className="list-item" style={{ display: 'grid', gap: 6 }}>
                    <div className="row-between">
                      <span className={`badge ${f.type === 'complaint' ? 'b-red' : 'b-blue'}`}>{f.type === 'complaint' ? 'Khiếu nại' : 'Phản hồi'}{f.rating ? ` · ${f.rating}/5` : ''}</span>
                      <span className={`badge ${f.status === 'resolved' ? 'b-sage' : 'b-amber'}`}>{f.status === 'resolved' ? 'Đã xử lý' : 'Đang mở'}</span>
                    </div>
                    <p className="small">{f.content}</p>
                    <span className="tiny muted">{dateTimeVN(f.created_at)}</span>
                    {f.resolution && <Notice kind="ok">{f.resolution}</Notice>}
                    {f.status !== 'resolved' && can('guests.manage') && (resolving === f.id
                      ? <ReasonForm label="Kết quả xử lý" placeholder="Đã xử lý thế nào" confirm="Đánh dấu đã xử lý" busy={busy} onCancel={() => setResolving(null)}
                          onSubmit={async resolution => { const ok = await run(() => post(`/admin/feedback/${f.id}/resolve`, { resolution }), 'Đã cập nhật'); if (ok) { setResolving(null); d.reload(true); } }} />
                      : <button className="btn btn-sm" onClick={() => setResolving(f.id)}>Xử lý</button>)}
                  </div>))}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </RequirePerm>
  );
}
