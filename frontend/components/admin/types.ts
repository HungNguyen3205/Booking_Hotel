export type StayCard = {
  stay_id: number; booking_id: number; code: string; status: string; guest: string | null; vip: boolean;
  adults: number; children: number; check_in: string; check_out: string; checked_in_at: string | null; balance: number | null;
};

export type MapRoom = {
  id: number; number: string; floor_id: number; room_type_id: number; type_name: string; type_code: string;
  wing: string | null; map_x: number; map_y: number; map_w: number; map_h: number; door_side: 'n' | 's' | 'e' | 'w'; notes: string | null;
  housekeeping: string; housekeeping_label: string; availability: string;
  block: { id: number; reason: string; start: string; end: string } | null;
  occupancy: 'vacant' | 'occupied' | 'arriving' | 'departing' | 'reserved';
  current: StayCard | null; departing: StayCard | null; arriving: StayCard | null; next: StayCard | null;
  task: { id: number; status: string; assignee: string | null } | null;
};

export type Landmark = { type: string; label: string; x: number; y: number; w: number; h: number };
export type Floor = { id: number; name: string; level: number; map_width: number; map_height: number; landmarks: Landmark[] | null; layout_confirmed: boolean };

export type RoomMapData = {
  date: string; is_today: boolean; show_balance: boolean;
  summary: { vacant_ready: number; occupied: number; arriving: number; departing: number; dirty: number; blocked: number };
  floors: Floor[]; room_types: { id: number; name: string; code: string }[]; rooms: MapRoom[];
};

export type Totals = {
  room: number; services: number; surcharges: number; discounts: number; charges: number; deposits: number; payments: number; refunds: number;
  paid: number; balance: number; pending_claims: number; deposit_required: number; deposit_outstanding: number;
};

export type Night = { id: number; stay_id: number; folio_id: number; night: string; room_rate: number; extra_charge: number; amount: number; rate_label: string; void: boolean; void_reason: string | null };
export type Guest = { id: number; full_name: string; phone: string | null; nationality: string | null; vip: boolean; pivot?: { is_primary: boolean | number } };
export type Stay = {
  id: number; booking_id: number; room_type_id: number; room_id: number | null; room_locked: boolean; status: string;
  check_in: string; check_out: string; adults: number; children: number; extra_beds: number; checked_in_at: string | null; checked_out_at: string | null;
  dirty_override_reason: string | null;
  room: { id: number; number: string; housekeeping: string } | null;
  type: { id: number; name: string; code: string; max_adults: number; max_children: number; max_occupancy: number };
  guests: Guest[]; nights: Night[];
};
export type FolioLine = { id: number; folio_id: number; stay_id: number | null; type: string; description: string; quantity: number; unit_price: number; amount: number;
  business_date: string; reverses_id: number | null; voided_at: string | null; reason: string | null; poster: { id: number; name: string } | null; created_at: string };
export type Payment = { id: number; folio_id: number; kind: string; method: string; amount: number; status: string; reference: string | null; note: string | null;
  receipt_no: string | null; paid_at: string | null; receiver: { id: number; name: string } | null; provider: string | null };
export type Folio = { id: number; name: string; status: string; bill_to_id: number | null; totals: Totals; lines: FolioLine[]; payments: Payment[] };
export type Customer = { id: number; kind: string; full_name: string; phone: string | null; email: string | null; nationality: string | null; vip: boolean;
  tax_code?: string | null; address?: string | null; preferences?: string | null; notes?: string | null; id_type?: string | null; id_number?: string | null };
export type BookingDetail = {
  booking: {
    id: number; code: string; status: string; source: string; source_ref: string | null; group_name: string | null; hold_expires_at: string | null;
    deposit_percent: number; deposit_required: number; special_requests: string | null; internal_notes: string | null; cancel_reason: string | null;
    cancelled_at: string | null; created_at: string; policy_snapshot: Record<string, unknown> | null;
    customer: Customer; bill_to: { id: number; full_name: string; kind: string } | null; rate_plan: { id: number; name: string } | null; creator: { id: number; name: string } | null;
    stays: Stay[];
  };
  totals: Totals; folios: Folio[];
  history: { id: number; action: string; summary: string; reason: string | null; created_at: string; user: { id: number; name: string } | null }[];
  cancellation: { late: boolean; fee: number; explain: string } | null;
  payment_qr: { qr: string; bank_name: string; account_number: string; account_name: string; amount: number; message: string } | null;
};
export type Options = {
  rate_plans: { id: number; name: string; deposit_percent: number; policy: { name: string; description: string } | null }[];
  payment_methods: { code: string; name: string; type: string }[];
  sources: Record<string, string>;
  settings: { hold_minutes_staff: number; max_nights: number };
  surcharges: { early_check_in: number; late_check_out: number; extra_adult: number; extra_child: number; extra_bed: number };
};
export type ServiceItem = { id: number; category: string; name: string; unit: string; price: number; active: boolean; item?: { on_hand: number; unit: string } | null };
