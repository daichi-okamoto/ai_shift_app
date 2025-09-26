<?php

namespace Database\Seeders;

use App\Models\Assignment;
use App\Models\AvailabilityRequest;
use App\Models\FairnessPoint;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\Shift;
use App\Models\ShiftType;
use App\Models\Unit;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Arr;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $organization = Organization::factory()->create([
            'name' => 'ケアホーム未来',
            'code' => 'CARE001',
            'settings' => [
                'timezone' => 'Asia/Tokyo',
            ],
        ]);

        $shiftTypes = collect([
            ['code' => 'EARLY', 'name' => '早番', 'start_at' => '07:00', 'end_at' => '15:45', 'break' => 60],
            ['code' => 'DAY', 'name' => '日勤', 'start_at' => '08:30', 'end_at' => '17:15', 'break' => 60],
            ['code' => 'LATE', 'name' => '遅番', 'start_at' => '11:45', 'end_at' => '20:30', 'break' => 60],
            ['code' => 'NIGHT', 'name' => '夜勤', 'start_at' => '16:30', 'end_at' => '09:30', 'break' => 90],
            ['code' => 'NIGHT_AFTER', 'name' => '夜勤明け', 'start_at' => '09:30', 'end_at' => '13:30', 'break' => 0],
            ['code' => 'OFF', 'name' => '休み', 'start_at' => '00:00', 'end_at' => '23:59', 'break' => 0],
        ])->mapWithKeys(fn (array $data) => [
            $data['code'] => ShiftType::create([
                'organization_id' => $organization->id,
                'name' => $data['name'],
                'code' => $data['code'],
                'start_at' => $data['start_at'],
                'end_at' => $data['end_at'],
                'break_minutes' => $data['break'],
                'is_default' => in_array($data['code'], ['EARLY', 'DAY', 'LATE', 'NIGHT'], true),
            ]),
        ]);

        $defaultShiftTypeIds = $shiftTypes
            ->filter(fn ($type, $code) => in_array($code, ['EARLY', 'DAY', 'LATE', 'NIGHT'], true))
            ->pluck('id')
            ->values()
            ->all();

        $unitDefinitions = [
            ['name' => '1AB ユニット', 'code' => '1AB'],
            ['name' => '1CD ユニット', 'code' => '1CD'],
            ['name' => '2AB ユニット', 'code' => '2AB'],
            ['name' => '2CD ユニット', 'code' => '2CD'],
            ['name' => '3AB ユニット', 'code' => '3AB'],
        ];

        $units = collect($unitDefinitions)->map(function (array $definition, int $index) use ($organization) {
            return Unit::create([
                'organization_id' => $organization->id,
                'name' => $definition['name'],
                'code' => $definition['code'],
                'display_order' => $index + 1,
                'coverage_requirements' => [
                    'early' => 1,
                    'day' => 1,
                    'late' => 1,
                    'night' => 1,
                ],
            ]);
        });

        $admin = User::query()->updateOrCreate(
            ['email' => 'admin@example.com'],
            [
                'organization_id' => $organization->id,
                'name' => '管理者 太郎',
                'role' => 'admin',
                'employment_type' => 'full_time',
                'password' => 'password',
            ]
        );
        $admin->memberships()->delete();
        $admin->allowedShiftTypes()->sync($defaultShiftTypeIds);

        $membersByUnit = [];

        foreach ($units as $unit) {
            $leader = User::factory()
                ->for($organization)
                ->state([
                    'name' => $unit->code . ' リーダー',
                    'role' => 'leader',
                    'employment_type' => 'full_time',
                ])->create();
            $leader->allowedShiftTypes()->sync($defaultShiftTypeIds);

            $fullTimeStaff = User::factory()
                ->count(6)
                ->for($organization)
                ->state([
                    'role' => 'member',
                    'employment_type' => 'full_time',
                ])->create();

            foreach ($fullTimeStaff as $member) {
                $member->allowedShiftTypes()->sync($defaultShiftTypeIds);
            }

            $partTimeShiftTypeIds = [
                $shiftTypes['DAY']->id,
            ];

            $partTimeStaff = User::factory()
                ->count(3)
                ->for($organization)
                ->state([
                    'role' => 'member',
                    'employment_type' => 'part_time',
                ])->create();

            foreach ($partTimeStaff as $member) {
                $member->allowedShiftTypes()->sync($partTimeShiftTypeIds);
            }

            Membership::create([
                'user_id' => $leader->id,
                'unit_id' => $unit->id,
                'role' => 'leader',
                'display_order' => 0,
            ]);

            $order = 1;
            $staffMembers = $fullTimeStaff->merge($partTimeStaff);
            foreach ($staffMembers as $member) {
                Membership::create([
                    'user_id' => $member->id,
                    'unit_id' => $unit->id,
                    'role' => 'member',
                    'display_order' => $order++,
                ]);
            }

            $unitMembers = collect([$leader])
                ->merge($fullTimeStaff)
                ->merge($partTimeStaff)
                ->map(fn (User $user) => $user->load('allowedShiftTypes'));

            $membersByUnit[$unit->id] = $unitMembers;
        }

        $periodStart = Carbon::now()->startOfMonth();
        $periodEnd = (clone $periodStart)->endOfMonth();

        foreach ($membersByUnit as $unitMembers) {
            foreach ($unitMembers as $user) {
                FairnessPoint::create([
                    'user_id' => $user->id,
                    'period_start' => $periodStart,
                    'period_end' => $periodEnd,
                    'night_points' => 0,
                    'weekend_points' => 0,
                    'holiday_points' => 0,
                    'total_points' => 0,
                ]);
            }
        }

        $startDate = Carbon::now()->startOfWeek(Carbon::MONDAY);

        foreach (range(0, 6) as $offset) {
            $workDate = (clone $startDate)->addDays($offset);

            foreach ($units as $unit) {
                $unitMembers = $membersByUnit[$unit->id];

                foreach (['EARLY', 'DAY', 'LATE', 'NIGHT'] as $code) {
                    $shift = Shift::create([
                        'unit_id' => $unit->id,
                        'shift_type_id' => $shiftTypes[$code]->id,
                        'work_date' => $workDate,
                        'start_at' => $shiftTypes[$code]->start_at,
                        'end_at' => $shiftTypes[$code]->end_at,
                        'status' => $offset <= 1 ? 'published' : 'draft',
                        'meta' => [
                            'coverage' => Arr::get($unit->coverage_requirements, strtolower($code), 1),
                        ],
                    ]);

                    $eligibleMembers = $unitMembers->filter(function (User $member) use ($code) {
                        $allowedCodes = $member->allowedShiftTypes
                            ->pluck('code')
                            ->map(fn ($value) => strtoupper((string) $value))
                            ->all();
                        return in_array($code, $allowedCodes, true);
                    });

                    if ($eligibleMembers->isEmpty()) {
                        continue;
                    }

                    $assignee = $eligibleMembers->random();
                    Assignment::create([
                        'shift_id' => $shift->id,
                        'user_id' => $assignee->id,
                        'status' => $offset <= 1 ? 'final' : 'draft',
                        'is_night_aftercare_blocked' => $code === 'NIGHT',
                    ]);

                    if (in_array($code, ['NIGHT'], true)) {
                        $fairness = FairnessPoint::where('user_id', $assignee->id)
                            ->where('period_start', $periodStart)
                            ->first();

                        if ($fairness) {
                            $fairness->increment('night_points', 3);
                            if ($workDate->isWeekend()) {
                                $fairness->increment('weekend_points', 1);
                                $fairness->increment('total_points', 4);
                            } else {
                                $fairness->increment('total_points', 3);
                            }
                        }
                    }
                }

                AvailabilityRequest::create([
                    'user_id' => $unitMembers->random()->id,
                    'unit_id' => $unit->id,
                    'work_date' => (clone $workDate)->addDays(3),
                    'type' => 'wish',
                    'start_at' => '09:00',
                    'end_at' => '15:00',
                    'status' => 'pending',
                    'reason' => '通院のための希望です。',
                ]);
            }
        }

        $admin->memberships()->create([
            'unit_id' => $units->first()->id,
            'role' => 'leader',
            'display_order' => 99,
        ]);

        $generalMember = User::query()->firstOrCreate(
            ['email' => 'member@example.com'],
            [
                'organization_id' => $organization->id,
                'name' => '一般ユーザー 花子',
                'role' => 'member',
                'employment_type' => 'part_time',
                'password' => 'password',
            ],
        );

        $targetUnit = $units->first();

        Membership::query()->updateOrCreate(
            [
                'user_id' => $generalMember->id,
                'unit_id' => $targetUnit->id,
            ],
            [
                'role' => 'member',
                'display_order' => 10,
            ],
        );

        $sampleDate = Carbon::now()->addDays(2)->toDateString();
        $dayShiftType = $shiftTypes['DAY'];

        $sampleShift = Shift::query()->firstOrCreate(
            [
                'unit_id' => $targetUnit->id,
                'work_date' => $sampleDate,
                'shift_type_id' => $dayShiftType->id,
            ],
            [
                'start_at' => $dayShiftType->start_at,
                'end_at' => $dayShiftType->end_at,
                'status' => 'draft',
                'meta' => [
                    'created_via' => 'seeder',
                ],
            ],
        );

        Assignment::query()->updateOrCreate(
            [
                'shift_id' => $sampleShift->id,
                'user_id' => $generalMember->id,
            ],
            [
                'status' => 'draft',
                'note' => 'サンプル登録された日勤シフトです。',
            ],
        );

        AvailabilityRequest::query()->updateOrCreate(
            [
                'user_id' => $generalMember->id,
                'unit_id' => $targetUnit->id,
                'work_date' => $sampleDate,
                'type' => 'wish',
            ],
            [
                'start_at' => '09:00',
                'end_at' => '15:00',
                'status' => 'pending',
                'reason' => '家族の都合により夕方は不在予定です。',
            ],
        );
    }
}
