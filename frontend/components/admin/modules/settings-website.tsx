'use client';

import { useState } from 'react';
import { ExternalLink, FileText, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { Empty, ErrorState, Loading, useAction, useLoad } from '@/components/ui';
import { api, get, post, put } from '@/lib/api';
import { dateVN } from '@/lib/format';
import { formValues } from './common';
import { SaveCard, useSettings } from './settings-hotel';

type Post = { id: number; type: 'article' | 'offer'; slug: string; title: string; excerpt: string | null; body: string; cover: string | null; cover_alt: string | null;
  valid_from: string | null; valid_to: string | null; status: 'draft' | 'published'; published_at: string | null };

export function WebsiteSetup() {
  const s = useSettings();
  const posts = useLoad(() => get<Post[]>('/admin/setup/posts'), []);
  const { busy, run } = useAction();
  const [amenities, setAmenities] = useState<{ icon: string; title: string; text: string }[] | null>(null);
  const [gallery, setGallery] = useState<{ url: string; alt: string }[] | null>(null);
  const [edit, setEdit] = useState<Post | 'new' | null>(null);
  const [cover, setCover] = useState('');

  if (s.loading) return <Loading />;
  if (s.error || !s.data) return <ErrorState error={s.error} onRetry={s.reload} />;
  const site = s.data.settings.site;
  const am = amenities ?? site.amenities;
  const gal = gallery ?? site.gallery;

  async function uploadTo(cb: (url: string) => void, file: File) {
    const fd = new FormData(); fd.append('file', file);
    const r = await run(() => api<{ url: string }>('/admin/setup/media', 'POST', fd), 'Đã tải ảnh — nhập mô tả (alt)');
    if (r) cb(r.url);
  }

  return (
    <div className="mod-section">
      <SaveCard title="Nội dung trang chủ & giới thiệu" busy={busy} onSubmit={async f => {
        const body = { ...formValues(f), amenities: am, gallery: gal };
        const ok = await run(() => put('/admin/setup/settings/site', body), 'Đã lưu nội dung website');
        if (ok !== undefined) { setAmenities(null); setGallery(null); s.reload(true); }
      }} note={<p className="small muted">Chỉ đăng thông tin thực tế đã xác nhận. Ảnh cần mô tả (alt) để hỗ trợ người dùng và công cụ tìm kiếm. <a href="/" target="_blank" rel="noreferrer"><ExternalLink size={12} /> Xem website</a></p>}>
        <div className="form-grid">
          <label className="field"><span>Tagline</span><input className="input" name="tagline" defaultValue={site.tagline} /></label>
          <label className="field"><span>Tiêu đề hero</span><input className="input" name="hero_title" defaultValue={site.hero_title} /></label>
          <label className="field"><span>Liên kết bản đồ</span><input className="input" type="url" name="map_url" defaultValue={site.map_url} /></label>
          <label className="field"><span>Zalo</span><input className="input" name="zalo" defaultValue={site.zalo} /></label>
          <label className="field"><span>Facebook (URL)</span><input className="input" type="url" name="facebook" defaultValue={site.facebook} /></label>
        </div>
        <label className="field"><span>Mô tả hero</span><input className="input" name="hero_subtitle" defaultValue={site.hero_subtitle} /></label>
        <label className="field"><span>Giới thiệu</span><textarea className="textarea" rows={5} name="about" defaultValue={site.about} /></label>
        <div className="stack-sm">
          <strong className="small">Tiện ích</strong>
          {am.map((a, i) => (
            <div key={i} className="row">
              <select className="select" style={{ width: 120 }} value={a.icon} onChange={e => setAmenities(am.map((x, j) => j === i ? { ...x, icon: e.target.value } : x))}>
                {['spa', 'coffee', 'yoga', 'kids', 'wifi', 'car', 'food', 'other'].map(k => <option key={k} value={k}>{k}</option>)}</select>
              <input className="input" style={{ width: 220 }} value={a.title} required placeholder="Tên tiện ích" onChange={e => setAmenities(am.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
              <input className="input grow" value={a.text} placeholder="Mô tả" onChange={e => setAmenities(am.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} />
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAmenities(am.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
            </div>))}
          <div><button type="button" className="btn btn-sm" onClick={() => setAmenities([...am, { icon: 'other', title: '', text: '' }])}><Plus size={14} /> Thêm tiện ích</button></div>
        </div>
        <div className="stack-sm">
          <strong className="small">Thư viện ảnh</strong>
          {gal.map((g, i) => (
            <div key={i} className="row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.url} alt={g.alt} className="mod-thumb" />
              <input className="input" style={{ width: 240 }} value={g.url} onChange={e => setGallery(gal.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
              <input className="input grow" value={g.alt} required placeholder="Mô tả ảnh (alt)" onChange={e => setGallery(gal.map((x, j) => j === i ? { ...x, alt: e.target.value } : x))} />
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setGallery(gal.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
            </div>))}
          <label className="btn btn-sm" style={{ width: 'fit-content' }}><ImagePlus size={14} /> Tải ảnh lên
            <input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f) uploadTo(url => setGallery([...gal, { url, alt: '' }]), f); e.target.value = ''; }} /></label>
        </div>
      </SaveCard>

      <div className="card">
        <div className="card-head"><h2><FileText size={15} /> Bài viết & ưu đãi</h2><button className="btn btn-sm" onClick={() => { setEdit('new'); setCover(''); }}><Plus size={14} /> Viết bài</button></div>
        {edit && (
          <div className="card-pad"><form className="inline-form" onSubmit={async e => {
            e.preventDefault();
            const body = formValues(e.currentTarget);
            const ok = await run(() => edit === 'new' ? post('/admin/setup/posts', body) : put(`/admin/setup/posts/${edit.id}`, body), 'Đã lưu bài');
            if (ok !== undefined) { setEdit(null); posts.reload(true); }
          }}>
            <div className="form-grid">
              <label className="field"><span>Loại</span><select className="select" name="type" defaultValue={edit === 'new' ? 'article' : edit.type}><option value="article">Bài viết</option><option value="offer">Ưu đãi</option></select></label>
              <label className="field"><span>Tiêu đề</span><input className="input" name="title" defaultValue={edit === 'new' ? '' : edit.title} required /></label>
              <label className="field"><span>Đường dẫn (để trống tự tạo)</span><input className="input" name="slug" defaultValue={edit === 'new' ? '' : edit.slug} pattern="[a-z0-9-]+" /></label>
              <label className="field"><span>Trạng thái</span><select className="select" name="status" defaultValue={edit === 'new' ? 'draft' : edit.status}><option value="draft">Bản nháp</option><option value="published">Xuất bản</option></select></label>
              <label className="field"><span>Hiệu lực từ (ưu đãi)</span><input className="input" type="date" name="valid_from" defaultValue={edit === 'new' ? '' : edit.valid_from?.slice(0, 10) ?? ''} /></label>
              <label className="field"><span>Hiệu lực đến (ưu đãi)</span><input className="input" type="date" name="valid_to" defaultValue={edit === 'new' ? '' : edit.valid_to?.slice(0, 10) ?? ''} /></label>
            </div>
            <label className="field"><span>Tóm tắt (meta description)</span><input className="input" name="excerpt" maxLength={300} defaultValue={edit === 'new' ? '' : edit.excerpt ?? ''} /></label>
            <label className="field"><span>Nội dung (đoạn cách nhau bằng dòng trống)</span><textarea className="textarea" rows={10} name="body" required defaultValue={edit === 'new' ? '' : edit.body} /></label>
            <div className="form-grid">
              <label className="field"><span>Ảnh bìa (URL)</span><input className="input" name="cover" value={cover} onChange={e => setCover(e.target.value)} /></label>
              <label className="field"><span>Mô tả ảnh bìa (alt)</span><input className="input" name="cover_alt" required={!!cover} defaultValue={edit === 'new' ? '' : edit.cover_alt ?? ''} /></label>
            </div>
            <label className="btn btn-sm" style={{ width: 'fit-content' }}><ImagePlus size={14} /> Tải ảnh bìa
              <input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f) uploadTo(setCover, f); e.target.value = ''; }} /></label>
            <div className="row"><button className="btn btn-primary btn-sm" disabled={busy}>Lưu bài</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(null)}>Hủy</button></div>
          </form></div>
        )}
        {posts.loading ? <Loading /> : posts.error ? <ErrorState error={posts.error} onRetry={posts.reload} /> : !posts.data?.length ? <Empty title="Chưa có bài viết" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Tiêu đề</th><th>Loại</th><th>Trạng thái</th><th>Xuất bản</th><th /></tr></thead>
            <tbody>{posts.data.map(p => <tr key={p.id}>
              <td><strong>{p.title}</strong><div className="tiny muted">/{p.type === 'offer' ? 'uu-dai' : 'bai-viet'}/{p.slug}</div></td>
              <td>{p.type === 'offer' ? 'Ưu đãi' : 'Bài viết'}</td>
              <td>{p.status === 'published' ? <span className="badge b-sage">Đã xuất bản</span> : <span className="badge b-neutral">Bản nháp</span>}</td>
              <td>{dateVN(p.published_at)}</td>
              <td className="right"><button className="btn btn-sm btn-ghost" onClick={() => { setEdit(p); setCover(p.cover ?? ''); }}><Pencil size={14} /> Sửa</button></td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
