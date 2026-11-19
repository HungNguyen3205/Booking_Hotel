<?php
namespace App\Services;

use App\Models\Property;
use Carbon\CarbonImmutable;

/** Cơ sở đang thao tác và ngày vận hành. */
class Context
{
    private static ?Property $property = null;

    public static function set(Property $property): void
    {
        self::$property = $property;
    }

    public static function property(): Property
    {
        if (!self::$property) {
            self::$property = Property::where('active', true)->orderBy('id')->firstOrFail();
        }
        return self::$property;
    }

    public static function propertyId(): int
    {
        return self::property()->id;
    }

    public static function propertyIdOrNull(): ?int
    {
        return self::$property?->id;
    }

    public static function reset(): void
    {
        self::$property = null;
    }

    /** Ngày vận hành theo múi giờ khách sạn. */
    public static function today(): CarbonImmutable
    {
        return CarbonImmutable::now(self::$property?->timezone ?? config('app.timezone'))->startOfDay();
    }
}
