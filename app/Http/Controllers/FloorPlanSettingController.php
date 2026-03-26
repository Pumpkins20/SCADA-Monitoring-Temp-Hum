<?php

namespace App\Http\Controllers;

use App\Models\Room;
use App\Models\Sensor;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class FloorPlanSettingController extends Controller
{
    public function index(): Response
    {
        $rooms = Room::query()
            ->with([
                'hmis' => fn ($q) => $q
                    ->orderBy('name')
                    ->with([
                        'sensors' => fn ($sq) => $sq
                            ->select(['id', 'hmi_id', 'name', 'pos_x', 'pos_y'])
                            ->orderBy('name'),
                    ]),
            ])
            ->select(['id', 'name', 'location', 'floor_plan_image', 'floor_plan_width', 'floor_plan_height'])
            ->orderBy('name')
            ->get();

        return Inertia::render('floor-plan-settings/index', [
            'rooms' => $rooms->map(fn (Room $room) => [
                'id' => $room->id,
                'name' => $room->name,
                'location' => $room->location,
                'floor_plan_image' => $room->floor_plan_image
                    ? asset('storage/'.$room->floor_plan_image)
                    : null,
                'floor_plan_width' => $room->floor_plan_width ?? 9000,
                'floor_plan_height' => $room->floor_plan_height ?? 9000,
                'sensors' => $room->hmis
                    ->flatMap->sensors
                    ->map(fn (Sensor $s) => [
                        'id' => $s->id,
                        'name' => $s->name,
                        'pos_x' => $s->pos_x,
                        'pos_y' => $s->pos_y,
                    ])
                    ->values()
                    ->all(),
            ])->all(),
        ]);
    }

    // ─── Upload / replace floor plan image ───────────────────────────────────

    public function uploadImage(Request $request, Room $room): RedirectResponse
    {
        $request->validate([
            'image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp,svg', 'max:10240'],
            'floor_plan_width' => ['required', 'integer', 'min:100', 'max:65535'],
            'floor_plan_height' => ['required', 'integer', 'min:100', 'max:65535'],
        ], [
            'image.required' => 'File gambar wajib dipilih.',
            'image.image' => 'File harus berupa gambar.',
            'image.mimes' => 'Format gambar yang didukung: JPG, PNG, WebP, SVG.',
            'image.max' => 'Ukuran gambar maksimal 10 MB.',
            'floor_plan_width.required' => 'Lebar ruangan wajib diisi.',
            'floor_plan_width.integer' => 'Lebar ruangan harus berupa angka.',
            'floor_plan_width.min' => 'Lebar ruangan minimal 100 mm.',
            'floor_plan_height.required' => 'Tinggi ruangan wajib diisi.',
            'floor_plan_height.integer' => 'Tinggi ruangan harus berupa angka.',
            'floor_plan_height.min' => 'Tinggi ruangan minimal 100 mm.',
        ]);

        // Delete old image from storage if one exists
        if ($room->floor_plan_image) {
            Storage::disk('public')->delete($room->floor_plan_image);
        }

        $path = $request->file('image')->store('floor-plans', 'public');

        $room->update([
            'floor_plan_image' => $path,
            'floor_plan_width' => $request->integer('floor_plan_width'),
            'floor_plan_height' => $request->integer('floor_plan_height'),
        ]);

        return back();
    }

    // ─── Remove floor plan image ──────────────────────────────────────────────

    public function removeImage(Room $room): RedirectResponse
    {
        if ($room->floor_plan_image) {
            Storage::disk('public')->delete($room->floor_plan_image);

            $room->update(['floor_plan_image' => null]);
        }

        return back();
    }

    // ─── Update room dimensions only (without re-uploading image) ────────────

    public function updateDimensions(Request $request, Room $room): RedirectResponse
    {
        $request->validate([
            'floor_plan_width' => ['required', 'integer', 'min:100', 'max:65535'],
            'floor_plan_height' => ['required', 'integer', 'min:100', 'max:65535'],
        ], [
            'floor_plan_width.required' => 'Lebar ruangan wajib diisi.',
            'floor_plan_width.integer' => 'Lebar ruangan harus berupa angka.',
            'floor_plan_width.min' => 'Lebar ruangan minimal 100 mm.',
            'floor_plan_height.required' => 'Tinggi ruangan wajib diisi.',
            'floor_plan_height.integer' => 'Tinggi ruangan harus berupa angka.',
            'floor_plan_height.min' => 'Tinggi ruangan minimal 100 mm.',
        ]);

        $room->update([
            'floor_plan_width' => $request->integer('floor_plan_width'),
            'floor_plan_height' => $request->integer('floor_plan_height'),
        ]);

        return back();
    }

    // ─── Update sensor position ───────────────────────────────────────────────

    public function updatePosition(Request $request, Sensor $sensor): RedirectResponse
    {
        $validated = $request->validate([
            'pos_x' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'pos_y' => ['nullable', 'integer', 'min:0', 'max:65535'],
        ]);

        $sensor->update($validated);

        return back();
    }
}
