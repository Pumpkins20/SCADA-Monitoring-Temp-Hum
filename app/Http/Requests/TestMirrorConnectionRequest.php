<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class TestMirrorConnectionRequest extends FormRequest
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
            'ip_address' => ['required', 'ip'],
            'port' => ['required', 'integer', 'min:1', 'max:65535'],
            'protocol' => ['nullable', 'in:http,https'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'ip_address.required' => 'Alamat IP wajib diisi.',
            'ip_address.ip' => 'Format alamat IP tidak valid.',
            'port.required' => 'Port wajib diisi.',
            'port.integer' => 'Port harus berupa angka.',
            'port.min' => 'Port minimal 1.',
            'port.max' => 'Port maksimal 65535.',
            'protocol.in' => 'Protocol harus http atau https.',
        ];
    }
}
