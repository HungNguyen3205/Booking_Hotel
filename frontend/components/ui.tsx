'use client';

import { AlertTriangle, CheckCircle2, Info, Inbox, RefreshCw, XCircle } from 'lucide-react';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { errorText } from '@/lib/format';

export function Loading({ label = 'Đang tải…' }: { label?: string }) {
  return <div className="state" role="status" aria-live="polite"><div className="spinner" /><span>{label}</span></div>;
}

export function Empty({ title = 'Chưa có dữ liệu', children }: { title?: string; children?: ReactNode }) {
  return <div className="state"><Inbox size={28} aria-hidden /><strong>{title}</strong>{children && <div className="small">{children}</div>}</div>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <XCircle size={28} aria-hidden />
      <strong>Không tải được dữ liệu</strong>
      <span className="small">{errorText(error)}</span>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}><RefreshCw size={14} /> Thử lại</button>}
    </div>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'ok' | 'warn' | 'error'; children: ReactNode }) {
  const Icon = { info: Info, ok: CheckCircle2, warn: AlertTriangle, error: XCircle }[kind];
  return <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}><Icon size={16} aria-hidden /><div>{children}</div></div>;
}

/** Tải dữ liệu với đủ trạng thái loading / lỗi / thử lại. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(async (silent = false) => {
    const id = ++seq.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await loader();
      if (id === seq.current) setData(result);
    } catch (e) {
      if (id === seq.current) setError(e);
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

// ---------- Toast ----------
type ToastItem = { id: number; kind: 'ok' | 'error' | 'warn' | 'info'; text: string };
const ToastCtx = createContext<(kind: ToastItem['kind'], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastItem['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems(list => [...list, { id, kind, text }]);
    setTimeout(() => setItems(list => list.filter(t => t.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map(t => <div key={t.id} className="toast"><Notice kind={t.kind}>{t.text}</Notice></div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/** Chạy một thao tác ghi: khóa nút, báo thành công/lỗi. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      const result = await fn();
      if (success) toast('ok', success);
      return result;
    } catch (e) {
      toast('error', errorText(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return { busy, run };
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && !error && <small>{hint}</small>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
