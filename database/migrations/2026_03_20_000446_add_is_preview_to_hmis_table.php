<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hmis', function (Blueprint $table) {
            $table->boolean('is_preview')
                ->default(false)
                ->after('is_active')
                ->comment('True = HMI mode preview; dibaca poller tetapi belum aktif monitoring normal');
        });
    }

    public function down(): void
    {
        Schema::table('hmis', function (Blueprint $table) {
            $table->dropColumn('is_preview');
        });
    }
};
