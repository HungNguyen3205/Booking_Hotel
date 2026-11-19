'use client';

import { useState } from 'react';
import { CheckCircle2, Clock, Database, HandMetal, Pencil, Plus, Plug, XCircle } from 'lucide-react';
import { Empty, ErrorState, Loading, Notice, useAction, useLoad } from '@/components/ui';
import { get, put } from '@/lib/api';
import { dateTimeVN } from '@/lib/format';
import { formValues } from './common';
import { SaveCard, useSettings } from './settings-hotel';

type Integration = { key: string; name: string; status: 'active' | 'not_configured' | 'pending_provider' | 'manual'; detail: string };
type Method = { code: string; name: string; type: string; active: boolean; sort: number };
type Outbox = { id: number; channel: string; recipient: string; template: string; status: string; error: string | null; created_at: string };
type Backup = { name: string; size: number; created_at: string };

const STATUS: Record<string, [string, string, typeof CheckCircle2]> = {
  active: ['Đang hoạt động', 'b-sage', CheckCircle2], not_configured: ['Chưa cấu hình', 'b-amber', XCircle],
  pending_provider: ['Chờ nhà cung cấp', 'b-neutral', Clock], manual: ['Thủ công', 'b-blue', HandMetal],
  sent: ['Đã gửi', 'b-sage', CheckCircle2], failed: ['Lỗi', 'b-red', XCircle], queued: ['Đang chờ', 'b-blue', Clock],
};
const StatusBadge = ({ s }: { s: string }) => { const [l, c, I] = STATUS[s] ?? [s, 'b-neutral', Clock]; return <span className={`badge ${c}`}><I aria-hidden />{l}</span>; };
const TYPES: Record<string, string> = { cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', qr: 'QR', card: 'Thẻ', other: 'Khác' };

export function IntegrationsSetup() {
  const s = useSettings();
  const ints = useLoad(() => get<Integration[]>('/admin/setup/integrations'), []);
  const methods = useLoad(() => get<Method[]>('/admin/payment-methods'), []);
  const outbox = useLoad(() => get<Outbox[]>('/admin/setup/notifications'), []);
  const backups = useLoad(() => get<Backup[]>('/admin/setup/backups'), []);
  const { busy, run } = useAction();
  const [method, setMethod] = useState<Method | 'new' | null>(null);

  return (
    <div className="mod-section">
      <div className="card">
        <div className="card-head"><h2><Plug size={15} /> Trạng thái tích hợp</h2></div>
        {ints.loading ? <Loading /> : ints.error ? <ErrorState error={ints.error} onRetry={ints.reload} /> : (
          <div className="list">{ints.data!.map(i => (
            <div key={i.key} className="list-item" style={{ display: 'grid', gap: 4 }}>
              <div className="row-between"><strong>{i.name}</strong><StatusBadge s={i.status} /></div>
              <span className="small muted">{i.detail}</span>
            </div>))}</div>
        )}
      </div>

      <div className="grid-2">
        {s.loading ? <Loading /> : s.error || !s.data ? <ErrorState error={s.error} onRetry={s.reload} /> : (
          <SaveCard title="Mã QR chuyển khoản (VietQR)" busy={busy} onSubmit={async f => {
            const ok = await run(() => put('/admin/setup/settings/payment_qr', formValues(f, [], ['enabled'])), 'Đã lưu cấu hình QR');
            if (ok !== undefined) { s.reload(true); ints.reload(true); }
          }} note={<Notice kind="info">Mã QR chỉ giúp khách chuyển khoản đúng nội dung. Tiền về được ghi nhận khi kế toán đối soát hoặc webhook ngân hàng hợp lệ — không dựa vào việc khách bấm “đã chuyển”.</Notice>}>
            <div className="form-grid">
              <label className="field"><span>Mã BIN ngân hàng (6 số)</span><input className="input" name="bank_bin" inputMode="numeric" pattern="\d{6}" defaultValue={s.data.settings.payment_qr.bank_bin} /></label>
              <label className="field"><span>Tên ngân hàng</span><input className="input" name="bank_name" defaultValue={s.data.settings.payment_qr.bank_name} /></label>
              <label className="field"><span>Số tài khoản</span><input className="input" name="account_number" defaultValue={s.data.settings.payment_qr.account_number} /></label>
              <label className="field"><span>Chủ tài khoản</span><input className="input" name="account_name" defaultValue={s.data.settings.payment_qr.account_name} /></label>
            </div>
            <label className="check"><input type="checkbox" name="enabled" defaultChecked={s.data.settings.payment_qr.enabled} /> Bật QR trên website và quầy</label>
          </SaveCard>
        )}

        <div className="card">
          <div className="card-head"><h2>Phương thức thanh toán</h2><button className="btn btn-sm" onClick={() => setMethod('new')}><Plus size={14} /> Thêm</button></div>
          {method && (
            <div className="card-pad"><form className="inline-form" onSubmit={async e => {
              e.preventDefault();
              const v = formValues(e.currentTarget, ['sort'], ['active']);
              const code = method === 'new' ? String(v.code ?? '') : method.code;
              delete v.code;
              const ok = await run(() => put(`/admin/setup/payment-methods/${code}`, v), 'Đã lưu phương thức');
              if (ok !== undefined) { setMethod(null); methods.reload(true); }
            }}>
              <div className="form-grid">
                {method === 'new' && <label className="field"><span>Mã (a-z, 0-9, _)</span><input className="input" name="code" pattern="[a-z0-9_]{2,30}" required /></label>}
                <label className="field"><span>Tên</span><input className="input" name="name" defaultValue={method === 'new' ? '' : method.name} required /></label>
                <label className="field"><span>Loại</span><select className="select" name="type" defaultValue={method === 'new' ? 'bank_transfer' : method.type}>{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label className="field"><span>Thứ tự</span><input className="input" type="number" name="sort" defaultValue={method === 'new' ? 0 : method.sort} /></label>
              </div>
              <label className="check"><input type="checkbox" name="active" defaultChecked={method === 'new' || method.active} /> Đang dùng</label>
              <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Lưu</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setMethod(null)}>Hủy</button></div>
            </form></div>
          )}
          {methods.loading ? <Loading /> : methods.error ? <ErrorState error={methods.error} onRetry={methods.reload} /> : (
            <div className="list">{methods.data!.map(m => (
              <div key={m.code} className="list-item"><span><strong>{m.name}</strong> <span className="tiny muted">{m.code} · {TYPES[m.type]}</span></span>
                <div className="row">{m.active ? <span className="badge b-sage">Đang dùng</span> : <span className="badge b-neutral">Tắt</span>}
                  <button className="btn btn-sm btn-ghost" onClick={() => setMethod(m)}><Pencil size={14} /></button></div></div>))}</div>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h2>Hàng đợi thông báo</h2><span className="tiny muted">100 bản ghi gần nhất</span></div>
          {outbox.loading ? <Loading /> : outbox.error ? <ErrorState error={outbox.error} onRetry={outbox.reload} /> : !outbox.data?.length ? <Empty title="Chưa có thông báo" /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Thời điểm</th><th>Kênh</th><th>Người nhận</th><th>Trạng thái</th></tr></thead>
              <tbody>{outbox.data.map(o => <tr key={o.id}><td className="nowrap">{dateTimeVN(o.created_at)}</td><td>{o.channel}</td><td>{o.recipient}</td>
                <td><StatusBadge s={o.status} />{o.error && <div className="tiny muted">{o.error}</div>}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2><Database size={15} /> Sao lưu</h2></div>
          <div className="card-pad stack-sm">
            <p className="small muted">Sao lưu tự động hằng ngày bằng lệnh <code>php artisan hotel:backup</code> (cần chạy <code>schedule:run</code>). Phục hồi thực hiện trên máy chủ bằng dòng lệnh theo hướng dẫn trong README — không phục hồi từ giao diện để tránh ghi đè nhầm dữ liệu.</p>
          </div>
          {backups.loading ? <Loading /> : backups.error ? <ErrorState error={backups.error} onRetry={backups.reload} /> : !backups.data?.length ? <Empty title="Chưa có bản sao lưu" /> : (
            <div className="list">{backups.data.map(b => <div key={b.name} className="list-item"><span className="small">{b.name}</span><span className="small muted">{(b.size / 1024).toFixed(0)} KB · {dateTimeVN(b.created_at)}</span></div>)}</div>
          )}
        </div>
      </div>
    </div>
  );
}
