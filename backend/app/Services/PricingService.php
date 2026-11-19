<?php
namespace App\Services;

use App\Models\RatePlan;
use App\Models\RateRule;
use App\Models\RoomType;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Tính giá từng đêm.
 *
 * Thứ tự ưu tiên khi nhiều quy tắc cùng khớp một đêm:
 *   1. `priority` cao hơn thắng (do người cấu hình đặt).
 *   2. Bằng priority: loại cụ thể hơn thắng — Lễ (holiday) > Mùa (season) > Cuối tuần (weekend).
 *   3. Vẫn bằng: quy tắc gắn riêng kế hoạch giá thắng quy tắc dùng chung cho mọi kế hoạch.
 *   4. Vẫn bằng: quy tắc tạo sau (id lớn hơn) thắng.
 * Không khớp quy tắc nào: dùng giá cơ sở của loại phòng (giá ngày thường).
 * Sau đó áp dụng % điều chỉnh của kế hoạch giá, làm tròn theo cấu hình.
 * Phụ thu thêm người/giường phụ cộng theo từng đêm.
 */
class PricingService
{
    private const KIND_RANK = ['holiday' => 3, 'season' => 2, 'weekend' => 1];

    /**
     * @return array{nights: array<int, array{night:string, room_rate:int, extra_charge:int, amount:int, label:string, rule_id:?int}>, total:int}
     */
    public function quote(RoomType $type, ?RatePlan $plan, string $checkIn, string $checkOut, int $adults, int $children = 0, int $extraBeds = 0): array
    {
        $start = CarbonImmutable::parse($checkIn);
        $end = CarbonImmutable::parse($checkOut);
        $rules = RateRule::where('room_type_id', $type->id)->where('active', true)
            ->where(fn ($q) => $q->whereNull('rate_plan_id')->when($plan, fn ($q) => $q->orWhere('rate_plan_id', $plan->id)))
            ->get();
        $booking = Settings::get('booking', $type->property_id);
        $fees = Settings::get('surcharges', $type->property_id);
        $extraAdults = max(0, $adults - $type->base_adults);
        $extraPerNight = $extraAdults * (int) $fees['extra_adult'] + $children * (int) $fees['extra_child'] + $extraBeds * (int) $fees['extra_bed'];

        $nights = [];
        $total = 0;
        for ($day = $start; $day < $end; $day = $day->addDay()) {
            [$base, $label, $ruleId] = $this->baseFor($type, $rules, $day);
            $rate = $this->applyPlan($base, $plan, (int) $booking['rounding']);
            $amount = $rate + $extraPerNight;
            $nights[] = ['night' => $day->toDateString(), 'room_rate' => $rate, 'extra_charge' => $extraPerNight,
                'amount' => $amount, 'label' => $plan ? "$label · {$plan->name}" : $label, 'rule_id' => $ruleId];
            $total += $amount;
        }
        return ['nights' => $nights, 'total' => $total];
    }

    /** @return array{0:int,1:string,2:?int} */
    public function baseFor(RoomType $type, Collection $rules, CarbonImmutable $day): array
    {
        $date = $day->toDateString();
        $dow = $day->dayOfWeek;
        $match = $rules->filter(function (RateRule $r) use ($date, $dow) {
            if ($r->start_date && $date < $r->start_date->toDateString()) return false;
            if ($r->end_date && $date > $r->end_date->toDateString()) return false;
            if ($r->days_of_week && !in_array($dow, array_map('intval', $r->days_of_week), true)) return false;
            return true;
        })->sort(function (RateRule $a, RateRule $b) {
            return [$b->priority, self::KIND_RANK[$b->kind] ?? 0, $b->rate_plan_id ? 1 : 0, $b->id]
                <=> [$a->priority, self::KIND_RANK[$a->kind] ?? 0, $a->rate_plan_id ? 1 : 0, $a->id];
        })->first();

        return $match ? [$match->price, $match->name, $match->id] : [$type->base_rate, 'Giá ngày thường', null];
    }

    public function applyPlan(int $price, ?RatePlan $plan, int $rounding): int
    {
        if ($plan && $plan->adjust_percent !== 0) {
            $price = intdiv($price * (100 + $plan->adjust_percent) + 50, 100);
        }
        if ($rounding > 1) {
            $price = intdiv($price + intdiv($rounding, 2), $rounding) * $rounding;
        }
        return max(0, $price);
    }

    /** Tiền cọc yêu cầu, làm tròn lên theo cấu hình. */
    public function deposit(int $total, int $percent, int $rounding = 1000): int
    {
        if ($percent <= 0 || $total <= 0) return 0;
        $raw = intdiv($total * $percent + 99, 100);
        $rounding = max(1, $rounding);
        return min($total, intdiv($raw + $rounding - 1, $rounding) * $rounding);
    }
}
