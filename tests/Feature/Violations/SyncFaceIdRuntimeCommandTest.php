<?php

namespace Tests\Feature\Violations;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

class SyncFaceIdRuntimeCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_sync_command_imports_dump_and_builds_runtime_manifest(): void
    {
        $pythonExecutable = base_path('testFaceID/.venv/Scripts/python.exe');
        if (! is_file($pythonExecutable)) {
            $this->markTestSkipped('Face ID python executable is not available in this environment.');
        }

        $workspaceRoot = storage_path('app/private/testing/faceid-sync');
        $referenceRoot = $workspaceRoot . DIRECTORY_SEPARATOR . 'references';
        $manifestPath = $workspaceRoot . DIRECTORY_SEPARATOR . 'reference-manifest.json';
        $importManifestPath = $workspaceRoot . DIRECTORY_SEPARATOR . 'import-manifest.json';

        File::deleteDirectory($workspaceRoot);

        config()->set('services.faceid.python_executable', $pythonExecutable);
        config()->set('services.faceid.reference_manifest_path', $manifestPath);
        config()->set('services.faceid.import_manifest_path', $importManifestPath);
        config()->set('filesystems.disks.faceid_references.root', $referenceRoot);

        $this->artisan('violations:sync-faceid-runtime', [
            '--dump' => base_path('tests/Fixtures/faceid/minimal_sigur_dump.sql'),
            '--without-runtime-refresh' => true,
            '--without-storage-link' => true,
        ])->assertExitCode(0);

        $this->assertDatabaseHas('violation_employee_face_references', [
            'source_system' => 'sigur',
            'source' => 'sigur-personalimg',
            'disk' => 'faceid_references',
            'path' => 'sigur_dump/sigur-personalimg_emp_1_img_101.png',
            'is_active' => true,
        ]);

        $this->assertTrue(is_file($manifestPath));
        $manifest = json_decode((string) file_get_contents($manifestPath), true);

        $this->assertIsArray($manifest);
        $this->assertSame(1, $manifest['referenceCount'] ?? null);
        $this->assertSame('faceid:iin:990101300000', $manifest['references'][0]['businessKey'] ?? null);
        $this->assertTrue(is_file($referenceRoot . DIRECTORY_SEPARATOR . 'sigur_dump' . DIRECTORY_SEPARATOR . 'sigur-personalimg_emp_1_img_101.png'));
    }
}