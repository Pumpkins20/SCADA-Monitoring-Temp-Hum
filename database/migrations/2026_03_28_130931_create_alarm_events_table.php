<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('alarm_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sensor_id')->constrained('sensors')->cascadeOnDelete();
            $table->string('alarm_type', 20);
            $table->decimal('current_value', 7, 2)->nullable();
            $table->timestamp('occurred_at');
            $table->timestamp('cleared_at')->nullable();
            $table->timestamps();

            $table->index(['sensor_id', 'alarm_type', 'cleared_at'], 'idx_alarm_events_open_lookup');
            $table->index('occurred_at', 'idx_alarm_events_occurred_at');
            $table->index('cleared_at', 'idx_alarm_events_cleared_at');
            $table->index('alarm_type', 'idx_alarm_events_type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('alarm_events');
    }
};
