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
        Schema::table('sensors', function (Blueprint $table) {
            $table->integer('modbus_coil_alarm_temp')->nullable()->after('modbus_address_hum');
            $table->integer('modbus_coil_alarm_hum')->nullable()->after('modbus_coil_alarm_temp');
            $table->integer('modbus_coil_connection')->nullable()->after('modbus_coil_alarm_hum');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('sensors', function (Blueprint $table) {
            $table->dropColumn([
                'modbus_coil_alarm_temp',
                'modbus_coil_alarm_hum',
                'modbus_coil_connection',
            ]);
        });
    }
};
