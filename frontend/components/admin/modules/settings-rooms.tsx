'use client';

import { PointerEvent as RPointerEvent, useMemo, useRef, useState } from 'react';
import { Archive, ArchiveRestore, ImagePlus, Pencil, Plus, Save, Trash2, Undo2, Wrench } from 'lucide-react';
import { useSession } from '@/components/admin/session';
import { AvailabilityBadge } from '@/components/admin/badges';
import { Empty, ErrorState, Loading, Notice, useAction, useLoad } from '@/components/ui';
import { api, del, get, post, put } from '@/lib/api';
import { addDays, dateVN, money, todayISO } from '@/lib/format';
import { ReasonForm, formValues } from './common';

type Landmark = { type: string; label: string; x: number; y: number; w: number; h: number };
type Floor = { id: number; name: string; level: number; map_width: number; map_height: number; landmarks: Landmark[] | null; layout_confirmed: boolean };
type RoomType = { id: number; code: string; slug: string; name: string; short_description: string | null; description: string | null; area: number; bed: string | null;
  base_adults: number; max_adults: number; max_children: number; max_occupancy: number; max_extra_beds: number; base_rate: number; hourly_rate: number | null;
  amenities: string[] | null; images: { url: string; alt: string }[] | null; seo_title: string | null; seo_description: string | null; active: boolean; public: boolean; sort: number; rooms_count: number };
type Room = { id: number; number: string; floor_id: number; room_type_id: number; wing: string | null; map_x: number; map_y: number; map_w: number; map_h: number;
  door_side: string; sort: number; notes: string | null; archived_at: string | null; type: { name: string; code: string } };
type Block = { id: number; room_id: number; type: string; start_date: string; end_date: string; reason: string; room: { number: string } };
type Data = { floors: Floor[]; room_types: RoomType[]; rooms: Room[]; blocks: Block[] };

const LANDMARK_TYPES: Record<string, string> = { stairs: 'Cầu thang', elevator: 'Thang máy', entrance: 'Lối vào', facade: 'Mặt tiền', courtyard: 'Sân trong/khoảng giữa',
  corridor: 'Hành lang', reception: 'Lễ tân', service: 'Khu phục vụ', other: 'Khác' };
const LANDMARK_FILL: Record<string, string> = { corridor: '#efece5', courtyard: '#f4f6f2', stairs: '#e8e4da', elevator: '#e8e4da', entrance: '#e2ecf5', facade: '#f3ebdc', reception: '#e2ecf5', service: '#ece9e3', other: '#efece5' };
const WINGS: Record<string, string> = { left: 'Cánh trái', base: 'Đáy chữ U', right: 'Cánh phải' };
const DOORS: Record<string, string> = { n: 'Bắc (trên)', s: 'Nam (dưới)', e: 'Đông (phải)', w: 'Tây (trái)' };

export function RoomsSetup() {
  const { can } = useSession();
  const d = useLoad(() => get<Data>('/admin/setup/rooms'), []);
  if (d.loading) return <Loading />;
  if (d.error || !d.data) return <ErrorState error={d.error} onRetry={d.reload} />;
  const reload = () => d.reload(true);
  return (
    <div className="mod-section">
      <FloorsAndLayout data={d.data} reload={reload} canManage={can('rooms.manage')} />
      <RoomTypes types={d.data.room_types} reload={reload} canManage={can('rooms.manage')} />
      <Rooms data={d.data} reload={reload} canManage={can('rooms.manage')} />
      <Blocks data={d.data} reload={reload} canManage={can('maintenance.manage')} />
    </div>
  );
}

// ---------------- Tầng + sơ đồ ----------------
function FloorsAndLayout({ data, reload, canManage }: { data: Data; reload: () => void; canManage: boolean }) {
  const { busy, run } = useAction();
  const [floorId, setFloorId] = useState<number | null>(data.floors[0]?.id ?? null);
  const floor = data.floors.find(f => f.id === floorId) ?? null;
  const [editFloor, setEditFloor] = useState<Floor | 'new' | null>(null);
  const [marks, setMarks] = useState<Landmark[]>([]);
  const [draft, setDraft] = useState<Record<number, Partial<Room>>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);

  const rooms = useMemo(() => data.rooms.filter(r => r.floor_id === floorId && !r.archived_at).map(r => ({ ...r, ...draft[r.id] })), [data.rooms, floorId, draft]);
  const sel = rooms.find(r => r.id === selected);
  const dirty = Object.keys(draft).length > 0;
  const setRoom = (id: number, patch: Partial<Room>) => setDraft(d => ({ ...d, [id]: { ...d[id], ...patch } }));

  const toSvg = (e: RPointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };
  const snap = (v: number) => Math.max(0, Math.round(v / 10) * 10);

  function openFloorEditor(f: Floor | 'new') { setEditFloor(f); setMarks(f === 'new' ? [] : (f.landmarks ?? []).map(m => ({ ...m }))); }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Tầng & sơ đồ chữ U</h2>
        <div className="row">
          <div className="tabs">{data.floors.map(f => <button key={f.id} className="tab" aria-selected={f.id === floorId} onClick={() => { setFloorId(f.id); setSelected(null); }}>{f.name}</button>)}</div>
          {canManage && <button className="btn btn-sm" onClick={() => openFloorEditor('new')}><Plus size={14} /> Tầng</button>}
        </div>
      </div>
      <div className="card-pad stack">
        {!floor ? <Empty title="Chưa có tầng" /> : <>
          {!floor.layout_confirmed && <Notice kind="warn"><strong>Sơ đồ minh họa — chưa khớp mặt bằng thực tế.</strong> Vị trí phòng, cầu thang, lối vào chỉ là giả định. Khi có bản vẽ, chỉnh lại và đánh dấu “Đã khớp mặt bằng thực tế”.</Notice>}
          <div className="mod-split">
            <div className="stack-sm">
              <svg ref={svgRef} className="mod-svg" viewBox={`0 0 ${floor.map_width} ${floor.map_height}`} role="img" aria-label={`Sơ đồ ${floor.name}`}
                onPointerMove={e => { if (!drag.current) return; const p = toSvg(e); setRoom(drag.current.id, { map_x: snap(p.x - drag.current.dx), map_y: snap(p.y - drag.current.dy) }); }}
                onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
                {(floor.landmarks ?? []).map((m, i) => (
                  <g key={i}><rect x={m.x} y={m.y} width={m.w} height={m.h} fill={LANDMARK_FILL[m.type] ?? '#efece5'} stroke="#d8d2c4" strokeDasharray={m.type === 'courtyard' ? '6 4' : undefined} rx={4} />
                    <text x={m.x + m.w / 2} y={m.y + m.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={13} fill="#6b7a74">{m.label}</text></g>
                ))}
                {rooms.map(r => (
                  <g key={r.id} className="room" onPointerDown={e => {
                    setSelected(r.id);
                    if (!canManage) return;
                    const p = toSvg(e); drag.current = { id: r.id, dx: p.x - r.map_x, dy: p.y - r.map_y };
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                  }}>
                    <rect x={r.map_x} y={r.map_y} width={r.map_w} height={r.map_h} rx={5} fill={r.id === selected ? '#e3ebe1' : '#fffdf9'}
                      stroke={r.id === selected ? '#233d35' : draft[r.id] ? '#b49563' : '#cfc8b9'} strokeWidth={r.id === selected ? 2.5 : 1.5} />
                    <DoorMark r={r} />
                    <text x={r.map_x + r.map_w / 2} y={r.map_y + r.map_h / 2 - 6} textAnchor="middle" fontSize={20} fontWeight={700} fill="#233d35">{r.number}</text>
                    <text x={r.map_x + r.map_w / 2} y={r.map_y + r.map_h / 2 + 16} textAnchor="middle" fontSize={12} fill="#6b7a74">{r.type.name}</text>
                  </g>
                ))}
              </svg>
              <p className="tiny muted">{canManage ? 'Kéo ô phòng để di chuyển (bước 10). Viền đồng = thay đổi chưa lưu. Cửa phòng là vạch đậm trên cạnh.' : 'Chỉ xem.'}</p>
              {canManage && dirty && <div className="row">
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={async () => {
                  const rows = Object.entries(draft).map(([id, p]) => { const r = data.rooms.find(x => x.id === Number(id))!; const m = { ...r, ...p };
                    return { id: m.id, map_x: m.map_x, map_y: m.map_y, map_w: m.map_w, map_h: m.map_h, door_side: m.door_side, wing: m.wing, floor_id: m.floor_id }; });
                  const ok = await run(() => put('/admin/setup/layout', { rooms: rows }).then(() => true), 'Đã lưu bố cục');
                  if (ok) { setDraft({}); reload(); }
                }}><Save size={14} /> Lưu bố cục ({Object.keys(draft).length} phòng)</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setDraft({})}><Undo2 size={14} /> Bỏ thay đổi</button>
              </div>}
            </div>
            <div className="stack">
              {sel ? (
                <div className="inline-form">
                  <h4>Phòng {sel.number} · {sel.type.name}</h4>
                  <div className="form-grid">
                    {(['map_x', 'map_y', 'map_w', 'map_h'] as const).map(k => (
                      <label key={k} className="field"><span>{{ map_x: 'X', map_y: 'Y', map_w: 'Rộng', map_h: 'Cao' }[k]}</span>
                        <input className="input" type="number" step={10} min={k === 'map_w' ? 40 : k === 'map_h' ? 30 : 0} value={sel[k]} disabled={!canManage}
                          onChange={e => setRoom(sel.id, { [k]: Number(e.target.value) })} /></label>))}
                    <label className="field"><span>Hướng cửa</span><select className="select" value={sel.door_side} disabled={!canManage} onChange={e => setRoom(sel.id, { door_side: e.target.value })}>
                      {Object.entries(DOORS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                    <label className="field"><span>Dãy</span><select className="select" value={sel.wing ?? ''} disabled={!canManage} onChange={e => setRoom(sel.id, { wing: e.target.value || null })}>
                      <option value="">—</option>{Object.entries(WINGS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                  </div>
                </div>
              ) : <p className="small muted">Chọn một ô phòng trên sơ đồ để chỉnh vị trí, kích thước, hướng cửa.</p>}
              <div className="row-between"><strong className="small">{floor.name} · tầng {floor.level} · {floor.map_width}×{floor.map_height}</strong>
                {canManage && <button className="btn btn-sm" onClick={() => openFloorEditor(floor)}><Pencil size={14} /> Mốc & tầng</button>}</div>
            </div>
          </div>
        </>}
        {editFloor && canManage && (
          <form className="inline-form" onSubmit={async e => {
            e.preventDefault();
            const body = { ...formValues(e.currentTarget, ['level', 'map_width', 'map_height'], ['layout_confirmed']), landmarks: marks };
            const ok = await run(() => editFloor === 'new' ? post('/admin/setup/floors', body) : put(`/admin/setup/floors/${editFloor.id}`, body), 'Đã lưu tầng');
            if (ok !== undefined) { setEditFloor(null); reload(); }
          }}>
            <h4>{editFloor === 'new' ? 'Tầng mới' : `Sửa ${editFloor.name}`}</h4>
            <div className="form-grid">
              <label className="field"><span>Tên</span><input className="input" name="name" defaultValue={editFloor === 'new' ? '' : editFloor.name} required /></label>
              <label className="field"><span>Số tầng</span><input className="input" type="number" name="level" defaultValue={editFloor === 'new' ? '' : editFloor.level} required /></label>
              <label className="field"><span>Chiều rộng sơ đồ</span><input className="input" type="number" name="map_width" defaultValue={editFloor === 'new' ? 1000 : editFloor.map_width} required /></label>
              <label className="field"><span>Chiều cao sơ đồ</span><input className="input" type="number" name="map_height" defaultValue={editFloor === 'new' ? 640 : editFloor.map_height} required /></label>
            </div>
            <label className="check"><input type="checkbox" name="layout_confirmed" defaultChecked={editFloor !== 'new' && editFloor.layout_confirmed} /> Đã khớp mặt bằng thực tế (bỏ nhãn “minh họa”)</label>
            <div className="stack-sm">
              <strong className="small">Mốc định hướng (cầu thang, thang máy, lối vào, mặt tiền, sân trong, hành lang…)</strong>
              {marks.map((m, i) => (
                <div key={i} className="row">
                  <select className="select" style={{ width: 150 }} value={m.type} onChange={e => setMarks(l => l.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}>
                    {Object.entries(LANDMARK_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  <input className="input" style={{ width: 200 }} value={m.label} placeholder="Nhãn" onChange={e => setMarks(l => l.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                  {(['x', 'y', 'w', 'h'] as const).map(k => <input key={k} className="input" style={{ width: 74 }} type="number" aria-label={k} value={m[k]}
                    onChange={e => setMarks(l => l.map((x, j) => j === i ? { ...x, [k]: Number(e.target.value) } : x))} />)}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMarks(l => l.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                </div>
              ))}
              <div><button type="button" className="btn btn-sm" onClick={() => setMarks(l => [...l, { type: 'stairs', label: 'Cầu thang', x: 20, y: 20, w: 100, h: 80 }])}><Plus size={14} /> Thêm mốc</button></div>
            </div>
            <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Lưu tầng</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditFloor(null)}>Hủy</button></div>
          </form>
        )}
      </div>
    </div>
  );
}

function DoorMark({ r }: { r: Room }) {
  const len = Math.min(36, Math.min(r.map_w, r.map_h) * 0.4);
  const cx = r.map_x + r.map_w / 2, cy = r.map_y + r.map_h / 2;
  const [x1, y1, x2, y2] = r.door_side === 'n' ? [cx - len / 2, r.map_y, cx + len / 2, r.map_y]
    : r.door_side === 's' ? [cx - len / 2, r.map_y + r.map_h, cx + len / 2, r.map_y + r.map_h]
    : r.door_side === 'e' ? [r.map_x + r.map_w, cy - len / 2, r.map_x + r.map_w, cy + len / 2]
    : [r.map_x, cy - len / 2, r.map_x, cy + len / 2];
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#b49563" strokeWidth={6} strokeLinecap="round" />;
}

// ---------------- Loại phòng ----------------
function RoomTypes({ types, reload, canManage }: { types: RoomType[]; reload: () => void; canManage: boolean }) {
  const { busy, run } = useAction();
  const [edit, setEdit] = useState<RoomType | 'new' | null>(null);
  const [images, setImages] = useState<{ url: string; alt: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    const fd = new FormData(); fd.append('file', file);
    const res = await run(() => api<{ url: string }>('/admin/setup/upload', 'POST', fd), 'Đã tải ảnh — nhập mô tả (alt) cho ảnh');
    if (res) setImages(l => [...l, { url: res.url, alt: '' }]);
    setUploading(false);
  }

  const form = (t: RoomType | null) => (
    <form className="inline-form" onSubmit={async e => {
      e.preventDefault();
      const v = formValues(e.currentTarget, ['area', 'base_adults', 'max_adults', 'max_children', 'max_occupancy', 'max_extra_beds', 'base_rate', 'hourly_rate', 'sort'], ['active', 'public']);
      const body = { ...v, amenities: String(v.amenities ?? '').split(',').map(s => s.trim()).filter(Boolean), images: images.filter(i => i.url) };
      const ok = await run(() => t ? put(`/admin/setup/room-types/${t.id}`, body) : post('/admin/setup/room-types', body), 'Đã lưu loại phòng');
      if (ok !== undefined) { setEdit(null); reload(); }
    }}>
      <h4>{t ? `Sửa: ${t.name}` : 'Loại phòng mới'}</h4>
      <div className="form-grid">
        <label className="field"><span>Mã</span><input className="input" name="code" defaultValue={t?.code} required /></label>
        <label className="field"><span>Tên</span><input className="input" name="name" defaultValue={t?.name} required /></label>
        <label className="field"><span>Đường dẫn (slug)</span><input className="input" name="slug" defaultValue={t?.slug} pattern="[a-z0-9-]+" required /></label>
        <label className="field"><span>Diện tích (m²)</span><input className="input" type="number" name="area" defaultValue={t?.area} required /></label>
        <label className="field"><span>Giường</span><input className="input" name="bed" defaultValue={t?.bed ?? ''} placeholder="Chưa có thông tin thì để trống" /></label>
        <label className="field"><span>Người lớn đã gồm trong giá</span><input className="input" type="number" name="base_adults" defaultValue={t?.base_adults ?? 1} required /></label>
        <label className="field"><span>Người lớn tối đa</span><input className="input" type="number" name="max_adults" defaultValue={t?.max_adults ?? 2} required /></label>
        <label className="field"><span>Trẻ em tối đa</span><input className="input" type="number" name="max_children" defaultValue={t?.max_children ?? 0} required /></label>
        <label className="field"><span>Tổng khách tối đa</span><input className="input" type="number" name="max_occupancy" defaultValue={t?.max_occupancy ?? 2} required /></label>
        <label className="field"><span>Giường phụ tối đa</span><input className="input" type="number" name="max_extra_beds" defaultValue={t?.max_extra_beds ?? 0} required /></label>
        <label className="field"><span>Giá cơ sở/đêm (đ)</span><input className="input" type="number" step={1000} name="base_rate" defaultValue={t?.base_rate} required /></label>
        <label className="field"><span>Giá theo giờ (đ)</span><input className="input" type="number" step={1000} name="hourly_rate" defaultValue={t?.hourly_rate ?? ''} /></label>
        <label className="field"><span>Thứ tự</span><input className="input" type="number" name="sort" defaultValue={t?.sort ?? 0} /></label>
      </div>
      <label className="field"><span>Mô tả ngắn</span><input className="input" name="short_description" defaultValue={t?.short_description ?? ''} maxLength={300} /></label>
      <label className="field"><span>Mô tả chi tiết</span><textarea className="textarea" name="description" defaultValue={t?.description ?? ''} /></label>
      <label className="field"><span>Tiện nghi (phân tách bằng dấu phẩy)</span><input className="input" name="amenities" defaultValue={(t?.amenities ?? []).join(', ')} /></label>
      <div className="form-grid">
        <label className="field"><span>SEO title</span><input className="input" name="seo_title" defaultValue={t?.seo_title ?? ''} /></label>
        <label className="field"><span>SEO description</span><input className="input" name="seo_description" defaultValue={t?.seo_description ?? ''} maxLength={300} /></label>
      </div>
      <div className="stack-sm">
        <strong className="small">Ảnh phòng thực tế (mỗi ảnh cần mô tả alt)</strong>
        {images.map((im, i) => (
          <div key={i} className="row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={im.url} alt={im.alt || 'Ảnh chưa có mô tả'} className="mod-thumb" />
            <input className="input grow" value={im.alt} required placeholder="Mô tả ảnh (alt)" onChange={e => setImages(l => l.map((x, j) => j === i ? { ...x, alt: e.target.value } : x))} />
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setImages(l => l.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </div>
        ))}
        <label className="btn btn-sm" style={{ width: 'fit-content' }}><ImagePlus size={14} /> {uploading ? 'Đang tải…' : 'Tải ảnh (JPG/PNG/WebP ≤ 6MB)'}
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} /></label>
      </div>
      <div className="row">
        <label className="check"><input type="checkbox" name="active" defaultChecked={t?.active ?? true} /> Đang kinh doanh</label>
        <label className="check"><input type="checkbox" name="public" defaultChecked={t?.public ?? true} /> Hiển thị trên website</label>
      </div>
      {t && <label className="field"><span>Lý do (khi đổi giá cơ sở)</span><input className="input" name="reason" placeholder="Ví dụ: điều chỉnh giá mùa thấp điểm" /></label>}
      <div className="row"><button className="btn btn-primary btn-sm" disabled={busy || uploading || images.some(i => !i.alt.trim())}>Lưu</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(null)}>Hủy</button></div>
    </form>
  );

  return (
    <div className="card">
      <div className="card-head"><h2>Loại phòng</h2>{canManage && <button className="btn btn-sm" onClick={() => { setEdit('new'); setImages([]); }}><Plus size={14} /> Thêm</button>}</div>
      {edit === 'new' && <div className="card-pad">{form(null)}</div>}
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Loại</th><th className="right">Diện tích</th><th>Giường</th><th>Sức chứa</th><th className="right">Giá cơ sở</th><th className="right">Số phòng</th><th>Ảnh</th><th>Website</th><th /></tr></thead>
        <tbody>{types.map(t => edit !== 'new' && edit?.id === t.id ? <tr key={t.id}><td colSpan={9}>{form(t)}</td></tr> : (
          <tr key={t.id}>
            <td><strong>{t.name}</strong> <span className="tiny muted">{t.code}</span></td><td className="right num">{t.area} m²</td><td>{t.bed ?? <span className="muted small">Chưa cập nhật</span>}</td>
            <td className="small">{t.max_adults} NL + {t.max_children} TE (tối đa {t.max_occupancy})</td><td className="right num">{money(t.base_rate)}</td><td className="right num">{t.rooms_count}</td>
            <td>{t.images?.length ? `${t.images.length} ảnh` : <span className="badge b-amber">Chưa có ảnh</span>}</td>
            <td>{t.public && t.active ? <span className="badge b-sage">Hiển thị</span> : <span className="badge b-neutral">Ẩn</span>}</td>
            <td className="right">{canManage && <button className="btn btn-sm btn-ghost" onClick={() => { setEdit(t); setImages(t.images ?? []); }}><Pencil size={14} /> Sửa</button>}</td>
          </tr>))}</tbody>
      </table></div>
    </div>
  );
}

// ---------------- Phòng ----------------
function Rooms({ data, reload, canManage }: { data: Data; reload: () => void; canManage: boolean }) {
  const { busy, run } = useAction();
  const [edit, setEdit] = useState<Room | 'new' | null>(null);
  const [archiving, setArchiving] = useState<Room | null>(null);
  const floorName = (id: number) => data.floors.find(f => f.id === id)?.name ?? '—';

  const form = (r: Room | null) => (
    <form className="inline-form" onSubmit={async e => {
      e.preventDefault();
      const body = formValues(e.currentTarget, ['floor_id', 'room_type_id', 'map_x', 'map_y', 'map_w', 'map_h', 'sort']);
      const ok = await run(() => r ? put(`/admin/setup/rooms/${r.id}`, body) : post('/admin/setup/rooms', body), 'Đã lưu phòng');
      if (ok !== undefined) { setEdit(null); reload(); }
    }}>
      <h4>{r ? `Sửa phòng ${r.number}` : 'Phòng mới'}</h4>
      <div className="form-grid">
        <label className="field"><span>Số phòng</span><input className="input" name="number" defaultValue={r?.number} required /></label>
        <label className="field"><span>Tầng</span><select className="select" name="floor_id" defaultValue={r?.floor_id}>{data.floors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label className="field"><span>Loại phòng</span><select className="select" name="room_type_id" defaultValue={r?.room_type_id}>{data.room_types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="field"><span>Dãy</span><select className="select" name="wing" defaultValue={r?.wing ?? ''}><option value="">—</option>{Object.entries(WINGS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field"><span>Hướng cửa</span><select className="select" name="door_side" defaultValue={r?.door_side ?? 's'}>{Object.entries(DOORS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field"><span>X</span><input className="input" type="number" name="map_x" defaultValue={r?.map_x ?? 40} /></label>
        <label className="field"><span>Y</span><input className="input" type="number" name="map_y" defaultValue={r?.map_y ?? 40} /></label>
        <label className="field"><span>Rộng</span><input className="input" type="number" name="map_w" defaultValue={r?.map_w ?? 120} min={40} /></label>
        <label className="field"><span>Cao</span><input className="input" type="number" name="map_h" defaultValue={r?.map_h ?? 90} min={30} /></label>
        <label className="field"><span>Thứ tự</span><input className="input" type="number" name="sort" defaultValue={r?.sort ?? 0} /></label>
      </div>
      <label className="field"><span>Ghi chú</span><input className="input" name="notes" defaultValue={r?.notes ?? ''} /></label>
      <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Lưu</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(null)}>Hủy</button></div>
    </form>
  );

  return (
    <div className="card">
      <div className="card-head"><h2>Phòng ({data.rooms.filter(r => !r.archived_at).length} đang sử dụng)</h2>{canManage && <button className="btn btn-sm" onClick={() => setEdit('new')}><Plus size={14} /> Thêm phòng</button>}</div>
      {edit === 'new' && <div className="card-pad">{form(null)}</div>}
      {archiving && <div className="card-pad"><ReasonForm label={archiving.archived_at ? `Sử dụng lại phòng ${archiving.number}` : `Ngừng sử dụng phòng ${archiving.number}`}
        confirm={archiving.archived_at ? 'Sử dụng lại' : 'Ngừng sử dụng'} danger={!archiving.archived_at} busy={busy} onCancel={() => setArchiving(null)}
        extra={!archiving.archived_at ? <p className="small muted">Phòng đã có giao dịch không bị xóa; chỉ ẩn khỏi bán hàng và sơ đồ. Phòng còn đặt phòng từ hôm nay sẽ bị từ chối.</p> : undefined}
        onSubmit={async reason => { const ok = await run(() => post(`/admin/setup/rooms/${archiving.id}/archive`, { archived: !archiving.archived_at, reason }), 'Đã cập nhật'); if (ok !== undefined) { setArchiving(null); reload(); } }} /></div>}
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Phòng</th><th>Tầng</th><th>Loại</th><th>Dãy</th><th>Trạng thái</th><th /></tr></thead>
        <tbody>{data.rooms.map(r => edit !== 'new' && edit?.id === r.id ? <tr key={r.id}><td colSpan={6}>{form(r)}</td></tr> : (
          <tr key={r.id} style={r.archived_at ? { opacity: .6 } : undefined}>
            <td><strong>{r.number}</strong></td><td>{floorName(r.floor_id)}</td><td>{r.type.name}</td><td>{r.wing ? WINGS[r.wing] : '—'}</td>
            <td>{r.archived_at ? <span className="badge b-neutral"><Archive aria-hidden />Ngừng sử dụng</span> : <span className="badge b-sage">Đang sử dụng</span>}</td>
            <td className="right">{canManage && <div className="mod-actions">
              <button className="btn btn-sm btn-ghost" onClick={() => setEdit(r)}><Pencil size={14} /> Sửa</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setArchiving(r)}>{r.archived_at ? <><ArchiveRestore size={14} /> Dùng lại</> : <><Archive size={14} /> Ngừng</>}</button>
              <button className="btn btn-sm btn-ghost btn-danger" onClick={async () => {
                if (!window.confirm(`Xóa phòng ${r.number}? Chỉ xóa được khi phòng chưa có bất kỳ giao dịch nào.`)) return;
                const ok = await run(() => del(`/admin/setup/rooms/${r.id}`).then(() => true), 'Đã xóa phòng'); if (ok) reload();
              }}><Trash2 size={14} /></button></div>}</td>
          </tr>))}</tbody>
      </table></div>
    </div>
  );
}

// ---------------- Chặn bảo trì / ngừng bán ----------------
function Blocks({ data, reload, canManage }: { data: Data; reload: () => void; canManage: boolean }) {
  const { busy, run } = useAction();
  const [adding, setAdding] = useState(false);
  const [releasing, setReleasing] = useState<number | null>(null);
  return (
    <div className="card">
      <div className="card-head"><h2><Wrench size={15} /> Bảo trì / ngừng bán theo khoảng ngày</h2>{canManage && <button className="btn btn-sm" onClick={() => setAdding(v => !v)}><Plus size={14} /> Chặn phòng</button>}</div>
      {adding && canManage && (
        <div className="card-pad"><form className="inline-form" onSubmit={async e => {
          e.preventDefault();
          const v = formValues(e.currentTarget, ['room_id']);
          const ok = await run(() => post(`/admin/rooms/${v.room_id}/blocks`, v), 'Đã chặn phòng');
          if (ok !== undefined) { setAdding(false); reload(); }
        }}>
          <div className="form-grid">
            <label className="field"><span>Phòng</span><select className="select" name="room_id">{data.rooms.filter(r => !r.archived_at).map(r => <option key={r.id} value={r.id}>{r.number}</option>)}</select></label>
            <label className="field"><span>Loại</span><select className="select" name="type"><option value="maintenance">Bảo trì</option><option value="out_of_service">Ngừng bán</option></select></label>
            <label className="field"><span>Từ ngày</span><input className="input" type="date" name="start_date" defaultValue={todayISO()} required /></label>
            <label className="field"><span>Đến ngày (không gồm)</span><input className="input" type="date" name="end_date" defaultValue={addDays(todayISO(), 1)} required /></label>
          </div>
          <input className="input" name="reason" required minLength={3} placeholder="Lý do" />
          <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Chặn</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Hủy</button></div>
        </form></div>
      )}
      {!data.blocks.length ? <Empty title="Không có phòng đang bị chặn" /> : (
        <div className="list">{data.blocks.map(b => (
          <div key={b.id} className="list-item" style={{ display: 'grid', gap: 6 }}>
            <div className="row-between"><div className="row"><strong>Phòng {b.room.number}</strong><AvailabilityBadge status={b.type} /><span className="small">{dateVN(b.start_date)} → {dateVN(b.end_date)}</span></div>
              {canManage && releasing !== b.id && <button className="btn btn-sm" onClick={() => setReleasing(b.id)}>Mở bán lại</button>}</div>
            <span className="small muted">{b.reason}</span>
            {releasing === b.id && <ReasonForm label="Mở bán lại từ hôm nay" confirm="Mở bán" busy={busy} onCancel={() => setReleasing(null)}
              onSubmit={async reason => { const ok = await run(() => post(`/admin/room-blocks/${b.id}/release`, { reason }), 'Đã mở bán lại'); if (ok !== undefined) { setReleasing(null); reload(); } }} />}
          </div>))}</div>
      )}
    </div>
  );
}
