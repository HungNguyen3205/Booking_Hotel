import { BedDouble, Brush, CalendarCheck, CheckCircle2, Clock, DoorOpen, LogIn, LogOut, Search, Sparkles, Wrench, XCircle, Ban, UserX, Hourglass } from 'lucide-react';
import { AVAILABILITY, BOOKING_STATUS, HOUSEKEEPING, OCCUPANCY } from '@/lib/format';

// Mọi trạng thái đều có biểu tượng + chữ, không chỉ dựa vào màu.

const BOOKING = {
  hold: ['b-amber', Hourglass], confirmed: ['b-blue', CalendarCheck], checked_in: ['b-moss', BedDouble],
  checked_out: ['b-neutral', LogOut], cancelled: ['b-neutral', XCircle], no_show: ['b-red', UserX],
} as const;

export function BookingBadge({ status }: { status: string }) {
  const [cls, Icon] = BOOKING[status as keyof typeof BOOKING] ?? ['b-neutral', Clock];
  return <span className={`badge ${cls}`}><Icon aria-hidden />{BOOKING_STATUS[status] ?? status}</span>;
}

const HK = { dirty: ['b-amber', Brush], cleaning: ['b-blue', Sparkles], inspecting: ['b-bronze', Search], clean: ['b-sage', CheckCircle2] } as const;
export function HousekeepingBadge({ status }: { status: string }) {
  const [cls, Icon] = HK[status as keyof typeof HK] ?? ['b-neutral', Clock];
  return <span className={`badge ${cls}`}><Icon aria-hidden />{HOUSEKEEPING[status] ?? status}</span>;
}

const AV = { active: ['b-sage', CheckCircle2], maintenance: ['b-neutral', Wrench], out_of_service: ['b-neutral', Ban] } as const;
export function AvailabilityBadge({ status }: { status: string }) {
  const [cls, Icon] = AV[status as keyof typeof AV] ?? ['b-neutral', Clock];
  return <span className={`badge ${cls}`}><Icon aria-hidden />{AVAILABILITY[status] ?? status}</span>;
}

const OCC = { vacant: ['b-sage', DoorOpen], occupied: ['b-moss', BedDouble], arriving: ['b-blue', LogIn], departing: ['b-amber', LogOut], reserved: ['b-blue', CalendarCheck] } as const;
export function OccupancyBadge({ status }: { status: string }) {
  const [cls, Icon] = OCC[status as keyof typeof OCC] ?? ['b-neutral', Clock];
  return <span className={`badge ${cls}`}><Icon aria-hidden />{OCCUPANCY[status] ?? status}</span>;
}
