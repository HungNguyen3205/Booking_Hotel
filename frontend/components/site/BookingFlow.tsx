'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, BedDouble, Check, Maximize, MoonStar, Search, ShieldCheck, Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { addDays, dateVN, diffDays, errorText, money, todayISO } from '@/lib/format';
import { Loading, Notice } from '@/components/ui';
import { BookingSummary, PublicBooking } from './BookingSummary';
import { RoomPlate } from './RoomPlate';
import type { RoomType } from '@/lib/site-api';

type Night = { night: string; room_rate: number; extra_charge: number; amount: number; label: string };
type Plan = { id: number; name: string; description: string | null; includes_breakfast: boolean; deposit_percent: number; refundable: boolean | null;
  free_cancel_hours: number | null; policy: string | null; total: number; deposit: number; nights: Night[] };
type Result = { room_type: RoomType; available: boolean; remaining: number; reason: string | null; plans: Plan[] };
type Query = { check_in: string; check_out: string; adults: number; children: number; rooms: number };
type Step = 'search' | 'select' | 'book' | 'done';

const STEPS: [Step, string][] = [['search', 'Ngày & khách'], ['select', 'Chọn phòng'], ['book', 'Thông tin & xác nhận'], ['done', 'Hoàn tất']];

function newKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

export function BookingFlow() {
  const params = useSearchParams();
  const roomSlug = params.get('room');
  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState<Query>({ check_in: '', check_out: '', adults: 2, children: 0, rooms: 1 });
  const [results, setResults] = useState<Result[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [choice, setChoice] = useState<{ result: Result; plan: Plan } | null>(null);
  const [customer, setCustomer] = useState({ full_name: '', phone: '', email: '', special_requests: '' });
  const [accept, setAccept] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState<PublicBooking | null>(null);
  const keyRef = useRef<{ key: string; payload: string } | null>(null);
  const topRef = useRef<HTMLOListElement>(null);

  const go = (s: Step) => { setStep(s); requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };

  const searchSeq = useRef(0);
  const search = useCallback(async (q: Query, message = '') => {
    const id = ++searchSeq.current; // chỉ áp dụng kết quả của lần tìm mới nhất
    setSearching(true);
    setError(message);
    setResults(null);
    setChoice(null);
    try {
      const p = new URLSearchParams({ check_in: q.check_in, check_out: q.check_out, adults: String(q.adults), children: String(q.children), rooms: String(q.rooms) });
      const res = await api<{ results: Result[] }>(`/public/availability?${p}`);
      if (id !== searchSeq.current) return;
      setResults(res.results);
      // Giữ lựa chọn khi tải lại / quay lại / sang trang khác (không sửa URL giữa luồng: router sẽ coi là điều hướng)
      try { window.sessionStorage.setItem('glg.stay', JSON.stringify(q)); } catch { /* bỏ qua */ }
      setStep('select');
    } catch (e) {
      if (id !== searchSeq.current) return;
      setError(errorText(e));
      setStep('search');
    } finally {
      if (id === searchSeq.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    let saved: { check_in?: string; check_out?: string; adults?: number; children?: number; rooms?: number } = {};
    try { saved = JSON.parse(window.sessionStorage.getItem('glg.stay') ?? '{}'); } catch { /* bỏ qua */ }
    const fromUrl = !!params.get('check_in');
    const ci = params.get('check_in') ?? saved.check_in ?? null;
    const co = params.get('check_out') ?? saved.check_out ?? null;
    const q: Query = {
      check_in: ci && ci >= todayISO() ? ci : todayISO(),
      check_out: co && ci && co > ci ? co : addDays(ci && ci >= todayISO() ? ci : todayISO(), 1),
      adults: Math.max(1, Number(params.get('adults') ?? (fromUrl ? null : saved.adults)) || 2),
      children: Math.max(0, Number(params.get('children') ?? (fromUrl ? null : saved.children)) || 0),
      rooms: Math.max(1, Number(params.get('rooms') ?? (fromUrl ? null : saved.rooms)) || 1),
    };
    setQuery(q);
    if (ci && co) search(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    if (query.check_out <= query.check_in) { setError('Ngày trả phòng phải sau ngày nhận phòng.'); return; }
    if (query.rooms > query.adults) { setError('Mỗi phòng cần ít nhất một người lớn.'); return; }
    search(query);
  }

  async function submitBooking(e?: FormEvent) {
    e?.preventDefault();
    if (!choice || submitting) return;
    const body = {
      ...query, room_type_id: choice.result.room_type.id, rate_plan_id: choice.plan.id, expected_total: choice.plan.total,
      customer: { full_name: customer.full_name.trim(), phone: customer.phone.trim(), email: customer.email.trim() },
      special_requests: customer.special_requests.trim() || null, accept_policy: accept,
    };
    // Cùng nội dung → giữ nguyên request_key để gửi lại an toàn (backend trả về đơn đã tạo, không tạo trùng)
    const payload = JSON.stringify(body);
    if (!keyRef.current || keyRef.current.payload !== payload) keyRef.current = { key: newKey(), payload };
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      const res = await api<PublicBooking>('/public/bookings', 'POST', { ...body, request_key: keyRef.current.key });
      setBooking(res);
      go('done');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        keyRef.current = null;
        go('select');
        await search(query, `${e.message} Danh sách phòng và giá đã được cập nhật, vui lòng chọn lại.`);
      } else if (e instanceof ApiError && e.status === 422) {
        setFieldErrors(e.fields);
        setError(e.message);
        go('book');
      } else {
        setError(`${errorText(e)} Bạn có thể bấm "Đặt phòng" lại — hệ thống sẽ không tạo đơn trùng.`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const nights = query.check_in && query.check_out ? diffDays(query.check_in, query.check_out) : 0;
  const idx = STEPS.findIndex(s => s[0] === step);
  const sorted = results ? [...results].sort((a, b) => Number(b.room_type.slug === roomSlug) - Number(a.room_type.slug === roomSlug) || Number(b.available) - Number(a.available)) : null;
  const fe = (k: string) => fieldErrors[k]?.[0];
  const guests = `${query.adults} người lớn${query.children ? `, ${query.children} trẻ em` : ''}`;
  const pick = (r: Result, p: Plan) => { setChoice({ result: r, plan: p }); setError(''); setAccept(false); go('book'); };

  return (
    <div className={`book-flow ${step === 'done' ? 'is-done' : ''}`}>
      {step !== 'done' && (
        <form className="ticket-search" onSubmit={submitSearch} aria-label="Ngày lưu trú và số khách">
          <div className="ts-dates">
            <label className="field"><span>Nhận phòng</span><input className="input" type="date" name="check_in" required min={todayISO()} value={query.check_in}
              onChange={e => setQuery(q => ({ ...q, check_in: e.target.value, check_out: q.check_out <= e.target.value ? addDays(e.target.value, 1) : q.check_out }))} /></label>
            <div className="ts-stub" aria-live="polite"><MoonStar size={15} aria-hidden /><strong>{nights > 0 ? nights : '–'}</strong><span>đêm</span></div>
            <label className="field"><span>Trả phòng</span><input className="input" type="date" name="check_out" required min={query.check_in ? addDays(query.check_in, 1) : todayISO()} value={query.check_out}
              onChange={e => setQuery(q => ({ ...q, check_out: e.target.value }))} /></label>
          </div>
          <div className="ts-guests">
            <label className="field"><span>Người lớn</span><select className="select" name="adults" value={query.adults} onChange={e => setQuery(q => ({ ...q, adults: Number(e.target.value) }))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n}>{n}</option>)}</select></label>
            <label className="field"><span>Trẻ em</span><select className="select" name="children" value={query.children} onChange={e => setQuery(q => ({ ...q, children: Number(e.target.value) }))}>
              {Array.from({ length: 9 }, (_, i) => i).map(n => <option key={n}>{n}</option>)}</select></label>
            <label className="field"><span>Số phòng</span><select className="select" name="rooms" value={query.rooms} onChange={e => setQuery(q => ({ ...q, rooms: Number(e.target.value) }))}>
              {Array.from({ length: 6 }, (_, i) => i + 1).map(n => <option key={n}>{n}</option>)}</select></label>
          </div>
          <button className="btn btn-primary ts-go" disabled={searching}><Search size={16} aria-hidden /> {searching ? 'Đang tìm…' : step === 'search' ? 'Tìm phòng' : 'Tìm lại'}</button>
        </form>
      )}

      <ol ref={topRef} className="steps" aria-label="Các bước đặt phòng">
        {STEPS.map(([s, label], i) => <li key={s} aria-current={s === step ? 'step' : undefined} className={i < idx ? 'done' : ''}>
          <span className="step-dot" aria-hidden>{i < idx ? <Check size={12} /> : i + 1}</span>{label}</li>)}
      </ol>
      {error && step !== 'done' && <div style={{ marginBottom: 16 }}><Notice kind={step === 'select' ? 'warn' : 'error'}>{error}</Notice></div>}

      {searching && <Loading label="Đang kiểm tra phòng trống…" />}

      {step === 'select' && sorted && !searching && (
        <div className="stay-list">
          <p className="stay-query">{dateVN(query.check_in)} <ArrowRight size={14} aria-hidden /> {dateVN(query.check_out)} · {nights} đêm · {guests} · {query.rooms} phòng</p>
          {sorted.every(r => !r.available) && <Notice kind="warn">Không còn loại phòng phù hợp cho ngày và số khách đã chọn. Hãy thử đổi ngày, số phòng hoặc liên hệ khách sạn.</Notice>}
          {sorted.map(r => (
            <article className={`stay-option ${r.available ? '' : 'is-off'}`} key={r.room_type.id} aria-disabled={!r.available}>
              <div className="stay-media">
                <RoomPlate t={r.room_type} compact sizes="(max-width: 860px) 100vw, 420px" />
                {r.available && r.remaining <= 2 && <span className="stay-flag">Chỉ còn {r.remaining} phòng</span>}
              </div>
              <div className="stay-body">
                <div className="stay-head">
                  <h3>{r.room_type.name}</h3>
                  <div className="facts">
                    <span><Maximize size={14} aria-hidden /> {r.room_type.area} m²</span>
                    <span><Users size={14} aria-hidden /> tối đa {r.room_type.max_occupancy} khách/phòng</span>
                    <span><BedDouble size={14} aria-hidden /> {r.room_type.bed ?? 'Giường: đang cập nhật'}</span>
                  </div>
                  {r.room_type.short_description && <p className="stay-desc">{r.room_type.short_description}</p>}
                  <Link className="small link-arrow" href={`/phong/${r.room_type.slug}`} target="_blank">Xem chi tiết phòng</Link>
                </div>
                {!r.available && <p className="stay-off">{r.reason ?? 'Không khả dụng cho lựa chọn này'}</p>}
                {r.plans.map(p => (
                  <div className="plan" key={p.id}>
                    <div className="plan-info">
                      <strong>{p.name}{p.includes_breakfast && <span className="badge b-sage" style={{ marginLeft: 8 }}>Gồm bữa sáng</span>}</strong>
                      {p.description && <span className="small muted">{p.description}</span>}
                      <span className="small">Đặt cọc {p.deposit_percent}%: <strong>{money(p.deposit)}</strong></span>
                      <details><summary>Giá từng đêm &amp; chính sách</summary>
                        <ul className="nights">{p.nights.map(n => <li key={n.night}>{dateVN(n.night)} — {n.label}: {money(n.amount)}{query.rooms > 1 ? ' (phòng đầu)' : ''}</li>)}</ul>
                        {p.policy && <p className="small muted" style={{ marginTop: 6 }}>{p.policy}</p>}
                      </details>
                    </div>
                    <div className="plan-buy">
                      <span className="price"><strong>{money(p.total)}</strong></span>
                      <span className="tiny muted">{nights} đêm · {query.rooms} phòng</span>
                      <button type="button" className="btn btn-bronze" onClick={() => pick(r, p)}>Đặt phòng này <ArrowRight size={15} aria-hidden /></button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {step === 'book' && choice && (
        <div className="book-layout">
          <form className="card card-pad stack book-form" onSubmit={submitBooking}>
            <div className="row-between">
              <h2 className="serif" style={{ fontSize: 28 }}>Thông tin người đặt</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => go('select')}><ArrowLeft size={15} aria-hidden /> Đổi phòng</button>
            </div>
            <label className="field"><span>Họ và tên *</span><input className="input" name="full_name" required minLength={2} maxLength={120} autoComplete="name"
              value={customer.full_name} onChange={e => setCustomer(c => ({ ...c, full_name: e.target.value }))} aria-invalid={!!fe('customer.full_name')} />
              {fe('customer.full_name') && <span className="field-error">{fe('customer.full_name')}</span>}</label>
            <div className="form-grid">
              <label className="field"><span>Số điện thoại *</span><input className="input" name="phone" type="tel" inputMode="tel" required pattern="[+0-9 .()\-]{8,20}" autoComplete="tel"
                value={customer.phone} onChange={e => setCustomer(c => ({ ...c, phone: e.target.value }))} aria-invalid={!!fe('customer.phone')} aria-describedby="phone-hint" />
                <small id="phone-hint">Số này cũng là mã đặt phòng của bạn.</small>
                {fe('customer.phone') && <span className="field-error">{fe('customer.phone')}</span>}</label>
              <label className="field"><span>Email *</span><input className="input" name="email" type="email" required autoComplete="email"
                value={customer.email} onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))} aria-invalid={!!fe('customer.email')} aria-describedby="email-hint" />
                <small id="email-hint">Dùng để tra cứu đặt phòng.</small>
                {fe('customer.email') && <span className="field-error">{fe('customer.email')}</span>}</label>
            </div>
            <label className="field"><span>Yêu cầu đặc biệt</span><textarea className="textarea" name="special_requests" maxLength={1000} rows={3} placeholder="Ví dụ: giờ đến dự kiến, phòng tầng cao…"
              value={customer.special_requests} onChange={e => setCustomer(c => ({ ...c, special_requests: e.target.value }))} />
              <small>Khách sạn sẽ cố gắng đáp ứng nhưng không đảm bảo.</small></label>
            <div className="policy-box">
              <strong><ShieldCheck size={16} aria-hidden /> Đặt cọc &amp; hủy phòng</strong>
              <p className="small">Cọc {choice.plan.deposit_percent}% ({money(choice.plan.deposit)}). {choice.plan.policy ?? ''}</p>
              <p className="small muted">Đơn được giữ chỗ trong thời gian quy định để chờ cọc. <Link href="/chinh-sach" target="_blank">Chính sách đầy đủ</Link> · <Link href="/quyen-rieng-tu" target="_blank">Quyền riêng tư</Link></p>
            </div>
            <label className="check"><input type="checkbox" name="accept_policy" required checked={accept} onChange={e => setAccept(e.target.checked)} />
              Tôi đã đọc và đồng ý với chính sách đặt, hủy phòng và quyền riêng tư.</label>
            {fe('accept_policy') && <span className="field-error">{fe('accept_policy')}</span>}
            <button className="btn btn-bronze book-submit" disabled={submitting}>{submitting ? 'Đang gửi…' : <>Đặt phòng · {money(choice.plan.total)}</>}</button>
          </form>

          <aside className="stay-ticket" aria-label="Vé lưu trú: tóm tắt đặt phòng">
            <div className="ticket-media"><RoomPlate t={choice.result.room_type} compact sizes="360px" /></div>
            <div className="ticket-top">
              <span className="eyebrow">Vé lưu trú · GLG</span>
              <strong className="ticket-room">{choice.result.room_type.name}</strong>
              <span className="small muted">{choice.plan.name}</span>
            </div>
            <div className="ticket-dates">
              <div><span>Nhận phòng</span><strong>{dateVN(query.check_in)}</strong></div>
              <div className="ticket-nights" aria-hidden><MoonStar size={14} />{nights}</div>
              <div><span>Trả phòng</span><strong>{dateVN(query.check_out)}</strong></div>
            </div>
            <div className="ticket-tear" aria-hidden />
            <dl className="ticket-dl">
              <dt>Số đêm</dt><dd>{nights}</dd>
              <dt>Số phòng</dt><dd>{query.rooms}</dd>
              <dt>Khách</dt><dd>{query.adults} NL{query.children ? ` · ${query.children} TE` : ''}</dd>
              <dt className="total">Tổng tiền</dt><dd className="total">{money(choice.plan.total)}</dd>
              <dt>Cọc cần thanh toán</dt><dd>{money(choice.plan.deposit)}</dd>
            </dl>
            <p className="tiny muted">Giá đã gồm phụ thu theo số khách (nếu có). Dịch vụ phát sinh thanh toán tại khách sạn.</p>
          </aside>
        </div>
      )}

      {step === 'done' && booking && (
        <div className="stack" style={{ gap: 18 }}>
          <Notice kind="ok">Đã gửi yêu cầu đặt phòng. Vui lòng lưu lại <strong>mã đặt phòng</strong> để tra cứu.{customer.email && ' Email xác nhận chỉ được gửi khi khách sạn đã bật kênh email.'}</Notice>
          <BookingSummary booking={booking} contact={customer.email} onUpdate={setBooking} />
          <p><Link href="/tra-cuu" className="link-arrow">Tra cứu đặt phòng sau này</Link></p>
        </div>
      )}
    </div>
  );
}