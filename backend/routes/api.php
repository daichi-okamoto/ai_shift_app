<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AvailabilityRequestController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\FairnessPointController;
use App\Http\Controllers\Api\ShiftController;
use App\Http\Controllers\Api\ShiftGenerationController;
use App\Http\Controllers\Api\ShiftTypeController;
use App\Http\Controllers\Api\UnitController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/register', [AuthController::class, 'register']);
});

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::put('/auth/password', [AuthController::class, 'updatePassword']);

    Route::middleware('role:admin,leader,member')->group(function (): void {
        Route::get('/units', [UnitController::class, 'index']);
        Route::middleware('role:admin')->group(function (): void {
            Route::post('/units', [UnitController::class, 'store']);
            Route::put('/units/{unit}', [UnitController::class, 'update']);
            Route::delete('/units/{unit}', [UnitController::class, 'destroy']);
            Route::post('/units/reorder', [UnitController::class, 'reorder']);
        });

        Route::middleware('role:admin,leader')->group(function (): void {
            Route::put('/units/{unit}/memberships', [UnitController::class, 'updateMemberships']);
        });

        Route::get('/units/{unit}/shifts', [ShiftController::class, 'index']);
        Route::get('/units/{unit}/shifts/export', [ShiftController::class, 'exportMonthly']);
        Route::post('/units/{unit}/shifts/batch', [ShiftController::class, 'batchUpsert']);
        Route::post('/units/{unit}/shifts/delete-range', [ShiftController::class, 'bulkDelete']);
        Route::post('/units/{unit}/shifts/auto-generate', [ShiftGenerationController::class, 'generate']);
        Route::get('/shift-types', [ShiftTypeController::class, 'index']);

        Route::middleware('role:admin,leader')->group(function (): void {
            Route::post('/units/{unit}/shifts', [ShiftController::class, 'store']);
        });

        Route::get('/units/{unit}/availability-requests', [AvailabilityRequestController::class, 'index']);
        Route::post('/units/{unit}/availability-requests', [AvailabilityRequestController::class, 'store']);
        Route::delete('/units/{unit}/availability-requests/{availabilityRequest}', [AvailabilityRequestController::class, 'destroy']);
        Route::get('/units/{unit}/availability-schedule', [AvailabilityRequestController::class, 'schedule']);
        Route::post('/units/{unit}/availability-schedule/remind', [AvailabilityRequestController::class, 'sendReminder']);

        Route::get('/fairness/summary', [FairnessPointController::class, 'summary']);
    });

    Route::middleware('role:admin,leader')->group(function (): void {
        Route::get('/employees', [EmployeeController::class, 'index']);
        Route::get('/employees/{employee}', [EmployeeController::class, 'show']);
    });

    Route::middleware('role:admin')->group(function (): void {
        Route::post('/employees', [EmployeeController::class, 'store']);
        Route::put('/employees/{employee}', [EmployeeController::class, 'update']);
        Route::delete('/employees/{employee}', [EmployeeController::class, 'destroy']);
    });
});
