<?php

namespace App\Models;

use Database\Factories\SensorLatestDataFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SensorLatestData extends Model
{
    /** @use HasFactory<SensorLatestDataFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = [
        'sensor_id',
        'temperature',
        'humidity',
        'status',
        'alarm_temp',
        'alarm_hum',
        'alarm_disconnect',
        'calibrate_temp',
        'calibrate_hum',
        'over_temp',
        'under_temp',
        'over_hum',
        'under_hum',
        'last_read_at',
    ];

    protected function casts(): array
    {
        return [
            'temperature' => 'decimal:2',
            'humidity' => 'decimal:2',
            'alarm_temp' => 'boolean',
            'alarm_hum' => 'boolean',
            'alarm_disconnect' => 'boolean',
            'calibrate_temp' => 'decimal:2',
            'calibrate_hum' => 'decimal:2',
            'over_temp' => 'decimal:2',
            'under_temp' => 'decimal:2',
            'over_hum' => 'decimal:2',
            'under_hum' => 'decimal:2',
            'last_read_at' => 'datetime',
        ];
    }

    public function sensor(): BelongsTo
    {
        return $this->belongsTo(Sensor::class);
    }
}
