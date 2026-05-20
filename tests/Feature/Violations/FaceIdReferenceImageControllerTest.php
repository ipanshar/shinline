<?php

namespace Tests\Feature\Violations;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class FaceIdReferenceImageControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_faceid_reference_image_route_streams_reference_from_local_store(): void
    {
        Storage::fake('faceid_references');
        Storage::disk('faceid_references')->put('manual/test.jpg', 'fake-reference-image');

        $this->get('/reference-images/manual/test.jpg')->assertOk();
    }
}