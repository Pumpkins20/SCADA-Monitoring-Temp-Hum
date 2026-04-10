<?php

namespace App\Http\Requests;

use App\Models\Hmi;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreHmiRequest extends FormRequest
{
    private const MAX_HMI_CONNECTIONS = 5;

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
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'ip_address' => ['required', 'ip', 'unique:hmis,ip_address'],
            'port' => ['required', 'integer', 'min:1', 'max:65535'],
            'register_function' => ['sometimes', 'in:03,04'],
        ];
    }

    /**
     * @return array<int, callable(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if (Hmi::query()->count() >= self::MAX_HMI_CONNECTIONS) {
                    $validator->errors()->add('hmi_limit', 'Maksimal 5 device');
                }
            },
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
            'ip_address.unique' => 'IP Address sudah terdaftar',
            'port.required' => 'Port wajib diisi.',
            'port.integer' => 'Port harus berupa angka.',
            'port.min' => 'Port minimal 1.',
            'port.max' => 'Port maksimal 65535.',
            'register_function.in' => 'Function register harus FC03 (Holding) atau FC04 (Input).',
        ];
    }
}
