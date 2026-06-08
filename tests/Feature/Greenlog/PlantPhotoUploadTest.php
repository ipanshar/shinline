<?php

namespace Tests\Feature\Greenlog;

use App\Models\Greenlog\Plant;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PlantPhotoUploadTest extends TestCase
{
    use RefreshDatabase;

    public function test_photo_upload_stores_file_and_creates_database_record(): void
    {
        Storage::fake('public');

        $user = User::factory()->create([
            'company' => 'GreenLog QA',
        ]);

        $adminRole = Role::query()->create([
            'name' => 'Администратор',
            'level' => 100,
        ]);

        $user->roles()->attach($adminRole);
        $user->load('roles');

        $plant = Plant::query()->create([
            'company_key' => 'GreenLog QA',
            'created_by_user_id' => $user->id,
            'inventory_number' => 'GL-PLANT-001',
            'name' => 'Office ficus',
            'category' => 'office',
            'status' => 'alive',
            'quantity' => 1,
        ]);

        $file = UploadedFile::fake()->image('ficus.jpg');

        $response = $this->actingAs($user)->post('/api/greenlog/plants/'.$plant->id.'/photos', [
            'photo' => $file,
            'type' => 'plant',
            'description' => 'Upload verification',
        ]);

        $response->assertCreated()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.plant_id', $plant->id)
            ->assertJsonPath('data.disk', 'public');

        $storedPath = $response->json('data.path');

        $this->assertIsString($storedPath);
        $this->assertStringStartsWith("greenlog/plants/{$plant->id}/", $storedPath);

        Storage::disk('public')->assertExists($storedPath);

        $this->assertDatabaseHas('greenlog_plant_photos', [
            'plant_id' => $plant->id,
            'company_key' => 'GreenLog QA',
            'disk' => 'public',
            'path' => $storedPath,
            'original_name' => 'ficus.jpg',
            'type' => 'plant',
            'description' => 'Upload verification',
        ]);
    }
}
