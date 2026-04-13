<!DOCTYPE html>
<html lang="id">

<head>
    <meta charset="UTF-8">
    <title>Backup Otomatis Data 90 Hari</title>
</head>

<body style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
    <p>Halo,</p>
    <p>
        Sistem SCADA telah membuat backup otomatis data yang lebih lama dari 90 hari.
        File backup terlampir dalam format XLSX.
    </p>

    <p>
        <strong>Waktu backup:</strong> {{ $generatedAt }}<br>
        <strong>Cutoff data:</strong> {{ $cutoffAt }}<br>
        <strong>Jumlah sensor_logs:</strong> {{ $sensorLogsCount }}<br>
        <strong>Jumlah sensor_readings:</strong> {{ $sensorReadingsCount }}
    </p>

    <p>Terima kasih.</p>
</body>

</html>
