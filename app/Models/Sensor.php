<?php

namespace App\Models;

use Database\Factories\SensorFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Sensor extends Model
{
    /** @use HasFactory<SensorFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = [
        'hmi_id',
        'name',
        'modbus_address_temp',
        'modbus_address_hum',
        'unit_id',
        'pos_x',
        'pos_y',
    ];

    protected function casts(): array
    {
        return [
            'modbus_address_temp' => 'integer',
            'modbus_address_hum' => 'integer',
            'unit_id' => 'integer',
            'pos_x' => 'integer',
            'pos_y' => 'integer',
        ];
    }

    public function hmi(): BelongsTo
    {
        return $this->belongsTo(Hmi::class);
    }

    public function latestData(): HasOne
    {
        return $this->hasOne(SensorLatestData::class);
    }

    public function readings(): HasMany
    {
        return $this->hasMany(SensorReading::class);
    }

    public function alarmEvents(): HasMany
    {
        return $this->hasMany(AlarmEvent::class);
    }
}
