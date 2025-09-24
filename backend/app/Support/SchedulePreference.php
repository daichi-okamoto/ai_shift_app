<?php

namespace App\Support;

use Carbon\Carbon;
use Illuminate\Support\Arr;

class SchedulePreference
{
    public const DAY_KEYS = [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
        'holiday',
    ];

    public static function defaults(): array
    {
        return [
            'fixed_days_off' => array_fill_keys(self::DAY_KEYS, false),
            'custom_dates_off' => [],
        ];
    }

    public static function normalize(?array $input): array
    {
        $normalized = self::defaults();

        if (! is_array($input)) {
            return $normalized;
        }

        $fixedDaysOff = Arr::get($input, 'fixed_days_off', []);
        if (is_array($fixedDaysOff)) {
            foreach (self::DAY_KEYS as $key) {
                if (array_key_exists($key, $fixedDaysOff)) {
                    $normalized['fixed_days_off'][$key] = filter_var($fixedDaysOff[$key], FILTER_VALIDATE_BOOLEAN);
                }
            }
        }

        $customDates = Arr::get($input, 'custom_dates_off', []);
        if (is_array($customDates)) {
            $normalized['custom_dates_off'] = collect($customDates)
                ->filter()
                ->map(fn ($value) => self::normalizeDate($value))
                ->filter()
                ->unique()
                ->sort()
                ->values()
                ->all();
        }

        return $normalized;
    }

    public static function prune(array $normalized): array
    {
        $pruned = [];
        $fixed = $normalized['fixed_days_off'] ?? [];
        if (is_array($fixed)) {
            $filtered = array_filter($fixed, fn ($value) => (bool) $value);
            if (! empty($filtered)) {
                $pruned['fixed_days_off'] = $filtered;
            }
        }

        $custom = $normalized['custom_dates_off'] ?? [];
        if (is_array($custom) && ! empty($custom)) {
            $pruned['custom_dates_off'] = array_values($custom);
        }

        return $pruned;
    }

    public static function expand(?array $stored): array
    {
        $expanded = self::defaults();

        if (! is_array($stored)) {
            return $expanded;
        }

        $fixed = Arr::get($stored, 'fixed_days_off', []);
        if (is_array($fixed)) {
            foreach (self::DAY_KEYS as $key) {
                if (array_key_exists($key, $fixed)) {
                    $expanded['fixed_days_off'][$key] = filter_var($fixed[$key], FILTER_VALIDATE_BOOLEAN);
                }
            }
        }

        $custom = Arr::get($stored, 'custom_dates_off', []);
        if (is_array($custom)) {
            $expanded['custom_dates_off'] = collect($custom)
                ->filter()
                ->map(fn ($value) => self::normalizeDate($value))
                ->filter()
                ->unique()
                ->sort()
                ->values()
                ->all();
        }

        return $expanded;
    }

    private static function normalizeDate(mixed $value): ?string
    {
        try {
            return Carbon::parse($value)->toDateString();
        } catch (\Throwable $e) {
            return null;
        }
    }
}
