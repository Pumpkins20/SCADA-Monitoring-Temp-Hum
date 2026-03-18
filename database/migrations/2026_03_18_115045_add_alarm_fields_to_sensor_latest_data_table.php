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
            $table->boolean('alarm_temp')->default(false)->after('status');
            $table->boolean('alarm_hum')->default(false)->after('alarm_temp');
            $table->boolean('alarm_disconnect')->default(false)->after('alarm_hum');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('sensor_latest_data', function (Blueprint $table) {
            $table->dropColumn(['alarm_temp', 'alarm_hum', 'alarm_disconnect']);
        });
    }
};
