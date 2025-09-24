<?php

namespace App\Support;

use Carbon\Carbon;
use Illuminate\Support\Collection;

class JapaneseHolidayResolver
{
    private static ?Collection $holidays = null;

    protected static function data(): Collection
    {
        if (static::$holidays !== null) {
            return static::$holidays;
        }

        $path = resource_path('data/japanese_holidays_2020_2031.json');
        if (! file_exists($path)) {
            return static::$holidays = collect();
        }

        $decoded = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);

        return static::$holidays = collect($decoded)
            ->mapWithKeys(fn (array $info, string $date) => [Carbon::parse($date)->toDateString() => $info]);
    }

    public static function between(Carbon $start, Carbon $end): array
    {
        $startDate = $start->toDateString();
        $endDate = $end->toDateString();

        return static::data()
            ->filter(fn (array $_, string $date) => $date >= $startDate && $date <= $endDate)
            ->keys()
            ->sort()
            ->values()
            ->all();
    }

    public static function isHoliday(Carbon|string $date): bool
    {
        $key = $date instanceof Carbon ? $date->toDateString() : Carbon::parse($date)->toDateString();

        return static::data()->has($key);
    }

    public static function info(Carbon|string $date): ?array
    {
        $key = $date instanceof Carbon ? $date->toDateString() : Carbon::parse($date)->toDateString();

        return static::data()->get($key);
    }
}
