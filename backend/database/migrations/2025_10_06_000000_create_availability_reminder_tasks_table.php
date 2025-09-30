<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('availability_reminder_tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('unit_id')->constrained()->cascadeOnDelete();
            $table->string('period', 7);
            $table->date('scheduled_for');
            $table->enum('status', ['pending', 'sent', 'skipped'])->default('pending');
            $table->timestamp('triggered_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['unit_id', 'period', 'scheduled_for']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('availability_reminder_tasks');
    }
};
