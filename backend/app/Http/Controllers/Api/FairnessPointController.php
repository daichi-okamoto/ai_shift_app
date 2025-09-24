<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FairnessPoint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class FairnessPointController extends Controller
{
    public function summary(Request $request): JsonResponse
    {
        $user = $request->user();

        $period = $request->query('period');

        $periodStart = $this->resolvePeriodStart($period);
        $periodEnd = (clone $periodStart)->endOfMonth();

        $points = FairnessPoint::query()
            ->with(['user.memberships.unit'])
            ->where('period_start', $periodStart->toDateString())
            ->whereHas('user', function ($query) use ($user): void {
                $query->where('organization_id', $user->organization_id);
            })
            ->get();

        $summary = [
            'period' => [
                'start' => $periodStart->toDateString(),
                'end' => $periodEnd->toDateString(),
                'label' => $periodStart->format('Y年n月度'),
            ],
            'totals' => [
                'member_count' => $points->count(),
                'total_points' => $points->sum('total_points'),
                'average_total' => $points->count() ? round($points->avg('total_points'), 1) : 0,
                'max_total' => $points->max('total_points') ?? 0,
                'min_total' => $points->count() ? $points->min('total_points') : 0,
                'night_points' => $points->sum('night_points'),
                'weekend_points' => $points->sum('weekend_points'),
                'holiday_points' => $points->sum('holiday_points'),
            ],
            'top_members' => $points
                ->sortByDesc('total_points')
                ->take(3)
                ->map(function (FairnessPoint $point) {
                    $user = $point->user;
                    $unitNames = $user?->memberships
                        ?->pluck('unit.name')
                        ->filter()
                        ->unique()
                        ->values()
                        ->all() ?? [];

                    return [
                        'user_id' => $point->user_id,
                        'name' => $user?->name,
                        'role' => $user?->role,
                        'unit_names' => $unitNames,
                        'night_points' => (int) $point->night_points,
                        'weekend_points' => (int) $point->weekend_points,
                        'holiday_points' => (int) $point->holiday_points,
                        'total_points' => (int) $point->total_points,
                    ];
                })
                ->values()
                ->all(),
        ];

        return response()->json([
            'data' => $summary,
        ]);
    }

    private function resolvePeriodStart(?string $period): Carbon
    {
        if ($period) {
            try {
                return Carbon::createFromFormat('Y-m', $period)->startOfMonth();
            } catch (\Throwable $exception) {
                // Fallback to current month when the provided format is invalid.
            }
        }

        return Carbon::now()->startOfMonth();
    }
}

