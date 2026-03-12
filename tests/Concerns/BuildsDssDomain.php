<?php

namespace Tests\Concerns;

use App\Models\Checkpoint;
use App\Models\Devaice;
use App\Models\DssApi;
use App\Models\DssSetings;
use App\Models\EntryPermit;
use App\Models\Status;
use App\Models\Truck;
use App\Models\VehicleCapture;
use App\Models\Visitor;
use App\Models\Yard;
use App\Models\Zone;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response;
use Illuminate\Support\Str;

trait BuildsDssDomain
{
    protected function seedDssStatuses(): array
    {
        $definitions = [
            'active' => 'Активный',
            'on_territory' => 'На территории',
            'left_territory' => 'Покинул территорию',
            'not_active' => 'Неактивный',
            'completed' => 'Завершён',
        ];

        $statuses = [];
        foreach ($definitions as $key => $name) {
            $statuses[$key] = Status::firstOrCreate([
                'key' => $key,
            ], [
                'name' => $name,
            ]);
        }

        return $statuses;
    }

    protected function createYard(bool $strictMode = false, array $attributes = []): Yard
    {
        return Yard::create(array_merge([
            'name' => 'Yard ' . Str::upper(Str::random(6)),
            'strict_mode' => $strictMode,
            'weighing_required' => false,
        ], $attributes));
    }

    protected function createZone(?Yard $yard = null, array $attributes = []): Zone
    {
        $yard ??= $this->createYard();

        return Zone::create(array_merge([
            'name' => 'Zone ' . Str::upper(Str::random(5)),
            'yard_id' => $yard->id,
            'description' => 'Test zone',
            'center_lat' => 43.238949,
            'center_lng' => 76.889709,
            'polygon' => [[43.238949, 76.889709], [43.239149, 76.889909], [43.238749, 76.889909]],
            'color' => '#3388ff',
        ], $attributes));
    }

    protected function createCheckpoint(?Yard $yard = null, array $attributes = []): Checkpoint
    {
        $yard ??= $this->createYard();

        return Checkpoint::create(array_merge([
            'name' => 'КПП ' . Str::upper(Str::random(4)),
            'yard_id' => $yard->id,
        ], $attributes));
    }

    protected function createDevice(?Zone $zone = null, ?Checkpoint $checkpoint = null, string $type = 'Entry', array $attributes = []): Devaice
    {
        $zone ??= $this->createZone();
        $checkpoint ??= $this->createCheckpoint(Yard::findOrFail($zone->yard_id));

        return Devaice::create(array_merge([
            'channelId' => 'channel-' . Str::lower(Str::random(8)),
            'channelName' => 'Камера ' . Str::upper(Str::random(4)),
            'checkpoint_id' => $checkpoint->id,
            'type' => $type,
            'zone_id' => $zone->id,
        ], $attributes));
    }

    protected function createTruck(array $attributes = []): Truck
    {
        return Truck::create(array_merge([
            'name' => 'Truck ' . Str::upper(Str::random(5)),
            'plate_number' => 'A' . random_int(100, 999) . 'BC',
        ], $attributes));
    }

    protected function createPermit(Truck $truck, Yard $yard, array $attributes = []): EntryPermit
    {
        $activeStatus = Status::where('key', 'active')->first() ?? $this->seedDssStatuses()['active'];

        return EntryPermit::create(array_merge([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'status_id' => $activeStatus->id,
            'one_permission' => false,
            'begin_date' => now()->subHour(),
            'end_date' => now()->addDay(),
            'task_id' => null,
        ], $attributes));
    }

    protected function createVisitor(array $attributes = []): Visitor
    {
        return Visitor::create(array_merge([
            'plate_number' => 'UNKNOWN',
            'original_plate_number' => 'UNKNOWN',
            'entry_date' => now()->subMinutes(20),
            'confirmation_status' => Visitor::CONFIRMATION_PENDING,
        ], $attributes));
    }

    protected function createVehicleCapture(Devaice $device, array $attributes = []): VehicleCapture
    {
        $captureTime = (string) ($attributes['captureTime'] ?? now()->timestamp);
        $plate = $attributes['plateNo'] ?? 'A123BC';
        $direction = strtolower((string) ($device->type ?: 'unknown'));

        return VehicleCapture::create(array_merge([
            'devaice_id' => $device->id,
            'truck_id' => null,
            'plateNo' => $plate,
            'capture_direction' => $direction,
            'capture_key' => sha1(implode('|', [$device->id, $captureTime, strtolower(str_replace([' ', '-'], '', $plate)), $direction])),
            'capturePicture' => 'https://example.test/capture.jpg',
            'plateNoPicture' => 'https://example.test/plate.jpg',
            'vehicleBrandName' => 'DAF',
            'captureTime' => $captureTime,
            'vehicleColorName' => 'White',
            'vehicleModelName' => 'XF',
        ], $attributes));
    }

    protected function registerDefaultDssApis(?DssSetings $settings = null): DssSetings
    {
        $settings ??= $this->createDssSettings();

        foreach ([
            'Authorize' => '/authorize',
            'KeepAlive' => '/keepalive',
            'UpdateToken' => '/update-token',
            'Unauthorize' => '/logout',
            'VehicleCapture' => '/captures',
        ] as $name => $url) {
            DssApi::updateOrCreate([
                'dss_setings_id' => $settings->id,
                'api_name' => $name,
            ], [
                'method' => 'POST',
                'request_url' => $url,
            ]);
        }

        return $settings->fresh();
    }

    protected function createDssSettings(array $attributes = []): DssSetings
    {
        return DssSetings::create(array_merge([
            'base_url' => 'https://dss.example.test',
            'user_name' => 'operator',
            'password' => 'secret',
            'token' => null,
            'credential' => null,
            'client_type' => 'WINPC_V2',
            'subhour' => 0,
        ], $attributes));
    }

    protected function fixtureArray(string $name): array
    {
        return json_decode($this->fixtureString($name), true, 512, JSON_THROW_ON_ERROR);
    }

    protected function fixtureString(string $name): string
    {
        return file_get_contents(base_path('tests/Fixtures/dss/' . $name . '.json'));
    }

    protected function jsonResponseFromFixture(string $name, int $status = 200): Response
    {
        return new Response($status, ['Content-Type' => 'application/json'], $this->fixtureString($name));
    }

    protected function makeHistoryMockClient(array $responses, array &$historyContainer): \GuzzleHttp\Client
    {
        $mock = new MockHandler($responses);
        $stack = HandlerStack::create($mock);
        $stack->push(Middleware::history($historyContainer));

        return new \GuzzleHttp\Client(['handler' => $stack]);
    }
}