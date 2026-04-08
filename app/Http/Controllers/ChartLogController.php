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

    private const FILTERED_POINT_LIMIT = 400;

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
                $timestampsQuery
                    ->pluck('created_at')
                    ->sort()
                    ->values(),
                self::FILTERED_POINT_LIMIT,
            );

        $logsByRoom = SensorLog::query()
            ->whereIn('created_at', $timestamps)
            ->get()
            ->groupBy('room_id')
            ->map(fn($items) => $items->keyBy(fn($log) => $log->created_at->format('Y-m-d H:i:s')));

        $timestampKeys = $timestamps->map(fn($ts) => Carbon::parse($ts)->format('Y-m-d H:i:s'));

        $roomChartSeries = $rooms->map(function (Room $room) use ($timestampKeys, $logsByRoom) {
            $roomLogs = $logsByRoom->get($room->id, collect());

            return [
                'roomId' => $room->id,
                'roomName' => $room->name,
                'points' => $timestampKeys->map(function (string $tsKey) use ($roomLogs) {
                    $log = $roomLogs->get($tsKey);

                    return [
                        'time' => Carbon::parse($tsKey)->format('H:i'),
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

        $timestamps = $timeFilterMode === 'none'
            ? $timestampsQuery
            ->limit(self::DEFAULT_NONE_LIMIT)
            ->pluck('created_at')
            ->sort()
            ->values()
            : $this->sampleTimestamps(
                $timestampsQuery
                    ->pluck('created_at')
                    ->sort()
                    ->values(),
                self::FILTERED_POINT_LIMIT,
            );

        $readings = SensorReading::query()
            ->whereIn('sensor_id', $sensorIds)
            ->whereIn('created_at', $timestamps)
            ->get();

        $timestampKeys = $timestamps->map(fn($ts) => Carbon::parse($ts)->format('Y-m-d H:i:s'));

        $sensorReadingsByTimestamp = $readings
            ->groupBy('sensor_id')
            ->map(fn($items) => $items->keyBy(fn($r) => $r->created_at->format('Y-m-d H:i:s')));

        $sensorList = $sensors->values();

        $chartSeriesPerSensor = $sensorList
            ->map(function (Sensor $sensor) use ($timestampKeys, $sensorReadingsByTimestamp) {
                $series = $sensorReadingsByTimestamp->get($sensor->id);

                return [
                    'sensorId' => $sensor->id,
                    'sensorName' => $sensor->name,
                    'points' => $timestampKeys->map(function (string $tsKey) use ($series) {
                        $reading = $series?->get($tsKey);

                        return [
                            'time' => Carbon::parse($tsKey)->format('H:i'),
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
