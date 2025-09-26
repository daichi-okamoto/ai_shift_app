<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Assignment;
use App\Models\Organization;
use App\Models\Shift;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EmployeeDeletionKeepsAssignmentsTest extends TestCase
{
    use RefreshDatabase;

    public function test_deleting_employee_retains_shift_assignments(): void
    {
        $organization = Organization::factory()->create();
        $admin = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => UserRole::Admin,
        ]);
        $member = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => UserRole::Member,
        ]);
        $unit = Unit::factory()->create([
            'organization_id' => $organization->id,
        ]);

        $unit->memberships()->create([
            'user_id' => $member->id,
            'role' => 'member',
            'display_order' => 0,
        ]);

        $shift = Shift::create([
            'unit_id' => $unit->id,
            'shift_type_id' => null,
            'work_date' => now()->toDateString(),
            'start_at' => '09:00',
            'end_at' => '18:00',
            'status' => 'draft',
            'meta' => null,
        ]);

        $assignment = $shift->assignments()->create([
            'user_id' => $member->id,
            'status' => 'draft',
            'is_night_aftercare_blocked' => false,
            'note' => null,
        ]);

        $this->actingAs($admin)
            ->deleteJson("/api/employees/{$member->id}")
            ->assertNoContent();

        $this->assertDatabaseHas('assignments', [
            'id' => $assignment->id,
            'shift_id' => $shift->id,
            'user_id' => null,
        ]);
        $this->assertDatabaseCount('assignments', 1);
    }
}
