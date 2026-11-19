'use client';

import { useState } from 'react';
import { Bot, BrushCleaning, CalendarX, CheckCircle2, Clock, Play, UserCheck, Wallet } from 'lucide-react';
import { ErrorState, Loading, Notice, useAction, useLoad, useToast } from '@/components/ui';
import { get, post, put } from '@/lib/api';
import { dateTimeVN, dateVN, errorText } from '@/lib/format';

type Settings = { auto_no_show: boolean; no_show_charge_fee: boolean; daily_stayover_cleaning: boolean; auto_assign_housekeeping: boolean };
type Result = { date: string; holds_released: number; no_shows: number; stayover_tasks: number; assigned: number; errors: string[] };
type Data = { settings: Settings; state: { last_daily: string | null; last_result: Result | null };
  log: { id: number; action: string; summary: string; reason: string | null; created_at: string }[] };

const SWITCHES: { key: keyof Settings; title: string; text: string; icon: typeof Bot; parent?: keyof Settings }[] = [
  { key: 'auto_no_show', icon: CalendarX, title: 'Tự đánh dấu khách không đến',
    text: 'Sang ngày hôm sau mà khách đã xác nhận vẫn chưa nhận phòng, hệ thống chuyển sang "Không đến" và mở bán lại phòng.' },
  { key: 'no_show_charge_fee', icon: Wallet, parent: 'auto_no_show', title: 'Tự ghi phí không đến theo chính sách',
    text: 'Ghi phí vào hồ sơ thanh toán theo % chính sách đã chụp lúc đặt. Tắt nếu muốn quản lý tự quyết định thu phí.' },
  { key: 'daily_stayover_cleaning', icon: BrushCleaning, title: 'Tạo việc dọn hằng ngày cho phòng đang ở',
    text: 'Mỗi ngày, phòng có khách ở tiếp được chuyển "Bẩn" và tạo việc dọn — buồng phòng không phải chờ lễ tân báo.' },
  { key: 'auto_assign_housekeeping', icon: UserCheck, title: 'Tự giao việc dọn phòng',
    text: 'Việc dọn mới (sau trả phòng hoặc hằng ngày) được giao ngay cho nhân viên buồng phòng trong ca đang ít việc nhất.' },
];

const ALWAYS = [
  'Giữ chỗ hết hạn mà chưa cọc: tự hủy và trả phòng về tồn bán.',
  'Thu cọc hoặc ngân hàng báo có (webhook): tự xác nhận đặt phòng.',
  'Khách trả phòng: phòng tự chuyển "Bẩn", tạo việc dọn, hồ sơ thanh toán tự đóng khi đã thu đủ.',
  'Bán minibar/dịch vụ có liên kết kho: tự trừ tồn đúng một lần; hủy khoản phí thì tự hoàn kho.',
  'Sao lưu dữ liệu mỗi đêm (khi máy chủ có lịch chạy).',
];

/** Tự động hóa: để chủ khách sạn hiểu ngay hệ thống đang tự làm gì và bật/tắt từng việc. */
export function AutomationSettings() {
  const d = useLoad(() => get<Data>('/admin/automation'), []);
  const toast = useToast();
  const { busy, run } = useAction();
  const [saving, setSaving] = useState<keyof Settings | null>(null);

  if (d.loading && !d.data) return <Loading />;
  if (d.error || !d.data) return <ErrorState error={d.error} onRetry={() => d.reload()} />;
  const { settings, state, log } = d.data;

  async function toggle(key: keyof Settings, value: boolean) {
    setSaving(key);
    try {
      const next = await put<Settings>('/admin/setup/settings/automation', { ...settings, [key]: value });
      d.setData({ ...d.data!, settings: { ...settings, ...next } });
      toast('ok', `${value ? 'Đã bật' : 'Đã tắt'}: ${SWITCHES.find(s => s.key === key)?.title}.`);
    } catch (err) {
      toast('error', errorText(err));
    } finally {
      setSaving(null);
    }
  }

  const r = state.last_result;
  return (
    <div className="mod-section">
      <Notice kind="info"><strong>Hệ thống tự vận hành hằng ngày.</strong> Mỗi ngày một lần (khi có người mở Tổng quan hoặc Lịch phòng, hoặc theo lịch máy chủ lúc 00:10), hệ thống tự làm các việc dưới đây và ghi lại trong nhật ký với người thực hiện là “Hệ thống”.</Notice>

      <div className="card">
        <div className="card-head"><h2><Bot size={16} /> Việc hệ thống tự làm — bật/tắt được</h2></div>
        <div className="svc-auto-list">
          {SWITCHES.map(({ key, title, text, icon: Icon, parent }) => {
            const disabled = !!parent && !settings[parent];
            return (
              <label key={key} className={`svc-auto-item ${disabled ? 'is-disabled' : ''}`}>
                <span className="svc-auto-icon"><Icon size={18} aria-hidden /></span>
                <span className="grow"><strong>{title}</strong><span className="small muted">{text}</span></span>
                <span className="svc-switch">
                  <input type="checkbox" role="switch" checked={settings[key]} disabled={disabled || saving === key}
                    onChange={e => toggle(key, e.target.checked)} aria-label={title} />
                  <span className="small">{settings[key] ? 'Đang bật' : 'Đang tắt'}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2><CheckCircle2 size={16} /> Luôn tự động (không cần bật)</h2></div>
        <ul className="svc-always">{ALWAYS.map(t => <li key={t}><CheckCircle2 size={14} aria-hidden /> {t}</li>)}</ul>
      </div>

      <div className="card">
        <div className="card-head">
          <h2><Clock size={16} /> Lần chạy gần nhất {state.last_daily ? `· ${dateVN(state.last_daily)}` : ''}</h2>
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={async () => {
            const res = await run(() => post<Result>('/admin/automation/run'), 'Đã chạy tự động hóa.');
            if (res) d.reload(true);
          }}><Play size={14} /> Chạy ngay</button>
        </div>
        <div className="card-pad">
          {!r ? <p className="small muted">Chưa chạy lần nào.</p> : (
            <div className="kpis">
              <div className="kpi"><span>Giữ chỗ hết hạn đã giải phóng</span><strong>{r.holds_released}</strong></div>
              <div className="kpi"><span>Lượt không đến</span><strong>{r.no_shows}</strong></div>
              <div className="kpi"><span>Việc dọn phòng ở</span><strong>{r.stayover_tasks}</strong></div>
              <div className="kpi"><span>Việc đã tự giao</span><strong>{r.assigned}</strong></div>
            </div>
          )}
          {r?.errors?.length ? <Notice kind="warn">{r.errors.join(' · ')}</Notice> : null}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Hệ thống đã tự làm</h2><span className="small muted">50 mục gần nhất</span></div>
        {!log.length ? <p className="card-pad small muted">Chưa có.</p> : (
          <ul className="svc-log">{log.map(l => (
            <li key={l.id}><span className="muted small nowrap">{dateTimeVN(l.created_at)}</span><span>{l.summary}{l.reason && <span className="muted"> — {l.reason}</span>}</span></li>
          ))}</ul>
        )}
      </div>
    </div>
  );
}
