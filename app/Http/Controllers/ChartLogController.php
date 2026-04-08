<?php

namespace App\Http\Controllers;

use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorLog;
use App\Models\SensorReading;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

class ChartLogController extends Controller
{
    private const DEFAULT_NONE_LIMIT = 120;

    private const FILTERED_POINT_LIMIT_SHORT_RANGE = 400;

    private const FILTERED_POINT_LIMIT_MEDIUM_RANGE = 180;

    private const FILTERED_POINT_LIMIT_LONG_RANGE = 120;

    private const MEDIUM_RANGE_THRESHOLD_MINUTES = 60;

    private const LONG_RANGE_THRESHOLD_MINUTES = 360;

    private const MIN_OVERVIEW_RECENT_MINUTES = 15;

    private const MAX_RECENT_MINUTES = 43200;

    private const MAX_INTERVAL_DAYS = 30;

    public function index(Request $request): Response
    {
        $rooms = Room::query()->orderBy('name')->get(['id', 'name']);
        $activeRoomId = $request->filled('room') ? (int) $request->query('room') : null;
        $timeFilterMode = $this->resolveTimeFilterMode((string) $request->query('time_filter', 'none'));
        $startAt = $this->parseDateTime((string) $request->query('start_at', ''));
        $endAt = $this->parseDateTime((string) $request->query('end_at', ''));
        $recentMinutes = $this->normalizeRecentMinutes((int) $request->query('recent_minutes', 5));

        if ($timeFilterMode === 'interval') {
            if ($startAt === null || $endAt === null) {
                $timeFilterMode = 'none';
            } else {
                [$startAt, $endAt] = $this->normalizeIntervalRange($startAt, $endAt);
            }
        }

        if ($activeRoomId !== null) {
            return $this->detailMode(
                $rooms,
                $activeRoomId,
                $timeFilterMode,
                $startAt,
                $endAt,
                $recentMinutes,
            );
        }

        return $this->overviewMode(
            $rooms,
            $timeFilterMode,
            $startAt,
            $endAt,
            $recentMinutes,
        );
    }

    private function overviewMode(
        $rooms,
        string $timeFilterMode,
        ?Carbon $startAt,
        ?Carbon $endAt,
        int $recentMinutes,
    ): Response {
        if ($timeFilterMode === 'recent') {
            $recentMinutes = max($recentMinutes, self::MIN_OVERVIEW_RECENT_MINUTES);
        }

        $bucketMinutes = $timeFilterMode === 'none'
            ? null
            : $this->resolveBucketMinutes($timeFilterMode, $startAt, $endAt, $recentMinutes);

        $filteredPointLimit = $this->resolveFilteredPointLimit(
            $timeFilterMode,
            $startAt,
            $endAt,
            $recentMinutes,
        );

        $latestTimestamp = $timeFilterMode === 'recent'
            ? SensorLog::query()->max('created_at')
            : null;

        $timestampsQuery = SensorLog::query()
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

        $logsByRoom = SensorLog::query()
            ->whereIn('created_at', $timestamps)
            ->get()
            ->groupBy('room_id')
            ->map(fn($items) => $items->keyBy(fn($log) => $log->created_at->format('Y-m-d H:i:s')));

        $timestampKeys = $timestamps->map(fn($ts) => Carbon::parse($ts)->format('Y-m-d H:i:s'));
        $timeLabelsByTimestamp = $this->buildTimeLabels($timestampKeys, $bucketMinutes);

        $roomChartSeries = $rooms->map(function (Room $room) use ($timestampKeys, $logsByRoom, $timeLabelsByTimestamp) {
            $roomLogs = $logsByRoom->get($room->id, collect());

            return [
                'roomId' => $room->id,
                'roomName' => $room->name,
                'points' => $timestampKeys->map(function (string $tsKey) use ($roomLogs, $timeLabelsByTimestamp) {
                    $log = $roomLogs->get($tsKey);

                    return [
                        'time' => $timeLabelsByTimestamp->get($tsKey, Carbon::parse($tsKey)->format('H:i')),
                        'avg_temperature' => $log ? (float) $log->avg_temperature : null,
                        'avg_humidity' => $log ? (float) $log->avg_humidity : null,
                    ];
                })->all(),
            ];
        })->all();

        return Inertia::render('chart-logs/index', [
            'rooms' => $rooms->map(fn(Room $r) => ['id' => $r->id, 'name' => $r->name])->all(),
            'mode' => 'overview',
            'timeFilter' => $this->makeTimeFilterPayload(
                $timeFilterMode,
                $startAt,
                $endAt,
                $recentMinutes,
            ),
            'roomChartSeries' => $roomChartSeries,
        ]);
    }

    private function detailMode(
        $rooms,
        int $activeRoomId,
        string $timeFilterMode,
        ?Carbon $startAt,
        ?Carbon $endAt,
        int $recentMinutes,
    ): Response {
        $activeRoom = $rooms->firstWhere('id', $activeRoomId);

        $sensors = Sensor::query()
            ->whereHas('hmi', fn($q) => $q->where('room_id', $activeRoomId))
            ->orderBy('id')
            ->get(['id', 'name']);

        $sensorIds = $sensors->pluck('id');

        $latestTimestamp = $timeFilterMode === 'recent'
            ? SensorReading::query()
            ->whereIn('sensor_id', $sensorIds)
            ->max('created_at')
            : null;

        $timestampsQuery = SensorReading::query()
            ->whereIn('sensor_id', $sensorIds)
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

        $readings = SensorReading::query()
            ->whereIn('sensor_id', $sensorIds)
            ->whereIn('created_at', $timestamps)
            ->get();

        $timestampKeys = $timestamps->map(fn($ts) => Carbon::parse($ts)->format('Y-m-d H:i:s'));
        $timeLabelsByTimestamp = $this->buildTimeLabels($timestampKeys, $bucketMinutes);

        $sensorReadingsByTimestamp = $readings
            ->groupBy('sensor_id')
            ->map(fn($items) => $items->keyBy(fn($r) => $r->created_at->format('Y-m-d H:i:s')));

        $sensorList = $sensors->values();

        $chartSeriesPerSensor = $sensorList
            ->map(function (Sensor $sensor) use ($timestampKeys, $sensorReadingsByTimestamp, $timeLabelsByTimestamp) {
                $series = $sensorReadingsByTimestamp->get($sensor->id);

                return [
                    'sensorId' => $sensor->id,
                    'sensorName' => $sensor->name,
                    'points' => $timestampKeys->map(function (string $tsKey) use ($series, $timeLabelsByTimestamp) {
                        $reading = $series?->get($tsKey);

                        return [
                            'time' => $timeLabelsByTimestamp->get($tsKey, Carbon::parse($tsKey)->format('H:i')),
                            'avg_temperature' => $reading ? (float) $reading->avg_temp : null,
                            'avg_humidity' => $reading ? (float) $reading->avg_hum : null,
                        ];
                    })->all(),
                ];
            })
            ->all();

        return Inertia::render('chart-logs/index', [
            'rooms' => $rooms->map(fn(Room $r) => ['id' => $r->id, 'name' => $r->name])->all(),
            'mode' => 'detail',
            'activeRoomId' => $activeRoomId,
            'activeRoomName' => $activeRoom?->name ?? '',
            'sensors' => $sensorList->map(fn(Sensor $s) => ['id' => $s->id, 'name' => $s->name])->all(),
            'timeFilter' => $this->makeTimeFilterPayload(
                $timeFilterMode,
                $startAt,
                $endAt,
                $recentMinutes,
            ),
            'chartSeriesPerSensor' => $chartSeriesPerSensor,
        ]);
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
            return 5;
        }

        return min($minutes, self::MAX_RECENT_MINUTES);
    }

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

    private function bucketTimestamps(Collection $timestamps, int $bucketMinutes): Collection
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

    private function buildTimeLabels(Collection $timestampKeys, ?int $bucketMinutes): Collection
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

    private function sampleTimestamps(Collection $timestamps, int $maxPoints): Collection
    {
        $count = $timestamps->count();

        if ($count <= $maxPoints) {
            return $timestamps->values();
        }

        $sampled = collect();
        $lastIndex = $count - 1;

        for ($i = 0; $i < $maxPoints; $i++) {
            $index = (int) floor(($i * $lastIndex) / ($maxPoints - 1));
            $sampled->push($timestamps->get($index));
        }

        return $sampled->values();
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
}
