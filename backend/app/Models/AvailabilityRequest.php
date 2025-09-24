<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AvailabilityRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'unit_id',
        'work_date',
        'type',
        'start_at',
        'end_at',
        'status',
        'reason',
    ];

    protected $casts = [
        'work_date' => 'date',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }
}
