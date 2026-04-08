<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class GaugeSetting extends Model
{
    public const DEFAULT_LOGO_LEFT = '/images/logo/injourney.png';

    public const DEFAULT_LOGO_CENTER = '/images/logo/westindo.png';

    public const FIXED_LOGO_RIGHT = '/images/logo/edutic.png';

    public const DEFAULT_HEADER_TITLE_LINE_1 =
    'SCADA MONITORING AC PRESISI RUANG SERVER CCTV & FIDS';

    public const DEFAULT_HEADER_TITLE_LINE_2 =
    'BANDARA SOEKARNO - HATTA';

    /** @use HasFactory<\Database\Factories\GaugeSettingFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = [
        'temp_min',
        'temp_max',
        'temp_green_from',
        'temp_green_to',
        'temp_yellow_from',
        'temp_yellow_to',
        'temp_red_from',
        'temp_red_to',
        'hum_min',
        'hum_max',
        'hum_green_from',
        'hum_green_to',
        'hum_yellow_from',
        'hum_yellow_to',
        'hum_red_from',
        'hum_red_to',
        'logo_left_path',
        'logo_center_path',
        'header_title_line_1',
        'header_title_line_2',
    ];

    protected function casts(): array
    {
        return [
            'temp_min' => 'float',
            'temp_max' => 'float',
            'temp_green_from' => 'float',
            'temp_green_to' => 'float',
            'temp_yellow_from' => 'float',
            'temp_yellow_to' => 'float',
            'temp_red_from' => 'float',
            'temp_red_to' => 'float',
            'hum_min' => 'float',
            'hum_max' => 'float',
            'hum_green_from' => 'float',
            'hum_green_to' => 'float',
            'hum_yellow_from' => 'float',
            'hum_yellow_to' => 'float',
            'hum_red_from' => 'float',
            'hum_red_to' => 'float',
        ];
    }

    /**
     * @return array{left: string, center: string, right: string}
     */
    public static function resolveHeaderLogos(?self $setting): array
    {
        return [
            'left' => static::toLogoUrl(
                $setting?->logo_left_path,
                self::DEFAULT_LOGO_LEFT,
            ),
            'center' => static::toLogoUrl(
                $setting?->logo_center_path,
                self::DEFAULT_LOGO_CENTER,
            ),
            'right' => self::FIXED_LOGO_RIGHT,
        ];
    }

    /**
     * @return array{line1: string, line2: string}
     */
    public static function resolveHeaderTitle(?self $setting): array
    {
        $line1 = trim((string) ($setting?->header_title_line_1 ?? ''));
        $line2 = trim((string) ($setting?->header_title_line_2 ?? ''));

        return [
            'line1' => $line1 !== '' ? $line1 : self::DEFAULT_HEADER_TITLE_LINE_1,
            'line2' => $line2 !== '' ? $line2 : self::DEFAULT_HEADER_TITLE_LINE_2,
        ];
    }

    private static function toLogoUrl(?string $path, string $fallback): string
    {
        if (! $path) {
            return $fallback;
        }

        if (! Storage::disk('public')->exists($path)) {
            return $fallback;
        }

        return Storage::url($path);
    }
}
