<?php

namespace App\Http\Controllers;

use App\Http\Requests\TestMirrorConnectionRequest;
use Illuminate\Http\JsonResponse;
use Inertia\Inertia;
use Inertia\Response;

class MirrorController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('mirror/index');
    }

    public function testConnection(TestMirrorConnectionRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $ip = $validated['ip_address'];
        $port = (int) $validated['port'];
        $timeout = 3;

        $startedAt = microtime(true);
        $socket = @fsockopen($ip, $port, $errno, $errstr, $timeout);
        $latencyMs = (int) round((microtime(true) - $startedAt) * 1000);

        $isReachable = (bool) $socket;

        if ($socket) {
            fclose($socket);
        }

        return response()->json([
            'success' => $isReachable,
            'reachable' => $isReachable,
            'latency_ms' => $latencyMs,
            'message' => $isReachable
                ? 'Koneksi mirror berhasil.'
                : 'Tidak dapat terhubung ke target mirror.',
        ]);
    }
}
