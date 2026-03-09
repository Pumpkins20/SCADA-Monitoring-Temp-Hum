<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreRoomRequest;
use App\Http\Requests\UpdateRoomRequest;
use App\Models\Room;
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
