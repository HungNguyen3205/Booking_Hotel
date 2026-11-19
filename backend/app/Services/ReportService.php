<?php
namespace App\Services;

use App\Models\Booking;
use App\Models\Room;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Báo cáo. Kỳ báo cáo [from, to] tính theo ngày vận hành, bao gồm cả hai đầu.
 *
 * - Phòng-đêm khả dụng = số phòng đang sử dụng (chưa lưu trữ) × số ngày − số phòng-đêm bị chặn (bảo trì/ngừng bán).
 *   Phòng ngừng bán/bảo trì bị loại khỏi mẫu số và được báo cáo riêng.
 * - Phòng-đêm đã bán = các đêm chưa hủy của lượt ở đã nhận phòng hoặc đã trả phòng (thực tế).
 * - Doanh thu phòng = tổng giá đã chụp của các đêm trên, ghi nhận theo ngày của đêm ở.
 * - Doanh thu dịch vụ/phụ thu/phí = dòng phí (sau giảm giá, điều chỉnh, dòng đảo) theo ngày phát sinh.
 * - Công suất = đã bán / khả dụng. ADR = doanh thu phòng / đã bán. RevPAR = doanh thu phòng / khả dụng.
 * - Tiền đã thu = cọc + thanh toán − hoàn tiền theo thời điểm thu (khác doanh thu).
 * - Giữ chỗ/đã xác nhận cho tương lai được báo riêng là "đã đặt" (on-the-books), không tính vào doanh thu.
 */
class ReportService
{
    public function summary(int $propertyId, string $from, string $to): array
    {
        $days = CarbonImmutable::parse($from)->diffInDays(CarbonImmutable::parse($to)) + 1;
        $toExclusive = CarbonImmutable::parse($to)->addDay()->toDateString();
        $rooms = Room::where('property_id', $propertyId)->whereNull('archived_at')->count();
        $blocked = (int) DB::table('room_nights')->join('rooms', 'rooms.id', '=', 'room_nights.room_id')
            ->where('rooms.property_id', $propertyId)->whereNotNull('room_block_id')
            ->where('night', '>=', $from)->where('night', '<=', $to)->count();
        $available = max(0, $rooms * $days - $blocked);

        $sold = $this->nightsQuery($propertyId, $from, $to)->whereIn('stays.status', ['checked_in', 'checked_out']);
        $soldNights = (clone $sold)->count();
        $roomRevenue = (int) (clone $sold)->sum('stay_nights.amount');
        $otb = $this->nightsQuery($propertyId, $from, $to)->whereIn('stays.status', ['hold', 'confirmed']);

        $lines = DB::table('folio_lines')->join('folios', 'folios.id', '=', 'folio_lines.folio_id')
            ->join('bookings', 'bookings.id', '=', 'folios.booking_id')->where('bookings.property_id', $propertyId)
            ->whereBetween('folio_lines.business_date', [$from, $to])
            ->selectRaw('folio_lines.type as type, SUM(folio_lines.amount) as total')->groupBy('folio_lines.type')->pluck('total', 'type');
        $walkIn = (int) DB::table('cash_entries')->where('property_id', $propertyId)->where('type', 'income')->where('category', 'Bán dịch vụ lẻ')
            ->whereBetween('business_date', [$from, $to])->sum('amount')
            - (int) DB::table('cash_entries')->where('property_id', $propertyId)->where('type', 'expense')->where('category', 'Bán dịch vụ lẻ')
            ->whereBetween('business_date', [$from, $to])->sum('amount');
        $serviceRevenue = (int) ($lines['service'] ?? 0) + $walkIn;
        $otherRevenue = (int) ($lines['surcharge'] ?? 0) + (int) ($lines['fee'] ?? 0);
        $discounts = (int) ($lines['discount'] ?? 0) + (int) ($lines['adjustment'] ?? 0);

        $payments = DB::table('payments')->join('bookings', 'bookings.id', '=', 'payments.booking_id')
            ->where('bookings.property_id', $propertyId)->where('payments.status', 'completed')
            ->where('payments.paid_at', '>=', $from)->where('payments.paid_at', '<', $toExclusive)
            ->selectRaw("payments.method as method, payments.kind as kind, SUM(payments.amount) as total")
            ->groupBy('payments.method', 'payments.kind')->get();
        $collections = [];
        foreach ($payments as $p) {
            $collections[$p->method] ??= ['method' => $p->method, 'deposit' => 0, 'payment' => 0, 'refund' => 0, 'net' => 0];
            $collections[$p->method][$p->kind] += (int) $p->total;
            $collections[$p->method]['net'] += $p->kind === 'refund' ? -(int) $p->total : (int) $p->total;
        }
        $cash = DB::table('cash_entries')->where('property_id', $propertyId)->whereBetween('business_date', [$from, $to])
            ->selectRaw('type, SUM(amount) as total')->groupBy('type')->pluck('total', 'type');

        $bookingBase = fn () => Booking::where('property_id', $propertyId);
        $stayBase = fn () => DB::table('stays')->join('bookings', 'bookings.id', '=', 'stays.booking_id')->where('bookings.property_id', $propertyId);

        return [
            'period' => ['from' => $from, 'to' => $to, 'days' => $days],
            'rooms' => $rooms,
            'room_nights_available' => $available,
            'room_nights_blocked' => $blocked,
            'room_nights_sold' => $soldNights,
            'room_nights_on_books' => (clone $otb)->count(),
            'on_books_revenue' => (int) (clone $otb)->sum('stay_nights.amount'),
            'occupancy' => $available ? round($soldNights * 100 / $available, 1) : 0,
            'room_revenue' => $roomRevenue,
            'service_revenue' => $serviceRevenue,
            'other_revenue' => $otherRevenue,
            'discounts' => $discounts,
            'total_revenue' => $roomRevenue + $serviceRevenue + $otherRevenue + $discounts,
            'adr' => $soldNights ? intdiv($roomRevenue, $soldNights) : 0,
            'revpar' => $available ? intdiv($roomRevenue, $available) : 0,
            'collections' => array_values($collections),
            'collected_net' => array_sum(array_column($collections, 'net')),
            'cashbook' => ['income' => (int) ($cash['income'] ?? 0), 'expense' => (int) ($cash['expense'] ?? 0)],
            'arrivals' => $stayBase()->whereBetween('stays.check_in', [$from, $to])->whereIn('stays.status', ['checked_in', 'checked_out'])->count(),
            'departures' => $stayBase()->where('stays.status', 'checked_out')->whereBetween('stays.check_out', [$from, $to])->count(),
            'new_bookings' => $bookingBase()->where('created_at', '>=', $from)->where('created_at', '<', $toExclusive)->count(),
            'cancellations' => $bookingBase()->where('status', 'cancelled')->where('cancelled_at', '>=', $from)->where('cancelled_at', '<', $toExclusive)->count(),
            'no_shows' => $stayBase()->where('stays.status', 'no_show')->whereBetween('stays.check_in', [$from, $to])->count(),
        ];
    }

    private function nightsQuery(int $propertyId, string $from, string $to)
    {
        return DB::table('stay_nights')->join('stays', 'stays.id', '=', 'stay_nights.stay_id')
            ->join('bookings', 'bookings.id', '=', 'stays.booking_id')->where('bookings.property_id', $propertyId)
            ->where('stay_nights.void', false)->whereBetween('stay_nights.night', [$from, $to]);
    }

    public function byRoomType(int $propertyId, string $from, string $to): array
    {
        $days = CarbonImmutable::parse($from)->diffInDays(CarbonImmutable::parse($to)) + 1;
        $types = DB::table('room_types')->where('property_id', $propertyId)->orderBy('sort')->get();
        return $types->map(function ($t) use ($propertyId, $from, $to, $days) {
            $rooms = Room::where('room_type_id', $t->id)->whereNull('archived_at')->count();
            $blocked = DB::table('room_nights')->join('rooms', 'rooms.id', '=', 'room_nights.room_id')->where('rooms.room_type_id', $t->id)
                ->whereNotNull('room_block_id')->whereBetween('night', [$from, $to])->count();
            $q = $this->nightsQuery($propertyId, $from, $to)->where('stays.room_type_id', $t->id)->whereIn('stays.status', ['checked_in', 'checked_out']);
            $sold = (clone $q)->count();
            $revenue = (int) (clone $q)->sum('stay_nights.amount');
            $available = max(0, $rooms * $days - $blocked);
            return ['room_type' => $t->name, 'rooms' => $rooms, 'available' => $available, 'sold' => $sold, 'revenue' => $revenue,
                'occupancy' => $available ? round($sold * 100 / $available, 1) : 0, 'adr' => $sold ? intdiv($revenue, $sold) : 0,
                'revpar' => $available ? intdiv($revenue, $available) : 0];
        })->all();
    }

    /** Hiệu quả nguồn khách: theo đặt phòng tạo trong kỳ. */
    public function bySource(int $propertyId, string $from, string $to): array
    {
        $toExclusive = CarbonImmutable::parse($to)->addDay()->toDateString();
        return DB::table('bookings')->where('bookings.property_id', $propertyId)
            ->where('bookings.created_at', '>=', $from)->where('bookings.created_at', '<', $toExclusive)
            ->leftJoin('stays', 'stays.booking_id', '=', 'bookings.id')
            ->leftJoin('stay_nights', fn ($j) => $j->on('stay_nights.stay_id', '=', 'stays.id')->where('stay_nights.void', false))
            ->groupBy('bookings.source')
            ->selectRaw('bookings.source as source, COUNT(DISTINCT bookings.id) as bookings, COUNT(stay_nights.id) as room_nights, COALESCE(SUM(stay_nights.amount),0) as room_value,
                COUNT(DISTINCT CASE WHEN bookings.status IN (\'cancelled\') THEN bookings.id END) as cancelled,
                COUNT(DISTINCT CASE WHEN bookings.status IN (\'no_show\') THEN bookings.id END) as no_show')
            ->get()->map(fn ($r) => (array) $r)->all();
    }

    /** Công nợ: đặt phòng còn phải thu (đã trả phòng hoặc đang ở), theo người chịu công nợ. */
    public function receivables(int $propertyId): array
    {
        $bookings = Booking::where('property_id', $propertyId)->whereIn('status', ['checked_in', 'checked_out', 'cancelled', 'no_show'])
            ->with(['customer:id,full_name,phone', 'billTo:id,full_name,kind'])->get();
        $balances = app(FolioService::class)->balances($bookings->pluck('id')->all());
        $today = Context::today();
        return $bookings->filter(fn ($b) => ($balances[$b->id] ?? 0) > 0)->map(function ($b) use ($balances, $today) {
            $lastOut = DB::table('stays')->where('booking_id', $b->id)->max('check_out');
            return ['booking_id' => $b->id, 'code' => $b->code, 'status' => $b->status, 'customer' => $b->customer?->full_name,
                'bill_to' => $b->billTo?->full_name, 'bill_to_kind' => $b->billTo?->kind, 'balance' => $balances[$b->id],
                'last_check_out' => $lastOut, 'age_days' => $lastOut ? max(0, (int) CarbonImmutable::parse($lastOut)->diffInDays($today, false)) : 0];
        })->sortByDesc('balance')->values()->all();
    }
}
