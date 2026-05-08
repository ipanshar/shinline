<?php

namespace Tests\Unit;

use App\Models\EntryPermit;
use App\Services\DssPermitVehicleService;
use Mockery;
use Tests\TestCase;

class DssPermitVehicleServiceTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();

        parent::tearDown();
    }

    public function test_revoke_permit_vehicle_safely_catches_exceptions(): void
    {
        /** @var DssPermitVehicleService $service */
        $service = Mockery::mock(DssPermitVehicleService::class)
            ->makePartial();

        /** @var \Mockery\MockInterface $serviceMock */
        $serviceMock = $service;

        $permit = new EntryPermit([
            'id' => 77,
            'truck_id' => 501,
            'yard_id' => 9,
        ]);

        $serviceMock->shouldReceive('revokePermitVehicle')
            ->once()
            ->with($permit)
            ->andThrow(new \RuntimeException('DSS unavailable'));

        $result = $service->revokePermitVehicleSafely($permit);

        $this->assertSame('DSS unavailable', $result['error']);
        $this->assertSame(\RuntimeException::class, $result['exception']);
    }
}