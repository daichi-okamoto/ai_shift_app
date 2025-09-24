<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Organization;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UnitMembershipTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_add_member_to_unit(): void
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

        $payload = [
            'members' => [
                [
                    'user_id' => $member->id,
                    'role' => 'member',
                ],
            ],
        ];

        $response = $this->actingAs($admin)->putJson("/api/units/{$unit->id}/memberships", $payload);

        $response->assertStatus(200);
        $response->assertJsonPath('data.members.0.id', $member->id);
    }

    public function test_admin_can_append_member_to_existing_memberships(): void
    {
        $organization = Organization::factory()->create();
        $unit = Unit::factory()->create([
            'organization_id' => $organization->id,
        ]);

        $admin = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => UserRole::Admin,
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

        $newMember = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => UserRole::Member,
        ]);

        $payload = [
            'members' => [
                [
                    'user_id' => $leader->id,
                    'role' => 'leader',
                ],
                [
                    'user_id' => $newMember->id,
                    'role' => 'member',
                ],
            ],
        ];

        $response = $this->actingAs($admin)->putJson("/api/units/{$unit->id}/memberships", $payload);

        $response->assertStatus(200);
        $response->assertJsonPath('data.members.1.id', $newMember->id);
    }

    // Primary member concept removed; ordering is preserved but no special handling needed.
}
