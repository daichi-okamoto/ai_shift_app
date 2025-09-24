<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('unit_id')->constrained()->cascadeOnDelete();
            $table->foreignId('shift_type_id')->nullable()->constrained()->nullOnDelete();
            $table->date('work_date');
            $table->time('start_at');
            $table->time('end_at');
            $table->enum('status', ['draft', 'published'])->default('draft');
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['unit_id', 'work_date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('shifts');
    }
};
