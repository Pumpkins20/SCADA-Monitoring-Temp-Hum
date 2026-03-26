<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateSensorRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'unit_id' => ['required', 'integer', 'min:1', 'max:255'],
            'modbus_address_temp' => ['required', 'integer', 'min:0', 'max:65535'],
            'modbus_address_hum' => ['required', 'integer', 'min:0', 'max:65535'],
            'pos_x' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'pos_y' => ['nullable', 'integer', 'min:0', 'max:65535'],
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
            'unit_id.max' => 'Slave ID maksimal 255.',
            'modbus_address_temp.required' => 'Register suhu wajib diisi.',
            'modbus_address_temp.integer' => 'Register suhu harus berupa angka.',
            'modbus_address_hum.required' => 'Register kelembapan wajib diisi.',
            'modbus_address_hum.integer' => 'Register kelembapan harus berupa angka.',
            'pos_x.integer' => 'Koordinat X harus berupa angka.',
            'pos_x.min' => 'Koordinat X tidak boleh negatif.',
            'pos_x.max' => 'Koordinat X maksimal 65535.',
            'pos_y.integer' => 'Koordinat Y harus berupa angka.',
            'pos_y.min' => 'Koordinat Y tidak boleh negatif.',
            'pos_y.max' => 'Koordinat Y maksimal 65535.',
        ];
    }
}
