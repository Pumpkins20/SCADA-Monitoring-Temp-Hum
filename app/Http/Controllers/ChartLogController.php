<?php

namespace App\Http\Controllers;

use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorLog;
use App\Models\SensorReading;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class ChartLogController extends Controller
{
    public function index(Request $request): Response
    {
        $rooms = Room::query()->orderBy('name')->get(['id', 'name']);
        $activeRoomId = $request->filled('room') ? (int) $request->query('room') : null;

        if ($activeRoomId !== null) {
            return $this->detailMode($rooms, $activeRoomId);
        }

        return $this->overviewMode($rooms);
    }

    private function overviewMode($rooms): Response
    {
        $limit = 120;

        // Get last N distinct timestamps across all rooms
        $timestamps = SensorLog::query()
            ->selectRaw('DISTINCT created_at')
            ->orderByDesc('created_at')
            ->limit($limit)
            ->pluck('created_at')
            ->sort()
            ->values();

        // Fetch all records at those timestamps, keyed by room_id then timestamp
        $logsByRoom = SensorLog::query()
            ->whereIn('created_at', $timestamps)
            ->get()
            ->groupBy('room_id')
            ->map(fn ($items) => $items->keyBy(fn ($log) => $log->created_at->format('Y-m-d H:i:s')));

        $timestampKeys = $timestamps->map(fn ($ts) => Carbon::parse($ts)->format('Y-m-d H:i:s'));

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
            'rooms' => $rooms->map(fn (Room $r) => ['id' => $r->id, 'name' => $r->name])->all(),
            'mode' => 'overview',
            'roomChartSeries' => $roomChartSeries,
        ]);
    }

    private function detailMode($rooms, int $activeRoomId): Response
    {
        $activeRoom = $rooms->firstWhere('id', $activeRoomId);

        $sensors = Sensor::query()
            ->whereHas('hmi', fn ($q) => $q->where('room_id', $activeRoomId))
            ->orderBy('id')
            ->get(['id', 'name']);

        $sensorIds = $sensors->pluck('id');
        $limit = 120;

        $timestamps = SensorReading::query()
            ->whereIn('sensor_id', $sensorIds)
            ->selectRaw('DISTINCT created_at')
            ->orderByDesc('created_at')
            ->limit($limit)
            ->pluck('created_at')
            ->sort()
            ->values();

        $readings = SensorReading::query()
            ->whereIn('sensor_id', $sensorIds)
            ->whereIn('created_at', $timestamps)
            ->get();

        $timestampKeys = $timestamps->map(fn ($ts) => Carbon::parse($ts)->format('Y-m-d H:i:s'));

        $sensorReadingsByTimestamp = $readings
            ->groupBy('sensor_id')
            ->map(fn ($items) => $items->keyBy(fn ($r) => $r->created_at->format('Y-m-d H:i:s')));

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
            'rooms' => $rooms->map(fn (Room $r) => ['id' => $r->id, 'name' => $r->name])->all(),
            'mode' => 'detail',
            'activeRoomId' => $activeRoomId,
            'activeRoomName' => $activeRoom?->name ?? '',
            'sensors' => $sensorList->map(fn (Sensor $s) => ['id' => $s->id, 'name' => $s->name])->all(),
            'chartSeriesPerSensor' => $chartSeriesPerSensor,
        ]);
    }
}
