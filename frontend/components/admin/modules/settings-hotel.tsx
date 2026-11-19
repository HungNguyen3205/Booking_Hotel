'use client';

import { ReactNode } from 'react';
import { ErrorState, Loading, Notice, useAction, useLoad } from '@/components/ui';
import { get, put } from '@/lib/api';
import { money } from '@/lib/format';
import { formValues } from './common';

export type SettingsData = {
  property: { id: number; name: string; address: string | null; phone: string | null; email: string | null; check_in_time: string; check_out_time: string; timezone: string; currency: string };
  settings: {
    booking: Record<string, number | boolean>; surcharges: Record<string, number>;
    payment_qr: { enabled: boolean; bank_bin: string; bank_name: string; account_number: string; account_name: string };
    notifications: { email_enabled: boolean; zalo_enabled: boolean; booking_confirmation: string };
    policies: { booking: string; cancellation: string; privacy: string };
    site: { tagline: string; hero_title: string; hero_subtitle: string; about: string; map_url: string; zalo: string; facebook: string;
      amenities: { icon: string; title: string; text: string }[]; gallery: { url: string; alt: string }[] };
  };
};

export function useSettings() {
  return useLoad(() => get<SettingsData>('/admin/setup/settings'), []);
}

export function SaveCard({ title, children, onSubmit, busy, note }: { title: string; children: ReactNode; onSubmit: (f: HTMLFormElement) => void; busy: boolean; note?: ReactNode }) {
  return (
    <form className="card" onSubmit={e => { e.preventDefault(); onSubmit(e.currentTarget); }}>
      <div className="card-head"><h2>{title}</h2><button className="btn btn-primary btn-sm" disabled={busy}>Lưu</button></div>
      <div className="card-pad stack">{note}{children}</div>
    </form>
  );
}

const SURCHARGE_LABEL: Record<string, string> = {
  extra_adult: 'Thêm người lớn (đ/đêm)', extra_child: 'Trẻ em (đ/đêm)', extra_bed: 'Giường phụ (đ/đêm)', early_check_in: 'Nhận phòng sớm (đ/lần)', late_check_out: 'Trả phòng muộn (đ/lần)',
};

export function HotelSettings() {
  const d = useSettings();
  const { busy, run } = useAction();
  if (d.loading) return <Loading />;
  if (d.error || !d.data) return <ErrorState error={d.error} onRetry={d.reload} />;
  const { property: p, settings: s } = d.data;
  const save = (path: string, body: unknown) => run(() => put(path, body), 'Đã lưu cấu hình').then(r => { if (r !== undefined) d.reload(true); });

  return (
    <div className="grid-2">
      <SaveCard title="Thông tin khách sạn" busy={busy} onSubmit={f => save('/admin/setup/property', formValues(f))}
        note={<p className="small muted">Múi giờ {p.timezone}, tiền tệ {p.currency}. Điện thoại/email chỉ hiển thị trên website khi đã nhập.</p>}>
        <label className="field"><span>Tên</span><input className="input" name="name" defaultValue={p.name} required /></label>
        <label className="field"><span>Địa chỉ</span><input className="input" name="address" defaultValue={p.address ?? ''} /></label>
        <div className="form-grid">
          <label className="field"><span>Điện thoại</span><input className="input" name="phone" defaultValue={p.phone ?? ''} /></label>
          <label className="field"><span>Email</span><input className="input" type="email" name="email" defaultValue={p.email ?? ''} /></label>
          <label className="field"><span>Giờ nhận phòng</span><input className="input" type="time" name="check_in_time" defaultValue={p.check_in_time} required /></label>
          <label className="field"><span>Giờ trả phòng</span><input className="input" type="time" name="check_out_time" defaultValue={p.check_out_time} required /></label>
        </div>
      </SaveCard>

      <SaveCard title="Đặt phòng & vận hành" busy={busy}
        onSubmit={f => save('/admin/setup/settings/booking', formValues(f, ['hold_minutes_website', 'hold_minutes_staff', 'max_nights', 'max_rooms_per_booking', 'rounding'],
          ['hourly_enabled', 'require_inspection', 'require_shift_for_cash']))}>
        <div className="form-grid">
          <label className="field"><span>Giữ chỗ đơn website (phút)</span><input className="input" type="number" min={5} name="hold_minutes_website" defaultValue={Number(s.booking.hold_minutes_website)} /></label>
          <label className="field"><span>Giữ chỗ do lễ tân tạo (phút)</span><input className="input" type="number" min={5} name="hold_minutes_staff" defaultValue={Number(s.booking.hold_minutes_staff)} /></label>
          <label className="field"><span>Số đêm tối đa</span><input className="input" type="number" min={1} name="max_nights" defaultValue={Number(s.booking.max_nights)} /></label>
          <label className="field"><span>Số phòng tối đa/đặt phòng</span><input className="input" type="number" min={1} name="max_rooms_per_booking" defaultValue={Number(s.booking.max_rooms_per_booking)} /></label>
          <label className="field"><span>Làm tròn giá (đ)</span><select className="select" name="rounding" defaultValue={String(s.booking.rounding)}>{[1, 100, 500, 1000, 5000, 10000].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        </div>
        <label className="check"><input type="checkbox" name="require_inspection" defaultChecked={!!s.booking.require_inspection} /> Dọn xong phải kiểm tra mới thành “Sạch”</label>
        <label className="check"><input type="checkbox" name="require_shift_for_cash" defaultChecked={!!s.booking.require_shift_for_cash} /> Bắt buộc mở ca khi thu/chi tiền mặt</label>
        <label className="check"><input type="checkbox" name="hourly_enabled" defaultChecked={!!s.booking.hourly_enabled} /> Bật giá theo giờ (lưu cấu hình; đặt phòng theo giờ chưa triển khai)</label>
      </SaveCard>

      <SaveCard title="Phụ thu" busy={busy} onSubmit={f => save('/admin/setup/settings/surcharges', formValues(f, Object.keys(SURCHARGE_LABEL)))}
        note={<Notice kind="info">Mức 0 = <strong>chưa cấu hình</strong>; hệ thống không cho ghi phụ thu nhận sớm/trả muộn khi mức là 0.</Notice>}>
        <div className="form-grid">{Object.entries(SURCHARGE_LABEL).map(([k, l]) => (
          <label key={k} className="field"><span>{l}</span><input className="input" type="number" min={0} step={1000} name={k} defaultValue={s.surcharges[k]} />
            <small>{s.surcharges[k] ? money(s.surcharges[k]) : 'Chưa cấu hình'}</small></label>))}</div>
      </SaveCard>

      <SaveCard title="Mẫu thông báo" busy={busy} onSubmit={f => save('/admin/setup/settings/notifications', formValues(f, [], ['email_enabled', 'zalo_enabled']))}
        note={<p className="small muted">Biến: {'{name} {code} {check_in} {check_out} {total} {deposit}'}. Email chỉ gửi thật khi máy chủ có SMTP (xem “Thanh toán & tích hợp”).</p>}>
        <label className="check"><input type="checkbox" name="email_enabled" defaultChecked={s.notifications.email_enabled} /> Bật email xác nhận đặt phòng</label>
        <label className="check"><input type="checkbox" name="zalo_enabled" defaultChecked={s.notifications.zalo_enabled} /> Bật Zalo (chưa có nhà cung cấp — tin nhắn sẽ ghi “chưa cấu hình”)</label>
        <textarea className="textarea" name="booking_confirmation" rows={6} defaultValue={s.notifications.booking_confirmation} />
      </SaveCard>

      <div style={{ gridColumn: '1 / -1' }}>
        <SaveCard title="Chính sách (hiển thị trên website)" busy={busy} onSubmit={f => save('/admin/setup/settings/policies', formValues(f))}
          note={<Notice kind="warn">Nội dung mặc định là mẫu — khách sạn cần rà soát và xác nhận trước khi công khai.</Notice>}>
          <label className="field"><span>Chính sách đặt phòng</span><textarea className="textarea" rows={5} name="booking" defaultValue={s.policies.booking} /></label>
          <label className="field"><span>Chính sách hủy & hoàn tiền</span><textarea className="textarea" rows={5} name="cancellation" defaultValue={s.policies.cancellation} /></label>
          <label className="field"><span>Quyền riêng tư</span><textarea className="textarea" rows={6} name="privacy" defaultValue={s.policies.privacy} /></label>
        </SaveCard>
      </div>
    </div>
  );
}
