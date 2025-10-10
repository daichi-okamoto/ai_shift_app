<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AvailabilityReminderTask extends Model
{
    use HasFactory;

    protected $fillable = [
        'unit_id',
        'period',
        'scheduled_for',
        'status',
        'message',
        'triggered_at',
        'created_by',
    ];

    protected $casts = [
        'scheduled_for' => 'date',
        'triggered_at' => 'datetime',
    ];

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
