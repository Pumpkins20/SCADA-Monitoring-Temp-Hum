<?php

namespace App\Http\Controllers;

use App\Models\GaugeSetting;
use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorLog;
use App\Models\SensorReading;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection as SupportCollection;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    private const DEFAULT_NONE_LIMIT = 20;

    private const FILTERED_POINT_LIMIT_SHORT_RANGE = 400;

    private const FILTERED_POINT_LIMIT_MEDIUM_RANGE = 180;

    private const FILTERED_POINT_LIMIT_LONG_RANGE = 120;

    private const MEDIUM_RANGE_THRESHOLD_MINUTES = 60;

    private const LONG_RANGE_THRESHOLD_MINUTES = 360;

    private const MIN_RECENT_MINUTES = 15;

    private const MAX_RECENT_MINUTES = 43200;

    private const MAX_INTERVAL_DAYS = 30;

    public function index(Request $request): Response
    {
        $gaugeSetting = GaugeSetting::query()->first();
        $timeFilterMode = $this->resolveTimeFilterMode((string) $request->query('time_filter', 'none'));
        $startAt = $this->parseDateTime((string) $request->query('start_at', ''));
        $endAt = $this->parseDateTime((string) $request->query('end_at', ''));
        $recentMinutes = $this->normalizeRecentMinutes((int) $request->query('recent_minutes', self::MIN_RECENT_MINUTES));

        if ($timeFilterMode === 'interval') {
            if ($startAt === null || $endAt === null) {
                $timeFilterMode = 'none';
            } else {
                [$startAt, $endAt] = $this->normalizeIntervalRange($startAt, $endAt);
            }
        }

        if ($timeFilterMode === 'recent') {
            $recentMinutes = max($recentMinutes, self::MIN_RECENT_MINUTES);
        }

        $rooms = Room::with([
            'hmis' => fn ($q) => $q
                ->where('is_active', true)
                ->where('is_preview', false)
                ->with([
                    'latestData',
                    'sensors' => fn ($sq) => $sq->select(['id', 'hmi_id', 'name', 'unit_id', 'pos_x', 'pos_y']),
                    'sensors.latestData' => fn ($sq) => $sq->select([
                        'id',
                        'sensor_id',
                        'temperature',
                        'humidity',
                        'status',
                        'alarm_temp',
                        'alarm_hum',
                        'alarm_disconnect',
                        'calibrate_temp',
                        'calibrate_hum',
                        'last_read_at',
                    ]),
                ]),
        ])
            ->select(['id', 'name', 'location', 'temp_max_limit', 'hum_max_limit'])
            ->orderBy('name')
            ->get();

        $chartData = $this->buildDashboardChartData(
            $rooms->pluck('id'),
            $timeFilterMode,
            $startAt,
            $endAt,
            $recentMinutes,
        );

        $chartLogs = $chartData['chartLogs'];
        $globalChartLogs = $chartData['globalChartLogs'];

        $payload = $rooms->map(function (Room $room) {
            $sensors = $room->hmis->flatMap->sensors;
            $online = $sensors->filter(fn ($s) => $s->latestData !== null && $s->latestData->status !== 'OFFLINE');
            $hmiIpAddresses = $room->hmis
                ->pluck('ip_address')
                ->filter()
                ->implode(', ');

            return [
                'id' => $room->id,
                'name' => $room->name,
                'location' => $room->location,
                'ip_address' => $hmiIpAddresses !== '' ? $hmiIpAddresses : null,
                'temp_max_limit' => $room->temp_max_limit,
                'hum_max_limit' => $room->hum_max_limit,
                'room_avg_temp' => $online->isNotEmpty()
                    ? round((float) $online->avg(fn ($s) => $s->latestData->temperature), 1)
                    : null,
                'room_avg_hum' => $online->isNotEmpty()
                    ? round((float) $online->avg(fn ($s) => $s->latestData->humidity), 1)
                    : null,
                'hmi_avg_temp' => $room->hmis
                    ->filter(fn ($h) => $h->latestData?->avg_temp !== null)
                    ->isNotEmpty()
                    ? round((float) $room->hmis
                        ->filter(fn ($h) => $h->latestData?->avg_temp !== null)
                        ->avg(fn ($h) => (float) $h->latestData->avg_temp), 1)
                    : null,
                'hmi_avg_hum' => $room->hmis
                    ->filter(fn ($h) => $h->latestData?->avg_hum !== null)
                    ->isNotEmpty()
                    ? round((float) $room->hmis
                        ->filter(fn ($h) => $h->latestData?->avg_hum !== null)
                        ->avg(fn ($h) => (float) $h->latestData->avg_hum), 1)
                    : null,
                'status' => $this->resolveRoomStatus($sensors),
                'last_update' => $online->max(fn ($s) => $s->latestData?->last_read_at)?->format('Y-m-d H:i:s'),
                'sensors' => $sensors->map(fn ($s) => [
                    'id' => $s->id,
                    'name' => $s->name,
                    'temperature' => $s->latestData?->temperature !== null
                        ? (float) $s->latestData->temperature
                        : null,
                    'humidity' => $s->latestData?->humidity !== null
                        ? (float) $s->latestData->humidity
                        : null,
                    'status' => $s->latestData?->status ?? 'OFFLINE',
                    'calibrate_temp' => $s->latestData?->calibrate_temp !== null
                        ? (float) $s->latestData->calibrate_temp
                        : null,
                    'calibrate_hum' => $s->latestData?->calibrate_hum !== null
                        ? (float) $s->latestData->calibrate_hum
                        : null,
                    'alarms' => [
                        'temp' => $s->latestData?->alarm_temp ?? false,
                        'hum' => $s->latestData?->alarm_hum ?? false,
                        'disconnect' => $s->latestData?->alarm_disconnect ?? true,
                    ],
                    'last_read_at' => $s->latestData?->last_read_at?->format('Y-m-d H:i:s'),
                    'pos_x' => $s->pos_x,
                    'pos_y' => $s->pos_y,
                ])->values()->all(),
            ];
        });

        $onlineRooms = $payload->whereNotNull('room_avg_temp');
        $globalAvgTemp = $onlineRooms->isNotEmpty()
            ? round((float) $onlineRooms->avg('room_avg_temp'), 1)
            : null;
        $globalAvgHum = $onlineRooms->isNotEmpty()
            ? round((float) $onlineRooms->avg('room_avg_hum'), 1)
            : null;

        $activeAlarms = $payload->sum(function (array $room): int {
            return collect($room['sensors'])->sum(function (array $sensor): int {
                if (($sensor['status'] ?? 'OFFLINE') === 'OFFLINE') {
                    return 0;
                }

                $alarms = $sensor['alarms'] ?? [];

                return (int) ($alarms['temp'] ?? false)
                    + (int) ($alarms['hum'] ?? false)
                    + (int) ($alarms['disconnect'] ?? false);
            });
        });

        return Inertia::render('dashboard', [
            'globalStats' => [
                'avg_temp' => $globalAvgTemp,
                'avg_hum' => $globalAvgHum,
                'active_alarms' => $activeAlarms,
                'last_update' => now()->toDateTimeString(),
            ],
            'gaugeSettings' => [
                'temperature' => [
                    'min' => $gaugeSetting?->temp_min ?? 0,
                    'max' => $gaugeSetting?->temp_max ?? 80,
                    'zones' => [
                        ['from' => $gaugeSetting?->temp_green_from ?? 0, 'to' => $gaugeSetting?->temp_green_to ?? 36, 'color' => '#22c55e'],
                        ['from' => $gaugeSetting?->temp_yellow_from ?? 36, 'to' => $gaugeSetting?->temp_yellow_to ?? 56, 'color' => '#facc15'],
                        ['from' => $gaugeSetting?->temp_red_from ?? 56, 'to' => $gaugeSetting?->temp_red_to ?? 80, 'color' => '#ef4444'],
                    ],
                ],
                'humidity' => [
                    'min' => $gaugeSetting?->hum_min ?? 0,
                    'max' => $gaugeSetting?->hum_max ?? 100,
                    'zones' => [
                        ['from' => $gaugeSetting?->hum_green_from ?? 0, 'to' => $gaugeSetting?->hum_green_to ?? 60, 'color' => '#22c55e'],
                        ['from' => $gaugeSetting?->hum_yellow_from ?? 60, 'to' => $gaugeSetting?->hum_yellow_to ?? 80, 'color' => '#f59e0b'],
                        ['from' => $gaugeSetting?->hum_red_from ?? 80, 'to' => $gaugeSetting?->hum_red_to ?? 100, 'color' => '#ef4444'],
                    ],
                ],
            ],
            'rooms' => $payload->values()->all(),
            'chartLogs' => $chartLogs,
            'globalChartLogs' => $globalChartLogs,
            'timeFilter' => $this->makeTimeFilterPayload(
                $timeFilterMode,
                $startAt,
                $endAt,
                $recentMinutes,
            ),
        ]);
    }

    /**
     * @param  \Illuminate\Support\Collection<int, Sensor>  $sensors
     */
    public function show(Room $room): Response
    {
        $gaugeSetting = GaugeSetting::query()->first();

        $room->load([
            'hmis' => fn ($q) => $q
                ->where('is_active', true)
                ->where('is_preview', false)
                ->with([
                    'latestData',
                    'sensors' => fn ($sq) => $sq->select(['id', 'hmi_id', 'name', 'unit_id', 'pos_x', 'pos_y']),
                    'sensors.latestData' => fn ($sq) => $sq->select([
                        'id',
                        'sensor_id',
                        'temperature',
                        'humidity',
                        'status',
                        'alarm_temp',
                        'alarm_hum',
                        'alarm_disconnect',
                        'calibrate_temp',
                        'calibrate_hum',
                        'last_read_at',
                    ]),
                    'sensors.alarmEvents' => fn ($sq) => $sq
                        ->whereNull('cleared_at')
                        ->orderByDesc('occurred_at')
                        ->select(['id', 'sensor_id', 'alarm_type', 'occurred_at', 'cleared_at']),
                ]),
        ]);

        $sensors = $room->hmis->flatMap->sensors;
        $online = $sensors->filter(fn ($s) => $s->latestData !== null && $s->latestData->status !== 'OFFLINE');

        $chartSeriesBySensorId = SensorReading::query()
            ->whereIn('sensor_id', $sensors->pluck('id'))
            ->orderBy('created_at', 'desc')
            ->get()
            ->groupBy('sensor_id')
            ->map(fn ($readings) => $readings
                ->take(20)
                ->reverse()
                ->map(fn ($reading) => [
                    'time' => $reading->created_at->format('H:i'),
                    'avg_temperature' => round((float) $reading->avg_temp, 1),
                    'avg_humidity' => round((float) $reading->avg_hum, 1),
                ])
                ->values()
                ->all());

        $chartSeriesPerSensor = $sensors->map(fn ($sensor) => [
            'sensorId' => $sensor->id,
            'sensorName' => $sensor->name,
            'points' => $chartSeriesBySensorId->get($sensor->id, []),
        ])->values()->all();

        $roomPayload = [
            'id' => $room->id,
            'name' => $room->name,
            'location' => $room->location,
            'temp_max_limit' => $room->temp_max_limit,
            'hum_max_limit' => $room->hum_max_limit,
            'floor_plan_image' => $room->floor_plan_image
                ? asset('storage/'.$room->floor_plan_image)
                : null,
            'floor_plan_width' => $room->floor_plan_width ?? 9000,
            'floor_plan_height' => $room->floor_plan_height ?? 9000,
            'room_avg_temp' => $online->isNotEmpty()
                ? round((float) $online->avg(fn ($s) => $s->latestData->temperature), 1)
                : null,
            'room_avg_hum' => $online->isNotEmpty()
                ? round((float) $online->avg(fn ($s) => $s->latestData->humidity), 1)
                : null,
            'hmi_avg_temp' => $room->hmis
                ->filter(fn ($h) => $h->latestData?->avg_temp !== null)
                ->isNotEmpty()
                ? round((float) $room->hmis
                    ->filter(fn ($h) => $h->latestData?->avg_temp !== null)
                    ->avg(fn ($h) => (float) $h->latestData->avg_temp), 1)
                : null,
            'hmi_avg_hum' => $room->hmis
                ->filter(fn ($h) => $h->latestData?->avg_hum !== null)
                ->isNotEmpty()
                ? round((float) $room->hmis
                    ->filter(fn ($h) => $h->latestData?->avg_hum !== null)
                    ->avg(fn ($h) => (float) $h->latestData->avg_hum), 1)
                : null,
            'status' => $this->resolveRoomStatus($sensors),
            'sensors' => $sensors->map(function ($s): array {
                $resolvedAlarms = $this->resolveSensorAlarms(
                    $s->alarmEvents->pluck('alarm_type')->values()->all(),
                    $s->latestData?->alarm_temp,
                    $s->latestData?->alarm_hum,
                    $s->latestData?->alarm_disconnect,
                    $s->latestData?->status,
                );

                return [
                    'id' => $s->id,
                    'name' => $s->name,
                    'unit_id' => $s->unit_id,
                    'temperature' => $s->latestData?->temperature !== null
                        ? (float) $s->latestData->temperature
                        : null,
                    'humidity' => $s->latestData?->humidity !== null
                        ? (float) $s->latestData->humidity
                        : null,
                    'status' => $s->latestData?->status ?? 'OFFLINE',
                    'calibrate_temp' => $s->latestData?->calibrate_temp !== null
                        ? (float) $s->latestData->calibrate_temp
                        : null,
                    'calibrate_hum' => $s->latestData?->calibrate_hum !== null
                        ? (float) $s->latestData->calibrate_hum
                        : null,
                    'alarms' => $resolvedAlarms,
                    'last_read_at' => $s->latestData?->last_read_at?->format('Y-m-d H:i:s'),
                    'pos_x' => $s->pos_x,
                    'pos_y' => $s->pos_y,
                ];
            })->values()->all(),
        ];

        return Inertia::render('rooms/show', [
            'room' => $roomPayload,
            'chartSeriesPerSensor' => $chartSeriesPerSensor,
            'gaugeSettings' => [
                'temperature' => [
                    'min' => $gaugeSetting?->temp_min ?? 0,
                    'max' => $gaugeSetting?->temp_max ?? 80,
                    'zones' => [
                        ['from' => $gaugeSetting?->temp_green_from ?? 0, 'to' => $gaugeSetting?->temp_green_to ?? 36, 'color' => '#22c55e'],
                        ['from' => $gaugeSetting?->temp_yellow_from ?? 36, 'to' => $gaugeSetting?->temp_yellow_to ?? 56, 'color' => '#facc15'],
                        ['from' => $gaugeSetting?->temp_red_from ?? 56, 'to' => $gaugeSetting?->temp_red_to ?? 80, 'color' => '#ef4444'],
                    ],
                ],
                'humidity' => [
                    'min' => $gaugeSetting?->hum_min ?? 0,
                    'max' => $gaugeSetting?->hum_max ?? 100,
                    'zones' => [
                        ['from' => $gaugeSetting?->hum_green_from ?? 0, 'to' => $gaugeSetting?->hum_green_to ?? 60, 'color' => '#22c55e'],
                        ['from' => $gaugeSetting?->hum_yellow_from ?? 60, 'to' => $gaugeSetting?->hum_yellow_to ?? 80, 'color' => '#f59e0b'],
                        ['from' => $gaugeSetting?->hum_red_from ?? 80, 'to' => $gaugeSetting?->hum_red_to ?? 100, 'color' => '#ef4444'],
                    ],
                ],
            ],
        ]);
    }

    /**
     * @param  SupportCollection<int, int>  $roomIds
     * @return array{chartLogs: array<int, array<int, array{time: string, avg_temperature: float|null, avg_humidity: float|null}>>, globalChartLogs: array<int, array{time: string, avg_temperature: float|null, avg_humidity: float|null}>}
     */
    private function buildDashboardChartData(
        SupportCollection $roomIds,
        string $timeFilterMode,
        ?Carbon $startAt,
        ?Carbon $endAt,
        int $recentMinutes,
    ): array {
        if ($roomIds->isEmpty()) {
            return [
                'chartLogs' => [],
                'globalChartLogs' => [],
            ];
        }

        $latestTimestamp = $timeFilterMode === 'recent'
            ? SensorLog::query()
                ->whereIn('room_id', $roomIds)
                ->max('created_at')
            : null;

        $timestampsQuery = SensorLog::query()
            ->whereIn('room_id', $roomIds)
            ->selectRaw('DISTINCT created_at')
            ->orderByDesc('created_at');

        $this->applyTimeFilter(
            $timestampsQuery,
            $timeFilterMode,
            $startAt,
            $endAt,
            $recentMinutes,
            $latestTimestamp,
        );

        $bucketMinutes = $timeFilterMode === 'none'
            ? null
            : $this->resolveBucketMinutes($timeFilterMode, $startAt, $endAt, $recentMinutes);

        $filteredPointLimit = $this->resolveFilteredPointLimit(
            $timeFilterMode,
            $startAt,
            $endAt,
            $recentMinutes,
        );

        $timestamps = $timeFilterMode === 'none'
            ? $timestampsQuery
                ->limit(self::DEFAULT_NONE_LIMIT)
                ->pluck('created_at')
                ->sort()
                ->values()
            : $this->sampleTimestamps(
                $this->bucketTimestamps(
                    $timestampsQuery
                        ->pluck('created_at')
                        ->sort()
                        ->values(),
                    $bucketMinutes ?? 1,
                ),
                $filteredPointLimit,
            );

        $timestampKeys = $timestamps->map(fn ($timestamp) => Carbon::parse((string) $timestamp)->format('Y-m-d H:i:s'));
        $timeLabelsByTimestamp = $this->buildTimeLabels($timestampKeys, $bucketMinutes);

        $logsByRoom = SensorLog::query()
            ->whereIn('room_id', $roomIds)
            ->whereIn('created_at', $timestamps)
            ->get()
            ->groupBy('room_id')
            ->map(fn ($items) => $items->keyBy(fn ($log) => $log->created_at->format('Y-m-d H:i:s')));

        $chartLogs = $roomIds->mapWithKeys(function (int $roomId) use ($timestampKeys, $logsByRoom, $timeLabelsByTimestamp): array {
            $roomLogs = $logsByRoom->get($roomId, collect());

            return [
                $roomId => $timestampKeys->map(function (string $timestampKey) use ($roomLogs, $timeLabelsByTimestamp): array {
                    $log = $roomLogs->get($timestampKey);

                    return [
                        'time' => $timeLabelsByTimestamp->get($timestampKey, Carbon::parse($timestampKey)->format('H:i')),
                        'avg_temperature' => $log ? round((float) $log->avg_temperature, 1) : null,
                        'avg_humidity' => $log ? round((float) $log->avg_humidity, 1) : null,
                    ];
                })->all(),
            ];
        })->all();

        $globalLogsByTimestamp = SensorLog::query()
            ->whereIn('room_id', $roomIds)
            ->whereIn('created_at', $timestamps)
            ->selectRaw('created_at, AVG(avg_temperature) as avg_temperature, AVG(avg_humidity) as avg_humidity')
            ->groupBy('created_at')
            ->get()
            ->keyBy(fn ($log) => $log->created_at->format('Y-m-d H:i:s'));

        $globalChartLogs = $timestampKeys->map(function (string $timestampKey) use ($globalLogsByTimestamp, $timeLabelsByTimestamp): array {
            $log = $globalLogsByTimestamp->get($timestampKey);

            return [
                'time' => $timeLabelsByTimestamp->get($timestampKey, Carbon::parse($timestampKey)->format('H:i')),
                'avg_temperature' => $log ? round((float) $log->avg_temperature, 1) : null,
                'avg_humidity' => $log ? round((float) $log->avg_humidity, 1) : null,
            ];
        })->values()->all();

        return [
            'chartLogs' => $chartLogs,
            'globalChartLogs' => $globalChartLogs,
        ];
    }

    private function resolveTimeFilterMode(string $mode): string
    {
        $allowed = ['none', 'interval', 'recent'];

        return in_array($mode, $allowed, true) ? $mode : 'none';
    }

    private function parseDateTime(string $value): ?Carbon
    {
        if ($value === '') {
            return null;
        }

        try {
            return Carbon::createFromFormat('Y-m-d H:i:s', $value);
        } catch (\Throwable) {
            return null;
        }
    }

    private function normalizeRecentMinutes(int $minutes): int
    {
        if ($minutes < 1) {
            return self::MIN_RECENT_MINUTES;
        }

        return min($minutes, self::MAX_RECENT_MINUTES);
    }

    /**
     * @return array{0: Carbon, 1: Carbon}
     */
    private function normalizeIntervalRange(Carbon $startAt, Carbon $endAt): array
    {
        $from = $startAt->lte($endAt) ? $startAt->copy() : $endAt->copy();
        $to = $startAt->lte($endAt) ? $endAt->copy() : $startAt->copy();
        $maxFrom = $to->copy()->subDays(self::MAX_INTERVAL_DAYS);

        if ($from->lt($maxFrom)) {
            $from = $maxFrom;
        }

        return [$from, $to];
    }

    private function applyTimeFilter(
        Builder $query,
        string $mode,
        ?Carbon $startAt,
        ?Carbon $endAt,
        int $recentMinutes,
        mixed $latestTimestamp = null,
    ): void {
        if ($mode === 'recent') {
            $referenceTimestamp = $latestTimestamp !== null
                ? Carbon::parse((string) $latestTimestamp)
                : now();

            $query->where('created_at', '>=', $referenceTimestamp->subMinutes($recentMinutes));

            return;
        }

        if ($mode !== 'interval' || $startAt === null || $endAt === null) {
            return;
        }

        $query->whereBetween('created_at', [$startAt, $endAt]);
    }

    private function resolveFilteredPointLimit(
        string $mode,
        ?Carbon $startAt,
        ?Carbon $endAt,
        int $recentMinutes,
    ): int {
        $rangeMinutes = match ($mode) {
            'recent' => $recentMinutes,
            'interval' => $startAt !== null && $endAt !== null
                ? $startAt->diffInMinutes($endAt)
                : null,
            default => null,
        };

        if ($rangeMinutes === null) {
            return self::FILTERED_POINT_LIMIT_SHORT_RANGE;
        }

        if ($rangeMinutes > self::LONG_RANGE_THRESHOLD_MINUTES) {
            return self::FILTERED_POINT_LIMIT_LONG_RANGE;
        }

        if ($rangeMinutes > self::MEDIUM_RANGE_THRESHOLD_MINUTES) {
            return self::FILTERED_POINT_LIMIT_MEDIUM_RANGE;
        }

        return self::FILTERED_POINT_LIMIT_SHORT_RANGE;
    }

    private function resolveBucketMinutes(
        string $mode,
        ?Carbon $startAt,
        ?Carbon $endAt,
        int $recentMinutes,
    ): int {
        $rangeMinutes = match ($mode) {
            'recent' => $recentMinutes,
            'interval' => $startAt !== null && $endAt !== null
                ? $startAt->diffInMinutes($endAt)
                : null,
            default => null,
        };

        if ($rangeMinutes === null || $rangeMinutes <= 60) {
            return 1;
        }

        if ($rangeMinutes <= 180) {
            return 2;
        }

        if ($rangeMinutes <= 360) {
            return 5;
        }

        if ($rangeMinutes <= 720) {
            return 10;
        }

        if ($rangeMinutes <= 1440) {
            return 30;
        }

        if ($rangeMinutes <= 2880) {
            return 60;
        }

        if ($rangeMinutes <= 10080) {
            return 360;
        }

        return 1440;
    }

    private function bucketTimestamps(SupportCollection $timestamps, int $bucketMinutes): SupportCollection
    {
        if ($bucketMinutes <= 1) {
            return $timestamps->values();
        }

        $bucketed = collect();
        $lastSelected = null;

        foreach ($timestamps as $timestamp) {
            $current = Carbon::parse((string) $timestamp);

            if ($lastSelected === null || $lastSelected->diffInMinutes($current) >= $bucketMinutes) {
                $bucketed->push($timestamp);
                $lastSelected = $current;
            }
        }

        return $bucketed->values();
    }

    private function sampleTimestamps(SupportCollection $timestamps, int $maxPoints): SupportCollection
    {
        $count = $timestamps->count();

        if ($count <= $maxPoints) {
            return $timestamps->values();
        }

        $sampled = collect();
        $lastIndex = $count - 1;

        for ($index = 0; $index < $maxPoints; $index++) {
            $resolvedIndex = (int) floor(($index * $lastIndex) / ($maxPoints - 1));
            $sampled->push($timestamps->get($resolvedIndex));
        }

        return $sampled->values();
    }

    private function buildTimeLabels(SupportCollection $timestampKeys, ?int $bucketMinutes): SupportCollection
    {
        $labels = collect();
        $previousDate = null;

        foreach ($timestampKeys as $timestampKey) {
            $current = Carbon::parse((string) $timestampKey);
            $currentDate = $current->format('Y-m-d');

            if ($bucketMinutes !== null && $bucketMinutes >= 1440) {
                $label = $current->format('d/m');
            } elseif ($previousDate !== null && $previousDate !== $currentDate) {
                $label = $current->format('d/m H:i');
            } else {
                $label = $current->format('H:i');
            }

            $labels->put((string) $timestampKey, $label);
            $previousDate = $currentDate;
        }

        return $labels;
    }

    private function makeTimeFilterPayload(
        string $mode,
        ?Carbon $startAt,
        ?Carbon $endAt,
        int $recentMinutes,
    ): array {
        return [
            'mode' => $mode,
            'start_at' => $mode === 'interval' ? $startAt?->format('Y-m-d H:i:s') : null,
            'end_at' => $mode === 'interval' ? $endAt?->format('Y-m-d H:i:s') : null,
            'recent_minutes' => $recentMinutes,
        ];
    }

    /**
     * @param  \Illuminate\Support\Collection<int, Sensor>  $sensors
     */
    private function resolveRoomStatus(Collection|\Illuminate\Support\Collection $sensors): string
    {
        if ($sensors->isEmpty()) {
            return 'OFFLINE';
        }

        $statuses = $sensors->map(fn ($s) => $s->latestData?->status ?? 'OFFLINE')->unique();

        if ($statuses->contains('CRITICAL')) {
            return 'CRITICAL';
        }

        if ($statuses->contains('WARNING')) {
            return 'WARNING';
        }

        if ($statuses->every(fn ($s) => $s === 'OFFLINE')) {
            return 'OFFLINE';
        }

        return 'NORMAL';
    }

    /**
     * @param  list<string>  $activeAlarmTypes
     * @return array{temp: bool, hum: bool, disconnect: bool}
     */
    private function resolveSensorAlarms(
        array $activeAlarmTypes,
        ?bool $latestTemp,
        ?bool $latestHum,
        ?bool $latestDisconnect,
        ?string $latestStatus = null,
    ): array {
        $eventAlarmTypes = collect($activeAlarmTypes);
        $latestDisconnectResolved = (bool) ($latestDisconnect ?? false);
        $latestIsOffline = $latestStatus === 'OFFLINE';

        if ($activeAlarmTypes !== []) {
            return [
                'temp' => $eventAlarmTypes->contains(
                    fn (string $type): bool => in_array($type, ['temp', 'temp_high', 'temp_low'], true)
                ) || (bool) ($latestTemp ?? false),
                'hum' => $eventAlarmTypes->contains(
                    fn (string $type): bool => in_array($type, ['hum', 'hum_high', 'hum_low'], true)
                ) || (bool) ($latestHum ?? false),
                'disconnect' => $latestDisconnectResolved
                    || ($latestIsOffline && $eventAlarmTypes->contains('disconnect')),
            ];
        }

        return [
            'temp' => (bool) ($latestTemp ?? false),
            'hum' => (bool) ($latestHum ?? false),
            'disconnect' => (bool) ($latestDisconnect ?? true),
        ];
    }
}
