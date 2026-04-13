<?php

namespace App\Http\Controllers;

use App\Models\DssSetings;
use App\Models\DssTelegramChat;
use App\Models\DssTelegramNotification;
use App\Services\DssTelegramEventRegistry;
use App\Services\DssTelegramNotificationManager;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DssTelegramController extends Controller
{
    public function __construct(
        private DssTelegramNotificationManager $notificationManager,
        private DssTelegramEventRegistry $eventRegistry,
    ) {
    }

    public function config()
    {
        $this->notificationManager->syncDefaultNotificationsForAllChats();

        return response()->json([
            'status' => true,
            'data' => [
                'definitions' => $this->eventRegistry->definitions(),
                'chats' => DssTelegramChat::query()->orderBy('sort_order')->orderBy('id')->get(),
                'notifications' => DssTelegramNotification::query()->orderBy('telegram_chat_id')->orderBy('event_key')->get(),
            ],
        ]);
    }

    public function saveChat(Request $request)
    {
        $validated = $request->validate([
            'id' => ['nullable', 'integer', 'exists:dss_telegram_chats,id'],
            'name' => ['required', 'string', 'max:255'],
            'chat_id' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:1000'],
            'message_thread_id' => ['nullable', 'integer', 'min:1'],
            'is_enabled' => ['required', 'boolean'],
            'send_silently_default' => ['required', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:9999'],
        ]);

        $settingsId = DssSetings::query()->value('id');

        $chat = DssTelegramChat::query()->updateOrCreate(
            ['id' => $validated['id'] ?? null],
            [
                'dss_setings_id' => $settingsId,
                'name' => $validated['name'],
                'chat_id' => $validated['chat_id'],
                'description' => $validated['description'] ?? null,
                'message_thread_id' => $validated['message_thread_id'] ?? null,
                'is_enabled' => $validated['is_enabled'],
                'send_silently_default' => $validated['send_silently_default'],
                'sort_order' => $validated['sort_order'] ?? 0,
            ]
        );

        $this->notificationManager->syncDefaultNotificationsForChat($chat);

        return response()->json([
            'status' => true,
            'message' => 'Telegram chat saved successfully',
            'data' => $chat->fresh(),
        ]);
    }

    public function deleteChat(Request $request)
    {
        $validated = $request->validate([
            'id' => ['required', 'integer', 'exists:dss_telegram_chats,id'],
        ]);

        $chat = DssTelegramChat::query()->findOrFail($validated['id']);
        $chat->delete();

        return response()->json([
            'status' => true,
            'message' => 'Telegram chat deleted successfully',
        ]);
    }

    public function saveNotifications(Request $request)
    {
        $validated = $request->validate([
            'chat_id' => ['required', 'integer', 'exists:dss_telegram_chats,id'],
            'notifications' => ['required', 'array'],
            'notifications.*.event_key' => ['required', 'string', Rule::in($this->eventRegistry->keys())],
            'notifications.*.is_enabled' => ['required', 'boolean'],
            'notifications.*.send_silently' => ['required', 'boolean'],
            'notifications.*.cooldown_minutes' => ['nullable', 'integer', 'min:0', 'max:10080'],
        ]);

        $chat = DssTelegramChat::query()->findOrFail($validated['chat_id']);
        $settingsId = DssSetings::query()->value('id');

        foreach ($validated['notifications'] as $notification) {
            DssTelegramNotification::query()->updateOrCreate(
                [
                    'telegram_chat_id' => $chat->id,
                    'event_key' => $notification['event_key'],
                ],
                [
                    'dss_setings_id' => $chat->dss_setings_id ?? $settingsId,
                    'is_enabled' => $notification['is_enabled'],
                    'send_silently' => $notification['send_silently'],
                    'cooldown_minutes' => $notification['cooldown_minutes'] ?? 0,
                ]
            );
        }

        return response()->json([
            'status' => true,
            'message' => 'Telegram notifications updated successfully',
        ]);
    }

    public function testChat(Request $request)
    {
        $validated = $request->validate([
            'id' => ['required', 'integer', 'exists:dss_telegram_chats,id'],
        ]);

        $chat = DssTelegramChat::query()->findOrFail($validated['id']);
        $this->notificationManager->sendTest($chat);

        return response()->json([
            'status' => true,
            'message' => 'Test message sent successfully',
        ]);
    }
}