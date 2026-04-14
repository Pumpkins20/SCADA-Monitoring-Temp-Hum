<!DOCTYPE html>
<html lang="id">

<head>
    <meta charset="UTF-8">
    <title>Export Log Sensor</title>
    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            font-family: DejaVu Sans, sans-serif;
            color: #0f172a;
            font-size: 11px;
            line-height: 1.35;
        }

        .header {
            margin-bottom: 12px;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 8px;
        }

        .title {
            margin: 0;
            font-size: 16px;
            font-weight: 700;
        }

        .subtitle {
            margin: 2px 0 0;
            color: #475569;
            font-size: 10px;
        }

        .meta-grid {
            margin-bottom: 12px;
            width: 100%;
            border-collapse: collapse;
        }

        .meta-grid td {
            padding: 3px 0;
            vertical-align: top;
        }

        .meta-label {
            width: 120px;
            color: #334155;
            font-weight: 600;
        }

        .meta-value {
            color: #0f172a;
        }

        .table-wrap {
            width: 100%;
            overflow: hidden;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }

        thead th {
            border: 1px solid #cbd5e1;
            background: #e2e8f0;
            color: #0f172a;
            font-size: 9px;
            font-weight: 700;
            padding: 5px 4px;
            text-align: center;
            word-break: break-word;
        }

        tbody td {
            border: 1px solid #e2e8f0;
            padding: 4px 3px;
            font-size: 9px;
            text-align: center;
            word-break: break-word;
        }

        tbody td.time-cell {
            text-align: left;
            white-space: nowrap;
            width: 130px;
        }

        .empty {
            margin-top: 18px;
            border: 1px dashed #94a3b8;
            background: #f8fafc;
            padding: 10px;
            text-align: center;
            color: #475569;
            font-size: 10px;
        }
    </style>
</head>

<body>
    @php
        $filterLabel = 'Tanpa filter waktu';

        if ($timeFilterMode === 'recent') {
            $filterLabel = 'Recent ' . $recentMinutes . ' menit';
        }

        if ($timeFilterMode === 'interval' && $startAt !== null && $endAt !== null) {
            $filterLabel = 'Interval ' . $startAt . ' s/d ' . $endAt;
        }
    @endphp

    <div class="header">
        <h1 class="title">Export Log Sensor</h1>
        <p class="subtitle">Generated at: {{ $generatedAt }}</p>
    </div>

    <table class="meta-grid">
        <tr>
            <td class="meta-label">Nama Ruangan</td>
            <td class="meta-value">{{ $roomName }}</td>
        </tr>
        <tr>
            <td class="meta-label">Lokasi Ruangan</td>
            <td class="meta-value">{{ $roomMetadata['room_location'] }}</td>
        </tr>
        <tr>
            <td class="meta-label">IP Address</td>
            <td class="meta-value">{{ $roomMetadata['ip_address_summary'] }}</td>
        </tr>
        <tr>
            <td class="meta-label">Filter Waktu</td>
            <td class="meta-value">{{ $filterLabel }}</td>
        </tr>
    </table>

    @if (count($rows) === 0)
        <div class="empty">
            Belum ada data log untuk filter yang dipilih.
        </div>
    @else
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        @foreach ($headers as $header)
                            <th>{{ $header }}</th>
                        @endforeach
                    </tr>
                </thead>
                <tbody>
                    @foreach ($rows as $row)
                        <tr>
                            @foreach ($row as $index => $value)
                                <td class="{{ $index === 0 ? 'time-cell' : '' }}">
                                    {{ $value !== '' ? $value : '—' }}
                                </td>
                            @endforeach
                        </tr>
                    @endforeach
                </tbody>
            </table>
        </div>
    @endif
</body>

</html>
