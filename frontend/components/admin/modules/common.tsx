'use client';

import { ReactNode, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import '@/app/admin/modules.css';

export type Paged<T> = { data: T[]; current_page: number; last_page: number; total?: number };

export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: { key: K; label: string; show?: boolean }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="tabs no-print" role="tablist">
      {tabs.filter(t => t.show !== false).map(t => (
        <button key={t.key} role="tab" className="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}>{t.label}</button>
      ))}
    </div>
  );
}

export function Pager({ page, last, onPage }: { page: number; last: number; onPage: (p: number) => void }) {
  if (last <= 1) return null;
  return (
    <div className="pager no-print">
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /> Trước</button>
      <span className="small muted">Trang {page}/{last}</span>
      <button className="btn btn-sm" disabled={page >= last} onClick={() => onPage(page + 1)}>Sau <ChevronRight size={14} /></button>
    </div>
  );
}

/** Ô nhập lý do ngay tại chỗ (không mở popup). */
export function ReasonForm({ label, placeholder = 'Lý do', confirm, busy, onSubmit, onCancel, danger, extra }: {
  label: string; placeholder?: string; confirm: string; busy?: boolean; danger?: boolean; extra?: ReactNode;
  onSubmit: (reason: string) => void; onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <form className="inline-form" onSubmit={e => { e.preventDefault(); if (reason.trim().length >= 3) onSubmit(reason.trim()); }}>
      <h4>{label}</h4>
      {extra}
      <input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder={placeholder} minLength={3} required autoFocus />
      <div className="row">
        <button className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy || reason.trim().length < 3}>{confirm}</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>Hủy</button>
      </div>
    </form>
  );
}

/** Đọc FormData thành object, chuyển số cho các khóa chỉ định, checkbox thành boolean. */
export function formValues(form: HTMLFormElement, numbers: string[] = [], bools: string[] = []) {
  const fd = new FormData(form);
  const out: Record<string, unknown> = {};
  fd.forEach((v, k) => { out[k] = v; });
  for (const k of numbers) if (k in out) out[k] = out[k] === '' ? null : Number(out[k]);
  for (const k of bools) out[k] = fd.get(k) === 'on' || fd.get(k) === '1';
  for (const [k, v] of Object.entries(out)) if (v === '' && !numbers.includes(k)) out[k] = null;
  return out;
}

export function Money({ v }: { v: number | null | undefined }) {
  return <span className="num nowrap">{v == null ? '—' : `${new Intl.NumberFormat('vi-VN').format(v)}đ`}</span>;
}
