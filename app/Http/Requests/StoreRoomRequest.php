<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreRoomRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'location' => ['nullable', 'string', 'max:100'],
            'temp_max_limit' => ['required', 'numeric', 'min:0', 'max:99.99'],
            'hum_max_limit' => ['required', 'numeric', 'min:0', 'max:99.99'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'Nama ruangan wajib diisi.',
            'name.max' => 'Nama ruangan maksimal 100 karakter.',
            'temp_max_limit.required' => 'Batas suhu maksimum wajib diisi.',
            'temp_max_limit.numeric' => 'Batas suhu harus berupa angka.',
            'temp_max_limit.min' => 'Batas suhu minimal 0.',
            'temp_max_limit.max' => 'Batas suhu maksimal 99.99.',
            'hum_max_limit.required' => 'Batas kelembapan maksimum wajib diisi.',
            'hum_max_limit.numeric' => 'Batas kelembapan harus berupa angka.',
            'hum_max_limit.min' => 'Batas kelembapan minimal 0.',
            'hum_max_limit.max' => 'Batas kelembapan maksimal 99.99.',
        ];
    }
}
