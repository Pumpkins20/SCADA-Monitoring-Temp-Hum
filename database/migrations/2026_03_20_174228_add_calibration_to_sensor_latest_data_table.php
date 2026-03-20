<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('sensor_latest_data', function (Blueprint $table) {
            $table->decimal('calibrate_temp', 5, 2)
                ->nullable()
                ->after('alarm_disconnect');
            $table->decimal('calibrate_hum', 5, 2)
                ->nullable()
                ->after('calibrate_temp');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('sensor_latest_data', function (Blueprint $table) {
            $table->dropColumn(['calibrate_temp', 'calibrate_hum']);
        });
    }
};
