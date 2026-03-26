<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreHmiRequest;
use App\Http\Requests\UpdateHmiRequest;
use App\Models\Hmi;
use App\Models\Room;
use App\Models\Sensor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class HmiController extends Controller
{
    public function store(StoreHmiRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $sensorMap = [
            1 => ['temp' => 9, 'hum' => 11],
            2 => ['temp' => 33, 'hum' => 35],
            3 => ['temp' => 57, 'hum' => 59],
            4 => ['temp' => 81, 'hum' => 83],
        ];

        $hmi = DB::transaction(function () use ($validated, $sensorMap): Hmi {
            $room = Room::create([
                'name' => 'ROOM '.$validated['ip_address'],
                'location' => null,
            ]);

            $hmi = Hmi::create([
                'room_id' => $room->id,
                'name' => 'HMI '.$validated['ip_address'],
                'ip_address' => $validated['ip_address'],
                'port' => $validated['port'],
                'register_function' => $validated['register_function'] ?? '04',
                'is_active' => false,
                'is_preview' => true,
            ]);

            // Auto-create 4 sensor sesuai posisi Device_1..4 di HMI Haiwell D4.
            // Register address disimpan sebagai referensi UI/reporting.
            foreach (range(1, 4) as $position) {
                Sensor::create([
                    'hmi_id' => $hmi->id,
                    'name' => "Sensor {$position}",
                    'unit_id' => $position,
                    'modbus_address_temp' => $sensorMap[$position]['temp'],
                    'modbus_address_hum' => $sensorMap[$position]['hum'],
                ]);
            }

            return $hmi;
        });

        return response()->json([
            'hmi_id' => $hmi->id,
            'message' => 'HMI disimpan, menunggu data dari poller...',
        ], 201);
    }

    public function previewData(Hmi $hmi): JsonResponse
    {
        $hmi->loadMissing(['room', 'latestData']);

        if (! $hmi->is_preview) {
            return response()->json([
                'ready' => false,
                'room_name' => $hmi->room?->name,
                'room_detail' => $hmi->room?->location,
                'hmi_avg' => [
                    'temp' => $hmi->latestData?->avg_temp !== null
                        ? (float) $hmi->latestData->avg_temp
                        : null,
                    'hum' => $hmi->latestData?->avg_hum !== null
                        ? (float) $hmi->latestData->avg_hum
                        : null,
                ],
                'sensors' => [],
            ]);
        }

        $sensors = $hmi->sensors()
            ->with('latestData')
            ->orderBy('id')
            ->get();

        $hasData = $sensors->isNotEmpty() && $sensors->every(
            fn (Sensor $sensor) => $sensor->latestData !== null
        );

        return response()->json([
            'ready' => $hasData,
            'room_name' => $hmi->room?->name,
            'room_detail' => $hmi->room?->location,
            'hmi_avg' => [
                'temp' => $hmi->latestData?->avg_temp !== null
                    ? (float) $hmi->latestData->avg_temp
                    : null,
                'hum' => $hmi->latestData?->avg_hum !== null
                    ? (float) $hmi->latestData->avg_hum
                    : null,
            ],
            'sensors' => $sensors->map(fn (Sensor $sensor) => [
                'id' => $sensor->id,
                'name' => $sensor->name,
                'unit_id' => $sensor->unit_id,
                'modbus_address_temp' => $sensor->modbus_address_temp,
                'modbus_address_hum' => $sensor->modbus_address_hum,
                'temperature' => $sensor->latestData?->temperature,
                'humidity' => $sensor->latestData?->humidity,
                'calibrate_temp' => $sensor->latestData?->calibrate_temp,
                'calibrate_hum' => $sensor->latestData?->calibrate_hum,
                'status' => $sensor->latestData?->status,
                'alarm_temp' => $sensor->latestData?->alarm_temp,
                'alarm_hum' => $sensor->latestData?->alarm_hum,
                'readable' => [
                    'has_latest_data' => $sensor->latestData !== null,
                    'temperature' => $sensor->latestData?->temperature !== null,
                    'humidity' => $sensor->latestData?->humidity !== null,
                    'calibrate_temp' => $sensor->latestData?->calibrate_temp !== null,
                    'calibrate_hum' => $sensor->latestData?->calibrate_hum !== null,
                ],
            ])->values(),
        ]);
    }

    public function confirm(Request $request, Hmi $hmi): JsonResponse
    {
        if (! $hmi->is_preview) {
            return response()->json([
                'success' => false,
                'message' => 'HMI ini bukan dalam mode preview.',
            ], 409);
        }

        $validated = $request->validate([
            'sensor_names' => ['sometimes', 'array'],
            'sensor_names.*' => ['nullable', 'string', 'max:100'],
        ]);

        foreach ($validated['sensor_names'] ?? [] as $sensorId => $name) {
            $normalizedName = trim((string) $name);
            if ($normalizedName === '') {
                continue;
            }

            $hmi->sensors()
                ->whereKey((int) $sensorId)
                ->update(['name' => $normalizedName]);
        }

        $hmi->update([
            'is_active' => true,
            'is_preview' => false,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'HMI berhasil diaktifkan.',
        ]);
    }

    public function cancelPreview(Hmi $hmi): JsonResponse
    {
        if (! $hmi->is_preview) {
            return response()->json([
                'success' => false,
                'message' => 'HMI ini bukan dalam mode preview.',
            ], 403);
        }

        $roomId = $hmi->room_id;
        $hmi->delete();

        // Clean up orphaned room (no other HMIs use it)
        $remainingHmis = Hmi::where('room_id', $roomId)->count();
        if ($remainingHmis === 0) {
            Room::destroy($roomId);
        }

        return response()->json([
            'success' => true,
        ]);
    }

    public function update(UpdateHmiRequest $request, Hmi $hmi): RedirectResponse
    {
        $payload = $request->validated();
        if (($payload['is_active'] ?? false) === true) {
            $payload['is_preview'] = false;
        }

        $hmi->update($payload);

        return redirect()->route('rooms.devices', $hmi->room_id);
    }

    public function destroy(Hmi $hmi): RedirectResponse
    {
        $roomId = $hmi->room_id;
        $hmi->delete();

        return redirect()->route('rooms.devices', $roomId);
    }

    public function testConnection(Request $request): JsonResponse
    {
        $request->validate([
            'ip_address' => ['required', 'ip'],
            'port' => ['required', 'integer', 'min:1', 'max:65535'],
            'hmi_id' => ['sometimes', 'integer', 'exists:hmis,id'],
        ]);

        $ip = $request->string('ip_address')->value();
        $port = (int) $request->input('port');

        $socket = @fsockopen($ip, $port, $errno, $errstr, 3);

        $connected = (bool) $socket;

        if ($socket) {
            fclose($socket);
        }

        if ($request->filled('hmi_id')) {
            Hmi::findOrFail($request->integer('hmi_id'))->update(['is_active' => $connected]);
        }

        if ($connected) {
            return response()->json(['success' => true, 'message' => 'Koneksi berhasil.']);
        }

        return response()->json(['success' => false, 'message' => 'Tidak dapat terhubung. Periksa IP dan pastikan perangkat menyala.']);
    }
}
