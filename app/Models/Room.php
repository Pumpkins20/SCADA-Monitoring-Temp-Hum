<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Room extends Model
{
    /** @use HasFactory<\Database\Factories\RoomFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = [
        'name',
        'location',
        'temp_max_limit',
        'hum_max_limit',
        'floor_plan_image',
        'floor_plan_width',
        'floor_plan_height',
    ];

    protected function casts(): array
    {
        return [
            'temp_max_limit' => 'decimal:2',
            'hum_max_limit' => 'decimal:2',
            'floor_plan_width' => 'integer',
            'floor_plan_height' => 'integer',
        ];
    }

    public function hmis(): HasMany
    {
        return $this->hasMany(Hmi::class);
    }

    public function logs(): HasMany
    {
        return $this->hasMany(SensorLog::class);
    }
}
