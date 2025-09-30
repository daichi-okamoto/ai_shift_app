<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() === 'sqlite') {
            DB::statement('PRAGMA foreign_keys=OFF');

            Schema::table('assignments', function (Blueprint $table) {
                $table->dropForeign(['user_id']);
            });

            Schema::create('assignments_temp', function (Blueprint $table) {
                $table->id();
                $table->foreignId('shift_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
                $table->enum('status', ['draft', 'final'])->default('draft');
                $table->boolean('is_night_aftercare_blocked')->default(false);
                $table->text('note')->nullable();
                $table->timestamps();
                $table->unique(['shift_id', 'user_id']);
            });

            DB::statement('INSERT INTO assignments_temp (id, shift_id, user_id, status, is_night_aftercare_blocked, note, created_at, updated_at) SELECT id, shift_id, user_id, status, is_night_aftercare_blocked, note, created_at, updated_at FROM assignments');

            Schema::drop('assignments');
            Schema::rename('assignments_temp', 'assignments');

            DB::statement('PRAGMA foreign_keys=ON');

            return;
        }

        Schema::table('assignments', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
        });

        DB::statement('ALTER TABLE assignments MODIFY user_id BIGINT UNSIGNED NULL');

        Schema::table('assignments', function (Blueprint $table) {
            $table->foreign('user_id')
                ->references('id')
                ->on('users')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() === 'sqlite') {
            DB::statement('PRAGMA foreign_keys=OFF');

            Schema::table('assignments', function (Blueprint $table) {
                $table->dropForeign(['user_id']);
            });

            Schema::create('assignments_temp', function (Blueprint $table) {
                $table->id();
                $table->foreignId('shift_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->enum('status', ['draft', 'final'])->default('draft');
                $table->boolean('is_night_aftercare_blocked')->default(false);
                $table->text('note')->nullable();
                $table->timestamps();
                $table->unique(['shift_id', 'user_id']);
            });

            DB::statement('INSERT INTO assignments_temp (id, shift_id, user_id, status, is_night_aftercare_blocked, note, created_at, updated_at) SELECT id, shift_id, user_id, status, is_night_aftercare_blocked, note, created_at, updated_at FROM assignments WHERE user_id IS NOT NULL');

            Schema::drop('assignments');
            Schema::rename('assignments_temp', 'assignments');

            DB::statement('PRAGMA foreign_keys=ON');

            return;
        }

        Schema::table('assignments', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
        });

        DB::statement('DELETE FROM assignments WHERE user_id IS NULL');
        DB::statement('ALTER TABLE assignments MODIFY user_id BIGINT UNSIGNED NOT NULL');

        Schema::table('assignments', function (Blueprint $table) {
            $table->foreign('user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
        });
    }
};
