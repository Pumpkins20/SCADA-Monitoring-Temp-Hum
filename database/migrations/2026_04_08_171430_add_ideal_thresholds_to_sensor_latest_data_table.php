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
            $table->decimal('over_temp', 5, 2)
                ->nullable()
                ->after('calibrate_hum');
            $table->decimal('under_temp', 5, 2)
                ->nullable()
                ->after('over_temp');
            $table->decimal('over_hum', 5, 2)
                ->nullable()
                ->after('under_temp');
            $table->decimal('under_hum', 5, 2)
                ->nullable()
                ->after('over_hum');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('sensor_latest_data', function (Blueprint $table) {
            $table->dropColumn(['over_temp', 'under_temp', 'over_hum', 'under_hum']);
        });
    }
};
