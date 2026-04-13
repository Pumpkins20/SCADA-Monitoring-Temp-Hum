<?php

namespace App\Console\Commands;

use App\Mail\OldLogsBackupMail;
use App\Models\GaugeSetting;
use Carbon\CarbonInterface;
use Illuminate\Console\Command;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Writer\XLSX\Writer;

class PurgeOldLogs extends Command
{
    protected $signature = 'purge:old-logs';

    protected $description = 'Delete sensor_logs and sensor_readings older than 90 days';

    public function handle(): int
    {
        $cutoff = now()->subDays(90);

        $logsToBackup = (int) DB::table('sensor_logs')
            ->where('created_at', '<', $cutoff)
            ->count();
        $readingsToBackup = (int) DB::table('sensor_readings')
            ->where('created_at', '<', $cutoff)
            ->count();

        $recordsToBackup = $logsToBackup + $readingsToBackup;
        $backupEmail = $this->resolveBackupEmail();

        if ($recordsToBackup === 0) {
            $this->info('No records older than 90 days were found. Skipping backup export.');
        } elseif ($backupEmail === null) {
            $this->warn('Automatic backup skipped because backup email is not configured.');
        } else {
            try {
                $this->sendBackupEmail(
                    cutoff: $cutoff,
                    backupEmail: $backupEmail,
                    logsToBackup: $logsToBackup,
                    readingsToBackup: $readingsToBackup,
                );
            } catch (\Throwable $exception) {
                report($exception);
                $this->error('Automatic backup failed. Continuing with data purge.');
            }
        }

        $logsDeleted = DB::table('sensor_logs')->where('created_at', '<', $cutoff)->delete();
        $readingsDeleted = DB::table('sensor_readings')->where('created_at', '<', $cutoff)->delete();

        $this->info("Purged {$logsDeleted} sensor_logs and {$readingsDeleted} sensor_readings older than 90 days.");

        return self::SUCCESS;
    }

    private function resolveBackupEmail(): ?string
    {
        $backupEmail = GaugeSetting::query()->value('backup_email');

        if (! is_string($backupEmail)) {
            return null;
        }

        $normalized = trim($backupEmail);

        return $normalized !== '' ? $normalized : null;
    }

    private function sendBackupEmail(
        CarbonInterface $cutoff,
        string $backupEmail,
        int $logsToBackup,
        int $readingsToBackup,
    ): void {
        $generatedAt = now();
        [$filePath, $fileName] = $this->createBackupSpreadsheet(
            cutoff: $cutoff,
            generatedAt: $generatedAt,
        );

        try {
            Mail::to($backupEmail)->send(new OldLogsBackupMail(
                filePath: $filePath,
                fileName: $fileName,
                cutoffAt: $cutoff->toDateTimeString(),
                generatedAt: $generatedAt->toDateTimeString(),
                sensorLogsCount: $logsToBackup,
                sensorReadingsCount: $readingsToBackup,
            ));

            $this->info("Automatic backup was sent to {$backupEmail}.");
        } finally {
            if (is_file($filePath)) {
                unlink($filePath);
            }
        }
    }

    /**
     * @return array{string, string}
     */
    private function createBackupSpreadsheet(CarbonInterface $cutoff, CarbonInterface $generatedAt): array
    {
        $directory = storage_path('app/temp/purge-backups');

        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        $fileName = 'Backup_Otomatis_90_Hari_'.$generatedAt->format('Ymd_His').'.xlsx';
        $filePath = $directory.DIRECTORY_SEPARATOR.$fileName;

        $writer = new Writer;
        $opened = false;

        try {
            $writer->openToFile($filePath);
            $opened = true;

            $this->writeBackupMetaRows($writer, $generatedAt, $cutoff);
            $this->writeSensorLogsRows($writer, $cutoff);
            $writer->addRow(Row::fromValues(['']));
            $this->writeSensorReadingsRows($writer, $cutoff);
        } finally {
            if ($opened) {
                $writer->close();
            }
        }

        return [$filePath, $fileName];
    }

    private function writeBackupMetaRows(Writer $writer, CarbonInterface $generatedAt, CarbonInterface $cutoff): void
    {
        $writer->addRow(Row::fromValues(['Backup Otomatis Data 90 Hari']));
        $writer->addRow(Row::fromValues(['Generated At', $generatedAt->toDateTimeString()]));
        $writer->addRow(Row::fromValues(['Cutoff (<)', $cutoff->toDateTimeString()]));
        $writer->addRow(Row::fromValues(['']));
    }

    private function writeSensorLogsRows(Writer $writer, CarbonInterface $cutoff): void
    {
        $writer->addRow(Row::fromValues(['TABLE: sensor_logs']));
        $writer->addRow(Row::fromValues([
            'id',
            'room_id',
            'avg_temperature',
            'avg_humidity',
            'created_at',
            'updated_at',
        ]));

        $this->sensorLogsQuery($cutoff)->chunkById(1000, function ($rows) use ($writer): void {
            foreach ($rows as $row) {
                $writer->addRow(Row::fromValues([
                    (int) $row->id,
                    (int) $row->room_id,
                    (string) $row->avg_temperature,
                    (string) $row->avg_humidity,
                    (string) $row->created_at,
                    (string) $row->updated_at,
                ]));
            }
        });
    }

    private function writeSensorReadingsRows(Writer $writer, CarbonInterface $cutoff): void
    {
        $writer->addRow(Row::fromValues(['TABLE: sensor_readings']));
        $writer->addRow(Row::fromValues([
            'id',
            'sensor_id',
            'avg_temp',
            'avg_hum',
            'created_at',
        ]));

        $this->sensorReadingsQuery($cutoff)->chunkById(1000, function ($rows) use ($writer): void {
            foreach ($rows as $row) {
                $writer->addRow(Row::fromValues([
                    (int) $row->id,
                    (int) $row->sensor_id,
                    (string) $row->avg_temp,
                    (string) $row->avg_hum,
                    (string) $row->created_at,
                ]));
            }
        });
    }

    private function sensorLogsQuery(CarbonInterface $cutoff): Builder
    {
        return DB::table('sensor_logs')
            ->select(['id', 'room_id', 'avg_temperature', 'avg_humidity', 'created_at', 'updated_at'])
            ->where('created_at', '<', $cutoff);
    }

    private function sensorReadingsQuery(CarbonInterface $cutoff): Builder
    {
        return DB::table('sensor_readings')
            ->select(['id', 'sensor_id', 'avg_temp', 'avg_hum', 'created_at'])
            ->where('created_at', '<', $cutoff);
    }
}
