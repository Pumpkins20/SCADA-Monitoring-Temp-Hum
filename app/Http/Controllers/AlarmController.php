<?php

namespace App\Http\Controllers;

use App\Models\AlarmEvent;
use App\Models\Room;
use App\Models\SensorLatestData;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

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
                ->map(fn (AlarmEvent $event) => $this->mapRow($event))
                ->values()
                ->all();

            $pagination = [
                'currentPage' => $paginator->currentPage(),
                'lastPage' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ];
        }

        return Inertia::render('alarms/index', [
            'rooms' => $rooms->map(fn (Room $room) => [
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
        ]);
    }

    public function export(Request $request)
    {
        $tab = $this->resolveTab($request->string('tab', 'realtime')->toString());
        $activeRoomId = $request->integer('room');
        $startDate = $this->parseDate((string) $request->query('start_date', ''), false);
        $endDate = $this->parseDate((string) $request->query('end_date', ''), true);

        $query = $this->buildAlarmQuery($tab, $activeRoomId, $startDate, $endDate);
        $filename = 'alarm_export_'.now()->format('Ymd_His').'.csv';
        $hasPersistedRows = (clone $query)->exists();
        $fallbackRows = ! $hasPersistedRows && $this->isRealtimeTab($tab)
            ? $this->buildRealtimeFallbackRows($activeRoomId, $startDate, $endDate)
            : [];

        return response()->streamDownload(function () use ($query, $fallbackRows): void {
            $handle = fopen('php://output', 'w');

            if ($handle === false) {
                return;
            }

            fputcsv($handle, [
                'Alarm time',
                'Current value',
                'Alarm text',
                'Alarm type',
                'Variable name',
                'Confirmed time',
                'Room name',
                'Room detail',
            ]);

            if ($fallbackRows !== []) {
                foreach ($fallbackRows as $row) {
                    fputcsv($handle, [
                        $row['alarm_time'],
                        $row['current_value'],
                        $row['alarm_text'],
                        $row['alarm_type'],
                        $row['variable_name'],
                        $row['confirmed_time'],
                        $row['room_name'],
                        $row['room_detail'],
                    ]);
                }
            } else {
                foreach ($query->cursor() as $event) {
                    $row = $this->mapRow($event);

                    fputcsv($handle, [
                        $row['alarm_time'],
                        $row['current_value'],
                        $row['alarm_text'],
                        $row['alarm_type'],
                        $row['variable_name'],
                        $row['confirmed_time'],
                        $row['room_name'],
                        $row['room_detail'],
                    ]);
                }
            }

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv',
        ]);
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
            $query->whereHas('sensor.hmi', fn (Builder $builder) => $builder->where('room_id', $activeRoomId));
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

        return [
            'id' => $event->id,
            'alarm_time' => $event->occurred_at?->format('Y-m-d H:i:s') ?? '-',
            'current_value' => $this->formatCurrentValue($event),
            'alarm_text' => $this->makeAlarmText($event, $sensor?->unit_id),
            'alarm_type' => 'alert',
            'variable_name' => $this->makeVariableName($event->alarm_type, $sensor?->unit_id),
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

    private function makeAlarmText(AlarmEvent $event, ?int $unitId): string
    {
        $deviceLabel = $unitId !== null ? "Device {$unitId}" : 'Device';

        return match ($event->alarm_type) {
            'temp' => "{$deviceLabel} Temperature Alarm",
            'hum' => "{$deviceLabel} Humidity Alarm",
            default => "{$deviceLabel} Disconnected",
        };
    }

    private function makeVariableName(string $alarmType, ?int $unitId): string
    {
        $suffix = $unitId ?? 0;

        return match ($alarmType) {
            'temp' => "Ext_Device_{$suffix}_temp",
            'hum' => "Ext_Device_{$suffix}_hum",
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
            $latestRows->whereHas('sensor.hmi', fn (Builder $builder) => $builder->where('room_id', $activeRoomId));
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

        return [
            'id' => (int) ($latest->id * 10 + $this->fallbackAlarmTypeOrder($alarmType)),
            'alarm_time' => $latest->last_read_at?->format('Y-m-d H:i:s') ?? '-',
            'current_value' => $this->formatFallbackCurrentValue($currentValue),
            'alarm_text' => $this->makeAlarmTextFromType($alarmType, $sensor?->unit_id),
            'alarm_type' => 'alert',
            'variable_name' => $this->makeVariableName($alarmType, $sensor?->unit_id),
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

    private function makeAlarmTextFromType(string $alarmType, ?int $unitId): string
    {
        $deviceLabel = $unitId !== null ? "Device {$unitId}" : 'Device';

        return match ($alarmType) {
            'temp' => "{$deviceLabel} Temperature Alarm",
            'hum' => "{$deviceLabel} Humidity Alarm",
            default => "{$deviceLabel} Disconnected",
        };
    }

    private function fallbackAlarmTypeOrder(string $alarmType): int
    {
        return match ($alarmType) {
            'temp' => 1,
            'hum' => 2,
            default => 3,
        };
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
