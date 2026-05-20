<?php

namespace Tests\Feature\Violations;

use App\Models\Role;
use App\Models\User;
use App\Models\ViolationCategory;
use App\Models\ViolationIncident;
use App\Models\ViolationType;
use Database\Seeders\PermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ViolationManualIdentityReviewTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionsSeeder::class);
    }

    public function test_security_reviewer_can_resolve_unknown_identity_queue(): void
    {
        Storage::fake('public');
        Storage::fake('faceid_references');

        $reviewer = User::create([
            'name' => 'Security Reviewer',
            'login' => 'security_reviewer',
            'email' => 'security_reviewer@example.com',
            'email_verified_at' => now(),
            'password' => 'secret',
            'phone' => '+77000000001',
        ]);

        $role = Role::findByName('Служба безопасности');
        $this->assertNotNull($role);
        $reviewer->roles()->attach($role->id);

        $category = ViolationCategory::create([
            'key' => 'safety',
            'name' => 'ОТиТБ',
            'sort_order' => 10,
            'is_active' => true,
        ]);

        $type = ViolationType::create([
            'category_id' => $category->id,
            'key' => 'no_ppe',
            'name' => 'Игнорирование СИЗ',
            'sort_order' => 10,
            'is_active' => true,
        ]);

        $incident = ViolationIncident::create([
            'source' => 'telegram_miniapp',
            'workflow_status' => ViolationIncident::STATUS_UNKNOWN_MANUAL,
            'recognition_status' => ViolationIncident::RECOGNITION_UNKNOWN,
            'identity_source' => 'pending_manual_security',
            'occurred_at' => now(),
            'reported_by_user_id' => $reviewer->id,
            'reported_by_name' => 'Security Reviewer',
            'category_id' => $category->id,
            'type_id' => $type->id,
            'category_key' => $category->key,
            'category_name' => $category->name,
            'type_key' => $type->key,
            'type_name' => $type->name,
            'description' => 'Неизвестный сотрудник на объекте.',
            'recognition_attempts_count' => 1,
            'recognition_candidate_count' => 0,
            'recognition_threshold' => 0.5000,
            'evidence_total_count' => 1,
            'evidence_photo_count' => 1,
            'primary_evidence_kind' => 'photo',
            'primary_evidence_path' => 'violations/demo/proof.jpg',
        ]);

        Storage::disk('public')->put('violations/demo/recognition/probe.jpg', 'fake-face-image');

        $incident->evidences()->create([
            'media_role' => 'recognition_probe',
            'media_kind' => 'photo',
            'disk' => 'public',
            'path' => 'violations/demo/recognition/probe.jpg',
            'mime_type' => 'image/jpeg',
            'file_name' => 'probe.jpg',
            'file_size' => 2048,
            'sha1' => str_repeat('f', 40),
            'sort_order' => 0,
            'is_primary' => false,
        ]);

        $response = $this->actingAs($reviewer)->post("/violations/api/incidents/{$incident->id}/resolve-identity", [
            'employee_full_name' => 'Сергей Сергеев',
            'employee_department' => 'Цех розлива',
            'employee_position' => 'EMP',
            'review_note' => 'Сотрудник подтверждён вручную по фото.',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.employee_full_name', 'Сергей Сергеев')
            ->assertJsonPath('data.employee_department', 'Цех розлива')
            ->assertJsonPath('data.employee_position', 'EMP')
            ->assertJsonPath('data.workflow_status', 'pending_review')
            ->assertJsonPath('data.recognition_status', 'manual');

        $this->assertDatabaseHas('violation_employees', [
            'full_name' => 'Сергей Сергеев',
            'normalized_full_name' => 'сергей сергеев',
            'department' => 'Цех розлива',
            'position' => 'EMP',
        ]);

        $this->assertDatabaseHas('violation_incidents', [
            'id' => $incident->id,
            'employee_full_name' => 'Сергей Сергеев',
            'employee_department' => 'Цех розлива',
            'employee_position' => 'EMP',
            'workflow_status' => 'pending_review',
            'recognition_status' => 'manual',
            'identity_source' => 'manual_security',
        ]);

        $this->assertDatabaseHas('violation_employee_face_references', [
            'source_system' => 'manual_security',
            'source' => 'recognition_probe',
            'disk' => 'faceid_references',
            'sha1' => str_repeat('f', 40),
            'is_active' => true,
        ]);

        $this->assertNotEmpty(Storage::disk('faceid_references')->allFiles('manual'));
    }
}