<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hmis', function (Blueprint $table) {
            $table->string('register_function', 2)
                ->default('03')
                ->after('port')
                ->comment('Modbus FC untuk baca data register: 03=Holding, 04=Input');
        });
    }

    public function down(): void
    {
        Schema::table('hmis', function (Blueprint $table) {
            $table->dropColumn('register_function');
        });
    }
};
