<?php

namespace App\Console\Commands;

use App\Models\AvailabilityReminderTask;
use App\Services\AvailabilityScheduleService;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SendScheduledAvailabilityReminders extends Command
{
    protected $signature = 'availability:send-reminders';

    protected $description = 'Send availability reminder emails for scheduled tasks.';

    public function handle(): int
    {
        $now = CarbonImmutable::now();
        $tasks = AvailabilityReminderTask::query()
            ->with(['unit.organization'])
            ->where('status', 'pending')
            ->orderBy('scheduled_for')
            ->get();

        if ($tasks->isEmpty()) {
            $this->info('No pending reminder tasks.');

            return self::SUCCESS;
        }

        $processed = 0;
        foreach ($tasks as $task) {
            $service = new AvailabilityScheduleService($task->unit);
            $settings = $service->settings();
            $timezone = $settings['timezone'] ?? 'Asia/Tokyo';

            $scheduledFor = CarbonImmutable::parse($task->scheduled_for, $timezone);
            $today = CarbonImmutable::now($timezone)->startOfDay();

            if ($scheduledFor->startOfDay()->gt($today)) {
                continue;
            }

            $periodData = $service->compute($task->period);

            if ($periodData['reminder_sent_at']) {
                $task->update([
                    'status' => 'sent',
                    'triggered_at' => $now,
                ]);
                $processed++;
                continue;
            }

            try {
                $service->markReminderSent($periodData['period'], CarbonImmutable::now($timezone));
                $this->sendSlackReminder($task->message, $task->unit->organization->settings['availability']['slack_webhook_url'] ?? null);

                $task->update([
                    'status' => 'sent',
                    'triggered_at' => CarbonImmutable::now(),
                ]);
                $processed++;
            } catch (\Throwable $exception) {
                Log::error('Failed to send scheduled availability reminder', [
                    'task_id' => $task->id,
                    'unit_id' => $task->unit_id,
                    'period' => $task->period,
                    'error' => $exception->getMessage(),
                ]);

                $task->update([
                    'status' => 'skipped',
                    'triggered_at' => null,
                ]);
            }
        }

        $this->info(sprintf('Processed %d reminder task(s).', $processed));

        return self::SUCCESS;
    }

    private function sendSlackReminder(?string $message, ?string $webhookUrl): void
    {
        if (! $webhookUrl) {
            return;
        }

        $payload = [
            'text' => $message ?? '希望・休暇申請のリマインドを送信しました。',
        ];

        try {
            Http::post($webhookUrl, $payload);
        } catch (\Throwable $e) {
            Log::error('Failed to notify Slack about availability reminder', [
                'error' => $e->getMessage(),
            ]);
        }
    }
}
