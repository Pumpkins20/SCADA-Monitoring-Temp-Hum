<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreSensorRequest;
use App\Http\Requests\UpdateSensorRequest;
use App\Models\Sensor;
use Illuminate\Http\RedirectResponse;

class SensorController extends Controller
{
    public function store(StoreSensorRequest $request): RedirectResponse
    {
        $sensor = Sensor::create($request->validated());

        return redirect()->route('rooms.devices', $sensor->hmi->room_id);
    }

    public function update(UpdateSensorRequest $request, Sensor $sensor): RedirectResponse
    {
        $sensor->update($request->validated());

        return redirect()->route('rooms.devices', $sensor->hmi->room_id);
    }

    public function destroy(Sensor $sensor): RedirectResponse
    {
        $roomId = $sensor->hmi->room_id;
        $sensor->delete();

        return redirect()->route('rooms.devices', $roomId);
    }
}
