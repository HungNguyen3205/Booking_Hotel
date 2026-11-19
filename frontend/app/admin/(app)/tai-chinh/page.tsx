'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, Clock, Lock, Printer, RotateCcw, Unlock, XCircle } from 'lucide-react';
import { PageHead, RequirePerm } from '@/components/admin/shell';
import { useSession } from '@/components/admin/session';
import { BookingBadge } from '@/components/admin/badges';
import { Empty, ErrorState, Loading, Notice, useAction, useLoad } from '@/components/ui';
import { get, post, qs } from '@/lib/api';
import { dateTimeVN, dateVN, money, PAYMENT_KIND, todayISO } from '@/lib/format';
import { Paged, Pager, ReasonForm, Tabs, formValues } from '@/components/admin/modules/common';

type Method = { code: string; name: string; type: string; active: boolean };
type Shift = { id: number; opened_at: string; closed_at: string | null; opening_cash: number; expected_cash: number | null; counted_cash: number | null;
  difference: number | null; note: string | null; user: { name: string } | null; receiver: { name: string } | null;
  by_method?: { method: string; total: number; count: number }[]; cashbook?: { method: string; type: string; total: number }[] };
type Payment = { id: number; kind: string; method: string; amount: number; status: string; reference: string | null; receipt_no: string | null;
  paid_at: string | null; note: string | null; booking: { id: number; code: string; customer: { full_name: string } | null } | null; receiver: { name: string } | null };
type Cash = { id: number; type: string; category: string; method: string; amount: number; description: string; business_date: string; reverses_id: number | null; reversal_exists?: boolean; creator: { name: string } | null };
type Receivable = { booking_id: number; code: string; status: string; customer: string | null; bill_to: string | null; bill_to_kind: string | null; balance: number; last_check_out: string | null; age_days: number };

type TabKey = 'shift' | 'cash' | 'payments' | 'claims' | 'debt';

export default function FinancePage() {
  const { can } = useSession();
  const [tab, setTab] = useState<TabKey>(can('shifts.manage') ? 'shift' : 'payments');
  const methods = useLoad(() => get<Method[]>('/admin/payment-methods'), []);
  const methodName = (code: string) => methods.data?.find(m => m.code === code)?.name ?? code;
  return (
    <RequirePerm perm="payments.view">
      <div className="page">
        <PageHead title="Tài chính" sub="Ca làm việc, thu chi, khoản thu, đối soát chuyển khoản và công nợ." />
        <details className="card card-pad no-print">
          <summary><strong>Phân biệt các khái niệm</strong></summary>
          <ul className="small" style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
            <li><strong>Tiền đã thu</strong>: tiền thực nhận (cọc + thanh toán − hoàn tiền), ghi theo thời điểm thu.</li>
            <li><strong>Tiền cọc</strong>: khoản thu trước khi khách nhận phòng; vẫn là tiền đã thu nhưng chưa phải doanh thu.</li>
            <li><strong>Doanh thu</strong>: ghi nhận theo đêm khách ở thực tế và ngày phát sinh dịch vụ — không phụ thuộc lúc thu tiền.</li>
            <li><strong>Còn phải thu</strong>: tổng phát sinh của hồ sơ thanh toán trừ tiền đã thu. Khoản khách “báo đã chuyển khoản” chỉ được tính sau khi đối soát.</li>
            <li>Phiếu thu/bảng kê là chứng từ nội bộ, <strong>không phải hóa đơn điện tử</strong> (chưa kết nối nhà cung cấp hóa đơn).</li>
          </ul>
        </details>
        <Tabs value={tab} onChange={setTab} tabs={[
          { key: 'shift', label: 'Ca làm việc', show: can('shifts.manage') },
          { key: 'cash', label: 'Thu chi', show: can('cashbook.manage') },
          { key: 'payments', label: 'Khoản thu' },
          { key: 'claims', label: 'Chờ đối soát' },
          { key: 'debt', label: 'Công nợ' },
        ]} />
        {tab === 'shift' && <ShiftTab methodName={methodName} />}
        {tab === 'cash' && <CashTab methods={methods.data ?? []} methodName={methodName} />}
        {tab === 'payments' && <PaymentsTab methods={methods.data ?? []} methodName={methodName} />}
        {tab === 'claims' && <ClaimsTab methodName={methodName} />}
        {tab === 'debt' && <DebtTab />}
      </div>
    </RequirePerm>
  );
}

function ShiftTab({ methodName }: { methodName: (c: string) => string }) {
  const { user, can } = useSession();
  const cur = useLoad(() => get<{ shift: Shift | null; staff: { id: number; name: string }[] }>('/admin/shifts/current'), []);
  const hist = useLoad(() => get<Shift[]>('/admin/shifts'), []);
  const { busy, run } = useAction();
  const reload = () => { cur.reload(true); hist.reload(true); };
  if (cur.loading) return <Loading />;
  if (cur.error || !cur.data) return <ErrorState error={cur.error} onRetry={cur.reload} />;
  const s = cur.data.shift;
  return (
    <div className="mod-section">
      {!s ? (
        <form className="card card-pad stack" onSubmit={async e => {
          e.preventDefault();
          const ok = await run(() => post('/admin/shifts', formValues(e.currentTarget, ['opening_cash'])), 'Đã mở ca');
          if (ok !== undefined) reload();
        }}>
          <div className="row"><Unlock size={18} /><strong>Bạn chưa mở ca</strong></div>
          <p className="small muted">Cần mở ca để thu/chi tiền mặt. Tiền đầu ca là tiền mặt đang có trong két khi nhận ca.</p>
          <div className="form-grid">
            <label className="field"><span>Tiền mặt đầu ca (đ)</span><input className="input" type="number" min={0} step={1000} name="opening_cash" required /></label>
            <label className="field"><span>Ghi chú</span><input className="input" name="note" /></label>
          </div>
          <div><button className="btn btn-primary" disabled={busy}>Mở ca</button></div>
        </form>
      ) : (
        <div className="grid-2">
          <div className="card">
            <div className="card-head"><h2><Clock size={15} /> Ca đang mở của {s.user?.name ?? user.name}</h2><span className="small muted">từ {dateTimeVN(s.opened_at)}</span></div>
            <div className="card-pad stack">
              <dl className="dl">
                <dt>Tiền mặt đầu ca</dt><dd>{money(s.opening_cash)}</dd>
                {s.by_method?.map(m => <Fragment key={m.method}><dt>Thu qua {methodName(m.method)} ({m.count} phiếu)</dt><dd>{money(Number(m.total))}</dd></Fragment>)}
                {s.cashbook?.map(c => <Fragment key={c.method + c.type}><dt>{c.type === 'income' ? 'Thu khác' : 'Chi'} — {methodName(c.method)}</dt><dd>{c.type === 'income' ? '' : '−'}{money(Number(c.total))}</dd></Fragment>)}
                <dt className="total">Tiền mặt dự kiến trong két</dt><dd className="total">{money(s.expected_cash)}</dd>
              </dl>
              <p className="tiny muted">Tiền mặt dự kiến = đầu ca + thu tiền mặt − hoàn/chi tiền mặt trong ca.</p>
            </div>
          </div>
          <form className="card card-pad stack" onSubmit={async e => {
            e.preventDefault();
            const body = formValues(e.currentTarget, ['counted_cash', 'handed_to']);
            const ok = await run(() => post(`/admin/shifts/${s.id}/close`, body), 'Đã chốt ca');
            if (ok !== undefined) reload();
          }}>
            <div className="row"><Lock size={16} /><strong>Chốt ca & bàn giao</strong></div>
            <label className="field"><span>Tiền mặt thực đếm (đ)</span><input className="input" type="number" min={0} step={1000} name="counted_cash" required /></label>
            <label className="field"><span>Bàn giao cho</span><select className="select" name="handed_to"><option value="">—</option>
              {cur.data.staff.filter(x => x.id !== user.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label className="field"><span>Ghi chú (bắt buộc nếu lệch tiền)</span><textarea className="textarea" name="note" /></label>
            <div><button className="btn btn-primary" disabled={busy}>Chốt ca</button></div>
          </form>
        </div>
      )}
      <div className="card">
        <div className="card-head"><h2>Lịch sử ca</h2></div>
        {hist.loading ? <Loading /> : hist.error ? <ErrorState error={hist.error} onRetry={hist.reload} /> : !hist.data?.length ? <Empty title="Chưa có ca" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Nhân viên</th><th>Mở</th><th>Chốt</th><th className="right">Đầu ca</th><th className="right">Dự kiến</th><th className="right">Thực đếm</th><th className="right">Lệch</th><th>Bàn giao</th><th>Ghi chú</th></tr></thead>
            <tbody>{hist.data.map(h => (
              <tr key={h.id}>
                <td>{h.user?.name}</td><td className="nowrap">{dateTimeVN(h.opened_at)}</td>
                <td className="nowrap">{h.closed_at ? dateTimeVN(h.closed_at) : <span className="badge b-blue"><Unlock aria-hidden />Đang mở</span>}</td>
                <td className="right num">{money(h.opening_cash)}</td><td className="right num">{money(h.expected_cash)}</td><td className="right num">{money(h.counted_cash)}</td>
                <td className="right num">{h.difference == null ? '—' : h.difference === 0 ? <span className="badge b-sage"><CheckCircle2 aria-hidden />Khớp</span> : <span className="badge b-red"><XCircle aria-hidden />{money(h.difference)}</span>}</td>
                <td>{h.receiver?.name ?? '—'}</td><td className="small">{h.note}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
      {!can('cashbook.manage') && <p className="small muted">Chốt ca của người khác cần quyền kế toán.</p>}
    </div>
  );
}

function CashTab({ methods, methodName }: { methods: Method[]; methodName: (c: string) => string }) {
  const [page, setPage] = useState(1);
  const d = useLoad(() => get<Paged<Cash>>('/admin/cash-entries' + qs({ page })), [page]);
  const { busy, run } = useAction();
  const [reversing, setReversing] = useState<number | null>(null);
  return (
    <div className="mod-section">
      <form className="inline-form" onSubmit={async e => {
        e.preventDefault();
        const form = e.currentTarget;
        const ok = await run(() => post('/admin/cash-entries', formValues(form, ['amount'])), 'Đã ghi phiếu');
        if (ok !== undefined) { form.reset(); d.reload(true); }
      }}>
        <h4>Ghi phiếu thu/chi ngoài tiền phòng</h4>
        <div className="form-grid">
          <label className="field"><span>Loại</span><select className="select" name="type"><option value="expense">Phiếu chi</option><option value="income">Phiếu thu</option></select></label>
          <label className="field"><span>Danh mục</span><input className="input" name="category" required list="cash-cats" placeholder="Ví dụ: Mua vật tư" /></label>
          <label className="field"><span>Phương thức</span><select className="select" name="method">{methods.filter(m => m.active).map(m => <option key={m.code} value={m.code}>{m.name}</option>)}</select></label>
          <label className="field"><span>Số tiền (đ)</span><input className="input" type="number" min={1} name="amount" required /></label>
        </div>
        <datalist id="cash-cats"><option value="Mua vật tư" /><option value="Điện nước" /><option value="Sửa chữa" /><option value="Thu khác" /><option value="Nộp tiền về công ty" /></datalist>
        <input className="input" name="description" required placeholder="Diễn giải" />
        <div><button className="btn btn-primary btn-sm" disabled={busy}>Ghi phiếu</button></div>
      </form>
      <div className="card">
        {d.loading ? <Loading /> : d.error ? <ErrorState error={d.error} onRetry={d.reload} /> : !d.data?.data.length ? <Empty title="Chưa có phiếu thu chi" /> : (<>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Ngày</th><th>Loại</th><th>Danh mục</th><th>Diễn giải</th><th>Phương thức</th><th className="right">Số tiền</th><th>Người ghi</th><th /></tr></thead>
            <tbody>{d.data.data.map(c => (
              <tr key={c.id}>
                <td className="nowrap">{dateVN(c.business_date)}</td>
                <td>{c.type === 'income' ? <span className="badge b-sage"><ArrowDownCircle aria-hidden />Thu</span> : <span className="badge b-amber"><ArrowUpCircle aria-hidden />Chi</span>}</td>
                <td>{c.category}</td><td className="small">{c.description}</td><td>{methodName(c.method)}</td><td className="right num">{money(c.amount)}</td><td>{c.creator?.name}</td>
                <td>{!c.reverses_id && !c.reversal_exists && (reversing === c.id
                  ? <ReasonForm label="Đảo bút toán" confirm="Đảo" danger busy={busy} onCancel={() => setReversing(null)}
                      onSubmit={async reason => { const ok = await run(() => post(`/admin/cash-entries/${c.id}/reverse`, { reason }), 'Đã đảo bút toán'); if (ok !== undefined) { setReversing(null); d.reload(true); } }} />
                  : <button className="btn btn-sm btn-ghost" onClick={() => setReversing(c.id)}><RotateCcw size={14} /> Đảo</button>)}</td>
              </tr>))}</tbody>
          </table></div>
          <Pager page={d.data.current_page} last={d.data.last_page} onPage={setPage} />
        </>)}
      </div>
    </div>
  );
}

type Receipt = { hotel: { name: string; address: string | null; phone: string | null }; payment: Payment & { booking: { code: string; customer: { full_name: string; phone: string | null } | null; stays: { room: { number: string } | null }[] } | null }; note: string };

function PaymentsTab({ methods, methodName }: { methods: Method[]; methodName: (c: string) => string }) {
  const [f, setF] = useState({ from: todayISO(-30), to: todayISO(), method: '', kind: '' });
  const [page, setPage] = useState(1);
  const d = useLoad(() => get<Paged<Payment>>('/admin/payments' + qs({ ...f, page })), [f, page]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const { run } = useAction();
  return (
    <div className="mod-section">
      <form className="filters card card-pad no-print" onSubmit={e => { e.preventDefault(); setPage(1); setF(formValues(e.currentTarget) as typeof f); }}>
        <label className="field"><span>Từ ngày</span><input className="input" type="date" name="from" defaultValue={f.from} /></label>
        <label className="field"><span>Đến ngày</span><input className="input" type="date" name="to" defaultValue={f.to} /></label>
        <label className="field"><span>Phương thức</span><select className="select" name="method" defaultValue={f.method}><option value="">Tất cả</option>{methods.map(m => <option key={m.code} value={m.code}>{m.name}</option>)}</select></label>
        <label className="field"><span>Loại</span><select className="select" name="kind" defaultValue={f.kind}><option value="">Tất cả</option>{Object.entries(PAYMENT_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <button className="btn">Lọc</button>
      </form>
      {receipt && (
        <div className="stack">
          <div className="mod-receipt">
            <h3>{receipt.payment.kind === 'refund' ? 'PHIẾU CHI (HOÀN TIỀN)' : 'PHIẾU THU'}</h3>
            <p className="small" style={{ textAlign: 'center' }}>{receipt.hotel.name}<br />{receipt.hotel.address}{receipt.hotel.phone ? ` · ${receipt.hotel.phone}` : ''}</p>
            <dl className="mod-kv">
              <dt>Số phiếu</dt><dd>{receipt.payment.receipt_no}</dd>
              <dt>Thời điểm</dt><dd>{dateTimeVN(receipt.payment.paid_at)}</dd>
              <dt>Đặt phòng</dt><dd>{receipt.payment.booking?.code} {receipt.payment.booking?.stays?.map(s => s.room?.number).filter(Boolean).join(', ')}</dd>
              <dt>Khách</dt><dd>{receipt.payment.booking?.customer?.full_name}</dd>
              <dt>Nội dung</dt><dd>{PAYMENT_KIND[receipt.payment.kind]}{receipt.payment.note ? ` — ${receipt.payment.note}` : ''}</dd>
              <dt>Phương thức</dt><dd>{methodName(receipt.payment.method)}{receipt.payment.reference ? ` · ${receipt.payment.reference}` : ''}</dd>
              <dt>Số tiền</dt><dd><strong>{money(receipt.payment.amount)}</strong></dd>
              <dt>Người lập</dt><dd>{receipt.payment.receiver?.name}</dd>
            </dl>
            <p className="tiny muted">{receipt.note} Phiếu thu nội bộ — không phải hóa đơn điện tử.</p>
          </div>
          <div className="row no-print"><button className="btn btn-primary" onClick={() => window.print()}><Printer size={15} /> In phiếu</button><button className="btn btn-ghost" onClick={() => setReceipt(null)}>Đóng</button></div>
        </div>
      )}
      <div className="card no-print">
        {d.loading ? <Loading /> : d.error ? <ErrorState error={d.error} onRetry={d.reload} /> : !d.data?.data.length ? <Empty title="Không có khoản thu trong kỳ" /> : (<>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Số phiếu</th><th>Thời điểm</th><th>Đặt phòng</th><th>Loại</th><th>Phương thức</th><th className="right">Số tiền</th><th>Trạng thái</th><th>Người thu</th><th /></tr></thead>
            <tbody>{d.data.data.map(p => (
              <tr key={p.id}>
                <td className="nowrap">{p.receipt_no ?? '—'}</td><td className="nowrap">{dateTimeVN(p.paid_at ?? null)}</td>
                <td>{p.booking ? <Link href={`/admin/dat-phong/${p.booking.id}`}>{p.booking.code}</Link> : '—'}<div className="tiny muted">{p.booking?.customer?.full_name}</div></td>
                <td>{PAYMENT_KIND[p.kind]}</td><td>{methodName(p.method)}</td>
                <td className="right num">{p.kind === 'refund' ? '−' : ''}{money(p.amount)}</td>
                <td><PaymentStatus status={p.status} /></td><td>{p.receiver?.name ?? '—'}</td>
                <td>{p.status === 'completed' && <button className="btn btn-sm btn-ghost" onClick={async () => { const r = await run(() => get<Receipt>(`/admin/payments/${p.id}/receipt`)); if (r) setReceipt(r); }}><Printer size={14} /> Phiếu</button>}</td>
              </tr>))}</tbody>
          </table></div>
          <Pager page={d.data.current_page} last={d.data.last_page} onPage={setPage} />
        </>)}
      </div>
    </div>
  );
}

function PaymentStatus({ status }: { status: string }) {
  const map: Record<string, [string, string, typeof CheckCircle2]> = {
    completed: ['Đã ghi nhận', 'b-sage', CheckCircle2], pending: ['Chờ đối soát', 'b-amber', Clock], failed: ['Không khớp', 'b-red', XCircle], cancelled: ['Đã thay thế', 'b-neutral', XCircle],
  };
  const [l, c, Icon] = map[status] ?? [status, 'b-neutral', Clock];
  return <span className={`badge ${c}`}><Icon aria-hidden />{l}</span>;
}

function ClaimsTab({ methodName }: { methodName: (c: string) => string }) {
  const { can } = useSession();
  const d = useLoad(() => get<Payment[]>('/admin/payment-claims'), []);
  const { busy, run } = useAction();
  const [confirming, setConfirming] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);
  return (
    <div className="mod-section">
      <Notice kind="warn">Khách bấm “Tôi đã chuyển khoản” trên website <strong>không</strong> được tính là đã thu. Chỉ xác nhận sau khi đối chiếu sao kê ngân hàng; nhập đúng số tiền thực nhận.</Notice>
      <div className="card">
        {d.loading ? <Loading /> : d.error ? <ErrorState error={d.error} onRetry={d.reload} /> : !d.data?.length ? <Empty title="Không có khoản chờ đối soát" /> : (
          <div className="list">{d.data.map(p => (
            <div key={p.id} className="list-item" style={{ display: 'grid', gap: 8 }}>
              <div className="row-between">
                <div className="row">{p.booking && <Link href={`/admin/dat-phong/${p.booking.id}`}><strong>{p.booking.code}</strong></Link>}<span>{p.booking?.customer?.full_name}</span><PaymentStatus status={p.status} /></div>
                <span>Khách báo: <strong>{money(p.amount)}</strong> · {methodName(p.method)}{p.reference ? ` · ${p.reference}` : ''}</span>
              </div>
              {can('payments.collect') && (confirming === p.id ? (
                <form className="inline-form" onSubmit={async e => {
                  e.preventDefault();
                  const ok = await run(() => post(`/admin/payment-claims/${p.id}/confirm`, formValues(e.currentTarget, ['amount'])), 'Đã ghi nhận khoản thu');
                  if (ok !== undefined) { setConfirming(null); d.reload(true); }
                }}>
                  <div className="form-grid">
                    <label className="field"><span>Số tiền thực nhận theo sao kê (đ)</span><input className="input" type="number" min={1} name="amount" defaultValue={p.amount} required /></label>
                    <label className="field"><span>Mã giao dịch ngân hàng</span><input className="input" name="reference" defaultValue={p.reference ?? ''} /></label>
                  </div>
                  <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Xác nhận đã nhận tiền</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>Hủy</button></div>
                </form>
              ) : rejecting === p.id ? (
                <ReasonForm label="Không tìm thấy giao dịch" confirm="Từ chối" danger busy={busy} onCancel={() => setRejecting(null)}
                  onSubmit={async reason => { const ok = await run(() => post(`/admin/payment-claims/${p.id}/reject`, { reason }), 'Đã từ chối'); if (ok !== undefined) { setRejecting(null); d.reload(true); } }} />
              ) : (
                <div className="row"><button className="btn btn-sm btn-primary" onClick={() => setConfirming(p.id)}><CheckCircle2 size={14} /> Đã đối soát</button>
                  <button className="btn btn-sm btn-danger" onClick={() => setRejecting(p.id)}><XCircle size={14} /> Không khớp</button></div>
              ))}
            </div>))}</div>
        )}
      </div>
    </div>
  );
}

function DebtTab() {
  const d = useLoad(() => get<Receivable[]>('/admin/receivables'), []);
  if (d.loading) return <Loading />;
  if (d.error || !d.data) return <ErrorState error={d.error} onRetry={d.reload} />;
  const total = d.data.reduce((s, r) => s + r.balance, 0);
  return (
    <div className="card">
      <div className="card-head"><h2>Còn phải thu</h2><strong className="num">{money(total)}</strong></div>
      {!d.data.length ? <Empty title="Không có công nợ" /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Mã</th><th>Khách</th><th>Người chịu công nợ</th><th>Trạng thái</th><th>Ngày trả phòng</th><th className="right">Tuổi nợ</th><th className="right">Còn phải thu</th></tr></thead>
          <tbody>{d.data.map(r => (
            <tr key={r.booking_id}>
              <td><Link href={`/admin/dat-phong/${r.booking_id}`}><strong>{r.code}</strong></Link></td><td>{r.customer}</td>
              <td>{r.bill_to ? `${r.bill_to} (${r.bill_to_kind === 'agent' ? 'Đại lý' : 'Công ty'})` : 'Khách tự thanh toán'}</td>
              <td><BookingBadge status={r.status} /></td><td>{dateVN(r.last_check_out)}</td>
              <td className="right num">{r.status === 'checked_in' ? 'Đang ở' : `${r.age_days} ngày`}</td><td className="right num"><strong>{money(r.balance)}</strong></td>
            </tr>))}</tbody>
        </table></div>
      )}
    </div>
  );
}
