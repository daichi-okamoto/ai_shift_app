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
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'contract_hours_per_week')) {
                $table->dropColumn('contract_hours_per_week');
            }

            if (Schema::hasColumn('users', 'can_night_shift')) {
                $table->dropColumn('can_night_shift');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedSmallInteger('contract_hours_per_week')->nullable()->after('employment_type');
            $table->boolean('can_night_shift')->default(false)->after('employment_type');
        });
    }
};
