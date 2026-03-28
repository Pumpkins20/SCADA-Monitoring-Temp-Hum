<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AlarmEvent extends Model
{
    /** @var list<string> */
    protected $fillable = [
        'sensor_id',
        'alarm_type',
        'current_value',
        'occurred_at',
        'cleared_at',
    ];

    protected function casts(): array
    {
        return [
            'current_value' => 'decimal:2',
            'occurred_at' => 'datetime',
            'cleared_at' => 'datetime',
        ];
    }

    public function sensor(): BelongsTo
    {
        return $this->belongsTo(Sensor::class);
    }
}
