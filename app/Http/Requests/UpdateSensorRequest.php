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
            'modbus_register_function' => ['required', 'in:01,02,03,04'],
            'modbus_address_temp' => ['required', 'integer', 'min:0', 'max:65535'],
            'modbus_address_hum' => ['required', 'integer', 'min:0', 'max:65535'],
            'modbus_coil_alarm_temp' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'modbus_coil_alarm_hum' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'modbus_coil_connection' => ['nullable', 'integer', 'min:1', 'max:65535'],
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
            'modbus_register_function.required' => 'Function register wajib dipilih.',
            'modbus_register_function.in' => 'Function register harus salah satu dari 01, 02, 03, atau 04.',
            'modbus_address_temp.required' => 'Register suhu wajib diisi.',
            'modbus_address_temp.integer' => 'Register suhu harus berupa angka.',
            'modbus_address_hum.required' => 'Register kelembapan wajib diisi.',
            'modbus_address_hum.integer' => 'Register kelembapan harus berupa angka.',
            'modbus_coil_alarm_temp.integer' => 'Coil alarm suhu harus berupa angka.',
            'modbus_coil_alarm_temp.min' => 'Coil alarm suhu minimal 1.',
            'modbus_coil_alarm_temp.max' => 'Coil alarm suhu maksimal 65535.',
            'modbus_coil_alarm_hum.integer' => 'Coil alarm kelembapan harus berupa angka.',
            'modbus_coil_alarm_hum.min' => 'Coil alarm kelembapan minimal 1.',
            'modbus_coil_alarm_hum.max' => 'Coil alarm kelembapan maksimal 65535.',
            'modbus_coil_connection.integer' => 'Coil status koneksi harus berupa angka.',
            'modbus_coil_connection.min' => 'Coil status koneksi minimal 1.',
            'modbus_coil_connection.max' => 'Coil status koneksi maksimal 65535.',
        ];
    }
}
