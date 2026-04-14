<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ExportSensorLogsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'room' => ['required', 'integer', 'exists:rooms,id'],
            'page' => ['nullable', 'integer', 'min:1'],
            'time_filter' => ['nullable', 'string', 'in:none,interval,recent'],
            'start_at' => ['nullable', 'date_format:Y-m-d H:i:s', 'required_if:time_filter,interval'],
            'end_at' => ['nullable', 'date_format:Y-m-d H:i:s', 'required_if:time_filter,interval'],
            'recent_minutes' => ['nullable', 'integer', 'min:1', 'max:1440', 'required_if:time_filter,recent'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'room.required' => 'Ruangan wajib dipilih untuk export log.',
            'room.integer' => 'Ruangan tidak valid.',
            'room.exists' => 'Ruangan yang dipilih tidak ditemukan.',
            'page.integer' => 'Halaman tidak valid.',
            'page.min' => 'Halaman minimal bernilai 1.',
            'time_filter.in' => 'Mode filter waktu tidak valid.',
            'start_at.required_if' => 'Start time wajib diisi untuk mode interval.',
            'start_at.date_format' => 'Format Start time harus YYYY-MM-DD HH:MM:SS.',
            'end_at.required_if' => 'End time wajib diisi untuk mode interval.',
            'end_at.date_format' => 'Format End time harus YYYY-MM-DD HH:MM:SS.',
            'recent_minutes.required_if' => 'Recent interval wajib diisi untuk mode recent.',
            'recent_minutes.integer' => 'Recent interval harus berupa angka bulat.',
            'recent_minutes.min' => 'Recent interval minimal 1 menit.',
            'recent_minutes.max' => 'Recent interval maksimal 1440 menit.',
        ];
    }
}
