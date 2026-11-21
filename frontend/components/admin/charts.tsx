'use client';

import { ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { dateVN, money } from '@/lib/format';

/*
 * Biểu đồ trang Tổng quan — SVG tự vẽ, không thư viện.
 * Bảng màu (đã kiểm tra bằng validate_palette: lightness, chroma, CVD all-pairs, contrast trên nền #fffdf9):
 *   series-1 xanh lá #1f8a62 · series-2 đồng #c4861a · series-3 xanh dương #2f72c4; trung tính #a9aea9 cho "ngừng bán".
 * Quy cách: cột <= 24px, đầu cột bo 4px, khe 2px giữa phần chồng, đường 2px, lưới nhạt, chữ dùng màu chữ (không dùng màu series).
 */

const AXIS_H = 26;
const GUTTER = 52;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Số gọn kiểu Việt: 850k · 1,2tr · 15tr */
export function compactVnd(v: number) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace('.', ',').replace(',0', '')}tr`;
  if (a >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(v);
}

function niceMax(max: number, ticks = 4) {
  if (max <= 0) return { top: 1, step: 0.25 };
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => s >= raw) ?? 10 * pow;
  return { top: step * Math.ceil(max / step), step };
}

/** Thanh có đầu bo 4px phía dữ liệu, vuông ở chân (đường cơ sở). */
function topRoundedBar(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x, 90), Math.max(90, width - 90));
  return <div className="chart-tip" style={{ left, top: y }} role="status">{children}</div>;
}

export function ChartCard({ title, sub, legend, children, table }: { title: string; sub?: string; legend?: ReactNode; children: ReactNode; table?: ReactNode }) {
  return (
    <section className="card chart-card">
      <div className="chart-head">
        <div><h2>{title}</h2>{sub && <p className="small muted">{sub}</p>}</div>
        {legend && <div className="chart-legend">{legend}</div>}
      </div>
      <div className="chart-body">{children}</div>
      {table && <details className="chart-table"><summary>Xem dạng bảng</summary>{table}</details>}
    </section>
  );
}

export const Swatch = ({ c, label }: { c: string; label: string }) => <span><i className="sw" style={{ background: c }} />{label}</span>;

const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/* ---------- 1. Doanh thu theo ngày: cột chồng (phòng + dịch vụ) ---------- */
export function RevenueChart({ points }: { points: { date: string; room_revenue: number; service_revenue: number; occupancy: number }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 220;
  const plotW = Math.max(0, width - GUTTER - 8);
  const plotH = H - AXIS_H - 10;
  const totals = points.map(p => p.room_revenue + p.service_revenue);
  const { top, step } = niceMax(Math.max(...totals, 0));
  const band = points.length ? plotW / points.length : 0;
  const barW = Math.min(24, band * 0.56);
  const yOf = (v: number) => 10 + plotH - (v / top) * plotH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelEvery = band < 34 ? 2 : 1;
  const empty = totals.every(t => t === 0);
  const h = hover !== null ? points[hover] : null;

  return (
    <div ref={ref} className="chart-plot" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={`Doanh thu ${points.length} ngày gần nhất`}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={GUTTER} x2={GUTTER + plotW} y1={yOf(t)} y2={yOf(t)} className={t === 0 ? 'axis-base' : 'grid'} />
              <text x={GUTTER - 8} y={yOf(t)} className="tick" textAnchor="end" dominantBaseline="middle">{compactVnd(t)}</text>
            </g>
          ))}
          {points.map((p, i) => {
            const cx = GUTTER + band * i + band / 2;
            const x = cx - barW / 2;
            const roomH = (p.room_revenue / top) * plotH;
            const svcH = (p.service_revenue / top) * plotH;
            const base = 10 + plotH;
            const gap = roomH > 0 && svcH > 0 ? 2 : 0;
            return (
              <g key={p.date} opacity={hover === null || hover === i ? 1 : 0.45}>
                {/* Phần dưới (phòng): đầu bo chỉ khi không có phần dịch vụ phía trên */}
                {roomH > 0 && (svcH > 0
                  ? <rect x={x} y={base - roomH} width={barW} height={roomH} fill="var(--s1)" />
                  : <path d={topRoundedBar(x, base - roomH, barW, roomH)} fill="var(--s1)" />)}
                {svcH > 0 && <path d={topRoundedBar(x, base - roomH - gap - svcH, barW, svcH)} fill="var(--s2)" />}
                {(i % labelEvery === 0 || i === points.length - 1) &&
                  <text x={cx} y={H - 8} className="tick" textAnchor="middle">{shortDate(p.date)}</text>}
                <rect x={GUTTER + band * i} y={0} width={band} height={H - AXIS_H} fill="transparent"
                  onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${dateVN(p.date)}: ${money(totals[i])}`} />
              </g>
            );
          })}
          {empty && <text x={GUTTER + plotW / 2} y={10 + plotH / 2} className="empty-note" textAnchor="middle">Chưa có doanh thu trong {points.length} ngày này</text>}
        </svg>
      )}
      {h && hover !== null && (
        <Tooltip x={GUTTER + band * hover + band / 2} y={Math.max(0, yOf(totals[hover]) - 8)} width={width}>
          <strong>{dateVN(h.date)}</strong>
          <span><i className="sw" style={{ background: 'var(--s1)' }} />Phòng <b>{money(h.room_revenue)}</b></span>
          <span><i className="sw" style={{ background: 'var(--s2)' }} />Dịch vụ <b>{money(h.service_revenue)}</b></span>
          <span className="tip-total">Tổng <b>{money(totals[hover])}</b></span>
        </Tooltip>
      )}
    </div>
  );
}

/* ---------- 2. Công suất đã đặt các đêm tới: đường + vùng ---------- */
export function OccupancyChart({ points }: { points: { date: string; sold: number; available: number; occupancy: number }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 220;
  const plotW = Math.max(0, width - GUTTER - 16);
  const plotH = H - AXIS_H - 12;
  const n = points.length;
  const xOf = (i: number) => GUTTER + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const yOf = (v: number) => 12 + plotH - (v / 100) * plotH;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)},${yOf(p.occupancy).toFixed(1)}`).join(' ');
  const area = n ? `${line} L${xOf(n - 1)},${yOf(0)} L${xOf(0)},${yOf(0)} Z` : '';
  const step = n > 1 ? plotW / (n - 1) : plotW;
  const labelEvery = step < 40 ? 2 : 1;
  const h = hover !== null ? points[hover] : null;

  return (
    <div ref={ref} className="chart-plot" onMouseLeave={() => setHover(null)}>
      {width > 0 && n > 0 && (
        <svg width={width} height={H} role="img" aria-label={`Công suất phòng đã đặt ${n} đêm tới`}>
          {[0, 25, 50, 75, 100].map(t => (
            <g key={t}>
              <line x1={GUTTER} x2={GUTTER + plotW} y1={yOf(t)} y2={yOf(t)} className={t === 0 ? 'axis-base' : 'grid'} />
              <text x={GUTTER - 8} y={yOf(t)} className="tick" textAnchor="end" dominantBaseline="middle">{t}%</text>
            </g>
          ))}
          <path d={area} fill="var(--s3)" opacity={0.12} />
          <path d={line} fill="none" stroke="var(--s3)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (i % labelEvery === 0 || i === n - 1) &&
            <text key={p.date} x={xOf(i)} y={H - 8} className="tick" textAnchor="middle">{i === 0 ? 'Đêm nay' : shortDate(p.date)}</text>)}
          {hover !== null && h && <>
            <line x1={xOf(hover)} x2={xOf(hover)} y1={12} y2={yOf(0)} className="crosshair" />
            <circle cx={xOf(hover)} cy={yOf(h.occupancy)} r={5} fill="var(--s3)" stroke="var(--chart-surface)" strokeWidth={2} />
          </>}
          {points.map((p, i) => (
            <rect key={`h${p.date}`} x={xOf(i) - step / 2} y={0} width={step} height={H - AXIS_H} fill="transparent"
              onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${dateVN(p.date)}: ${p.occupancy}%`} />
          ))}
        </svg>
      )}
      {h && hover !== null && (
        <Tooltip x={xOf(hover)} y={Math.max(0, yOf(h.occupancy) - 12)} width={width}>
          <strong>Đêm {dateVN(h.date)}</strong>
          <span>Công suất <b>{h.occupancy}%</b></span>
          <span className="muted">{h.sold}/{h.available} phòng đã đặt</span>
        </Tooltip>
      )}
    </div>
  );
}

/* ---------- 3. Tình trạng phòng hôm nay: thanh phân đoạn ---------- */
const STATUS_PARTS: { key: 'occupied' | 'ready' | 'dirty' | 'blocked'; label: string; color: string }[] = [
  { key: 'occupied', label: 'Đang ở', color: 'var(--s1)' },
  { key: 'ready', label: 'Trống sẵn sàng', color: 'var(--s3)' },
  { key: 'dirty', label: 'Trống cần dọn', color: 'var(--s2)' },
  { key: 'blocked', label: 'Bảo trì / ngừng bán', color: 'var(--s-neutral)' },
];

export function RoomStatusChart({ status }: { status: Record<'occupied' | 'ready' | 'dirty' | 'blocked', number> }) {
  const total = STATUS_PARTS.reduce((a, p) => a + status[p.key], 0);
  const parts = STATUS_PARTS.filter(p => status[p.key] > 0);
  return (
    <div className="status-chart">
      <div className="status-total"><strong className="num">{total}</strong> phòng</div>
      <div className="status-bar" role="img" aria-label={STATUS_PARTS.map(p => `${p.label} ${status[p.key]}`).join(', ')}>
        {parts.map(p => (
          <div key={p.key} style={{ flexGrow: status[p.key], background: p.color }} title={`${p.label}: ${status[p.key]} phòng`} />
        ))}
        {total === 0 && <div style={{ flexGrow: 1, background: 'var(--grey)' }} />}
      </div>
      <ul className="status-legend">
        {STATUS_PARTS.map(p => (
          <li key={p.key}>
            <i className="sw" style={{ background: p.color }} />
            <span>{p.label}</span>
            <b className="num">{status[p.key]}</b>
            <span className="muted num">{total ? Math.round((status[p.key] * 100) / total) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- 4. Nguồn đặt phòng: thanh ngang, một màu ---------- */
export function SourcesChart({ rows, labels }: { rows: { source: string; bookings: number; cancelled: number; room_value: number }[]; labels: Record<string, string> }) {
  const max = Math.max(1, ...rows.map(r => r.bookings));
  if (!rows.length) return <p className="muted small" style={{ padding: '24px 0' }}>Chưa có đặt phòng trong 30 ngày qua.</p>;
  return (
    <ul className="hbar-list">
      {rows.map(r => (
        <li key={r.source} title={`${labels[r.source] ?? r.source}: ${r.bookings} đơn · ${r.cancelled} đã hủy · giá trị phòng ${money(r.room_value)}`}>
          <span className="hbar-label">{labels[r.source] ?? r.source}</span>
          <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(r.bookings / max) * 100}%` }} /></span>
          <b className="num">{r.bookings}</b>
        </li>
      ))}
    </ul>
  );
}
