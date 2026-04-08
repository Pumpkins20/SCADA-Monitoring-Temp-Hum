<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateHmiRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'ip_address' => [
                'required',
                'ip',
                Rule::unique('hmis', 'ip_address')->ignore($this->route('hmi')),
            ],
            'port' => ['required', 'integer', 'min:1', 'max:65535'],
            'register_function' => ['required', 'in:03,04'],
            'is_active' => ['required', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'Nama HMI wajib diisi.',
            'name.max' => 'Nama HMI maksimal 100 karakter.',
            'ip_address.required' => 'Alamat IP wajib diisi.',
            'ip_address.ip' => 'Format alamat IP tidak valid.',
            'ip_address.unique' => 'IP Address sudah terdaftar',
            'port.required' => 'Port wajib diisi.',
            'port.integer' => 'Port harus berupa angka.',
            'port.min' => 'Port minimal 1.',
            'port.max' => 'Port maksimal 65535.',
            'register_function.required' => 'Function register wajib dipilih.',
            'register_function.in' => 'Function register harus FC03 (Holding) atau FC04 (Input).',
        ];
    }
}
