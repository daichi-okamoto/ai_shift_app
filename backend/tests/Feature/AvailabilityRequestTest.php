<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Organization;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AvailabilityRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_submit_request_on_behalf_of_unit_member(): void
    {
        $organization = Organization::factory()->create();
        $unit = Unit::factory()->create([
            'organization_id' => $organization->id,
        ]);

        $admin = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => UserRole::Admin,
        ]);

        $member = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => UserRole::Member,
        ]);

        $unit->memberships()->create([
            'user_id' => $member->id,
            'role' => 'member',
            'display_order' => 0,
        ]);

        $payload = [
            'user_id' => $member->id,
            'work_date' => now()->addDays(5)->toDateString(),
            'type' => 'wish',
            'start_at' => '09:00',
            'end_at' => '18:00',
        ];

        $response = $this->actingAs($admin)->postJson("/api/units/{$unit->id}/availability-requests", $payload);

        $response->assertCreated();
        $response->assertJsonPath('data.user_id', $member->id);

        $this->assertDatabaseHas('availability_requests', [
            'user_id' => $member->id,
            'unit_id' => $unit->id,
            'type' => 'wish',
            'start_at' => '09:00',
            'end_at' => '18:00',
        ]);
    }

    public function test_leader_can_submit_request_for_unit_member(): void
    {
        $organization = Organization::factory()->create();
        $unit = Unit::factory()->create([
            'organization_id' => $organization->id,
        ]);

        $leader = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => UserRole::Leader,
        ]);

        $unit->memberships()->create([
            'user_id' => $leader->id,
            'role' => 'leader',
            'display_order' => 0,
        ]);

        $member = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => UserRole::Member,
        ]);

        $unit->memberships()->create([
            'user_id' => $member->id,
            'role' => 'member',
            'display_order' => 1,
        ]);

        $payload = [
            'user_id' => $member->id,
            'work_date' => now()->addDays(3)->toDateString(),
            'type' => 'unavailable',
        ];

        $response = $this->actingAs($leader)->postJson("/api/units/{$unit->id}/availability-requests", $payload);

        $response->assertCreated();
        $response->assertJsonPath('data.user_id', $member->id);
        $this->assertDatabaseHas('availability_requests', [
            'user_id' => $member->id,
            'unit_id' => $unit->id,
            'type' => 'unavailable',
        ]);
    }

    public function test_leader_cannot_submit_for_user_outside_unit(): void
    {
        $organization = Organization::factory()->create();
        $unit = Unit::factory()->create([
            'organization_id' => $organization->id,
        ]);

        $leader = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => UserRole::Leader,
        ]);

        $unit->memberships()->create([
            'user_id' => $leader->id,
            'role' => 'leader',
            'display_order' => 0,
        ]);

        $otherUnit = Unit::factory()->create([
            'organization_id' => $organization->id,
        ]);

        $otherMember = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => UserRole::Member,
        ]);

        $otherUnit->memberships()->create([
            'user_id' => $otherMember->id,
            'role' => 'member',
            'display_order' => 0,
        ]);

        $payload = [
            'user_id' => $otherMember->id,
            'work_date' => now()->addDays(2)->toDateString(),
            'type' => 'wish',
        ];

        $response = $this->actingAs($leader)->postJson("/api/units/{$unit->id}/availability-requests", $payload);

        $response->assertStatus(422);
        $response->assertJsonFragment(['message' => '指定した従業員はこのユニットに所属していません。']);
        $this->assertDatabaseMissing('availability_requests', [
            'user_id' => $otherMember->id,
            'unit_id' => $unit->id,
        ]);
    }

    public function test_member_cannot_submit_on_behalf_of_other_user(): void
    {
        $organization = Organization::factory()->create();
        $unit = Unit::factory()->create([
            'organization_id' => $organization->id,
        ]);

        $member = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => UserRole::Member,
        ]);

        $unit->memberships()->create([
            'user_id' => $member->id,
            'role' => 'member',
            'display_order' => 0,
        ]);

        $otherMember = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => UserRole::Member,
        ]);

        $unit->memberships()->create([
            'user_id' => $otherMember->id,
            'role' => 'member',
            'display_order' => 1,
        ]);

        $payload = [
            'user_id' => $otherMember->id,
            'work_date' => now()->addDays(4)->toDateString(),
            'type' => 'vacation',
        ];

        $response = $this->actingAs($member)->postJson("/api/units/{$unit->id}/availability-requests", $payload);

        $response->assertForbidden();
        $this->assertDatabaseMissing('availability_requests', [
            'user_id' => $otherMember->id,
            'unit_id' => $unit->id,
        ]);
    }
}
