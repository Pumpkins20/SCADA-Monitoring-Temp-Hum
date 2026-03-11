<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreHmiRequest;
use App\Http\Requests\UpdateHmiRequest;
use App\Models\Hmi;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class HmiController extends Controller
{
    public function store(StoreHmiRequest $request): RedirectResponse
    {
        Hmi::create($request->validated());

        return redirect()->route('rooms.devices', $request->validated('room_id'));
    }

    public function update(UpdateHmiRequest $request, Hmi $hmi): RedirectResponse
    {
        $hmi->update($request->validated());

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
