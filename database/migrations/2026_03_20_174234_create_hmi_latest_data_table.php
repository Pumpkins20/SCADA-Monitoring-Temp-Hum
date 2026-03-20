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
        Schema::create('hmi_latest_data', function (Blueprint $table) {
            $table->id();
            $table->foreignId('hmi_id')
                ->unique()
                ->constrained('hmis')
                ->cascadeOnDelete();
            $table->decimal('avg_temp', 5, 2)->nullable();
            $table->decimal('avg_hum', 5, 2)->nullable();
            $table->timestamp('last_read_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hmi_latest_data');
    }
};
