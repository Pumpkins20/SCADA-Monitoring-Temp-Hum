<?php

namespace App\Http\Controllers;

use App\Models\Room;
use App\Models\Sensor;
use App\Models\SensorReading;
use Illuminate\Http\Request;
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

        // Sensors for the active room, ordered consistently
        $sensors = Sensor::query()
            ->whereHas('hmi', fn ($q) => $q->where('room_id', $activeRoomId))
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

        $totalRows = SensorReading::query()
            ->whereIn('sensor_id', $sensorIds)
            ->selectRaw('COUNT(DISTINCT created_at) as cnt')
            ->value('cnt');

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
            ->groupBy(fn ($r) => $r->created_at->format('Y-m-d H:i:s'))
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

                    $row['temp_'.($i + 1)] = $temp;
                    $row['hum_'.($i + 1)] = $hum;

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
            'rooms' => $rooms->map(fn (Room $r) => ['id' => $r->id, 'name' => $r->name])->all(),
            'activeRoomId' => $activeRoomId,
            'sensors' => $sensorList->map(fn (Sensor $s) => ['id' => $s->id, 'name' => $s->name])->all(),
            'logs' => $rows,
            'pagination' => [
                'currentPage' => $page,
                'lastPage' => (int) ceil($totalRows / $perPage),
                'total' => (int) $totalRows,
            ],
        ]);
    }

    public function export(Request $request)
    {
        $activeRoomId = (int) $request->query('room');
        $room = Room::findOrFail($activeRoomId);

        $sensors = Sensor::query()
            ->whereHas('hmi', fn ($q) => $q->where('room_id', $activeRoomId))
            ->orderBy('id')
            ->get(['id', 'name']);

        $sensorIds = $sensors->pluck('id');

        $fileName = 'Log_Sensor_'.Str::slug($room->name).'_'.now()->format('Ymd_His').'.xlsx';

        $writer = new Writer;
        $writer->openToBrowser($fileName);

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

        while (true) {
            // Get distinct timestamps
            $timestamps = SensorReading::query()
                ->whereIn('sensor_id', $sensorIds)
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
                ->groupBy(fn ($r) => $r->created_at->format('Y-m-d H:i:s'))
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

        $writer->close();
    }
}
