<?php

namespace App\Http\Controllers;

use App\Mail\SensorLogExportMail;
use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorReading;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Color;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\XLSX\Writer;

class SensorLogController extends Controller
{
    public function index(Request $request): Response
    {
        $rooms = Room::query()->orderBy('name')->get(['id', 'name']);
        $activeRoomId = (int) $request->query('room', $rooms->first()?->id ?? 0);
        $timeFilterMode = $this->resolveTimeFilterMode(
            (string) $request->query('time_filter', 'none')
        );
        $startAt = $this->parseDateTime((string) $request->query('start_at', ''));
        $endAt = $this->parseDateTime((string) $request->query('end_at', ''));
        $recentMinutes = $this->normalizeRecentMinutes(
            (int) $request->query('recent_minutes', 5)
        );

        // Sensors for the active room, ordered consistently
        $sensors = Sensor::query()
            ->whereHas('hmi', fn($q) => $q->where('room_id', $activeRoomId))
            ->orderBy('id')
            ->get(['id', 'name']);

        $sensorIds = $sensors->pluck('id');

        // Paginate: get distinct timestamps first, then fetch readings for those timestamps
        $perPage = 50;
        $page = max(1, (int) $request->query('page', 1));

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
        );

        $totalRowsQuery = SensorReading::query()
            ->whereIn('sensor_id', $sensorIds)
            ->selectRaw('COUNT(DISTINCT created_at) as cnt');

        $this->applyTimeFilter(
            $totalRowsQuery,
            $timeFilterMode,
            $startAt,
            $endAt,
            $recentMinutes,
        );

        $totalRows = $totalRowsQuery->value('cnt');

        $timestamps = $timestampsQuery
            ->offset(($page - 1) * $perPage)
            ->limit($perPage)
            ->pluck('created_at');

        // Fetch all readings for these timestamps
        $readings = SensorReading::query()
            ->whereIn('sensor_id', $sensorIds)
            ->whereIn('created_at', $timestamps)
            ->get();

        // Pivot: group by timestamp, map sensor values to columns
        $sensorList = $sensors->values();
        $rows = $readings
            ->groupBy(fn($r) => $r->created_at->format('Y-m-d H:i:s'))
            ->sortKeysDesc()
            ->map(function ($group, $time) use ($sensorList) {
                $row = ['time' => $time];
                $tempSum = 0;
                $humSum = 0;
                $count = 0;

                foreach ($sensorList as $i => $sensor) {
                    $reading = $group->firstWhere('sensor_id', $sensor->id);
                    $temp = $reading ? (float) $reading->avg_temp : null;
                    $hum = $reading ? (float) $reading->avg_hum : null;

                    $row['temp_' . ($i + 1)] = $temp;
                    $row['hum_' . ($i + 1)] = $hum;

                    if ($temp !== null) {
                        $tempSum += $temp;
                        $humSum += $hum;
                        $count++;
                    }
                }

                $row['avg_temp'] = $count > 0 ? round($tempSum / $count, 1) : null;
                $row['avg_hum'] = $count > 0 ? round($humSum / $count, 1) : null;

                return $row;
            })
            ->values()
            ->all();

        return Inertia::render('logs/index', [
            'rooms' => $rooms->map(fn(Room $r) => ['id' => $r->id, 'name' => $r->name])->all(),
            'activeRoomId' => $activeRoomId,
            'sensors' => $sensorList->map(fn(Sensor $s) => ['id' => $s->id, 'name' => $s->name])->all(),
            'logs' => $rows,
            'timeFilter' => [
                'mode' => $timeFilterMode,
                'start_at' => $startAt?->format('Y-m-d H:i:s'),
                'end_at' => $endAt?->format('Y-m-d H:i:s'),
                'recent_minutes' => $recentMinutes,
            ],
            'pagination' => [
                'currentPage' => $page,
                'lastPage' => (int) ceil($totalRows / $perPage),
                'total' => (int) $totalRows,
            ],
            'flashSuccess' => $request->session()->get('success'),
            'flashError' => $request->session()->get('error'),
            'exportRecipientEmail' => config('mail.export_recipient'),
        ]);
    }

    public function export(Request $request): void
    {
        $activeRoomId = (int) $request->input('room');
        $room = Room::findOrFail($activeRoomId);
        $timeFilterMode = $this->resolveTimeFilterMode(
            (string) $request->input('time_filter', 'none')
        );
        $startAt = $this->parseDateTime((string) $request->input('start_at', ''));
        $endAt = $this->parseDateTime((string) $request->input('end_at', ''));
        $recentMinutes = $this->normalizeRecentMinutes(
            (int) $request->input('recent_minutes', 5)
        );

        $sensors = Sensor::query()
            ->whereHas('hmi', fn($q) => $q->where('room_id', $activeRoomId))
            ->orderBy('id')
            ->get(['id', 'name']);

        $sensorIds = $sensors->pluck('id');

        $fileName = 'Log_Sensor_' . Str::slug($room->name) . '_' . now()->format('Ymd_His') . '.xlsx';

        $writer = new Writer;
        $writer->openToBrowser($fileName);
        $this->writeExportRows(
            $writer,
            $sensors,
            $sensorIds,
            $timeFilterMode,
            $startAt,
            $endAt,
            $recentMinutes,
        );
        $writer->close();
    }

    public function exportToEmail(Request $request): RedirectResponse
    {
        $activeRoomId = (int) $request->input('room');
        $room = Room::findOrFail($activeRoomId);
        $timeFilterMode = $this->resolveTimeFilterMode(
            (string) $request->input('time_filter', 'none')
        );
        $startAt = $this->parseDateTime((string) $request->input('start_at', ''));
        $endAt = $this->parseDateTime((string) $request->input('end_at', ''));
        $recentMinutes = $this->normalizeRecentMinutes(
            (int) $request->input('recent_minutes', 5)
        );
        $page = max(1, (int) $request->input('page', 1));

        $recipientEmail = (string) config('mail.export_recipient', '');
        if ($recipientEmail === '') {
            return redirect()
                ->route(
                    'logs.index',
                    $this->buildLogsIndexQuery(
                        $activeRoomId,
                        $timeFilterMode,
                        $startAt,
                        $endAt,
                        $recentMinutes,
                        $page,
                    ),
                )
                ->with('error', 'Email recipient export log belum diatur.');
        }

        $sensors = Sensor::query()
            ->whereHas('hmi', fn($q) => $q->where('room_id', $activeRoomId))
            ->orderBy('id')
            ->get(['id', 'name']);

        $sensorIds = $sensors->pluck('id');
        $fileName = 'Log_Sensor_' . Str::slug($room->name) . '_' . now()->format('Ymd_His') . '.xlsx';
        $exportDirectory = storage_path('app/temp/exports');
        $filePath = $exportDirectory . DIRECTORY_SEPARATOR . $fileName;

        if (! is_dir($exportDirectory)) {
            mkdir($exportDirectory, 0755, true);
        }

        try {
            $writer = new Writer;
            $writer->openToFile($filePath);
            $this->writeExportRows(
                $writer,
                $sensors,
                $sensorIds,
                $timeFilterMode,
                $startAt,
                $endAt,
                $recentMinutes,
            );
            $writer->close();

            Mail::to($recipientEmail)->send(new SensorLogExportMail(
                roomName: $room->name,
                filePath: $filePath,
                fileName: $fileName,
                generatedAt: now()->format('Y-m-d H:i:s'),
            ));
        } catch (\Throwable $exception) {
            if (is_file($filePath)) {
                unlink($filePath);
            }

            report($exception);

            return redirect()
                ->route(
                    'logs.index',
                    $this->buildLogsIndexQuery(
                        $activeRoomId,
                        $timeFilterMode,
                        $startAt,
                        $endAt,
                        $recentMinutes,
                        $page,
                    ),
                )
                ->with('error', 'Gagal mengirim export log ke email.');
        }

        if (is_file($filePath)) {
            unlink($filePath);
        }

        return redirect()
            ->route(
                'logs.index',
                $this->buildLogsIndexQuery(
                    $activeRoomId,
                    $timeFilterMode,
                    $startAt,
                    $endAt,
                    $recentMinutes,
                    $page,
                ),
            )
            ->with('success', "Export log berhasil dikirim ke {$recipientEmail}.");
    }

    private function writeExportRows(
        Writer $writer,
        Collection $sensors,
        Collection $sensorIds,
        string $timeFilterMode,
        ?Carbon $startAt,
        ?Carbon $endAt,
        int $recentMinutes,
    ): void {

        // Header Style
        $headerStyle = (new Style)
            ->withFontBold(true)
            ->withFontColor(Color::WHITE)
            ->withBackgroundColor('3B82F6') // bg-blue-500
            ->withShouldWrapText(false);

        // Data Style
        $dataStyle = (new Style)
            ->withShouldWrapText(false);

        // Header Row
        $headers = ['Waktu'];
        $sensorCount = $sensors->count();
        for ($i = 1; $i <= $sensorCount; $i++) {
            $headers[] = "Suhu $i (°C)";
        }
        for ($i = 1; $i <= $sensorCount; $i++) {
            $headers[] = "Kelembapan $i (%)";
        }
        $headers[] = 'Rata-rata Suhu (°C)';
        $headers[] = 'Rata-rata Kelembapan (%)';

        $headerRow = Row::fromValuesWithStyle($headers, $headerStyle);
        $writer->addRow($headerRow);

        // Fetch dates chunk by chunk to avoid memory exhaustion
        $perPage = 1000;
        $page = 1;
        $baseTimestampsQuery = SensorReading::query()->whereIn('sensor_id', $sensorIds);

        $this->applyTimeFilter(
            $baseTimestampsQuery,
            $timeFilterMode,
            $startAt,
            $endAt,
            $recentMinutes,
        );

        while (true) {
            // Get distinct timestamps
            $timestamps = (clone $baseTimestampsQuery)
                ->selectRaw('DISTINCT created_at')
                ->orderByDesc('created_at')
                ->offset(($page - 1) * $perPage)
                ->limit($perPage)
                ->pluck('created_at');

            if ($timestamps->isEmpty()) {
                break;
            }

            // Fetch readings
            $readings = SensorReading::query()
                ->whereIn('sensor_id', $sensorIds)
                ->whereIn('created_at', $timestamps)
                ->get();

            $sensorList = $sensors->values();
            $rows = $readings
                ->groupBy(fn($r) => $r->created_at->format('Y-m-d H:i:s'))
                ->sortKeysDesc()
                ->map(function ($group, $time) use ($sensorList, $dataStyle) {
                    $rowData = [$time];
                    $tempSum = 0;
                    $humSum = 0;
                    $count = 0;

                    $temps = [];
                    $hums = [];

                    foreach ($sensorList as $sensor) {
                        $reading = $group->firstWhere('sensor_id', $sensor->id);
                        $temp = $reading ? (float) $reading->avg_temp : null;
                        $hum = $reading ? (float) $reading->avg_hum : null;

                        // We can insert integer/float or empty string. Spout auto-detects type.
                        $temps[] = $temp !== null ? $temp : '';
                        $hums[] = $hum !== null ? $hum : '';

                        if ($temp !== null) {
                            $tempSum += $temp;
                            $humSum += $hum;
                            $count++;
                        }
                    }

                    $rowData = array_merge($rowData, $temps, $hums);
                    $rowData[] = $count > 0 ? round($tempSum / $count, 1) : '';
                    $rowData[] = $count > 0 ? round($humSum / $count, 1) : '';

                    return Row::fromValuesWithStyle($rowData, $dataStyle);
                })
                ->values()
                ->all();

            $writer->addRows($rows);

            $page++;
        }
    }

    private function buildLogsIndexQuery(
        int $activeRoomId,
        string $timeFilterMode,
        ?Carbon $startAt,
        ?Carbon $endAt,
        int $recentMinutes,
        int $page,
    ): array {
        $query = [
            'room' => $activeRoomId,
            'page' => $page,
        ];

        if ($timeFilterMode === 'recent') {
            $query['time_filter'] = 'recent';
            $query['recent_minutes'] = $recentMinutes;

            return $query;
        }

        if ($timeFilterMode !== 'interval' || $startAt === null || $endAt === null) {
            return $query;
        }

        $from = $startAt->lte($endAt) ? $startAt : $endAt;
        $to = $startAt->lte($endAt) ? $endAt : $startAt;

        $query['time_filter'] = 'interval';
        $query['start_at'] = $from->format('Y-m-d H:i:s');
        $query['end_at'] = $to->format('Y-m-d H:i:s');

        return $query;
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

        return min($minutes, 1440);
    }

    private function applyTimeFilter(
        Builder $query,
        string $mode,
        ?Carbon $startAt,
        ?Carbon $endAt,
        int $recentMinutes,
    ): void {
        if ($mode === 'recent') {
            $query->where('created_at', '>=', now()->subMinutes($recentMinutes));

            return;
        }

        if ($mode !== 'interval' || $startAt === null || $endAt === null) {
            return;
        }

        $from = $startAt->lte($endAt) ? $startAt : $endAt;
        $to = $startAt->lte($endAt) ? $endAt : $startAt;

        $query->whereBetween('created_at', [$from, $to]);
    }
}
