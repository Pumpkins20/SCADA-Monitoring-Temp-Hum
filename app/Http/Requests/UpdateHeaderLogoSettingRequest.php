<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateHeaderLogoSettingRequest extends FormRequest
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
            'logo_left' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            'logo_center' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            'header_title_line_1' => ['nullable', 'string', 'max:160'],
            'header_title_line_2' => ['nullable', 'string', 'max:120'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'logo_left.image' => 'Logo kiri harus berupa file gambar.',
            'logo_left.mimes' => 'Logo kiri hanya mendukung format JPG, PNG, atau WEBP.',
            'logo_left.max' => 'Ukuran logo kiri maksimal 2 MB.',
            'logo_center.image' => 'Logo tengah harus berupa file gambar.',
            'logo_center.mimes' => 'Logo tengah hanya mendukung format JPG, PNG, atau WEBP.',
            'logo_center.max' => 'Ukuran logo tengah maksimal 2 MB.',
            'header_title_line_1.max' => 'Judul header baris 1 maksimal 160 karakter.',
            'header_title_line_2.max' => 'Judul header baris 2 maksimal 120 karakter.',
        ];
    }
}
