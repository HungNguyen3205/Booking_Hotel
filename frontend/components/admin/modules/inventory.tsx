'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, PackagePlus, Pencil, Plus } from 'lucide-react';
import { Can } from '@/components/admin/session';
import { Empty, ErrorState, Loading, Notice, useAction, useLoad } from '@/components/ui';
import { get, post, put, qs } from '@/lib/api';
import { dateTimeVN, money } from '@/lib/format';
import { Paged, Pager, formValues } from './common';

type Item = { id: number; sku: string; name: string; category: string; unit: string; on_hand: number; min_stock: number; unit_cost: number; active: boolean };
type Data = { items: Item[]; low_stock: Item[]; types: Record<string, string>; categories: Record<string, string> };
type Move = { id: number; type: string; quantity: number; balance_after: number; note: string | null; ref_type: string | null; created_at: string;
  item: { name: string; unit: string }; creator: { name: string } | null };

const MANUAL = ['receive', 'issue', 'count', 'adjust', 'damage', 'loss'];
const NEEDS_NOTE = ['adjust', 'damage', 'loss', 'count'];

function StockBadge({ i }: { i: Item }) {
  if (i.on_hand < 0) return <span className="badge b-red"><AlertTriangle aria-hidden />Âm kho</span>;
  if (i.on_hand <= i.min_stock) return <span className="badge b-amber"><AlertTriangle aria-hidden />Tồn thấp</span>;
  return <span className="badge b-sage"><CheckCircle2 aria-hidden />Đủ</span>;
}

/** Kho: minibar, vật tư, đồ vải. Mọi thay đổi tồn đi qua phiếu kho; bán minibar tự trừ kho một lần. */
export function InventoryPanel() {
  const d = useLoad(() => get<Data>('/admin/inventory'), []);
  const [itemFilter, setItemFilter] = useState<number | ''>('');
  const [page, setPage] = useState(1);
  const moves = useLoad(() => get<Paged<Move>>('/admin/inventory/movements' + qs({ item_id: itemFilter, page })), [itemFilter, page]);
  const { busy, run } = useAction();
  const [edit, setEdit] = useState<Item | 'new' | null>(null);
  const [moveType, setMoveType] = useState('receive');

  if (d.loading && !d.data) return <Loading />;
  if (d.error || !d.data) return <ErrorState error={d.error} onRetry={() => d.reload()} />;
  const { items, low_stock, types, categories } = d.data;
  const reload = () => { d.reload(true); moves.reload(true); };

  const itemForm = (it: Item | null) => (
    <form className="inline-form" onSubmit={async e => {
      e.preventDefault();
      const body = formValues(e.currentTarget, ['min_stock', 'unit_cost'], ['active']);
      const ok = await run(() => it ? put(`/admin/inventory/${it.id}`, body) : post('/admin/inventory', body), 'Đã lưu mặt hàng');
      if (ok !== undefined) { setEdit(null); reload(); }
    }}>
      <h4>{it ? `Sửa: ${it.name}` : 'Mặt hàng mới'}</h4>
      <div className="form-grid">
        <label className="field"><span>Mã hàng</span><input className="input" name="sku" defaultValue={it?.sku} required /></label>
        <label className="field"><span>Tên</span><input className="input" name="name" defaultValue={it?.name} required /></label>
        <label className="field"><span>Nhóm</span><select className="select" name="category" defaultValue={it?.category ?? 'minibar'}>{Object.entries(categories).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field"><span>Đơn vị</span><input className="input" name="unit" defaultValue={it?.unit} required /></label>
        <label className="field"><span>Tồn tối thiểu</span><input className="input" type="number" min={0} name="min_stock" defaultValue={it?.min_stock ?? 0} required /></label>
        <label className="field"><span>Giá vốn (đ)</span><input className="input" type="number" min={0} name="unit_cost" defaultValue={it?.unit_cost ?? 0} /></label>
      </div>
      <label className="check"><input type="checkbox" name="active" defaultChecked={it?.active ?? true} /> Đang sử dụng</label>
      {!it && <p className="small muted">Tồn ban đầu = 0. Dùng phiếu “Nhập kho” để ghi số lượng.</p>}
      <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Lưu</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(null)}>Hủy</button></div>
    </form>
  );

  return (
    <div className="mod-section">
      <div className="row-between">
        <p className="small muted">Minibar, vật tư tiêu hao, đồ vải. Mọi thay đổi tồn đi qua phiếu kho; bán minibar tự trừ kho một lần.</p>
        <Can perm="inventory.manage"><button className="btn btn-primary btn-sm" onClick={() => setEdit('new')}><Plus size={15} /> Thêm mặt hàng</button></Can>
      </div>
      {low_stock.length > 0 && <Notice kind="warn"><strong>{low_stock.length} mặt hàng tồn thấp:</strong> {low_stock.map(i => `${i.name} (${i.on_hand} ${i.unit})`).join(', ')}</Notice>}
      {edit === 'new' && itemForm(null)}

      <Can perm="inventory.manage">
        <form className="inline-form" onSubmit={async e => {
          e.preventDefault();
          const form = e.currentTarget;
          const ok = await run(() => post('/admin/inventory/movements', formValues(form, ['inventory_item_id', 'quantity'])), 'Đã ghi phiếu kho');
          if (ok !== undefined) { form.reset(); setMoveType('receive'); reload(); }
        }}>
          <h4><PackagePlus size={15} /> Phiếu kho</h4>
          <div className="form-grid">
            <label className="field"><span>Loại phiếu</span><select className="select" name="type" value={moveType} onChange={e => setMoveType(e.target.value)}>
              {MANUAL.map(k => <option key={k} value={k}>{types[k]}</option>)}</select></label>
            <label className="field"><span>Mặt hàng</span><select className="select" name="inventory_item_id" required>{items.filter(i => i.active).map(i => <option key={i.id} value={i.id}>{i.name} (tồn {i.on_hand})</option>)}</select></label>
            <label className="field"><span>{moveType === 'count' ? 'Số đếm thực tế' : moveType === 'adjust' ? 'Chênh lệch (+/−)' : 'Số lượng'}</span>
              <input className="input" type="number" name="quantity" required min={moveType === 'adjust' ? undefined : moveType === 'count' ? 0 : 1} /></label>
            <label className="field"><span>Ghi chú{NEEDS_NOTE.includes(moveType) ? ' (bắt buộc)' : ''}</span><input className="input" name="note" required={NEEDS_NOTE.includes(moveType)} /></label>
          </div>
          <div><button className="btn btn-primary btn-sm" disabled={busy || !items.length}>Ghi phiếu</button></div>
        </form>
      </Can>

      <div className="card">
        <div className="card-head"><h2>Tồn kho</h2></div>
        {!items.length ? <Empty title="Chưa có mặt hàng" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Mã</th><th>Tên</th><th>Nhóm</th><th className="right">Tồn</th><th className="right">Tối thiểu</th><th className="right">Giá vốn</th><th>Tình trạng</th><th /></tr></thead>
            <tbody>{items.map(i => edit !== 'new' && edit?.id === i.id ? <tr key={i.id}><td colSpan={8}>{itemForm(i)}</td></tr> : (
              <tr key={i.id} style={i.active ? undefined : { opacity: .6 }}>
                <td className="nowrap">{i.sku}</td><td><strong>{i.name}</strong>{!i.active && <span className="tiny muted"> (ngừng dùng)</span>}</td><td>{categories[i.category]}</td>
                <td className="right num"><strong>{i.on_hand}</strong> {i.unit}</td><td className="right num">{i.min_stock}</td><td className="right num">{money(i.unit_cost)}</td>
                <td><StockBadge i={i} /></td>
                <td className="right"><div className="mod-actions">
                  <button className="btn btn-sm btn-ghost" onClick={() => { setItemFilter(i.id); setPage(1); }}>Lịch sử</button>
                  <Can perm="inventory.manage"><button className="btn btn-sm btn-ghost" onClick={() => setEdit(i)}><Pencil size={14} /> Sửa</button></Can></div></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h2>Lịch sử phiếu kho</h2>
          <select className="select" style={{ width: 'auto' }} value={itemFilter} onChange={e => { setItemFilter(e.target.value ? Number(e.target.value) : ''); setPage(1); }}>
            <option value="">Tất cả mặt hàng</option>{items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
        {moves.loading && !moves.data ? <Loading /> : moves.error ? <ErrorState error={moves.error} onRetry={() => moves.reload()} /> : !moves.data?.data.length ? <Empty title="Chưa có phiếu kho" /> : (<>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Thời điểm</th><th>Mặt hàng</th><th>Loại</th><th className="right">Số lượng</th><th className="right">Tồn sau</th><th>Ghi chú</th><th>Người ghi</th></tr></thead>
            <tbody>{moves.data.data.map(m => (
              <tr key={m.id}>
                <td className="nowrap">{dateTimeVN(m.created_at)}</td><td>{m.item.name}</td><td>{types[m.type] ?? m.type}</td>
                <td className="right num" style={{ color: m.quantity < 0 ? 'var(--red-ink)' : 'var(--green-ok)' }}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
                <td className="right num">{m.balance_after}</td><td className="small">{m.note}</td><td>{m.creator?.name ?? 'Hệ thống'}</td>
              </tr>))}</tbody>
          </table></div>
          <Pager page={moves.data.current_page} last={moves.data.last_page} onPage={setPage} />
        </>)}
      </div>
    </div>
  );
}
