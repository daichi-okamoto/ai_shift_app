<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shift_type_user', function (Blueprint $table) {
            $table->foreignId('shift_type_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->primary(['shift_type_id', 'user_id']);
        });

        if (Schema::hasTable('users') && Schema::hasTable('shift_types')) {
            $shiftTypesByOrganization = DB::table('shift_types')
                ->select(['id', 'organization_id'])
                ->get()
                ->groupBy('organization_id');

            $timestamp = now();

            DB::table('users')
                ->select(['id', 'organization_id'])
                ->orderBy('id')
                ->chunk(500, function ($users) use ($shiftTypesByOrganization, $timestamp): void {
                    $rows = [];

                    foreach ($users as $user) {
                        $shiftTypes = $shiftTypesByOrganization->get($user->organization_id, collect());

                        foreach ($shiftTypes as $shiftType) {
                            $rows[] = [
                                'shift_type_id' => $shiftType->id,
                                'user_id' => $user->id,
                                'created_at' => $timestamp,
                                'updated_at' => $timestamp,
                            ];
                        }
                    }

                    if (! empty($rows)) {
                        DB::table('shift_type_user')->insert($rows);
                    }
                });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('shift_type_user');
    }
};
