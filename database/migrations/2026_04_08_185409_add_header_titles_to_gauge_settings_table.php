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
        Schema::table('gauge_settings', function (Blueprint $table) {
            $table
                ->string('header_title_line_1', 160)
                ->default('SCADA MONITORING AC PRESISI RUANG SERVER CCTV & FIDS')
                ->after('logo_center_path');
            $table
                ->string('header_title_line_2', 120)
                ->default('BANDARA SOEKARNO - HATTA')
                ->after('header_title_line_1');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('gauge_settings', function (Blueprint $table) {
            $table->dropColumn(['header_title_line_1', 'header_title_line_2']);
        });
    }
};
