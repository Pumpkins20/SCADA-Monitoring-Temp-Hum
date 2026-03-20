<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HmiLatestData extends Model
{
    /** @var list<string> */
    protected $fillable = [
        'hmi_id',
        'avg_temp',
        'avg_hum',
        'last_read_at',
    ];

    protected function casts(): array
    {
        return [
            'avg_temp' => 'decimal:2',
            'avg_hum' => 'decimal:2',
            'last_read_at' => 'datetime',
        ];
    }

    public function hmi(): BelongsTo
    {
        return $this->belongsTo(Hmi::class);
    }
}
