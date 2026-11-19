'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, BedDouble, CheckCircle2, ImageUp, Minus, PackageX, Pencil, Plus, Search, ShoppingBag, X } from 'lucide-react';
import { useSession } from '@/components/admin/session';
import { Empty, Notice, useAction, useToast } from '@/components/ui';
import { ApiError, get, post, put } from '@/lib/api';
import { errorText, money } from '@/lib/format';

export type Credit = { title: string; author: string; license: string; license_url: string | null; source: string };
export type Service = {
  id: number; category: string; name: string; description: string | null; image: string | null; image_credit: Credit | null;
  unit: string; price: number; inventory_item_id: number | null; active: boolean; sort: number;
  item: { id: number; name: string; on_hand: number; unit: string; min_stock: number } | null;
};
type InHouse = { id: number; room: { number: string } | null; type: { name: string } | null; booking: { code: string } | null; guests: { full_name: string }[] };
type Method = { code: string; name: string; type: string; active: boolean };
type InvItem = { id: number; name: string; unit: string; on_hand: number };

type Panel = { id: number | 'new'; kind: 'room' | 'sale' | 'edit' } | null;

function StockBadge({ s }: { s: Service }) {
  if (!s.item) return null;
  if (s.item.on_hand <= 0) return <span className="badge b-red"><PackageX aria-hidden />Hết hàng</span>;
  if (s.item.on_hand <= s.item.min_stock) return <span className="badge b-amber"><AlertTriangle aria-hidden />Sắp hết · {s.item.on_hand}</span>;
  return <span className="badge b-sage"><CheckCircle2 aria-hidden />Còn {s.item.on_hand} {s.item.unit}</span>;
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="svc-stepper" role="group" aria-label="Số lượng">
      <button type="button" className="icon-btn" onClick={() => onChange(Math.max(1, value - 1))} aria-label="Giảm"><Minus size={15} /></button>
      <input className="input num" type="number" min={1} max={100} value={value} onChange={e => onChange(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} aria-label="Số lượng" />
      <button type="button" className="icon-btn" onClick={() => onChange(Math.min(100, value + 1))} aria-label="Tăng"><Plus size={15} /></button>
    </div>
  );
}

/** Danh mục dịch vụ dạng thẻ: bấm thẻ → chọn phòng đang ở → ghi phí. */
export function ServiceCatalog({ services, categories, categoryImages, onChanged }: {
  services: Service[]; categories: Record<string, string>; categoryImages: Record<string, string>; onChanged: () => void;
}) {
  const { can } = useSession();
  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [inHouse, setInHouse] = useState<InHouse[] | null>(null);
  const [methods, setMethods] = useState<Method[] | null>(null);
  const [invItems, setInvItems] = useState<InvItem[] | null>(null);
  const [credits, setCredits] = useState<Record<string, Credit>>({});
  // Nguồn/giấy phép của ảnh có sẵn (kể cả ảnh mặc định theo nhóm)
  useEffect(() => { fetch('/images/services/credits.json').then(r => (r.ok ? r.json() : {})).then(setCredits).catch(() => undefined); }, []);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return services.filter(s => (cat === 'all' || s.category === cat) && (!term || s.name.toLowerCase().includes(term) || (s.description ?? '').toLowerCase().includes(term)));
  }, [services, cat, q]);
  const counts = useMemo(() => Object.fromEntries(Object.keys(categories).map(k => [k, services.filter(s => s.category === k).length])), [services, categories]);

  function open(id: number | 'new', kind: 'room' | 'sale' | 'edit') {
    setPanel({ id, kind });
    if (kind === 'room' && inHouse === null) get<InHouse[]>('/admin/stays/in-house').then(setInHouse).catch(() => setInHouse([]));
    if (kind === 'sale' && methods === null) get<Method[]>('/admin/payment-methods').then(m => setMethods(m.filter(x => x.active))).catch(() => setMethods([]));
    if (kind === 'edit' && invItems === null && can('inventory.view')) get<{ items: InvItem[] }>('/admin/inventory').then(r => setInvItems(r.items)).catch(() => setInvItems([]));
  }
  const close = () => setPanel(null);
  const imageOf = (s: Pick<Service, 'image' | 'category'>) => s.image ?? categoryImages[s.category] ?? categoryImages.other;
  const creditOf = (s: Service): Credit | null => {
    if (s.image_credit) return s.image_credit;
    const m = imageOf(s)?.match(/^\/images\/services\/([a-z0-9-]+)\.webp$/);
    return m ? credits[m[1]] ?? null : null;
  };

  return (
    <div className="mod-section">
      <div className="svc-toolbar">
        <div className="svc-chips" role="group" aria-label="Lọc theo nhóm">
          <button type="button" className="svc-chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>Tất cả <span>{services.length}</span></button>
          {Object.entries(categories).filter(([k]) => counts[k]).map(([k, l]) => (
            <button key={k} type="button" className="svc-chip" aria-pressed={cat === k} onClick={() => setCat(k)}>{l} <span>{counts[k]}</span></button>
          ))}
        </div>
        <label className="search svc-search"><Search size={15} aria-hidden /><input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm dịch vụ…" aria-label="Tìm dịch vụ" /></label>
      </div>

      <div className="svc-grid">
        {can('services.manage') && (panel?.id === 'new'
          ? <article className="svc-card svc-card-open"><EditForm service={null} categories={categories} categoryImages={categoryImages} invItems={invItems}
              onDone={() => { close(); onChanged(); }} onCancel={close} /></article>
          : <button type="button" className="svc-card svc-add" onClick={() => open('new', 'edit')}><Plus size={28} aria-hidden /><strong>Thêm dịch vụ</strong><span className="small muted">Ảnh mặc định theo nhóm, đổi được sau</span></button>)}

        {visible.map(s => {
          const isOpen = panel?.id === s.id;
          const credit = creditOf(s);
          return (
            <article key={s.id} className={`svc-card ${isOpen ? 'svc-card-open' : ''} ${s.active ? '' : 'svc-inactive'}`}>
              <div className="svc-media">
                <img src={imageOf(s)} alt={s.name} loading="lazy" width={800} height={600} />
                <span className="svc-cat">{categories[s.category] ?? s.category}</span>
              </div>
              <div className="svc-body">
                <div className="svc-title">
                  <h3>{s.name}</h3>
                  <strong className="svc-price num">{money(s.price)}<span>/{s.unit}</span></strong>
                </div>
                {s.description && <p className="svc-desc">{s.description}</p>}
                <div className="row svc-badges">
                  {!s.active && <span className="badge b-neutral"><Ban aria-hidden />Ngừng cung cấp</span>}
                  <StockBadge s={s} />
                </div>
                {credit && (
                  <a className="svc-credit" href={credit.source} target="_blank" rel="noopener noreferrer">Ảnh: {credit.author} · {credit.license}</a>
                )}
                {!isOpen && (
                  <div className="svc-actions">
                    {s.active && <button type="button" className="btn btn-primary btn-sm" onClick={() => open(s.id, 'room')}><BedDouble size={15} /> Ghi vào phòng</button>}
                    {s.active && can('payments.collect') && <button type="button" className="btn btn-sm" onClick={() => open(s.id, 'sale')}><ShoppingBag size={15} /> Bán lẻ</button>}
                    {can('services.manage') && <button type="button" className="btn btn-sm btn-ghost" onClick={() => open(s.id, 'edit')} aria-label={`Sửa ${s.name}`}><Pencil size={15} /></button>}
                  </div>
                )}
                {isOpen && panel?.kind === 'room' && <RoomForm service={s} stays={inHouse} onDone={() => { close(); onChanged(); }} onCancel={close} />}
                {isOpen && panel?.kind === 'sale' && <SaleForm service={s} methods={methods} onDone={() => { close(); onChanged(); }} onCancel={close} />}
                {isOpen && panel?.kind === 'edit' && <EditForm service={s} categories={categories} categoryImages={categoryImages} invItems={invItems}
                  onDone={() => { close(); onChanged(); }} onCancel={close} />}
              </div>
            </article>
          );
        })}
      </div>
      {!visible.length && <div className="card"><Empty title={services.length ? 'Không có dịch vụ phù hợp' : 'Chưa có dịch vụ'}>{services.length ? 'Thử bỏ bộ lọc hoặc từ khóa.' : 'Bấm “Thêm dịch vụ” để tạo.'}</Empty></div>}
    </div>
  );
}

function PanelHead({ title, onCancel }: { title: string; onCancel: () => void }) {
  return <div className="row-between"><h4>{title}</h4><button type="button" className="icon-btn" onClick={onCancel} aria-label="Đóng"><X size={16} /></button></div>;
}

function RoomForm({ service, stays, onDone, onCancel }: { service: Service; stays: InHouse[] | null; onDone: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [stayId, setStayId] = useState<number | ''>('');
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const total = service.price * qty;
  const stay = stays?.find(x => x.id === stayId);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!stayId) return;
    setBusy(true);
    try {
      await post(`/admin/stays/${stayId}/services`, { service_id: service.id, quantity: qty, note: note || undefined });
      toast('ok', `Đã ghi ${money(total)} (${service.name} ×${qty}) vào phòng ${stay?.room?.number ?? ''}.`);
      onDone();
    } catch (err) {
      toast('error', errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="inline-form svc-panel" onSubmit={submit}>
      <PanelHead title="Ghi vào phòng đang ở" onCancel={onCancel} />
      {stays === null ? <p className="small muted">Đang tải danh sách phòng…</p> : stays.length === 0 ? <Notice kind="info">Hiện không có phòng nào đang có khách.</Notice> : (
        <label className="field"><span>Phòng</span>
          <select className="select" value={stayId} onChange={e => setStayId(Number(e.target.value) || '')} required autoFocus>
            <option value="">— Chọn phòng —</option>
            {stays.map(st => <option key={st.id} value={st.id}>Phòng {st.room?.number ?? '?'} · {st.guests[0]?.full_name ?? st.booking?.code ?? ''}</option>)}
          </select></label>
      )}
      <div className="row-between"><Stepper value={qty} onChange={setQty} /><strong className="num">{money(total)}</strong></div>
      {service.item && qty > service.item.on_hand && <Notice kind="warn">Tồn kho chỉ còn {service.item.on_hand} {service.item.unit}.</Notice>}
      <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Ghi chú (tùy chọn)" maxLength={200} />
      <button className="btn btn-primary btn-block" disabled={busy || !stayId}>{busy ? 'Đang ghi…' : 'Ghi phí'}</button>
    </form>
  );
}

function SaleForm({ service, methods, onDone, onCancel }: { service: Service; methods: Method[] | null; onDone: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [qty, setQty] = useState(1);
  const [method, setMethod] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [shiftError, setShiftError] = useState('');
  const chosen = method || methods?.[0]?.code || '';
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setShiftError('');
    try {
      await post('/admin/services/walk-in', { service_id: service.id, quantity: qty, method: chosen, customer_name: name || undefined });
      toast('ok', `Đã thu ${money(service.price * qty)} — bán lẻ ${service.name} ×${qty}.`);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setShiftError(err.message);
      else toast('error', errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="inline-form svc-panel" onSubmit={submit}>
      <PanelHead title="Bán lẻ — thu tiền ngay" onCancel={onCancel} />
      <div className="row-between"><Stepper value={qty} onChange={setQty} /><strong className="num">{money(service.price * qty)}</strong></div>
      <label className="field"><span>Phương thức</span>
        <select className="select" value={chosen} onChange={e => setMethod(e.target.value)} required>
          {(methods ?? []).map(m => <option key={m.code} value={m.code}>{m.name}</option>)}
        </select></label>
      <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Tên khách (tùy chọn)" maxLength={120} />
      {shiftError && <Notice kind="warn">{shiftError} <Link href="/admin/tai-chinh">Mở ca tại Tài chính →</Link></Notice>}
      <button className="btn btn-primary btn-block" disabled={busy || !chosen}>{busy ? 'Đang ghi…' : 'Thu tiền & ghi nhận'}</button>
    </form>
  );
}

function EditForm({ service, categories, categoryImages, invItems, onDone, onCancel }: {
  service: Service | null; categories: Record<string, string>; categoryImages: Record<string, string>; invItems: InvItem[] | null; onDone: () => void; onCancel: () => void;
}) {
  const { can } = useSession();
  const { busy, run } = useAction();
  const toast = useToast();
  const [category, setCategory] = useState(service?.category ?? 'other');
  const [image, setImage] = useState<string | null>(service?.image ?? null);
  const [uploading, setUploading] = useState(false);
  const preview = image ?? categoryImages[category] ?? categoryImages.other;

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await post<{ url: string }>('/admin/setup/upload', fd);
      setImage(r.url);
    } catch (err) {
      toast('error', errorText(err));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      category, name: String(f.get('name') ?? ''), unit: String(f.get('unit') ?? ''), price: Number(f.get('price')),
      description: String(f.get('description') ?? '') || null, active: f.get('active') === 'on',
      inventory_item_id: f.get('inventory_item_id') ? Number(f.get('inventory_item_id')) : null,
      ...(image !== (service?.image ?? null) ? { image } : {}),
    };
    const ok = await run(() => service ? put(`/admin/services/${service.id}`, body) : post('/admin/services', body), service ? 'Đã lưu dịch vụ.' : 'Đã thêm dịch vụ.');
    if (ok !== undefined) onDone();
  }

  return (
    <form className="inline-form svc-panel" onSubmit={submit}>
      <PanelHead title={service ? `Sửa: ${service.name}` : 'Dịch vụ mới'} onCancel={onCancel} />
      <div className="svc-edit-media">
        <img src={preview} alt="Ảnh xem trước" width={800} height={600} />
        <div className="stack-sm">
          {can('rooms.manage') && (
            <label className="btn btn-sm"><ImageUp size={15} /> {uploading ? 'Đang tải…' : 'Tải ảnh lên'}
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const file = e.target.files?.[0]; if (file) upload(file); }} /></label>
          )}
          {image && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setImage(null)}>Dùng ảnh mặc định của nhóm</button>}
          {!image && <span className="tiny muted">Đang dùng ảnh mặc định của nhóm.</span>}
        </div>
      </div>
      <label className="field"><span>Tên dịch vụ</span><input className="input" name="name" defaultValue={service?.name} required maxLength={160} /></label>
      <div className="form-grid">
        <label className="field"><span>Nhóm</span><select className="select" value={category} onChange={e => setCategory(e.target.value)}>
          {Object.entries(categories).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field"><span>Đơn giá (đ)</span><input className="input num" type="number" min={0} step={1000} name="price" defaultValue={service?.price} required /></label>
        <label className="field"><span>Đơn vị</span><input className="input" name="unit" defaultValue={service?.unit ?? 'lần'} required maxLength={30} /></label>
        {can('inventory.view') && <label className="field"><span>Trừ kho</span><select className="select" name="inventory_item_id" defaultValue={service?.inventory_item_id ?? ''}>
          <option value="">Không trừ kho</option>{(invItems ?? []).map(i => <option key={i.id} value={i.id}>{i.name} (tồn {i.on_hand})</option>)}</select></label>}
      </div>
      <label className="field"><span>Mô tả ngắn</span><textarea className="textarea" name="description" defaultValue={service?.description ?? ''} maxLength={300} rows={2} /></label>
      <label className="check"><input type="checkbox" name="active" defaultChecked={service?.active ?? true} /> Đang cung cấp</label>
      <button className="btn btn-primary btn-block" disabled={busy || uploading}>Lưu</button>
    </form>
  );
}
