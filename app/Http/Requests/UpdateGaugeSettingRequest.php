<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateGaugeSettingRequest extends FormRequest
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
            'temp_min' => ['required', 'numeric', 'min:0', 'max:200'],
            'temp_max' => ['required', 'numeric', 'gt:temp_min', 'max:200'],
            'temp_green_from' => ['required', 'numeric', 'gte:temp_min', 'lte:temp_max'],
            'temp_green_to' => ['required', 'numeric', 'gt:temp_green_from', 'lte:temp_max'],
            'temp_yellow_from' => ['required', 'numeric', 'gte:temp_green_to', 'lte:temp_max'],
            'temp_yellow_to' => ['required', 'numeric', 'gt:temp_yellow_from', 'lte:temp_max'],
            'temp_red_from' => ['required', 'numeric', 'gte:temp_yellow_to', 'lte:temp_max'],
            'temp_red_to' => ['required', 'numeric', 'gt:temp_red_from', 'lte:temp_max'],

            'hum_min' => ['required', 'numeric', 'min:0', 'max:100'],
            'hum_max' => ['required', 'numeric', 'gt:hum_min', 'max:100'],
            'hum_green_from' => ['required', 'numeric', 'gte:hum_min', 'lte:hum_max'],
            'hum_green_to' => ['required', 'numeric', 'gt:hum_green_from', 'lte:hum_max'],
            'hum_yellow_from' => ['required', 'numeric', 'gte:hum_green_to', 'lte:hum_max'],
            'hum_yellow_to' => ['required', 'numeric', 'gt:hum_yellow_from', 'lte:hum_max'],
            'hum_red_from' => ['required', 'numeric', 'gte:hum_yellow_to', 'lte:hum_max'],
            'hum_red_to' => ['required', 'numeric', 'gt:hum_red_from', 'lte:hum_max'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            $tempMin = (float) $this->input('temp_min');
            $tempMax = (float) $this->input('temp_max');
            $tempGreenFrom = (float) $this->input('temp_green_from');
            $tempGreenTo = (float) $this->input('temp_green_to');
            $tempYellowFrom = (float) $this->input('temp_yellow_from');
            $tempYellowTo = (float) $this->input('temp_yellow_to');
            $tempRedFrom = (float) $this->input('temp_red_from');
            $tempRedTo = (float) $this->input('temp_red_to');

            $humMin = (float) $this->input('hum_min');
            $humMax = (float) $this->input('hum_max');
            $humGreenFrom = (float) $this->input('hum_green_from');
            $humGreenTo = (float) $this->input('hum_green_to');
            $humYellowFrom = (float) $this->input('hum_yellow_from');
            $humYellowTo = (float) $this->input('hum_yellow_to');
            $humRedFrom = (float) $this->input('hum_red_from');
            $humRedTo = (float) $this->input('hum_red_to');

            if ($tempGreenFrom !== $tempMin) {
                $validator->errors()->add('temp_green_from', 'Rentang suhu hijau harus dimulai dari nilai minimum suhu.');
            }

            if ($tempYellowFrom !== $tempGreenTo) {
                $validator->errors()->add('temp_yellow_from', 'Rentang suhu kuning harus dimulai dari batas akhir hijau.');
            }

            if ($tempRedFrom !== $tempYellowTo) {
                $validator->errors()->add('temp_red_from', 'Rentang suhu merah harus dimulai dari batas akhir kuning.');
            }

            if ($tempRedTo !== $tempMax) {
                $validator->errors()->add('temp_red_to', 'Rentang suhu merah harus berakhir di nilai maksimum suhu.');
            }

            if ($humGreenFrom !== $humMin) {
                $validator->errors()->add('hum_green_from', 'Rentang kelembapan hijau harus dimulai dari nilai minimum kelembapan.');
            }

            if ($humYellowFrom !== $humGreenTo) {
                $validator->errors()->add('hum_yellow_from', 'Rentang kelembapan kuning harus dimulai dari batas akhir hijau.');
            }

            if ($humRedFrom !== $humYellowTo) {
                $validator->errors()->add('hum_red_from', 'Rentang kelembapan merah harus dimulai dari batas akhir kuning.');
            }

            if ($humRedTo !== $humMax) {
                $validator->errors()->add('hum_red_to', 'Rentang kelembapan merah harus berakhir di nilai maksimum kelembapan.');
            }
        });
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'temp_min.required' => 'Nilai minimum suhu wajib diisi.',
            'temp_min.numeric' => 'Nilai minimum suhu harus berupa angka.',
            'temp_min.min' => 'Nilai minimum suhu minimal 0.',
            'temp_min.max' => 'Nilai minimum suhu maksimal 200.',
            'temp_max.required' => 'Nilai maksimum suhu wajib diisi.',
            'temp_max.numeric' => 'Nilai maksimum suhu harus berupa angka.',
            'temp_max.gt' => 'Nilai maksimum suhu harus lebih besar dari minimum suhu.',
            'temp_max.max' => 'Nilai maksimum suhu maksimal 200.',
            'hum_min.required' => 'Nilai minimum kelembapan wajib diisi.',
            'hum_min.numeric' => 'Nilai minimum kelembapan harus berupa angka.',
            'hum_min.min' => 'Nilai minimum kelembapan minimal 0.',
            'hum_min.max' => 'Nilai minimum kelembapan maksimal 100.',
            'hum_max.required' => 'Nilai maksimum kelembapan wajib diisi.',
            'hum_max.numeric' => 'Nilai maksimum kelembapan harus berupa angka.',
            'hum_max.gt' => 'Nilai maksimum kelembapan harus lebih besar dari minimum kelembapan.',
            'hum_max.max' => 'Nilai maksimum kelembapan maksimal 100.',
        ];
    }
}
