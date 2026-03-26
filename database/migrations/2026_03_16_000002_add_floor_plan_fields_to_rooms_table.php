<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            if (! Schema::hasColumn('rooms', 'floor_plan_image')) {
                $table->string('floor_plan_image')->nullable()->after('location');
            }
            if (! Schema::hasColumn('rooms', 'floor_plan_width')) {
                $table->unsignedSmallInteger('floor_plan_width')->default(9000)->after('floor_plan_image');
            }
            if (! Schema::hasColumn('rooms', 'floor_plan_height')) {
                $table->unsignedSmallInteger('floor_plan_height')->default(9000)->after('floor_plan_width');
            }
        });
    }

    public function down(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->dropColumn(
                array_filter(
                    ['floor_plan_image', 'floor_plan_width', 'floor_plan_height'],
                    fn (string $col) => Schema::hasColumn('rooms', $col),
                ),
            );
        });
    }
};
