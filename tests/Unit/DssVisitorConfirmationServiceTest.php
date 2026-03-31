<?php

namespace Tests\Unit;

use App\Services\DssStatusCacheService;
use App\Services\DssVisitorConfirmationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class DssVisitorConfirmationServiceTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    public function test_non_strict_yard_keeps_known_truck_pending_without_permit(): void
    {
        $service = new DssVisitorConfirmationService(new DssStatusCacheService());
        $yard = $this->createYard(false);
        $truck = $this->createTruck();

        $result = $service->resolve($yard, $truck, null);

        $this->assertFalse($result['auto_confirm']);
        $this->assertFalse($result['strict_mode']);
        $this->assertSame('pending', $result['status']);
        $this->assertSame('👁️ Требуется проверка оператором КПП', $result['reason']);
    }

    public function test_strict_yard_requires_permit_for_auto_confirmation(): void
    {
        $service = new DssVisitorConfirmationService(new DssStatusCacheService());
        $yard = $this->createYard(true);
        $truck = $this->createTruck();

        $withoutPermit = $service->resolve($yard, $truck, null);
        $withPermit = $service->resolve($yard, $truck, $this->createPermit($truck, $yard));

        $this->assertFalse($withoutPermit['auto_confirm']);
        $this->assertSame('pending', $withoutPermit['status']);
        $this->assertSame('🔒 Нет разрешения (строгий режим)', $withoutPermit['reason']);

        $this->assertTrue($withPermit['auto_confirm']);
        $this->assertSame('confirmed', $withPermit['status']);
    }

    public function test_unknown_truck_is_pending_even_in_non_strict_yard(): void
    {
        $service = new DssVisitorConfirmationService(new DssStatusCacheService());
        $yard = $this->createYard(false);

        $result = $service->resolve($yard, null, null);

        $this->assertFalse($result['auto_confirm']);
        $this->assertSame('pending', $result['status']);
        $this->assertSame('🚫 ТС не найдено в базе', $result['reason']);
    }
}