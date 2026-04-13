<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OldLogsBackupMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $filePath,
        public string $fileName,
        public string $cutoffAt,
        public string $generatedAt,
        public int $sensorLogsCount,
        public int $sensorReadingsCount,
    ) {}

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Backup Otomatis Data 90 Hari',
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            view: 'emails.old-logs-backup',
            with: [
                'cutoffAt' => $this->cutoffAt,
                'generatedAt' => $this->generatedAt,
                'sensorLogsCount' => $this->sensorLogsCount,
                'sensorReadingsCount' => $this->sensorReadingsCount,
            ],
        );
    }

    /**
     * Get the attachments for the message.
     *
     * @return array<int, \Illuminate\Mail\Mailables\Attachment>
     */
    public function attachments(): array
    {
        return [
            Attachment::fromPath($this->filePath)
                ->as($this->fileName)
                ->withMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
        ];
    }
}
