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
        'unit_id',
        'modbus_address_temp',
        'modbus_address_hum',
    ];

    protected function casts(): array
    {
        return [
            'unit_id' => 'integer',
            'modbus_address_temp' => 'integer',
            'modbus_address_hum' => 'integer',
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
