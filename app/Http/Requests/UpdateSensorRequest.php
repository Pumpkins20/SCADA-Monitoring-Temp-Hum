<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateSensorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'unit_id' => ['required', 'integer', 'min:1', 'max:247'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'Nama sensor wajib diisi.',
            'name.max' => 'Nama sensor maksimal 100 karakter.',
            'unit_id.required' => 'Slave ID wajib diisi.',
            'unit_id.integer' => 'Slave ID harus berupa angka.',
            'unit_id.min' => 'Slave ID minimal 1.',
            'unit_id.max' => 'Slave ID maksimal 247.',
        ];
    }
}
