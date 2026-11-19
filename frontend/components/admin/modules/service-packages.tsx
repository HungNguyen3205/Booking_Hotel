'use client';

import { useState } from 'react';
import { Layers, Pencil, Plus } from 'lucide-react';
import { Can } from '@/components/admin/session';
import { Empty, useAction } from '@/components/ui';
import { post, put } from '@/lib/api';
import { money } from '@/lib/format';
import { formValues } from './common';

export type Pkg = { id: number; name: string; description: string | null; price: number; items: { service_id: number; quantity: number }[]; active: boolean };

/** Combo Hotel–Spa–Coffee–Yoga (giai đoạn 3): chỉ lưu cấu hình, chưa bán trực tiếp. */
export function PackagesPanel({ packages, services, onChanged }: { packages: Pkg[]; services: { id: number; name: string }[]; onChanged: () => void }) {
  const { busy, run } = useAction();
  const [pkgEdit, setPkgEdit] = useState<Pkg | 'new' | null>(null);
  const [pkgItems, setPkgItems] = useState<{ service_id: number; quantity: number }[]>([]);
  return (
    <div className="card">
      <div className="card-head"><h2><Layers size={15} /> Combo Hotel – Spa – Coffee – Yoga</h2><span className="badge b-neutral">Giai đoạn 3 — chưa bán trực tiếp</span></div>
      <div className="card-pad stack">
        <p className="small muted">Lưu cấu hình combo để chuẩn bị mở rộng. Combo chưa được bán qua đặt phòng hay website.</p>
        {!packages.length && <Empty title="Chưa có combo" />}
        {packages.map(p => (
          <div key={p.id} className="row-between" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
            <div><strong>{p.name}</strong> <span className="muted small">{money(p.price)} · {p.items.map(i => `${services.find(s => s.id === i.service_id)?.name ?? '#' + i.service_id} ×${i.quantity}`).join(', ')}</span></div>
            <Can perm="services.manage"><button className="btn btn-sm btn-ghost" onClick={() => { setPkgEdit(p); setPkgItems(p.items); }}><Pencil size={14} /> Sửa</button></Can>
          </div>
        ))}
        <Can perm="services.manage">{!pkgEdit && <div><button className="btn btn-sm" onClick={() => { setPkgEdit('new'); setPkgItems([]); }}><Plus size={14} /> Thêm combo</button></div>}</Can>
        {pkgEdit && (
          <form className="inline-form" onSubmit={async e => {
            e.preventDefault();
            const body = { ...formValues(e.currentTarget, ['price'], ['active']), items: pkgItems };
            const ok = await run(() => pkgEdit === 'new' ? post('/admin/service-packages', body) : put(`/admin/service-packages/${pkgEdit.id}`, body), 'Đã lưu combo');
            if (ok !== undefined) { setPkgEdit(null); onChanged(); }
          }}>
            <div className="form-grid">
              <label className="field"><span>Tên combo</span><input className="input" name="name" defaultValue={pkgEdit === 'new' ? '' : pkgEdit.name} required /></label>
              <label className="field"><span>Giá combo (đ)</span><input className="input" type="number" min={0} name="price" defaultValue={pkgEdit === 'new' ? '' : pkgEdit.price} required /></label>
            </div>
            <textarea className="textarea" name="description" defaultValue={pkgEdit === 'new' ? '' : pkgEdit.description ?? ''} placeholder="Mô tả" />
            <div className="stack-sm">
              {pkgItems.map((it, i) => (
                <div key={i} className="row">
                  <select className="select" style={{ width: 'auto' }} value={it.service_id} onChange={e => setPkgItems(l => l.map((x, j) => j === i ? { ...x, service_id: Number(e.target.value) } : x))}>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  <input className="input" style={{ width: 90 }} type="number" min={1} value={it.quantity} onChange={e => setPkgItems(l => l.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} />
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPkgItems(l => l.filter((_, j) => j !== i))}>Bỏ</button>
                </div>
              ))}
              <div><button type="button" className="btn btn-sm" disabled={!services.length} onClick={() => setPkgItems(l => [...l, { service_id: services[0].id, quantity: 1 }])}><Plus size={14} /> Thêm dịch vụ vào combo</button></div>
            </div>
            <label className="check"><input type="checkbox" name="active" defaultChecked={pkgEdit !== 'new' && pkgEdit.active} /> Đánh dấu sẵn sàng (vẫn chưa bán trực tiếp)</label>
            <div className="row"><button className="btn btn-primary btn-sm" disabled={busy || !pkgItems.length}>Lưu combo</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setPkgEdit(null)}>Hủy</button></div>
          </form>
        )}
      </div>
    </div>
  );
}
