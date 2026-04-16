<?php

namespace App\Http\Controllers;

use App\Mail\AlarmLogExportMail;
use App\Models\AlarmEvent;
use App\Models\GaugeSetting;
use App\Models\Room;
use App\Models\SensorLatestData;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Color;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\XLSX\Writer;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class AlarmController extends Controller
{
    public function index(Request $request): Response
    {
        $rooms = Room::query()->orderBy('name')->get(['id', 'name']);

        $tab = $this->resolveTab($request->string('tab', 'realtime')->toString());
        $activeRoomId = $request->integer('room');
        $startDate = $this->parseDate((string) $request->query('start_date', ''), false);
        $endDate = $this->parseDate((string) $request->query('end_date', ''), true);

        $perPage = 30;
        $page = max(1, (int) $request->query('page', 1));

        $query = $this->buildAlarmQuery($tab, $activeRoomId, $startDate, $endDate);
        $paginator = $query->paginate($perPage, ['*'], 'page', $page)->withQueryString();

        if ($this->isRealtimeTab($tab) && $paginator->total() === 0) {
            $fallbackRows = $this->buildRealtimeFallbackRows($activeRoomId, $startDate, $endDate);

            $total = count($fallbackRows);
            $lastPage = max(1, (int) ceil($total / $perPage));
            $offset = ($page - 1) * $perPage;
            $rows = array_slice($fallbackRows, $offset, $perPage);

            $pagination = [
                'currentPage' => min($page, $lastPage),
                'lastPage' => $lastPage,
                'total' => $total,
            ];
        } else {
            $rows = $paginator
                ->getCollection()
                ->map(fn(AlarmEvent $event) => $this->mapRow($event))
                ->values()
                ->all();

            $pagination = [
                'currentPage' => $paginator->currentPage(),
                'lastPage' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ];
        }

        return Inertia::render('alarms/index', [
            'rooms' => $rooms->map(fn(Room $room) => [
                'id' => $room->id,
                'name' => $room->name,
            ])->values()->all(),
            'filters' => [
                'tab' => $tab,
                'room' => $activeRoomId > 0 ? $activeRoomId : null,
                'start_date' => $startDate?->format('Y-m-d'),
                'end_date' => $endDate?->format('Y-m-d'),
            ],
            'rows' => $rows,
            'pagination' => $pagination,
            'tabInfo' => [
                'isViewOnly' => true,
                'confirmedAvailableFromHmi' => false,
            ],
            'flashSuccess' => $request->session()->get('success'),
            'flashError' => $request->session()->get('error'),
            'exportRecipientEmail' => $this->resolveExportRecipientEmail(),
        ]);
    }

    public function export(Request $request): void
    {
        $tab = $this->resolveTab((string) $request->input('tab', 'realtime'));
        $activeRoomId = (int) $request->input('room', 0);
        $startDate = $this->parseDate((string) $request->input('start_date', ''), false);
        $endDate = $this->parseDate((string) $request->input('end_date', ''), true);

        $query = $this->buildAlarmQuery($tab, $activeRoomId, $startDate, $endDate);
        $hasPersistedRows = (clone $query)->exists();
        $fallbackRows = ! $hasPersistedRows && $this->isRealtimeTab($tab)
            ? $this->buildRealtimeFallbackRows($activeRoomId, $startDate, $endDate)
            : [];
        $filename = 'Alarm_Logs_' . Str::slug($this->formatTabLabel($tab)) . '_' . now()->format('Ymd_His') . '.xlsx';

        $writer = new Writer;
        $writer->openToBrowser($filename);
        $this->writeExportRows(
            $writer,
            $query,
            $fallbackRows,
            $tab,
            $activeRoomId,
            $startDate,
            $endDate,
        );
        $writer->close();
    }

    public function exportPdf(Request $request): SymfonyResponse
    {
        $tab = $this->resolveTab((string) $request->input('tab', 'realtime'));
        $activeRoomId = (int) $request->input('room', 0);
        $startDate = $this->parseDate((string) $request->input('start_date', ''), false);
        $endDate = $this->parseDate((string) $request->input('end_date', ''), true);

        $query = $this->buildAlarmQuery($tab, $activeRoomId, $startDate, $endDate);
        $hasPersistedRows = (clone $query)->exists();
        $fallbackRows = ! $hasPersistedRows && $this->isRealtimeTab($tab)
            ? $this->buildRealtimeFallbackRows($activeRoomId, $startDate, $endDate)
            : [];

        $fileName = 'Alarm_Logs_' . Str::slug($this->formatTabLabel($tab)) . '_' . now()->format('Ymd_His') . '.pdf';

        $html = view('exports.alarm-log-pdf', [
            'tabLabel' => $this->formatTabLabel($tab),
            'roomName' => $this->resolveRoomName($activeRoomId),
            'startDate' => $startDate?->format('Y-m-d H:i:s'),
            'endDate' => $endDate?->format('Y-m-d H:i:s'),
            'generatedAt' => now()->format('Y-m-d H:i:s'),
            'rows' => $this->resolveExportRows($query, $fallbackRows),
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

    public function exportToEmail(Request $request): RedirectResponse
    {
        $tab = $this->resolveTab((string) $request->input('tab', 'realtime'));
        $activeRoomId = (int) $request->input('room', 0);
        $startDate = $this->parseDate((string) $request->input('start_date', ''), false);
        $endDate = $this->parseDate((string) $request->input('end_date', ''), true);
        $page = max(1, (int) $request->input('page', 1));

        $recipientEmail = $this->resolveExportRecipientEmail();
        if ($recipientEmail === null) {
            return redirect()
                ->route(
                    'alarms.index',
                    $this->buildAlarmIndexQuery($tab, $activeRoomId, $startDate, $endDate, $page),
                )
                ->with('error', 'Email backup otomatis belum diatur.');
        }

        $query = $this->buildAlarmQuery($tab, $activeRoomId, $startDate, $endDate);
        $hasPersistedRows = (clone $query)->exists();
        $fallbackRows = ! $hasPersistedRows && $this->isRealtimeTab($tab)
            ? $this->buildRealtimeFallbackRows($activeRoomId, $startDate, $endDate)
            : [];

        $fileName = 'Alarm_Logs_' . Str::slug($this->formatTabLabel($tab)) . '_' . now()->format('Ymd_His') . '.xlsx';
        $exportDirectory = storage_path('app/temp/exports');
        $filePath = $exportDirectory . DIRECTORY_SEPARATOR . $fileName;
        $generatedAt = now()->format('Y-m-d H:i:s');
        $subjectExportLabel = 'EXPORT_DATA_ALARM_LOGS_(' . now()->format('d_m_Y_H_i') . ')';

        if (! is_dir($exportDirectory)) {
            mkdir($exportDirectory, 0755, true);
        }

        try {
            $writer = new Writer;
            $writer->openToFile($filePath);
            $this->writeExportRows(
                $writer,
                $query,
                $fallbackRows,
                $tab,
                $activeRoomId,
                $startDate,
                $endDate,
            );
            $writer->close();

            Mail::to($recipientEmail)->send(new AlarmLogExportMail(
                filePath: $filePath,
                fileName: $fileName,
                generatedAt: $generatedAt,
                subjectExportLabel: $subjectExportLabel,
            ));
        } catch (\Throwable $exception) {
            if (is_file($filePath)) {
                unlink($filePath);
            }

            report($exception);

            return redirect()
                ->route(
                    'alarms.index',
                    $this->buildAlarmIndexQuery($tab, $activeRoomId, $startDate, $endDate, $page),
                )
                ->with('error', 'Gagal mengirim export alarm ke email.');
        }

        if (is_file($filePath)) {
            unlink($filePath);
        }

        return redirect()
            ->route(
                'alarms.index',
                $this->buildAlarmIndexQuery($tab, $activeRoomId, $startDate, $endDate, $page),
            )
            ->with('success', "Export alarm berhasil dikirim ke {$recipientEmail}.");
    }

    private function writeExportRows(
        Writer $writer,
        Builder $query,
        array $fallbackRows,
        string $tab,
        int $activeRoomId,
        ?Carbon $startDate,
        ?Carbon $endDate,
    ): void {
        $roomName = $this->resolveRoomName($activeRoomId);

        $writer->addRow(Row::fromValues(['Jenis Data', 'Alarm Logs']));
        $writer->addRow(Row::fromValues(['Tab', $this->formatTabLabel($tab)]));
        $writer->addRow(Row::fromValues(['Ruangan', $roomName]));
        $writer->addRow(Row::fromValues(['Start Date', $startDate?->format('Y-m-d H:i:s') ?? '-']));
        $writer->addRow(Row::fromValues(['End Date', $endDate?->format('Y-m-d H:i:s') ?? '-']));
        $writer->addRow(Row::fromValues(['Generated At', now()->format('Y-m-d H:i:s')]));
        $writer->addRow(Row::fromValues(['']));

        $headerStyle = (new Style)
            ->withFontBold(true)
            ->withFontColor(Color::WHITE)
            ->withBackgroundColor('0891B2')
            ->withShouldWrapText(false);

        $dataStyle = (new Style)
            ->withShouldWrapText(false);

        $headers = [
            'Alarm time',
            'Current value',
            'Alarm text',
            'Alarm type',
            'Variable name',
            'Confirmed time',
            'Room name',
            'Room detail',
        ];

        $writer->addRow(Row::fromValuesWithStyle($headers, $headerStyle));

        if ($fallbackRows !== []) {
            $rows = collect($fallbackRows)
                ->map(fn(array $row) => Row::fromValuesWithStyle(
                    $this->mapExportRowValues($row),
                    $dataStyle,
                ))
                ->all();

            $writer->addRows($rows);

            return;
        }

        foreach ($query->cursor() as $event) {
            $row = $this->mapRow($event);

            $writer->addRow(Row::fromValuesWithStyle(
                $this->mapExportRowValues($row),
                $dataStyle,
            ));
        }
    }

    /**
     * @return array<int, array<int, string>>
     */
    private function resolveExportRows(Builder $query, array $fallbackRows): array
    {
        if ($fallbackRows !== []) {
            return collect($fallbackRows)
                ->map(fn(array $row) => $this->mapExportRowValues($row))
                ->values()
                ->all();
        }

        $rows = [];

        foreach ($query->cursor() as $event) {
            $rows[] = $this->mapExportRowValues($this->mapRow($event));
        }

        return $rows;
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<int, string>
     */
    private function mapExportRowValues(array $row): array
    {
        return [
            (string) ($row['alarm_time'] ?? '-'),
            (string) ($row['current_value'] ?? '-'),
            (string) ($row['alarm_text'] ?? '-'),
            (string) ($row['alarm_type'] ?? '-'),
            (string) ($row['variable_name'] ?? '-'),
            (string) ($row['confirmed_time'] ?? '-'),
            (string) ($row['room_name'] ?? '-'),
            (string) ($row['room_detail'] ?? '-'),
        ];
    }

    private function resolveRoomName(int $activeRoomId): string
    {
        if ($activeRoomId <= 0) {
            return 'Semua Ruang';
        }

        return Room::query()->whereKey($activeRoomId)->value('name') ?? "Room {$activeRoomId}";
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

    private function buildAlarmIndexQuery(
        string $tab,
        int $activeRoomId,
        ?Carbon $startDate,
        ?Carbon $endDate,
        int $page,
    ): array {
        $query = [
            'tab' => $tab,
            'page' => $page,
        ];

        if ($activeRoomId > 0) {
            $query['room'] = $activeRoomId;
        }

        if ($startDate !== null) {
            $query['start_date'] = $startDate->format('Y-m-d');
        }

        if ($endDate !== null) {
            $query['end_date'] = $endDate->format('Y-m-d');
        }

        return $query;
    }

    private function formatTabLabel(string $tab): string
    {
        return match ($tab) {
            'history' => 'History Alarm',
            'no-confirmed' => 'No Confirmed Alarm',
            'been-confirmed' => 'Been Confirmed Alarm',
            default => 'Real Time Alarm',
        };
    }

    private function buildAlarmQuery(
        string $tab,
        int $activeRoomId,
        ?Carbon $startDate,
        ?Carbon $endDate,
    ): Builder {
        $query = AlarmEvent::query()
            ->with([
                'sensor:id,hmi_id,name,unit_id',
                'sensor.hmi:id,room_id',
                'sensor.hmi.room:id,name,location',
            ]);

        if ($tab === 'realtime' || $tab === 'no-confirmed') {
            $query->whereNull('cleared_at');
        }

        if ($tab === 'been-confirmed') {
            $query->whereRaw('1 = 0');
        }

        if ($activeRoomId > 0) {
            $query->whereHas('sensor.hmi', fn(Builder $builder) => $builder->where('room_id', $activeRoomId));
        }

        if ($startDate !== null) {
            $query->where('occurred_at', '>=', $startDate);
        }

        if ($endDate !== null) {
            $query->where('occurred_at', '<=', $endDate);
        }

        return $query->orderByDesc('occurred_at')->orderByDesc('id');
    }

    private function mapRow(AlarmEvent $event): array
    {
        $sensor = $event->sensor;
        $room = $sensor?->hmi?->room;
        $deviceNumber = $this->resolveDeviceNumber($sensor?->unit_id, $sensor?->name);

        return [
            'id' => $event->id,
            'alarm_time' => $event->occurred_at?->format('Y-m-d H:i:s') ?? '-',
            'current_value' => $this->formatCurrentValue($event),
            'alarm_text' => $this->makeAlarmText($event, $deviceNumber),
            'alarm_type' => 'alert',
            'variable_name' => $this->makeVariableName($event->alarm_type, $deviceNumber),
            'confirmed_time' => '-',
            'room_name' => $room?->name ?? '-',
            'room_detail' => $room?->location ?? '-',
        ];
    }

    private function formatCurrentValue(AlarmEvent $event): string
    {
        if ($event->current_value === null) {
            return '-';
        }

        return rtrim(rtrim(number_format((float) $event->current_value, 2, '.', ''), '0'), '.');
    }

    private function makeAlarmText(AlarmEvent $event, ?int $deviceNumber): string
    {
        $deviceLabel = $deviceNumber !== null ? "Device {$deviceNumber}" : 'Device';

        return match ($event->alarm_type) {
            'temp_low' => "{$deviceLabel} Low Temperature",
            'hum_high' => "{$deviceLabel} High Humidity",
            'hum_low' => "{$deviceLabel} Low Humidity",
            'temp' => "{$deviceLabel} High Temperature",
            'hum' => "{$deviceLabel} High Humidity",
            'temp_high' => "{$deviceLabel} High Temperature",
            default => "{$deviceLabel} Disconnected",
        };
    }

    private function makeVariableName(string $alarmType, ?int $deviceNumber): string
    {
        $suffix = $deviceNumber ?? 0;

        return match ($alarmType) {
            'temp', 'temp_high', 'temp_low' => "Ext_Device_{$suffix}_temp",
            'hum', 'hum_high', 'hum_low' => "Ext_Device_{$suffix}_hum",
            default => "Ext_Device_{$suffix}_commStatus",
        };
    }

    private function buildRealtimeFallbackRows(
        int $activeRoomId,
        ?Carbon $startDate,
        ?Carbon $endDate,
    ): array {
        $latestRows = SensorLatestData::query()
            ->with([
                'sensor:id,hmi_id,unit_id',
                'sensor.hmi:id,room_id',
                'sensor.hmi.room:id,name,location',
            ])
            ->where(function (Builder $builder): void {
                $builder
                    ->where('alarm_temp', true)
                    ->orWhere('alarm_hum', true)
                    ->orWhere('alarm_disconnect', true);
            });

        if ($activeRoomId > 0) {
            $latestRows->whereHas('sensor.hmi', fn(Builder $builder) => $builder->where('room_id', $activeRoomId));
        }

        if ($startDate !== null) {
            $latestRows->where('last_read_at', '>=', $startDate);
        }

        if ($endDate !== null) {
            $latestRows->where('last_read_at', '<=', $endDate);
        }

        return $latestRows
            ->orderByDesc('last_read_at')
            ->orderByDesc('id')
            ->get()
            ->flatMap(function (SensorLatestData $latest) {
                $rows = [];

                if ($latest->alarm_temp) {
                    $rows[] = $this->mapFallbackRow($latest, 'temp', $latest->temperature);
                }

                if ($latest->alarm_hum) {
                    $rows[] = $this->mapFallbackRow($latest, 'hum', $latest->humidity);
                }

                if ($latest->alarm_disconnect) {
                    $rows[] = $this->mapFallbackRow($latest, 'disconnect', 0.0);
                }

                return $rows;
            })
            ->values()
            ->all();
    }

    private function mapFallbackRow(SensorLatestData $latest, string $alarmType, float|string|null $currentValue): array
    {
        $sensor = $latest->sensor;
        $room = $sensor?->hmi?->room;
        $deviceNumber = $this->resolveDeviceNumber($sensor?->unit_id, $sensor?->name);

        return [
            'id' => (int) ($latest->id * 10 + $this->fallbackAlarmTypeOrder($alarmType)),
            'alarm_time' => $latest->last_read_at?->format('Y-m-d H:i:s') ?? '-',
            'current_value' => $this->formatFallbackCurrentValue($currentValue),
            'alarm_text' => $this->makeAlarmTextFromType($alarmType, $deviceNumber),
            'alarm_type' => 'alert',
            'variable_name' => $this->makeVariableName($alarmType, $deviceNumber),
            'confirmed_time' => '-',
            'room_name' => $room?->name ?? '-',
            'room_detail' => $room?->location ?? '-',
        ];
    }

    private function formatFallbackCurrentValue(float|string|null $currentValue): string
    {
        if ($currentValue === null || $currentValue === '') {
            return '-';
        }

        return rtrim(rtrim(number_format((float) $currentValue, 2, '.', ''), '0'), '.');
    }

    private function makeAlarmTextFromType(string $alarmType, ?int $deviceNumber): string
    {
        $deviceLabel = $deviceNumber !== null ? "Device {$deviceNumber}" : 'Device';

        return match ($alarmType) {
            'temp_low' => "{$deviceLabel} Low Temperature",
            'hum_high' => "{$deviceLabel} High Humidity",
            'hum_low' => "{$deviceLabel} Low Humidity",
            'temp' => "{$deviceLabel} High Temperature",
            'hum' => "{$deviceLabel} High Humidity",
            'temp_high' => "{$deviceLabel} High Temperature",
            default => "{$deviceLabel} Disconnected",
        };
    }

    private function fallbackAlarmTypeOrder(string $alarmType): int
    {
        return match ($alarmType) {
            'temp', 'temp_high', 'temp_low' => 1,
            'hum', 'hum_high', 'hum_low' => 2,
            default => 4,
        };
    }

    private function resolveDeviceNumber(?int $unitId, ?string $sensorName): ?int
    {
        $parsedFromName = null;

        if ($sensorName !== null && preg_match('/(\d+)(?!.*\d)/', $sensorName, $matches) === 1) {
            $candidate = (int) $matches[1];

            if ($candidate >= 1 && $candidate <= 4) {
                $parsedFromName = $candidate;
            }
        }

        if ($parsedFromName !== null && ($unitId === null || $unitId < 1 || $unitId > 4)) {
            return $parsedFromName;
        }

        if ($unitId !== null && $unitId > 0) {
            if ($parsedFromName !== null && $unitId === 1 && $parsedFromName !== 1) {
                return $parsedFromName;
            }

            return $unitId;
        }

        if ($parsedFromName !== null) {
            return $parsedFromName;
        }

        return null;
    }

    private function isRealtimeTab(string $tab): bool
    {
        return in_array($tab, ['realtime', 'no-confirmed'], true);
    }

    private function resolveTab(string $tab): string
    {
        $allowed = ['realtime', 'history', 'no-confirmed', 'been-confirmed'];

        return in_array($tab, $allowed, true) ? $tab : 'realtime';
    }

    private function parseDate(string $value, bool $endOfDay): ?Carbon
    {
        if ($value === '') {
            return null;
        }

        try {
            $date = Carbon::createFromFormat('Y-m-d', $value);

            if ($date === false) {
                return null;
            }

            return $endOfDay ? $date->endOfDay() : $date->startOfDay();
        } catch (\Throwable) {
            return null;
        }
    }
}
