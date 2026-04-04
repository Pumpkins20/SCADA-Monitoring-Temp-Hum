<?php

namespace App\Http\Controllers;

use App\Models\GaugeSetting;
use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorLog;
use Illuminate\Database\Eloquent\Collection;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function index(): Response
    {
        $gaugeSetting = GaugeSetting::query()->first();

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

        $chartlogs = SensorLog::query()
            ->whereIn('room_id', $rooms->pluck('id'))
            ->orderBy('created_at', 'desc')
            ->get()
            ->groupBy('room_id')
            ->map(fn ($logs) => $logs->take(20)->reverse()->map(fn ($log) => [
                'time' => $log->created_at->format('H:i'),
                'avg_temperature' => round((float) $log->avg_temperature, 1),
                'avg_humidity' => round((float) $log->avg_humidity, 1),
            ])->values()->all());

        $globalChartLogs = SensorLog::query()
            ->whereIn('room_id', $rooms->pluck('id'))
            ->selectRaw('created_at, AVG(avg_temperature) as avg_temperature, AVG(avg_humidity) as avg_humidity')
            ->groupBy('created_at')
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get()
            ->reverse()
            ->map(fn ($log) => [
                'time' => $log->created_at->format('H:i'),
                'avg_temperature' => round((float) $log->avg_temperature, 1),
                'avg_humidity' => round((float) $log->avg_humidity, 1),
            ])
            ->values()
            ->all();

        $payload = $rooms->map(function (Room $room) {
            $sensors = $room->hmis->flatMap->sensors;
            $online = $sensors->filter(fn ($s) => $s->latestData !== null && $s->latestData->status !== 'OFFLINE');

            return [
                'id' => $room->id,
                'name' => $room->name,
                'location' => $room->location,
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
            'chartLogs' => $chartlogs,
            'globalChartLogs' => $globalChartLogs,
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

        $chartLogs = SensorLog::query()
            ->where('room_id', $room->id)
            ->orderBy('created_at', 'desc')
            ->take(20)
            ->get()
            ->reverse()
            ->map(fn ($log) => [
                'time' => $log->created_at->format('H:i'),
                'avg_temperature' => round((float) $log->avg_temperature, 1),
                'avg_humidity' => round((float) $log->avg_humidity, 1),
            ])
            ->values()
            ->all();

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
            'chartLogs' => $chartLogs,
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
