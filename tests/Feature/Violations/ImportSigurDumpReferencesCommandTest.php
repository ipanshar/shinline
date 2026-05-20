<?php

namespace Tests\Feature\Violations;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

class ImportSigurDumpReferencesCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_imports_only_required_face_reference_data_from_dump(): void
    {
        $pythonExecutable = base_path('testFaceID/.venv/Scripts/python.exe');
        if (! is_file($pythonExecutable)) {
            $this->markTestSkipped('Face ID python executable is not available in this environment.');
        }

        $referenceRoot = storage_path('app/private/testing/faceid/references');
        $manifestPath = storage_path('app/private/testing/faceid/reference-manifest.json');
        $importManifestPath = storage_path('app/private/testing/faceid/import-manifest.json');

        File::deleteDirectory(dirname($referenceRoot));

        config()->set('services.faceid.python_executable', $pythonExecutable);
        config()->set('services.faceid.reference_manifest_path', $manifestPath);
        config()->set('filesystems.disks.faceid_references.root', $referenceRoot);

        $this->artisan('violations:import-sigur-dump', [
            '--dump' => base_path('tests/Fixtures/faceid/minimal_sigur_dump.sql'),
            '--import-manifest' => $importManifestPath,
        ])->assertExitCode(0);

        $this->assertDatabaseHas('violation_employees', [
            'business_key' => 'faceid:iin:990101300000',
            'source_system' => 'sigur',
            'external_ref' => '1',
            'full_name' => 'Иван Иванов',
            'position' => 'Оператор линии',
            'employment_status' => 'AVAILABLE',
        ]);

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