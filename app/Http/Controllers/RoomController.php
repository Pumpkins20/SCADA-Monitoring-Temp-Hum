<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreRoomRequest;
use App\Http\Requests\UpdateRoomRequest;
use App\Models\Hmi;
use App\Models\Room;
use App\Models\Sensor;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class RoomController extends Controller
{
    public function index(): Response
    {
        $rooms = Room::query()
            ->withCount(['hmis', 'hmis as sensors_count' => function ($query) {
                $query->selectRaw('count(sensors.id)')
                    ->join('sensors', 'sensors.hmi_id', '=', 'hmis.id');
            }])
            ->orderBy('name')
            ->get()
            ->map(fn (Room $room) => [
                'id' => $room->id,
                'name' => $room->name,
                'location' => $room->location,
                'temp_max_limit' => (float) $room->temp_max_limit,
                'hum_max_limit' => (float) $room->hum_max_limit,
                'hmis_count' => $room->hmis_count,
                'sensors_count' => (int) $room->sensors_count,
                'created_at' => $room->created_at?->format('Y-m-d H:i'),
            ]);

        return Inertia::render('rooms/index', [
            'rooms' => $rooms->all(),
        ]);
    }

    public function devices(Room $room): Response
    {
        $room->load([
            'hmis' => fn ($query) => $query->orderBy('name')
                ->with(['sensors' => fn ($q) => $q->orderBy('name')]),
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
                'is_active' => $hmi->is_active,
                'sensors' => $hmi->sensors->map(fn (Sensor $sensor) => [
                    'id' => $sensor->id,
                    'name' => $sensor->name,
                    'unit_id' => $sensor->unit_id,
                    'modbus_address_temp' => $sensor->modbus_address_temp,
                    'modbus_address_hum' => $sensor->modbus_address_hum,
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
}
