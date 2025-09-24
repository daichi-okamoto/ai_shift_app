<?php

namespace App\Console\Commands;

use App\Models\Unit;
use Illuminate\Console\Command;

class GenerateUnitSchedule extends Command
{
    protected $signature = 'shifts:generate {unit_id : Target unit ID} {month : YYYY-MM format}';

    protected $description = 'Generate shifts using the optimizer script.';

    public function handle(): int
    {
        $unitId = (int) $this->argument('unit_id');
        $month = (string) $this->argument('month');

        $unit = Unit::with(['memberships.user'])->find($unitId);

        if (! $unit) {
            $this->error('Unit not found.');
            return self::FAILURE;
        }

        $controller = app(\App\Http\Controllers\Api\ShiftGenerationController::class);
        $payload = $controller->buildPayloadForUnit(
            $unit,
            $month,
            days: null,
            memberships: null,
            coverage: null,
            constraints: [
                'enforce_night_after_rest' => true,
                'forbid_late_to_early' => true,
                'limit_fulltime_repeat' => true,
                'balance_workload' => true,
                'max_nights_per_member' => 7,
                'max_consecutive_workdays' => 5,
                'time_limit' => 20,
            ],
        );

        $result = $controller->runOptimizer($payload);

        if (isset($result['error'])) {
            $this->error($result['error']);
            return self::FAILURE;
        }

        $controller->storeGeneratedSchedule($unit, $month, $result);

        $this->info('Schedule generated successfully.');
        return self::SUCCESS;
    }
}
