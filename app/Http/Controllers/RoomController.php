<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreRoomRequest;
use App\Http\Requests\UpdateRoomRequest;
use App\Models\Hmi;
use App\Models\Room;
use App\Models\Sensor;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class RoomController extends Controller
{
    public function index(): Response
    {
        $rooms = Room::query()
            ->with([
                'hmis' => fn ($query) => $query
                    ->select(['id', 'room_id', 'ip_address', 'is_active', 'is_preview'])
                    ->with([
                        'sensors' => fn ($sensorQuery) => $sensorQuery
                            ->select(['id', 'hmi_id'])
                            ->with([
                                'latestData' => fn ($latestDataQuery) => $latestDataQuery
                                    ->select(['id', 'sensor_id', 'status']),
                            ]),
                    ])
                    ->orderBy('id'),
            ])
            ->withCount(['hmis', 'hmis as sensors_count' => function ($query) {
                $query->selectRaw('count(sensors.id)')
                    ->join('sensors', 'sensors.hmi_id', '=', 'hmis.id');
            }])
            ->orderBy('name')
            ->get()
            ->map(function (Room $room): array {
                $connectedHmis = $room->hmis
                    ->where('is_preview', false)
                    ->values();

                $dashboardScopeSensors = $room->hmis
                    ->where('is_active', true)
                    ->where('is_preview', false)
                    ->flatMap->sensors;

                $dashboardRoomStatus = $this->resolveRoomStatus($dashboardScopeSensors);

                $ipAddresses = $connectedHmis
                    ->pluck('ip_address')
                    ->filter()
                    ->unique()
                    ->implode(', ');

                return [
                    'id' => $room->id,
                    'name' => $room->name,
                    'location' => $room->location,
                    'temp_max_limit' => (float) $room->temp_max_limit,
                    'hum_max_limit' => (float) $room->hum_max_limit,
                    'hmis_count' => $room->hmis_count,
                    'sensors_count' => (int) $room->sensors_count,
                    'status' => $dashboardRoomStatus === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
                    'ip_address' => $ipAddresses !== '' ? $ipAddresses : '-',
                    'created_at' => $room->created_at?->format('Y-m-d H:i'),
                ];
            });

        return Inertia::render('rooms/index', [
            'rooms' => $rooms->all(),
        ]);
    }

    public function devices(Room $room): Response
    {
        $room->load([
            'hmis' => fn ($query) => $query->orderBy('name')
                ->with([
                    'sensors' => fn ($q) => $q->orderBy('id')
                        ->with([
                            'latestData' => fn ($latestDataQuery) => $latestDataQuery
                                ->select([
                                    'id',
                                    'sensor_id',
                                    'calibrate_temp',
                                    'calibrate_hum',
                                    'over_temp',
                                    'under_temp',
                                    'over_hum',
                                    'under_hum',
                                ]),
                        ]),
                ]),
        ]);

        return Inertia::render('rooms/devices', [
            'room' => [
                'id' => $room->id,
                'name' => $room->name,
                'location' => $room->location,
                'temp_max_limit' => (float) $room->temp_max_limit,
                'hum_max_limit' => (float) $room->hum_max_limit,
            ],
            'hmis' => $room->hmis->map(fn (Hmi $hmi) => [
                'id' => $hmi->id,
                'name' => $hmi->name,
                'ip_address' => $hmi->ip_address,
                'port' => $hmi->port,
                'register_function' => $hmi->register_function ?? '03',
                'is_active' => $hmi->is_active,
                'sensors' => $hmi->sensors->values()->map(fn (Sensor $sensor, int $index) => [
                    'id' => $sensor->id,
                    'name' => $sensor->name,
                    'unit_id' => $sensor->unit_id,
                    'position' => $index + 1,
                    'calibrate_temp' => $sensor->latestData?->calibrate_temp !== null
                        ? (float) $sensor->latestData->calibrate_temp
                        : null,
                    'calibrate_hum' => $sensor->latestData?->calibrate_hum !== null
                        ? (float) $sensor->latestData->calibrate_hum
                        : null,
                    'over_temp' => $sensor->latestData?->over_temp !== null
                        ? (float) $sensor->latestData->over_temp
                        : null,
                    'under_temp' => $sensor->latestData?->under_temp !== null
                        ? (float) $sensor->latestData->under_temp
                        : null,
                    'over_hum' => $sensor->latestData?->over_hum !== null
                        ? (float) $sensor->latestData->over_hum
                        : null,
                    'under_hum' => $sensor->latestData?->under_hum !== null
                        ? (float) $sensor->latestData->under_hum
                        : null,
                ]),
            ]),
        ]);
    }

    public function store(StoreRoomRequest $request): RedirectResponse
    {
        Room::create($request->validated());

        return redirect()->route('rooms.index');
    }

    public function update(UpdateRoomRequest $request, Room $room): RedirectResponse
    {
        $room->update($request->validated());

        return redirect()->route('rooms.index');
    }

    public function destroy(Room $room): RedirectResponse
    {
        $room->delete();

        return redirect()->route('rooms.index');
    }

    /**
     * @param  \Illuminate\Support\Collection<int, Sensor>  $sensors
     */
    private function resolveRoomStatus(Collection|\Illuminate\Support\Collection $sensors): string
    {
        if ($sensors->isEmpty()) {
            return 'OFFLINE';
        }

        $statuses = $sensors->map(fn ($sensor) => $sensor->latestData?->status ?? 'OFFLINE')->unique();

        if ($statuses->contains('CRITICAL')) {
            return 'CRITICAL';
        }

        if ($statuses->contains('WARNING')) {
            return 'WARNING';
        }

        if ($statuses->every(fn ($status) => $status === 'OFFLINE')) {
            return 'OFFLINE';
        }

        return 'NORMAL';
    }
}
