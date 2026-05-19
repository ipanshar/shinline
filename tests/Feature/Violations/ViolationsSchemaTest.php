<?php

namespace Tests\Feature\Violations;

use App\Models\User;
use App\Models\ViolationCategory;
use App\Models\ViolationEmployee;
use App\Models\ViolationIncident;
use App\Models\ViolationType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ViolationsSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_violation_schema_persists_reporting_snapshot_and_children(): void
    {
        $this->assertTrue(Schema::hasTable('violation_employees'));
        $this->assertTrue(Schema::hasTable('violation_incidents'));
        $this->assertTrue(Schema::hasTable('violation_evidences'));
        $this->assertTrue(Schema::hasTable('violation_employee_face_references'));
        $this->assertTrue(Schema::hasTable('violation_recognition_attempts'));
        $this->assertTrue(Schema::hasTable('violation_status_histories'));
        $this->assertTrue(Schema::hasTable('violation_categories'));
        $this->assertTrue(Schema::hasTable('violation_types'));

        $reporter = User::create([
            'name' => 'Security Reporter',
            'login' => 'security_reporter',
            'email' => 'security_reporter@example.com',
            'password' => 'secret',
            'phone' => '+77001110000',
        ]);

        $employee = ViolationEmployee::create([
            'business_key' => 'iin:990101300000',
            'source_system' => 'aliya_import',
            'external_ref' => 'EMP-100',
            'iin' => '990101300000',
            'full_name' => 'Иван Иванов',
            'normalized_full_name' => 'иван иванов',
            'department' => 'Цех розлива',
            'position' => 'Оператор линии',
            'employment_status' => 'AVAILABLE',
            'is_active' => true,
            'face_reference_count' => 3,
            'face_reference_state' => 'ready',
            'meta' => ['source_label' => 'Aliya roster'],
        ]);

        $category = ViolationCategory::create([
            'key' => 'safety',
            'name' => 'ОТиТБ',
            'sort_order' => 10,
            'is_active' => true,
        ]);

        $type = ViolationType::create([
            'category_id' => $category->id,
            'key' => 'no_ppe',
            'name' => 'Работа без СИЗ',
            'sort_order' => 10,
            'is_active' => true,
        ]);

        $incident = ViolationIncident::create([
            'source' => 'telegram_miniapp',
            'workflow_status' => ViolationIncident::STATUS_PENDING_REVIEW,
            'recognition_status' => ViolationIncident::RECOGNITION_MATCHED,
            'identity_source' => 'recognized',
            'occurred_at' => now(),
            'reported_by_user_id' => $reporter->id,
            'reported_by_chat_id' => '123456789',
            'reported_by_name' => 'Security Reporter',
            'category_id' => $category->id,
            'type_id' => $type->id,
            'category_key' => 'safety',
            'category_name' => 'ОТиТБ',
            'type_key' => 'no_ppe',
            'type_name' => 'Работа без СИЗ',
            'description' => 'Сотрудник находился на линии без защитных очков.',
            'employee_id' => $employee->id,
            'employee_business_key' => $employee->business_key,
            'employee_iin' => $employee->iin,
            'employee_full_name' => $employee->full_name,
            'employee_normalized_full_name' => $employee->normalized_full_name,
            'employee_department' => $employee->department,
            'employee_position' => $employee->position,
            'employee_status' => $employee->employment_status,
            'recognition_employee_id' => $employee->id,
            'recognition_employee_business_key' => $employee->business_key,
            'recognition_employee_full_name' => $employee->full_name,
            'recognition_employee_department' => $employee->department,
            'recognition_attempts_count' => 1,
            'recognition_candidate_count' => 3,
            'recognition_similarity' => 0.8123,
            'recognition_threshold' => 0.5000,
            'evidence_total_count' => 2,
            'evidence_photo_count' => 1,
            'evidence_video_count' => 1,
            'primary_evidence_kind' => 'photo',
            'primary_evidence_path' => 'violations/original/photo-1.jpg',
            'meta' => ['capture_device' => 'telegram_camera'],
        ]);

        $photo = $incident->evidences()->create([
            'media_role' => 'original',
            'media_kind' => 'photo',
            'disk' => 'public',
            'path' => 'violations/original/photo-1.jpg',
            'mime_type' => 'image/jpeg',
            'file_name' => 'photo-1.jpg',
            'file_size' => 1024,
            'sha1' => str_repeat('a', 40),
            'width' => 1080,
            'height' => 1920,
            'sort_order' => 0,
            'is_primary' => true,
        ]);

        $incident->evidences()->create([
            'media_role' => 'original',
            'media_kind' => 'video',
            'disk' => 'public',
            'path' => 'violations/original/video-1.mp4',
            'mime_type' => 'video/mp4',
            'file_name' => 'video-1.mp4',
            'file_size' => 4096,
            'sha1' => str_repeat('b', 40),
            'duration_seconds' => 12,
            'sort_order' => 1,
        ]);

        $incident->recognitionAttempts()->create([
            'evidence_id' => $photo->id,
            'attempt_kind' => 'image',
            'service_name' => 'faceid_python',
            'status' => 'completed',
            'matched' => true,
            'threshold' => 0.5000,
            'best_similarity' => 0.8123,
            'candidate_count' => 3,
            'recognized_employee_id' => $employee->id,
            'recognized_employee_business_key' => $employee->business_key,
            'recognized_full_name' => $employee->full_name,
            'recognized_department' => $employee->department,
            'selected_frame_path' => 'violations/frames/frame-1.jpg',
            'candidates_json' => [
                ['business_key' => $employee->business_key, 'similarity' => 0.8123],
            ],
            'raw_response' => ['matched' => true],
            'started_at' => now(),
            'finished_at' => now(),
        ]);

        $incident->statusHistory()->create([
            'from_status' => ViolationIncident::STATUS_DRAFT_PROCESSING,
            'to_status' => ViolationIncident::STATUS_PENDING_REVIEW,
            'source' => 'system',
            'changed_by_user_id' => $reporter->id,
            'note' => 'Инцидент создан и отправлен на проверку.',
        ]);

        $employee->faceReferences()->create([
            'source_system' => 'sigur',
            'source' => 'sigur-personalimg',
            'external_ref' => 'EMP-100',
            'source_image_id' => '1001',
            'group_key' => $employee->business_key,
            'disk' => 'faceid_references',
            'path' => 'sigur_dump/ivan-1.jpg',
            'file_name' => 'ivan-1.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 1024,
            'sha1' => str_repeat('c', 40),
            'is_primary' => true,
            'is_active' => true,
            'meta' => ['source_label' => 'Sigur personalimg'],
        ]);

        $incident->refresh();

        $this->assertNotEmpty($incident->incident_uid);
        $this->assertSame('Иван Иванов', $incident->employee_full_name);
        $this->assertSame('ОТиТБ', $incident->category_name);
        $this->assertCount(2, $incident->evidences);
        $this->assertCount(1, $incident->recognitionAttempts);
        $this->assertCount(1, $incident->statusHistory);
        $this->assertCount(1, $employee->faceReferences);
        $this->assertSame('photo', $incident->primary_evidence_kind);
        $this->assertEquals('0.8123', (string) $incident->recognition_similarity);
        $this->assertSame($employee->id, $incident->employee?->id);
        $this->assertSame($employee->id, $incident->recognitionEmployee?->id);
        $this->assertSame($category->id, $incident->category?->id);
        $this->assertSame($type->id, $incident->type?->id);
    }
}