<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\AvailabilityReminderTask;
use App\Models\Organization;
use App\Models\Unit;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AvailabilityReminderTaskTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(CarbonImmutable::parse('2025-09-29 09:00:00', 'Asia/Tokyo'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_admin_can_schedule_reminder_task(): void
    {
        $organization = Organization::factory()->create();
        $unit = Unit::factory()->create([
            'organization_id' => $organization->id,
        ]);
        $admin = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => UserRole::Admin,
        ]);

        $period = CarbonImmutable::now()->addMonth()->format('Y-m');
        $scheduledFor = CarbonImmutable::now()->addDays(5)->format('Y-m-d');

        $response = $this->actingAs($admin)->postJson("/api/units/{$unit->id}/availability-reminders", [
            'period' => $period,
            'scheduled_for' => $scheduledFor,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('data.period', $period);
        $response->assertJsonPath('data.scheduled_for', $scheduledFor);

        $task = AvailabilityReminderTask::first();
        $this->assertNotNull($task);
        $this->assertSame($unit->id, $task->unit_id);
        $this->assertSame($period, $task->period);
        $this->assertSame($scheduledFor, $task->scheduled_for->toDateString());
        $this->assertSame('pending', $task->status);
    }

    public function test_member_cannot_schedule_reminder_task(): void
    {
        $organization = Organization::factory()->create();
        $unit = Unit::factory()->create([
            'organization_id' => $organization->id,
        ]);
        $member = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => UserRole::Member,
        ]);

        $response = $this->actingAs($member)->postJson("/api/units/{$unit->id}/availability-reminders", [
            'period' => CarbonImmutable::now()->format('Y-m'),
            'scheduled_for' => CarbonImmutable::now()->addDays(3)->format('Y-m-d'),
        ]);

        $response->assertStatus(403);
        $this->assertDatabaseCount('availability_reminder_tasks', 0);
    }

    public function test_command_sends_due_reminder_tasks(): void
    {
        $today = CarbonImmutable::now()->format('Y-m-d');

        $organization = Organization::factory()->create();
        $unit = Unit::factory()->create([
            'organization_id' => $organization->id,
        ]);

        $task = AvailabilityReminderTask::create([
            'unit_id' => $unit->id,
            'period' => CarbonImmutable::now()->addMonth()->format('Y-m'),
            'scheduled_for' => $today,
            'status' => 'pending',
        ]);

        $this->artisan('availability:send-reminders')
            ->expectsOutputToContain('Processed')
            ->assertExitCode(0);

        $task->refresh();
        $this->assertSame('sent', $task->status);
        $this->assertNotNull($task->triggered_at);
    }
}
