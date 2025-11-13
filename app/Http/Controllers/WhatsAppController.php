<?php

namespace App\Http\Controllers;

use App\Models\WhatsAppBusinesSeting;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use App\Models\Task;
use App\Models\User;
use App\Models\WhatsAppChatList;
use App\Models\WhatsAppChatMessages;
use App\Models\WhatsAppChatTemplate;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class WhatsAppController extends Controller
{
    protected $hostMessage;
    protected $bearer_token;
    protected $http_client;
    protected $phone_number_id;
    public function __construct()
    {
        $waba = WhatsAppBusinesSeting::first();
        $this->hostMessage = $waba->host . '/' . $waba->version . '/' . $waba->phone_number_id . '/messages';
        $this->bearer_token = $waba->bearer_token;
        $this->phone_number_id = $waba->phone_number_id;
        $this->http_client = Http::withToken($this->bearer_token);
    }

    // Обработка входящих уведомлений от WhatsApp
    public function WhatsAppAlarmAdd(Request $request)
    {
        try {
            $data = $request->all();

            // Логируем все входящие webhook'и
            Storage::disk('local')->append('whatsapp_alarm_log.txt', json_encode($data, JSON_PRETTY_PRINT) . "\n");

            if (!isset($data['entry'][0]['changes'][0]['value'])) {
                return response('Invalid webhook data', 400);
            }

            $value = $data['entry'][0]['changes'][0]['value'];

            // Обработка статусов сообщений
            if (isset($value['statuses'])) {
                foreach ($value['statuses'] as $status) {
                    $messageId = $status['id'];
                    $messageStatus = $status['status'];

                    // Находим сообщение в базе данных
                    $message = WhatsAppChatMessages::where('message_id', $messageId)->first();

                    if ($message) {
                        // Обновляем статус сообщения
                        $message->status = $messageStatus;

                        // Если сообщение не доставлено, сохраняем информацию об ошибке
                        if ($messageStatus === 'failed' && isset($status['errors'])) {
                            $message->error_code = $status['errors'][0]['code'] ?? null;
                            $message->error_message = $status['errors'][0]['message'] ?? null;
                        }

                        $message->save();
                    }
                }
            }

            // Обработка входящих сообщений
            if (isset($value['messages'])) {
                foreach ($value['messages'] as $message) {
                    // Получаем информацию о пользователе WhatsApp
                    $wa_id = $message['from'];
                    $profile_name = null;

                    if (isset($value['contacts'][0]['profile']['name'])) {
                        $profile_name = $value['contacts'][0]['profile']['name'];
                    }

                    // Находим пользователя по номеру WhatsApp
                    $user = DB::table('сounterparties')->where('whatsapp', $wa_id)->first();
                    if (!$user) {
                        Log::warning('Получено сообщение от неизвестного пользователя WhatsApp', [
                            'wa_id' => $wa_id,
                            'profile_name' => $profile_name
                        ]);
                        continue;
                    }

                    // Находим или создаем чат
                    $chatList = WhatsAppChatList::firstOrCreate(
                        [
                            'user_id' => $user->id,
                            'user_whatsapp' => $wa_id,
                            'phone_number_id' => $this->phone_number_id,
                        ],
                        [
                            'new_messages' => 0,
                            'last_time_message' => now(),
                        ]
                    );

                    if ($message['type'] === 'button') {
                        // Обрабатываем нажатие кнопки
                        if ($message['button']['payload'] === 'Согласен' && isset($message['context']['id'])) {
                            $originalMessage = WhatsAppChatMessages::where('message_id', $message['context']['id'])->first();

                            if ($originalMessage) {
                                WhatsAppChatMessages::create([
                                    'chat_list_id' => $chatList->id,
                                    'message' => 'Согласен на выполнение задания',
                                    'message_id' => $message['id'],
                                    'type' => 'button_response',
                                    'user_id' => $user->id,
                                    'response_to_message_id' => $message['context']['id'],
                                    'status' => 'received',
                                    'direction' => 'incoming'
                                ]);

                                $originalMessage->has_response = true; // Отмечаем, что на сообщение есть ответ
                                $originalMessage->save();
                            }
                        }
                    } elseif ($message['type'] === 'text') {
                        // Обрабатываем текстовые сообщения
                        WhatsAppChatMessages::create([
                            'chat_list_id' => $chatList->id,
                            'message' => $message['text']['body'],
                            'message_id' => $message['id'],
                            'type' => 'text',
                            'user_id' => $user->id,
                            'status' => 'received',
                            'direction' => 'incoming'
                        ]);
                    } elseif ($message['type'] === 'audio') {
                        // Обрабатываем аудиосообщения
                        WhatsAppChatMessages::create([
                            'chat_list_id' => $chatList->id,
                            'message' => $message['text']['body'],
                            'message_id' => $message['id'],
                            'type' => 'text',
                            'user_id' => $user->id,
                            'status' => 'received',
                            'direction' => 'incoming'
                        ]);
                    }

                    // Обновляем информацию о чате
                    $chatList->increment('new_messages');
                    $chatList->last_time_message = now();
                    $chatList->save();
                }
            }

            return response('OK', 200);
        } catch (\Exception $e) {
            Log::error('WhatsApp webhook error: ' . $e->getMessage());
            return response('Internal error', 500);
        }
    }

    // Верификация вебхука WhatsApp
    public function verify(Request $request)
    {
        $mode = $request->query('hub_mode');
        $token = $request->query('hub_verify_token');
        $challenge = $request->query('hub_challenge');

        $verifyToken = env('WHATSAPP_TOKEN');

        if ($mode === 'subscribe' && $token === $verifyToken) {
            Log::info('WhatsApp webhook verified successfully.');
            return response($challenge, 200);
        } else {
            Log::warning('WhatsApp webhook verification failed.', [
                'mode' => $mode,
                'token' => $token
            ]);
            return response('Forbidden', 403);
        }
    }

    // Создание или обновление настроек WhatsApp Business
    public function whatsappBusinessSettingsCreateOrUpdate(Request $request)
    {
        if ($request->isMethod('post')) {
            $data = $request->validate([
                'phone_number_id' => 'required|string',
                'waba_id' => 'required|string',
                'business_account_id' => 'required|string',
                'bearer_token' => 'required|string',
                'host' => 'required|string',
                'version' => 'required|string',
            ]);

            WhatsAppBusinesSeting::updateOrCreate(
                ['phone_number_id' => $data['phone_number_id']],
                $data
            );

            return redirect()->back()->with('success', 'Настройки успешно сохранены.');
        }

        return redirect()->back()->with('error', 'Некорректный метод запроса.');
    }

    // Получение настроек WhatsApp Business
    public function whatsappBusinessSettingsGet(Request $request)
    {
        $settings = WhatsAppBusinesSeting::first();
        if ($settings) {
            return response()->json($settings, Response::HTTP_OK);
        } else {
            return response()->json(['message' => 'Настройки не найдены.'], Response::HTTP_NOT_FOUND);
        }
    }

    public function getMessageText($message, $whatsapp_number, $from_user_id = null, $type)
    {
        $sendMessage = $this->http_client->withHeaders([
            'Authorization' => 'Bearer ' . $this->bearer_token,
            'Content-Type' => 'application/json',
        ])->post($this->hostMessage, [
            "messaging_product" => "whatsapp",
            "to" => $whatsapp_number,
            "type" => "text",
            "text" => [
                "body" => $message
            ]
        ]);
        $this->newMessage(
            $message,
            $whatsapp_number,
            $sendMessage->json()['messages'][0]['id'] ?? null,
            $from_user_id ? $from_user_id : User::where('name', 'admin')->value('id'),
            $type,
            'outgoing',
            'sent'
        );
    }


    public function getMessageTemplateNewTask(Request $request)
    {
        $data = $request->validate([
            'task_id' => 'required|integer',
            'users' => 'sometimes|array',
            'whatsapp_number' => 'sometimes|string',
            'user_id' => 'required|integer',
        ]);

        try {
            $task = Task::where('id', $data['task_id'])->first();

            if (!$task) {
                return response()->json([
                    'status' => false,
                    'message' => 'Задание не найдено'
                ], 404);
            }

            $template = WhatsAppChatTemplate::where('template_name', 'new_task')->first();

            if (!$template) {
                return response()->json([
                    'status' => false,
                    'message' => 'Шаблон сообщения не найден'
                ], 404);
            }

            $rout_name = '';
            $specification = $task->specification;
            $plate_number = implode(', ', $this->getUserTruckInRoute($data['user_id'], $task->route_regions));
            $reward = $task->reward;
            $plan_date = $task->plan_date;

            if (!empty($task->route_regions)) {
                $regionIds = explode(',', $task->route_regions);
                $regions = DB::table('regions')
                    ->whereIn('id', $regionIds)
                    ->pluck('name')
                    ->toArray();
                $rout_name = implode(' - ', $regions);
            }

            $successCount = 0;
            $errorCount = 0;

            // Определяем список получателей
            $recipients = [];

            if (isset($data['whatsapp_number'])) {
                // Если передан WhatsApp номер напрямую
                $recipients[] = ['whatsapp' => $data['whatsapp_number']];
            } elseif (isset($data['users'])) {
                // Если передан массив ID пользователей
                foreach ($data['users'] as $user_id) {
                    $user_whatsapp = DB::table('users')->where('id', $user_id)->value('whatsapp_number');
                    if ($user_whatsapp) {
                        $recipients[] = ['whatsapp' => $user_whatsapp];
                    }
                }
            }

            foreach ($recipients as $recipient) {
                $user_whatsapp = $recipient['whatsapp'];

                if (empty($user_whatsapp)) {
                    Log::warning('WhatsApp номер пустой', ['recipient' => $recipient]);
                    $errorCount++;
                    continue;
                }

                try {

                    $sendMessage = $this->http_client->withHeaders([
                        'Authorization' => 'Bearer ' . $this->bearer_token,
                        'Content-Type' => 'application/json',
                    ])->post($this->hostMessage, [
                        "messaging_product" => "whatsapp",
                        "to" => $user_whatsapp,
                        "type" => "template",
                        "template" => [
                            "name" => $template->template_name,
                            "language" => ["code" => "ru"],
                            "components" => [[
                                "type" => "body",
                                "parameters" => [
                                    ["type" => "text", "parameter_name" => "task_id", "text" => strval($task->id)],
                                    ["type" => "text", "parameter_name" => "rout_name", "text" => $rout_name ?: '-'],
                                    ["type" => "text", "parameter_name" => "specification", "text" => $specification ?: '-'],
                                    ["type" => "text", "parameter_name" => "plate_number", "text" => $plate_number ?: '-'],
                                    ["type" => "text", "parameter_name" => "plane_date", "text" => $plan_date ?: '-'],
                                    ["type" => "text", "parameter_name" => "reward", "text" => number_format($reward, 2)]
                                ]
                            ]]
                        ]
                    ]);

                    $content = $template->template_content;
                    $replacements = [
                        '{{task_id}}' => strval($task->id),
                        '{{rout_name}}' => $rout_name,
                        '{{specification}}' => $specification,
                        '{{plate_number}}' => $plate_number,
                        '{{plane_date}}' => $plan_date,
                        '{{reward}}' => number_format($reward, 2)
                    ];

                    $content = strtr($content, $replacements);

                    $this->newMessage(
                        $content,
                        $user_whatsapp,
                        $sendMessage->json()['messages'][0]['id'] ?? null,
                        $data['user_id'],
                        2, // тип 2 для шаблонных сообщений (template)
                        'outgoing',
                        'sent',
                        null
                    );

                    $successCount++;
                } catch (\Exception $e) {
                    Log::error('Ошибка отправки шаблона WhatsApp', [
                        'error' => $e->getMessage(),
                        'whatsapp_number' => $user_whatsapp,
                        'task_id' => $task->id,
                        'trace' => $e->getTraceAsString()
                    ]);
                    $errorCount++;
                }
            }

            // Добавляем проверку: если не было получателей
            if (empty($recipients)) {
                Log::warning('Нет получателей для отправки шаблона', [
                    'whatsapp_number' => $data['whatsapp_number'] ?? null,
                    'users' => $data['users'] ?? null
                ]);
            }

            return response()->json([
                'status' => true,
                'message' => "Отправлено: {$successCount}, ошибок: {$errorCount}",
                'success_count' => $successCount,
                'error_count' => $errorCount
            ], 200);
        } catch (\Exception $e) {
            Log::error('Ошибка в getMessageTemplateNewTask: ' . $e->getMessage());
            return response()->json([
                'status' => false,
                'message' => 'Ошибка при отправке шаблона: ' . $e->getMessage()
            ], 500);
        }
    }


    private function newMessage($textMessage, $whatsapp_number, $message_id, $fromUserId, $type, $direction, $status, $response_to_message_id = null)
    {
        $chatList = WhatsAppChatList::firstOrCreate(
            [
                'user_whatsapp' => $whatsapp_number,
                'phone_number_id' => $this->phone_number_id,
            ],
            [
                'new_messages' => 0,
                'last_time_message' => now(),
            ]
        );

        $ChatMessage = WhatsAppChatMessages::create([
            'chat_list_id' => $chatList->id,
            'message' => $textMessage,
            'message_id' => $message_id,
            'type' => $type,
            'user_id' => $fromUserId,
            'direction' => $direction,
            'status' => $status,
            'response_to_message_id' => $response_to_message_id,
        ]);

        if ($ChatMessage->response_to_message_id) {
            $originalMessage = WhatsAppChatMessages::where('message_id', $ChatMessage->response_to_message_id)->first();
            if ($originalMessage) {
                $originalMessage->has_response = true; // Отмечаем, что на сообщение есть ответ
                $originalMessage->save();
            }
        }

        if ($direction == 'incoming') {
            $chatList->increment('new_messages');
        }
        $chatList->last_time_message = now();
        $chatList->save();
    }

    private function getUserTruckInRoute($user_id, $route_regions)
    {
        return Task::leftJoin('trucks', 'tasks.truck_id', '=', 'trucks.id')
            ->where('tasks.user_id', $user_id)
            ->where('tasks.route_regions', $route_regions)
            ->pluck('trucks.plate_number')
            ->unique()
            ->values()
            ->toArray();
    }
}
