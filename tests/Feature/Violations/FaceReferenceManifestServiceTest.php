<?php

namespace Tests\Feature\Violations;

use App\Models\ViolationEmployee;
use App\Services\Violations\FaceReferenceManifestService;
use App\Services\Violations\TemporaryPassService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class FaceReferenceManifestServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('faceid_references');
    }

    public function test_manifest_exports_temporary_pass_profile_fields(): void
    {
        $now = Carbon::create(2026, 5, 29, 11, 30, 0);
        $this->travelTo($now);

        $employee = ViolationEmployee::query()->create([
            'business_key' => 'temporary_contractor:test-manifest',
            'source_system' => 'manual_security',
            'person_kind' => TemporaryPassService::PERSON_KIND_TEMPORARY_CONTRACTOR,
            'full_name' => 'Временный Подрядчик',
            'normalized_full_name' => 'временный подрядчик',
            'department' => 'Строительный отдел',
            'position' => 'Монтажник',
            'employment_status' => 'TEMPORARY_CONTRACTOR',
            'temporary_pass_status' => TemporaryPassService::PASS_STATUS_ACTIVE,
            'temporary_pass_issued_at' => $now,
            'temporary_pass_expires_at' => $now->copy()->addMonth(),
            'is_active' => true,
            'face_reference_state' => 'ready',
            'face_reference_count' => 1,
            'imported_at' => $now,
        ]);

        Storage::disk('faceid_references')->put('temporary/' . $employee->id . '/face.jpg', 'face');

        $employee->faceReferences()->create([
            'source_system' => 'manual_security',
            'source' => 'temporary_pass',
            'group_key' => $employee->business_key,
            'disk' => 'faceid_references',
            'path' => 'temporary/' . $employee->id . '/face.jpg',
            'file_name' => 'face.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 4,
            'sha1' => sha1('face'),
            'is_primary' => true,
            'is_active' => true,
            'imported_at' => $now,
            'last_synced_at' => $now,
        ]);

        $targetPath = storage_path('app/private/testing/temporary-pass-manifest.json');
        @unlink($targetPath);

        $result = app(FaceReferenceManifestService::class)->exportActiveManifest($targetPath);

        $this->assertSame(1, $result['count']);
        $manifest = json_decode((string) file_get_contents($targetPath), true);

        $this->assertIsArray($manifest);
        $this->assertSame(
            TemporaryPassService::PERSON_KIND_TEMPORARY_CONTRACTOR,
            $manifest['references'][0]['profile']['personKind'] ?? null
        );
        $this->assertSame(
            TemporaryPassService::PASS_STATUS_ACTIVE,
            $manifest['references'][0]['profile']['temporaryPassStatus'] ?? null
        );
        $this->assertSame(
            $now->copy()->addMonth()->toIso8601String(),
            $manifest['references'][0]['profile']['temporaryPassExpiresAt'] ?? null
        );
        $this->assertSame(
            $now->toIso8601String(),
            $manifest['references'][0]['profile']['temporaryPassIssuedAt'] ?? null
        );
    }
}
