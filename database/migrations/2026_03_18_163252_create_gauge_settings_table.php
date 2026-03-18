<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('gauge_settings', function (Blueprint $table) {
            $table->id();
            $table->decimal('temp_min', 5, 2)->default(0.00);
            $table->decimal('temp_max', 5, 2)->default(80.00);
            $table->decimal('temp_green_from', 5, 2)->default(0.00);
            $table->decimal('temp_green_to', 5, 2)->default(36.00);
            $table->decimal('temp_yellow_from', 5, 2)->default(36.00);
            $table->decimal('temp_yellow_to', 5, 2)->default(56.00);
            $table->decimal('temp_red_from', 5, 2)->default(56.00);
            $table->decimal('temp_red_to', 5, 2)->default(80.00);

            $table->decimal('hum_min', 5, 2)->default(0.00);
            $table->decimal('hum_max', 5, 2)->default(100.00);
            $table->decimal('hum_green_from', 5, 2)->default(0.00);
            $table->decimal('hum_green_to', 5, 2)->default(60.00);
            $table->decimal('hum_yellow_from', 5, 2)->default(60.00);
            $table->decimal('hum_yellow_to', 5, 2)->default(80.00);
            $table->decimal('hum_red_from', 5, 2)->default(80.00);
            $table->decimal('hum_red_to', 5, 2)->default(100.00);
            $table->timestamps();
        });

        DB::table('gauge_settings')->insert([
            'temp_min' => 0.00,
            'temp_max' => 80.00,
            'temp_green_from' => 0.00,
            'temp_green_to' => 36.00,
            'temp_yellow_from' => 36.00,
            'temp_yellow_to' => 56.00,
            'temp_red_from' => 56.00,
            'temp_red_to' => 80.00,
            'hum_min' => 0.00,
            'hum_max' => 100.00,
            'hum_green_from' => 0.00,
            'hum_green_to' => 60.00,
            'hum_yellow_from' => 60.00,
            'hum_yellow_to' => 80.00,
            'hum_red_from' => 80.00,
            'hum_red_to' => 100.00,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('gauge_settings');
    }
};
