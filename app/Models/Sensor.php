<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Sensor extends Model
{
    /** @use HasFactory<\Database\Factories\SensorFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = [
        'hmi_id',
        'name',
        'modbus_address_temp',
        'modbus_address_hum',
        'modbus_coil_alarm_temp',
        'modbus_coil_alarm_hum',
        'modbus_coil_connection',
        'unit_id',
        'modbus_register_function',
    ];

    protected function casts(): array
    {
        return [
            'modbus_address_temp' => 'integer',
            'modbus_address_hum' => 'integer',
            'modbus_coil_alarm_temp' => 'integer',
            'modbus_coil_alarm_hum' => 'integer',
            'modbus_coil_connection' => 'integer',
            'unit_id' => 'integer',
            'modbus_register_function' => 'string',
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
}
