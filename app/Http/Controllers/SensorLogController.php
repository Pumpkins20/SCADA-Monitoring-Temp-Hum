<?php

namespace App\Http\Controllers;

use App\Http\Requests\ExportSensorLogsRequest;
use App\Mail\SensorLogExportMail;
use App\Models\GaugeSetting;
use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorReading;
use Dompdf\Dompdf;
use Dompdf\Options;
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
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

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
            'exportRecipientEmail' => $this->resolveExportRecipientEmail(),
        ]);
    }

    public function export(ExportSensorLogsRequest $request): void
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
            $room,
            $sensors,
            $sensorIds,
            $timeFilterMode,
            $startAt,
            $endAt,
            $recentMinutes,
        );
        $writer->close();
    }

    public function exportPdf(ExportSensorLogsRequest $request): SymfonyResponse
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
        $metadata = $this->buildRoomExportMetadata($room);
        $headers = $this->buildExportHeaders($sensors->count());
        $rows = $this->buildChunkedExportRows(
            $sensors,
            $sensorIds,
            $timeFilterMode,
            $startAt,
            $endAt,
            $recentMinutes,
        );

        $fileName = 'Log_Sensor_' . Str::slug($room->name) . '_' . now()->format('Ymd_His') . '.pdf';

        $html = view('exports.sensor-log-pdf', [
            'roomName' => $room->name,
            'roomMetadata' => $metadata,
            'headers' => $headers,
            'rows' => $rows,
            'generatedAt' => now()->format('Y-m-d H:i:s'),
            'timeFilterMode' => $timeFilterMode,
            'startAt' => $startAt?->format('Y-m-d H:i:s'),
            'endAt' => $endAt?->format('Y-m-d H:i:s'),
            'recentMinutes' => $recentMinutes,
        ])->render();

        $options = new Options;
        $options->set('isRemoteEnabled', false);

        $dompdf = new Dompdf($options);
        $dompdf->setPaper('A4', 'landscape');
        $dompdf->loadHtml($html);
        $dompdf->render();

        return response(
            $dompdf->output(),
            200,
            [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'attachment; filename="' . $fileName . '"',
            ],
        );
    }

    public function exportToEmail(ExportSensorLogsRequest $request): RedirectResponse
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

        $recipientEmail = $this->resolveExportRecipientEmail();
        if ($recipientEmail === null) {
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
                ->with('error', 'Email backup otomatis belum diatur.');
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
                $room,
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
        Room $room,
        Collection $sensors,
        Collection $sensorIds,
        string $timeFilterMode,
        ?Carbon $startAt,
        ?Carbon $endAt,
        int $recentMinutes,
    ): void {
        $metadata = $this->buildRoomExportMetadata($room);

        $writer->addRow(Row::fromValues(['Nama Ruangan', $metadata['room_location_name']]));
        $writer->addRow(Row::fromValues(['Lokasi Ruangan', $metadata['room_location']]));
        $writer->addRow(Row::fromValues(['IP Address', $metadata['ip_address_summary']]));
        $writer->addRow(Row::fromValues(['']));

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
        $headers = $this->buildExportHeaders($sensors->count());

        $headerRow = Row::fromValuesWithStyle($headers, $headerStyle);
        $writer->addRow($headerRow);

        // Fetch dates chunk by chunk to avoid memory exhaustion
        $perPage = 1000;
        $page = 1;
        $baseTimestampsQuery = SensorReading::query()->whereIn('sensor_id', $sensorIds);
        $sensorList = $sensors->values();

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

            $rows = $this->mapReadingsToExportRows($readings, $sensorList)
                ->map(fn(array $rowData) => Row::fromValuesWithStyle($rowData, $dataStyle))
                ->values()
                ->all();

            $writer->addRows($rows);

            $page++;
        }
    }

    /**
     * @return array{room_location_name: string, room_location: string, ip_address_summary: string}
     */
    private function buildRoomExportMetadata(Room $room): array
    {
        $roomLocation = $room->location !== null && $room->location !== ''
            ? $room->location
            : '-';
        $roomIpAddresses = $room->hmis()
            ->whereNotNull('ip_address')
            ->pluck('ip_address')
            ->filter(fn($ipAddress) => $ipAddress !== null && $ipAddress !== '')
            ->unique()
            ->implode(', ');

        return [
            'room_location_name' => $room->name,
            'room_location' => $roomLocation,
            'ip_address_summary' => $roomIpAddresses !== '' ? $roomIpAddresses : '-',
        ];
    }

    /**
     * @return array<int, string>
     */
    private function buildExportHeaders(int $sensorCount): array
    {
        $headers = ['Waktu'];

        for ($i = 1; $i <= $sensorCount; $i++) {
            $headers[] = "Suhu $i (°C)";
        }

        for ($i = 1; $i <= $sensorCount; $i++) {
            $headers[] = "Kelembapan $i (%)";
        }

        $headers[] = 'Rata-rata Suhu (°C)';
        $headers[] = 'Rata-rata Kelembapan (%)';

        return $headers;
    }

    /**
     * @return Collection<int, array<int, float|string>>
     */
    private function mapReadingsToExportRows(Collection $readings, Collection $sensorList): Collection
    {
        return $readings
            ->groupBy(fn($reading) => $reading->created_at->format('Y-m-d H:i:s'))
            ->sortKeysDesc()
            ->map(function ($group, $time) use ($sensorList) {
                $tempSum = 0;
                $humSum = 0;
                $count = 0;
                $temps = [];
                $hums = [];

                foreach ($sensorList as $sensor) {
                    $reading = $group->firstWhere('sensor_id', $sensor->id);
                    $temp = $reading ? (float) $reading->avg_temp : null;
                    $hum = $reading ? (float) $reading->avg_hum : null;

                    $temps[] = $temp !== null ? $temp : '';
                    $hums[] = $hum !== null ? $hum : '';

                    if ($temp !== null) {
                        $tempSum += $temp;
                        $humSum += $hum;
                        $count++;
                    }
                }

                return array_merge(
                    [$time],
                    $temps,
                    $hums,
                    [
                        $count > 0 ? round($tempSum / $count, 1) : '',
                        $count > 0 ? round($humSum / $count, 1) : '',
                    ],
                );
            })
            ->values();
    }

    /**
     * @return array<int, array<int, float|string>>
     */
    private function buildChunkedExportRows(
        Collection $sensors,
        Collection $sensorIds,
        string $timeFilterMode,
        ?Carbon $startAt,
        ?Carbon $endAt,
        int $recentMinutes,
    ): array {
        $rows = [];
        $perPage = 1000;
        $page = 1;
        $sensorList = $sensors->values();

        $baseTimestampsQuery = SensorReading::query()->whereIn('sensor_id', $sensorIds);

        $this->applyTimeFilter(
            $baseTimestampsQuery,
            $timeFilterMode,
            $startAt,
            $endAt,
            $recentMinutes,
        );

        while (true) {
            $timestamps = (clone $baseTimestampsQuery)
                ->selectRaw('DISTINCT created_at')
                ->orderByDesc('created_at')
                ->offset(($page - 1) * $perPage)
                ->limit($perPage)
                ->pluck('created_at');

            if ($timestamps->isEmpty()) {
                break;
            }

            $readings = SensorReading::query()
                ->whereIn('sensor_id', $sensorIds)
                ->whereIn('created_at', $timestamps)
                ->get();

            $chunkRows = $this->mapReadingsToExportRows($readings, $sensorList)->all();
            $rows = [...$rows, ...$chunkRows];

            $page++;
        }

        return $rows;
    }

    private function resolveExportRecipientEmail(): ?string
    {
        $backupEmail = GaugeSetting::query()->value('backup_email');

        if (! is_string($backupEmail)) {
            return null;
        }

        $normalized = trim($backupEmail);

        return $normalized !== '' ? $normalized : null;
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
