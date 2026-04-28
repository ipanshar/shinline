<?php

namespace Tests\Feature\GuestVisits;

use App\Jobs\SendGuestVisitArrivalNotificationJob;
use App\Models\GuestVisit;
use App\Models\GuestVisitVehicle;
use App\Models\TelegramBotChat;
use App\Models\User;
use App\Models\Yard;
use App\Services\GuestVisitService;
use App\Services\GuestVisitTelegramNotifier;
use App\Services\TelegramMessagingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Mockery;
use Mockery\Adapter\Phpunit\MockeryPHPUnitIntegration;
use Tests\TestCase;

class CheckInNotificationTest extends TestCase
{
    use RefreshDatabase;
    use MockeryPHPUnitIntegration;

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_mark_arrived_dispatches_notification_job_for_telegram_bot_visit(): void
    {
        Bus::fake([SendGuestVisitArrivalNotificationJob::class]);

        [$user, $yard] = $this->seedUserWithApprovedTelegramChat();
        $visit = $this->createGuestVisit($yard, $user, GuestVisit::SOURCE_TELEGRAM_BOT);

        $service = $this->app->make(GuestVisitService::class);
        $service->markArrived($visit, now());

        Bus::assertDispatched(SendGuestVisitArrivalNotificationJob::class, function (SendGuestVisitArrivalNotificationJob $job) use ($visit) {
            return $job->guestVisitId === $visit->id && $job->isReentry === false;
        });

        $this->assertNotNull($visit->fresh()->last_entry_at);
    }

    public function test_mark_arrived_dispatches_job_for_operator_visit_but_notifier_skips_it(): void
    {
        Bus::fake([SendGuestVisitArrivalNotificationJob::class]);

        [$user, $yard] = $this->seedUserWithApprovedTelegramChat();
        $visit = $this->createGuestVisit($yard, $user, GuestVisit::SOURCE_OPERATOR);

        $service = $this->app->make(GuestVisitService::class);
        $service->markArrived($visit, now());

        // Job диспатчится в любом случае, фильтр по source применяется в нотификаторе
        // (см. test_notifier_skips_non_telegram_bot_visit).
        Bus::assertDispatched(SendGuestVisitArrivalNotificationJob::class);
    }

    public function test_notifier_skips_non_telegram_bot_visit(): void
    {
        $messaging = Mockery::mock(TelegramMessagingService::class);
        $messaging->shouldNotReceive('sendText');
        $this->app->instance(TelegramMessagingService::class, $messaging);

        [$user, $yard] = $this->seedUserWithApprovedTelegramChat();
        $visit = $this->createGuestVisit($yard, $user, GuestVisit::SOURCE_OPERATOR);

        $notifier = $this->app->make(GuestVisitTelegramNotifier::class);
        $notifier->notifyArrival($visit);
    }

    public function test_notifier_sends_message_with_vehicles_for_telegram_bot_visit(): void
    {
        [$user, $yard] = $this->seedUserWithApprovedTelegramChat();
        $visit = $this->createGuestVisit($yard, $user, GuestVisit::SOURCE_TELEGRAM_BOT);
        $visit->forceFill(['last_entry_at' => now()])->save();

        GuestVisitVehicle::create([
            'guest_visit_id' => $visit->id,
            'plate_number' => 'A123BC02',
            'brand' => 'Toyota',
            'model' => 'Camry',
            'color' => 'белый',
        ]);
        GuestVisitVehicle::create([
            'guest_visit_id' => $visit->id,
            'plate_number' => 'X777YZ02',
            'brand' => 'Lada',
            'model' => 'Vesta',
            'color' => null,
        ]);

        $messaging = Mockery::mock(TelegramMessagingService::class);
        $messaging->shouldReceive('sendText')
            ->once()
            ->with('chat-42', Mockery::on(function (string $text) {
                return str_contains($text, 'Гость прибыл')
                    && str_contains($text, 'A123BC02')
                    && str_contains($text, 'X777YZ02')
                    && str_contains($text, 'ТС 1')
                    && str_contains($text, 'ТС 2');
            }));
        $this->app->instance(TelegramMessagingService::class, $messaging);

        $notifier = $this->app->make(GuestVisitTelegramNotifier::class);
        $notifier->notifyArrival($visit->fresh(['vehicles', 'createdBy.telegramBotChat', 'yard']));
    }

    public function test_notifier_includes_reentry_marker_when_flag_set(): void
    {
        [$user, $yard] = $this->seedUserWithApprovedTelegramChat();
        $visit = $this->createGuestVisit($yard, $user, GuestVisit::SOURCE_TELEGRAM_BOT);
        $visit->forceFill(['last_entry_at' => now()])->save();

        $messaging = Mockery::mock(TelegramMessagingService::class);
        $messaging->shouldReceive('sendText')
            ->once()
            ->with('chat-42', Mockery::on(fn (string $text) => str_contains($text, 'Повторный вход')));
        $this->app->instance(TelegramMessagingService::class, $messaging);

        $notifier = $this->app->make(GuestVisitTelegramNotifier::class);
        $notifier->notifyArrival($visit->fresh(), null, true);
    }

    public function test_notifier_skips_when_chat_is_not_approved(): void
    {
        $messaging = Mockery::mock(TelegramMessagingService::class);
        $messaging->shouldNotReceive('sendText');
        $this->app->instance(TelegramMessagingService::class, $messaging);

        $user = User::create([
            'name' => 'Pending User',
            'login' => 'pending.user',
            'email' => 'pending@example.com',
            'password' => 'password',
        ]);
        TelegramBotChat::create([
            'chat_id' => 'chat-99',
            'user_id' => null,
            'approved_user_id' => $user->id,
            'approval_status' => TelegramBotChat::APPROVAL_AWAITING_REVIEW,
        ]);
        $yard = Yard::create([
            'name' => 'Площадка',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);
        $visit = $this->createGuestVisit($yard, $user, GuestVisit::SOURCE_TELEGRAM_BOT);
        $visit->forceFill(['last_entry_at' => now()])->save();

        $notifier = $this->app->make(GuestVisitTelegramNotifier::class);
        $notifier->notifyArrival($visit->fresh());
    }

    public function test_re_mark_arrived_after_previous_entry_dispatches_job_with_reentry_flag(): void
    {
        Bus::fake([SendGuestVisitArrivalNotificationJob::class]);

        [$user, $yard] = $this->seedUserWithApprovedTelegramChat();
        $visit = $this->createGuestVisit($yard, $user, GuestVisit::SOURCE_TELEGRAM_BOT);

        // Первый приход уже был зафиксирован, гость ушёл.
        $visit->forceFill([
            'last_entry_at' => now()->subHour(),
            'last_exit_at' => now()->subMinutes(30),
        ])->save();

        $service = $this->app->make(GuestVisitService::class);
        $service->markArrived($visit->fresh(), now());

        Bus::assertDispatched(SendGuestVisitArrivalNotificationJob::class, function (SendGuestVisitArrivalNotificationJob $job) use ($visit) {
            return $job->guestVisitId === $visit->id && $job->isReentry === true;
        });
    }

    /**
     * @return array{0: User, 1: Yard}
     */
    private function seedUserWithApprovedTelegramChat(): array
    {
        $user = User::create([
            'name' => 'Author',
            'login' => 'author',
            'email' => 'author@example.com',
            'password' => 'password',
            'phone' => '+77000000000',
        ]);

        TelegramBotChat::create([
            'chat_id' => 'chat-42',
            'user_id' => $user->id,
            'approved_user_id' => $user->id,
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
        ]);

        $yard = Yard::create([
            'name' => 'Площадка',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        return [$user, $yard];
    }

    private function createGuestVisit(Yard $yard, User $author, string $source): GuestVisit
    {
        return GuestVisit::create([
            'yard_id' => $yard->id,
            'guest_full_name' => 'Иван Тестовый',
            'guest_phone' => '+77001234567',
            'guest_position' => 'Гость',
            'host_name' => $author->name,
            'host_phone' => $author->phone ?: '+70000000000',
            'visit_starts_at' => now()->subMinute(),
            'visit_ends_at' => now()->addHours(4),
            'permit_kind' => GuestVisit::PERMIT_KIND_ONE_TIME,
            'workflow_status' => GuestVisit::STATUS_ACTIVE,
            'has_vehicle' => false,
            'source' => $source,
            'created_by_user_id' => $author->id,
        ]);
    }
}
