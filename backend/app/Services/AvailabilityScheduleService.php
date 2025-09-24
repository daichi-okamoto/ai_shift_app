<?php

namespace App\Services;

use App\Models\AvailabilityRequest;
use App\Models\Unit;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

class AvailabilityScheduleService
{
    public function __construct(private Unit $unit)
    {
        $this->unit->loadMissing(['organization', 'memberships.user']);
    }

    public function settings(): array
    {
        $settings = $this->unit->organization->settings ?? [];
        $availability = $settings['availability'] ?? [];

        return [
            'deadline_day' => $availability['deadline_day'] ?? 20,
            'reminder_days_before' => $availability['reminder_days_before'] ?? 3,
            'timezone' => $availability['timezone'] ?? 'Asia/Tokyo',
            'reminder_log' => $availability['reminder_log'] ?? [],
        ];
    }

    public function compute(string $period = null): array
    {
        $settings = $this->settings();
        $timezone = $settings['timezone'];
        $now = CarbonImmutable::now($timezone);

        if ($period) {
            try {
                $periodStart = CarbonImmutable::createFromFormat('Y-m', $period, $timezone)->startOfMonth();
            } catch (\Throwable $e) {
                $periodStart = $now->startOfMonth()->addMonth();
            }
        } else {
            $periodStart = $now->startOfMonth()->addMonth();
        }

        $periodEnd = $periodStart->endOfMonth();
        $deadlineDay = max(1, min(28, (int) $settings['deadline_day']));
        $deadlineBase = $periodStart->subMonth();
        $deadlineDay = min($deadlineDay, $deadlineBase->endOfMonth()->day);
        $deadlineAt = $deadlineBase->setDay($deadlineDay)->endOfDay();

        $reminderDayOffset = max(0, (int) $settings['reminder_days_before']);
        $reminderAt = $deadlineAt->subDays($reminderDayOffset);

        $periodKey = $this->periodKey($periodStart);
        $reminderSentAt = $this->reminderSentAt($settings['reminder_log'], $periodKey, $timezone);

        $requests = AvailabilityRequest::query()
            ->with(['user:id,name,role,email'])
            ->where('unit_id', $this->unit->id)
            ->whereBetween('work_date', [$periodStart->toDateString(), $periodEnd->toDateString()])
            ->orderBy('work_date')
            ->orderBy('created_at')
            ->get();

        $members = $this->unit->memberships
            ->filter(fn ($membership) => $membership->user !== null)
            ->map(fn ($membership) => $membership->user)
            ->unique('id');

        $requestsByUser = $requests->groupBy('user_id');
        $pendingMembers = $members->reject(fn ($member) => $requestsByUser->has($member->id))
            ->map(fn ($member) => [
                'id' => $member->id,
                'name' => $member->name,
                'role' => $member->role,
            ])->values();

        $submissions = $requestsByUser->map(function (Collection $items, int $userId) use ($members) {
            $member = $members->firstWhere('id', $userId);

            return [
                'user_id' => $userId,
                'user_name' => $member?->name,
                'role' => $member?->role,
                'count' => $items->count(),
                'latest_submitted_at' => optional($items->last()->created_at)->toIso8601String(),
            ];
        })->values();

        return [
            'period' => $periodStart->format('Y-m'),
            'period_start' => $periodStart->toDateString(),
            'period_end' => $periodEnd->toDateString(),
            'deadline_at' => $deadlineAt->toIso8601String(),
            'reminder_at' => $reminderAt->toIso8601String(),
            'reminder_sent_at' => $reminderSentAt?->toIso8601String(),
            'timezone' => $timezone,
            'now' => $now->toIso8601String(),
            'is_deadline_passed' => $now->greaterThan($deadlineAt),
            'is_reminder_due' => $now->greaterThanOrEqualTo($reminderAt) && ! $reminderSentAt,
            'pending_members' => $pendingMembers,
            'submissions' => $submissions,
        ];
    }

    public function markReminderSent(string $period, CarbonImmutable $timestamp): void
    {
        $settings = $this->unit->organization->settings ?? [];
        $availability = $settings['availability'] ?? [];
        $log = $availability['reminder_log'] ?? [];

        $timezone = $availability['timezone'] ?? 'Asia/Tokyo';

        try {
            $periodStart = CarbonImmutable::createFromFormat('Y-m', $period, $timezone)->startOfMonth();
        } catch (\Throwable $e) {
            $periodStart = CarbonImmutable::now($timezone)->startOfMonth()->addMonth();
        }
        $key = $this->periodKey($periodStart);
        $log[$key] = $timestamp->toIso8601String();

        $availability['reminder_log'] = $log;
        $settings['availability'] = $availability;

        $organization = $this->unit->organization;
        $organization->settings = $settings;
        $organization->save();
    }

    private function periodKey(CarbonImmutable $periodStart): string
    {
        return sprintf('unit:%d:%s', $this->unit->id, $periodStart->format('Y-m'));
    }

    private function reminderSentAt(array $log, string $key, string $timezone): ?CarbonImmutable
    {
        if (! array_key_exists($key, $log)) {
            return null;
        }

        try {
            return CarbonImmutable::parse($log[$key], $timezone);
        } catch (\Throwable $e) {
            return null;
        }
    }
}
