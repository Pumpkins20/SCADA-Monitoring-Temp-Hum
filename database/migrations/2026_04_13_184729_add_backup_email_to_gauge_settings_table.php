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
            $table->string('backup_email')->nullable()->after('header_title_line_2');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('gauge_settings', function (Blueprint $table) {
            $table->dropColumn('backup_email');
        });
    }
};
