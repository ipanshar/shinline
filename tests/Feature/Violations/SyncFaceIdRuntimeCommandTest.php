<?php

namespace Tests\Feature\Violations;

use App\Models\ViolationEmployee;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
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

    public function test_sync_command_can_import_directly_from_sigur_database(): void
    {
        $workspaceRoot = storage_path('app/private/testing/faceid-live-sync');
        $referenceRoot = $workspaceRoot . DIRECTORY_SEPARATOR . 'references';
        $manifestPath = $workspaceRoot . DIRECTORY_SEPARATOR . 'reference-manifest.json';
        $importManifestPath = $workspaceRoot . DIRECTORY_SEPARATOR . 'import-manifest.json';
        $sigurDatabasePath = $workspaceRoot . DIRECTORY_SEPARATOR . 'sigur.sqlite';

        File::deleteDirectory($workspaceRoot);
        if (! is_dir($workspaceRoot)) {
            mkdir($workspaceRoot, 0777, true);
        }

        touch($sigurDatabasePath);

        config()->set('services.faceid.sigur_sync_source', 'database');
        config()->set('services.faceid.sigur_connection', 'sigur');
        config()->set('services.faceid.reference_manifest_path', $manifestPath);
        config()->set('services.faceid.import_manifest_path', $importManifestPath);
        config()->set('filesystems.disks.faceid_references.root', $referenceRoot);
        config()->set('database.connections.sigur', [
            'driver' => 'sqlite',
            'database' => $sigurDatabasePath,
            'prefix' => '',
            'foreign_key_constraints' => false,
        ]);

        DB::purge('sigur');
        $sigurSchema = Schema::connection('sigur');
        $sigurSchema->create('personal', function (Blueprint $table) {
            $table->integer('ID')->primary();
            $table->string('TYPE')->nullable();
            $table->string('EMP_TYPE')->nullable();
            $table->string('NAME')->nullable();
            $table->text('DESCRIPTION')->nullable();
            $table->string('POS')->nullable();
            $table->string('STATUS')->nullable();
        });
        $sigurSchema->create('personalimg', function (Blueprint $table) {
            $table->integer('ID')->primary();
            $table->integer('EMP_ID')->nullable();
            $table->binary('DATA')->nullable();
        });
        $sigurSchema->create('photo', function (Blueprint $table) {
            $table->integer('ID')->primary();
            $table->binary('PREVIEW_RASTER')->nullable();
            $table->binary('HIRES_RASTER')->nullable();
        });

        DB::connection('sigur')->table('personal')->insert([
            [
                'ID' => 1,
                'TYPE' => 'EMP',
                'EMP_TYPE' => 'EMP',
                'NAME' => 'Иван Иванов',
                'DESCRIPTION' => '990101300000',
                'POS' => 'Оператор линии',
                'STATUS' => 'AVAILABLE',
            ],
            [
                'ID' => 2,
                'TYPE' => 'EMP',
                'EMP_TYPE' => 'EMP',
                'NAME' => 'Петр Петров',
                'DESCRIPTION' => '880202400000',
                'POS' => 'Контролер',
                'STATUS' => 'FIRED',
            ],
        ]);
        DB::connection('sigur')->table('personalimg')->insert([
            'ID' => 101,
            'EMP_ID' => 1,
            'DATA' => hex2bin('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6360000002000154A24F820000000049454E44AE426082'),
        ]);

        $this->artisan('violations:sync-faceid-runtime', [
            '--source' => 'database',
            '--without-runtime-refresh' => true,
            '--without-storage-link' => true,
        ])->assertExitCode(0);

        $this->assertDatabaseHas('violation_employee_face_references', [
            'source_system' => 'sigur',
            'source' => 'sigur-personalimg',
            'disk' => 'faceid_references',
            'path' => 'sigur_live/sigur-personalimg_emp_1_img_101.png',
            'is_active' => true,
        ]);

        $this->assertTrue(is_file($referenceRoot . DIRECTORY_SEPARATOR . 'sigur_live' . DIRECTORY_SEPARATOR . 'sigur-personalimg_emp_1_img_101.png'));
        $this->assertTrue(is_file($importManifestPath));

        $employee = ViolationEmployee::query()->where('business_key', 'faceid:iin:880202400000')->first();
        $this->assertNotNull($employee);
        $this->assertTrue($employee->is_active);
        $this->assertSame('FIRED', $employee->employment_status);
        $this->assertSame('grace_period', $employee->face_reference_state);
        $this->assertIsArray($employee->meta);
        $this->assertArrayHasKey('sigur_grace_expires_at', $employee->meta);

        $manifest = json_decode((string) file_get_contents($manifestPath), true);
        $this->assertIsArray($manifest);
        $this->assertSame(1, $manifest['referenceCount'] ?? null);
        $this->assertSame('faceid:iin:990101300000', $manifest['references'][0]['businessKey'] ?? null);
    }
}