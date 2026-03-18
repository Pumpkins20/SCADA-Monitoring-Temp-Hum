<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Drop columns moved/replaced by HMI-level configuration
        Schema::table('sensors', function (Blueprint $table) {
            $drop = array_filter([
                'modbus_register_function',
                'modbus_coil_alarm_temp',
                'modbus_coil_alarm_hum',
                'modbus_coil_connection',
            ], fn (string $col) => Schema::hasColumn('sensors', $col));

            if ($drop) {
                $table->dropColumn(array_values($drop));
            }
        });

        // Make address columns nullable — retained for reference/display but no longer
        // written by the auto-create flow. Must be separate call from dropColumn.
        Schema::table('sensors', function (Blueprint $table) {
            $table->unsignedInteger('modbus_address_temp')->nullable()->change();
            $table->unsignedInteger('modbus_address_hum')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('sensors', function (Blueprint $table) {
            $table->unsignedInteger('modbus_address_temp')->nullable(false)->change();
            $table->unsignedInteger('modbus_address_hum')->nullable(false)->change();
        });

        Schema::table('sensors', function (Blueprint $table) {
            $table->string('modbus_register_function', 20)->default('04')->after('unit_id');
            $table->integer('modbus_coil_alarm_temp')->nullable()->after('modbus_address_hum');
            $table->integer('modbus_coil_alarm_hum')->nullable()->after('modbus_coil_alarm_temp');
            $table->integer('modbus_coil_connection')->nullable()->after('modbus_coil_alarm_hum');
        });
    }
};
