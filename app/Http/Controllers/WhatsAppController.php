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
use App\Models\Сounterparty;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class WhatsAppController extends Controller
{
    protected $hostMessage;
    protected $bearer_token;
    protected $http_client;
    protected $phone_number_id;
    protected $label;
    public function __construct()
    {
        // Получаем активную настройку или первую доступную
        $waba = WhatsAppBusinesSeting::where('is_active', true)->where('label', 'cargo')->first() ?? WhatsAppBusinesSeting::first();
        
        if ($waba) {
            $this->hostMessage = $waba->host . '/' . $waba->version . '/' . $waba->phone_number_id . '/messages';
            $this->bearer_token = $waba->bearer_token;
            $this->phone_number_id = $waba->phone_number_id;
            $this->label = $waba->label;
            $this->http_client = Http::withToken($this->bearer_token);
        }
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
            $wa_phone_number_id = $value['metadata']['phone_number_id'] ?? null;
            $Wasettings = WhatsAppBusinesSeting::where('phone_number_id', $wa_phone_number_id)->first();
            
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

                    // Очистка номера WhatsApp от знака + и пробелов
                    $wa_id_clean = str_replace(['+', ' '], '', $wa_id);

                    // Находим или создаем контрагента только для label = 'cargo'
                    // Для CSC это клиенты из другого проекта, не партнеры
                    $сounterparty = null;
                    
                    if ($Wasettings && $Wasettings->label === 'cargo') {
                        $сounterparty = DB::table('сounterparties')->where('whatsapp', $wa_id_clean)->first();
                        
                        if (!$сounterparty) {
                            // Создаем нового неизвестного контрагента
                            $counterpartyId = DB::table('сounterparties')->insertGetId([
                                'name' => $profile_name ?: 'Неизвестный контрагент',
                                'whatsapp' => $wa_id_clean,
                                'phone' => $wa_id_clean,
                                'inn' => "0" . $wa_id_clean,
                                'created_at' => now(),
                                'updated_at' => now(),
                            ]);
                            
                            $сounterparty = DB::table('сounterparties')->where('id', $counterpartyId)->first();
                            
                            Log::info('Создан новый контрагент из WhatsApp', [
                                'id' => $counterpartyId,
                                'wa_id' => $wa_id_clean,
                                'profile_name' => $profile_name,
                                'label' => 'cargo'
                            ]);
                        }
                    }

                    // Находим или создаем чат
                    $chatList = WhatsAppChatList::firstOrCreate(
                        [
                            //'user_id' => $сounterparty->id,
                            'user_whatsapp' => $wa_id,
                            'phone_number_id' => $wa_phone_number_id,
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
                                // Формируем текст ответа с информацией о задании
                                $responseText = '✅ <b>Согласен на выполнение задания</b>';
                                
                                WhatsAppChatMessages::create([
                                    'chat_list_id' => $chatList->id,
                                    'message' => $responseText,
                                    'message_id' => $message['id'],
                                    'type' => 3,                                    //'user_id' => null,
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
                            'type' => 1,
                            'response_to_message_id' => $message['context']['id'] ?? null,
                           // 'user_id' => null,
                            'status' => 'received',
                            'direction' => 'incoming'
                        ]);
                    } elseif ($message['type'] === 'image') {
                        // Обрабатываем изображения
                        $mediaUrl = $this->downloadWhatsAppMedia($message['image']['id'], $wa_phone_number_id);
                        $caption = $message['image']['caption'] ?? '';
                        
                        // Проверяем label для формата сообщения
                        if ($Wasettings && $Wasettings->label === 'CSC') {
                            // Для CSC: простой формат - название и ссылка
                            $filename = $message['image']['id'] . '.jpg'; // WhatsApp не передает имя для изображений
                            $messageText = $caption ? $caption . ', ' : '';
                            $messageText .= $mediaUrl ? $filename . ', ' . $mediaUrl : 'Не удалось загрузить изображение';
                        } else {
                            // Обычный формат с HTML
                            $messageText = $caption ? $caption . '<br>' : '';
                            $messageText .= $mediaUrl ? '<img src="' . $mediaUrl . '" alt="Image" style="max-width: 100%; border-radius: 8px;" />' : 'Не удалось загрузить изображение';
                        }
                        
                        WhatsAppChatMessages::create([
                            'chat_list_id' => $chatList->id,
                            'message' => $messageText,
                            'message_id' => $message['id'],
                            'type' => 4, // тип 4 для изображений
                            'response_to_message_id' => $message['context']['id'] ?? null,
                            'status' => 'received',
                            'direction' => 'incoming'
                        ]);
                    } elseif ($message['type'] === 'document') {
                        // Обрабатываем документы
                        $mediaUrl = $this->downloadWhatsAppMedia($message['document']['id'], $wa_phone_number_id);
                        $filename = $message['document']['filename'] ?? 'document';
                        $caption = $message['document']['caption'] ?? '';
                        
                        // Проверяем label для формата сообщения
                        if ($Wasettings && $Wasettings->label === 'CSC') {
                            // Для CSC: простой формат - название файла и ссылка
                            $messageText = $caption ? $caption . ', ' : '';
                            $messageText .= $mediaUrl ? $filename . ', ' . $mediaUrl : 'Не удалось загрузить документ';
                        } else {
                            // Обычный формат с HTML
                            $messageText = $caption ? $caption . '<br>' : '';
                            $messageText .= $mediaUrl ? '📎 <a href="' . $mediaUrl . '" target="_blank" download>' . $filename . '</a>' : 'Не удалось загрузить документ';
                        }
                        
                        WhatsAppChatMessages::create([
                            'chat_list_id' => $chatList->id,
                            'message' => $messageText,
                            'message_id' => $message['id'],
                            'type' => 5, // тип 5 для документов
                            'response_to_message_id' => $message['context']['id'] ?? null,
                            'status' => 'received',
                            'direction' => 'incoming'
                        ]);
                    } elseif ($message['type'] === 'audio') {
                        // Обрабатываем аудиосообщения
                        $mediaUrl = $this->downloadWhatsAppMedia($message['audio']['id'], $wa_phone_number_id);
                        $messageText = $mediaUrl ? '🎵 <audio controls><source src="' . $mediaUrl . '" type="audio/ogg"></audio>' : 'Не удалось загрузить аудио';
                        
                        WhatsAppChatMessages::create([
                            'chat_list_id' => $chatList->id,
                            'message' => $messageText,
                            'message_id' => $message['id'],
                            'type' => 6, // тип 6 для аудио
                            'response_to_message_id' => $message['context']['id'] ?? null,
                            'status' => 'received',
                            'direction' => 'incoming'
                        ]);
                    } elseif ($message['type'] === 'video') {
                        // Обрабатываем видео
                        $mediaUrl = $this->downloadWhatsAppMedia($message['video']['id'], $wa_phone_number_id);
                        $caption = $message['video']['caption'] ?? '';
                        $messageText = $caption ? $caption . '<br>' : '';
                        $messageText .= $mediaUrl ? '🎬 <video controls style="max-width: 100%; border-radius: 8px;"><source src="' . $mediaUrl . '" type="video/mp4"></video>' : 'Не удалось загрузить видео';
                        
                        WhatsAppChatMessages::create([
                            'chat_list_id' => $chatList->id,
                            'message' => $messageText,
                            'message_id' => $message['id'],
                            'type' => 7, // тип 7 для видео
                            'response_to_message_id' => $message['context']['id'] ?? null,
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
                'host' => 'required|string',
                'version' => 'required|string',
                'numbers' => 'required|array|min:1',
                'numbers.*.phone_number_id' => 'required|string',
                'numbers.*.waba_id' => 'nullable|string',
                'numbers.*.business_account_id' => 'nullable|string',
                'numbers.*.bearer_token' => 'required|string',
                'numbers.*.is_active' => 'nullable|boolean',
                'numbers.*.label' => 'nullable|string|max:255',
            ]);

            $host = $data['host'];
            $version = $data['version'];
            $numbers = $data['numbers'];

            // Получаем ID существующих номеров из запроса
            $existingIds = collect($numbers)
                ->pluck('id')
                ->filter()
                ->map(fn($id) => (int)$id)
                ->toArray();

            // Удаляем номера, которых нет в новом списке
            if (!empty($existingIds)) {
                WhatsAppBusinesSeting::whereNotIn('id', $existingIds)->delete();
            } else {
                // Если нет ID в запросе, значит все номера новые - удаляем все старые
                WhatsAppBusinesSeting::truncate();
            }

            // Обновляем или создаем номера
            foreach ($numbers as $index => $numberData) {
                $isActive = $numberData['is_active'] ?? ($index === 0); // Первый номер по умолчанию активен
                
                $settings = [
                    'phone_number_id' => $numberData['phone_number_id'],
                    'waba_id' => $numberData['waba_id'] ?? null,
                    'business_account_id' => $numberData['business_account_id'] ?? null,
                    'bearer_token' => $numberData['bearer_token'],
                    'host' => $host,
                    'version' => $version,
                    'is_active' => $isActive,
                    'label' => $numberData['label'] ?? null,
                ];

                if (isset($numberData['id']) && is_numeric($numberData['id'])) {
                    // Обновляем существующий номер
                    WhatsAppBusinesSeting::where('id', (int)$numberData['id'])->update($settings);
                } else {
                    // Создаем новый номер
                    WhatsAppBusinesSeting::create($settings);
                }
            }

            // Для API запросов возвращаем JSON
            if ($request->expectsJson()) {
                return response()->json([
                    'success' => true,
                    'message' => 'Настройки успешно сохранены.'
                ], Response::HTTP_OK);
            }

            return redirect()->back()->with('success', 'Настройки успешно сохранены.');
        }

        return redirect()->back()->with('error', 'Некорректный метод запроса.');
    }

    // Получение настроек WhatsApp Business
    public function whatsappBusinessSettingsGet(Request $request)
    {
        $settingsData = WhatsAppBusinesSeting::getAllForApi();
        
        if ($settingsData) {
            return response()->json($settingsData, Response::HTTP_OK);
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

    /**
     * Загрузка медиафайла из WhatsApp
     * @param string $mediaId - ID медиафайла от WhatsApp
     * @param string|null $phoneNumberId - ID номера телефона (для выбора правильного токена)
     * @return string|null - Путь к сохраненному файлу или null в случае ошибки
     */
    private function downloadWhatsAppMedia($mediaId, $phoneNumberId = null)
    {
        try {
            $waba = $phoneNumberId 
                ? WhatsAppBusinesSeting::where('phone_number_id', $phoneNumberId)->first() 
                : WhatsAppBusinesSeting::first();

            if (!$waba) {
                Log::error('Настройки WhatsApp не найдены для загрузки медиа', ['phone_number_id' => $phoneNumberId]);
                return null;
            }

            // Используем клиент с токеном конкретного аккаунта
            $client = Http::withToken($waba->bearer_token);
            
            // Шаг 1: Получаем URL медиафайла
            $mediaInfoUrl = $waba->host . '/' . $waba->version . '/' . $mediaId.'?phone_number_id=' . $waba->phone_number_id;
            
            $mediaInfoResponse = $client->get($mediaInfoUrl);
            
            if (!$mediaInfoResponse->successful()) {
                Log::error('Ошибка получения URL медиафайла', [
                    'media_id' => $mediaId,
                    'phone_number_id' => $phoneNumberId,
                    'response' => $mediaInfoResponse->body()
                ]);
                return null;
            }
            
            $mediaInfo = $mediaInfoResponse->json();
            $mediaUrl = $mediaInfo['url'] ?? null;
            $mimeType = $mediaInfo['mime_type'] ?? 'application/octet-stream';
            
            if (!$mediaUrl) {
                Log::error('URL медиафайла не найден', ['media_id' => $mediaId]);
                return null;
            }
            
            // Шаг 2: Скачиваем медиафайл
            $mediaResponse = $client->get($mediaUrl);
            
            if (!$mediaResponse->successful()) {
                Log::error('Ошибка скачивания медиафайла', [
                    'media_url' => $mediaUrl,
                    'response' => $mediaResponse->body()
                ]);
                return null;
            }
            
            // Шаг 3: Определяем расширение файла по mime-type
            $extension = $this->getExtensionFromMimeType($mimeType);
            
            // Шаг 4: Генерируем уникальное имя файла
            $filename = 'whatsapp_' . $mediaId . '_' . time() . '.' . $extension;
            // Для Laravel Storage всегда используем прямые слэши
            $directory = 'whatsapp/media/' . date('Y/m/d');
            $filePath = $directory . '/' . $filename;
            
            // Убеждаемся, что директория существует
            if (!Storage::disk('public')->exists($directory)) {
                Storage::disk('public')->makeDirectory($directory, 0775, true);
            }
            
            // Шаг 5: Сохраняем файл в storage
            $saved = Storage::disk('public')->put($filePath, $mediaResponse->body());
            
            if (!$saved) {
                Log::error('Не удалось сохранить медиафайл', [
                    'media_id' => $mediaId,
                    'file_path' => $filePath
                ]);
                return null;
            }
            
            // Шаг 6: Возвращаем публичный URL (всегда с прямыми слэшами для URL)
            $publicUrl = '/storage/whatsapp/media/' . date('Y/m/d') . '/' . $filename;
            
            Log::info('Медиафайл успешно загружен', [
                'media_id' => $mediaId,
                'file_path' => $filePath,
                'public_url' => $publicUrl
            ]);
            
            return $publicUrl;
            
        } catch (\Exception $e) {
            Log::error('Ошибка при загрузке медиафайла из WhatsApp', [
                'media_id' => $mediaId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            return null;
        }
    }

    /**
     * Определение расширения файла по MIME-типу
     */
    private function getExtensionFromMimeType($mimeType)
    {
        $mimeMap = [
            'image/jpeg' => 'jpg',
            'image/jpg' => 'jpg',
            'image/png' => 'png',
            'image/gif' => 'gif',
            'image/webp' => 'webp',
            'audio/ogg' => 'ogg',
            'audio/mpeg' => 'mp3',
            'audio/mp4' => 'm4a',
            'video/mp4' => 'mp4',
            'video/3gpp' => '3gp',
            'application/pdf' => 'pdf',
            'application/msword' => 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
            'application/vnd.ms-excel' => 'xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
            'text/plain' => 'txt',
        ];
        
        return $mimeMap[$mimeType] ?? 'bin';
    }

    /**
     * Загрузка медиафайла в WhatsApp
     * @param \Illuminate\Http\UploadedFile $file - Загруженный файл
     * @return string|null - ID медиафайла от WhatsApp или null в случае ошибки
     */
    public function uploadMedia($file)
    {
        try {
            $waba = WhatsAppBusinesSeting::first();
            
            // URL для загрузки медиа
            $uploadUrl = $waba->host . '/' . $waba->version . '/' . $waba->phone_number_id . '/media';
            
            // Получаем путь к файлу (работает на Windows IIS)
            $filePath = $file->getRealPath();
            
            // Если getRealPath() вернул пустую строку (проблема на Windows IIS)
            if (empty($filePath)) {
                $filePath = $file->getPathname();
            }
            
            // Проверяем что путь не пустой
            if (empty($filePath) || !file_exists($filePath)) {
                Log::error('Не удалось получить путь к файлу', [
                    'filename' => $file->getClientOriginalName(),
                    'real_path' => $file->getRealPath(),
                    'pathname' => $file->getPathname()
                ]);
                return null;
            }
            
            // Отправляем файл через multipart/form-data
            $response = Http::withToken($this->bearer_token)
                ->attach('file', file_get_contents($filePath), $file->getClientOriginalName())
                ->post($uploadUrl, [
                    'messaging_product' => 'whatsapp'
                ]);
            
            if (!$response->successful()) {
                Log::error('Ошибка загрузки файла в WhatsApp', [
                    'filename' => $file->getClientOriginalName(),
                    'response' => $response->body()
                ]);
                return null;
            }
            
            $result = $response->json();
            $mediaId = $result['id'] ?? null;
            
            if (!$mediaId) {
                Log::error('Media ID не получен от WhatsApp', ['response' => $result]);
                return null;
            }
            
            Log::info('Файл успешно загружен в WhatsApp', [
                'filename' => $file->getClientOriginalName(),
                'media_id' => $mediaId
            ]);
            
            return $mediaId;
            
        } catch (\Exception $e) {
            Log::error('Ошибка при загрузке файла в WhatsApp', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            return null;
        }
    }

    /**
     * Отправка медиафайла через WhatsApp
     * @param Request $request - содержит file, whatsapp_number, user_id, caption (опционально)
     * @return \Illuminate\Http\JsonResponse
     */
    public function sendMediaMessage(Request $request)
    {
        try {
            $data = $request->validate([
                'file' => 'required|file|max:16384', // максимум 16MB
                'whatsapp_number' => 'required|string',
                'user_id' => 'required|integer',
                'caption' => 'nullable|string|max:1024',
            ]);

            $file = $request->file('file');
            $mimeType = $file->getMimeType();
            
            // Определяем тип медиа по MIME-типу
            $mediaType = $this->getMediaTypeFromMime($mimeType);
            
            if (!$mediaType) {
                return response()->json([
                    'status' => false,
                    'message' => 'Неподдерживаемый тип файла'
                ], 400);
            }

            // Шаг 1: Загружаем файл в WhatsApp и получаем media_id
            $mediaId = $this->uploadMedia($file);
            
            if (!$mediaId) {
                return response()->json([
                    'status' => false,
                    'message' => 'Ошибка загрузки файла в WhatsApp'
                ], 500);
            }

            // Шаг 2: Отправляем сообщение с медиа
            $messageData = [
                "messaging_product" => "whatsapp",
                "to" => $data['whatsapp_number'],
                "type" => $mediaType,
                $mediaType => [
                    "id" => $mediaId
                ]
            ];

            // Добавляем подпись если есть
            if (!empty($data['caption'])) {
                $messageData[$mediaType]['caption'] = $data['caption'];
            }

            $sendMessage = $this->http_client->withHeaders([
                'Authorization' => 'Bearer ' . $this->bearer_token,
                'Content-Type' => 'application/json',
            ])->post($this->hostMessage, $messageData);

            if (!$sendMessage->successful()) {
                Log::error('Ошибка отправки медиа-сообщения', [
                    'response' => $sendMessage->body()
                ]);
                return response()->json([
                    'status' => false,
                    'message' => 'Ошибка отправки сообщения'
                ], 500);
            }

            $messageId = $sendMessage->json()['messages'][0]['id'] ?? null;

            // Сохраняем локально копию файла
            $localPath = $this->saveLocalMediaCopy($file);

            // Формируем текст сообщения для БД
            $messageText = '';
            if (!empty($data['caption'])) {
                $messageText = $data['caption'] . '<br>';
            }

            // Добавляем HTML-тег в зависимости от типа файла
            if ($mediaType === 'image' && $localPath) {
                $messageText .= '<img src="' . $localPath . '" alt="Image" style="max-width: 100%; border-radius: 8px;" />';
            } elseif ($mediaType === 'document') {
                $filename = $file->getClientOriginalName();
                $messageText .= $localPath 
                    ? '📎 <a href="' . $localPath . '" target="_blank" download>' . $filename . '</a>'
                    : '📎 ' . $filename;
            } elseif ($mediaType === 'audio' && $localPath) {
                $messageText .= '🎵 <audio controls><source src="' . $localPath . '" type="' . $mimeType . '"></audio>';
            } elseif ($mediaType === 'video' && $localPath) {
                $messageText .= '🎬 <video controls style="max-width: 100%; border-radius: 8px;"><source src="' . $localPath . '" type="' . $mimeType . '"></video>';
            }

            // Сохраняем сообщение в БД
            $typeMap = [
                'image' => 4,
                'document' => 5,
                'audio' => 6,
                'video' => 7
            ];

            $this->newMessage(
                $messageText,
                $data['whatsapp_number'],
                $messageId,
                $data['user_id'],
                $typeMap[$mediaType] ?? 5,
                'outgoing',
                'sent'
            );

            return response()->json([
                'status' => true,
                'message' => 'Файл успешно отправлен',
                'message_id' => $messageId
            ], 200);

        } catch (\Exception $e) {
            Log::error('Ошибка в sendMediaMessage: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json([
                'status' => false,
                'message' => 'Ошибка при отправке файла: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Определение типа медиа по MIME-типу для WhatsApp API
     */
    private function getMediaTypeFromMime($mimeType)
    {
        if (str_starts_with($mimeType, 'image/')) {
            return 'image';
        } elseif (str_starts_with($mimeType, 'video/')) {
            return 'video';
        } elseif (str_starts_with($mimeType, 'audio/')) {
            return 'audio';
        } elseif (in_array($mimeType, [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain'
        ])) {
            return 'document';
        }
        
        return null;
    }

    /**
     * Сохранение локальной копии медиафайла
     */
    private function saveLocalMediaCopy($file)
    {
        try {
            $extension = $file->getClientOriginalExtension();
            $filename = 'whatsapp_upload_' . time() . '_' . uniqid() . '.' . $extension;
            $directory = 'whatsapp/media/' . date('Y/m/d');
            $filePath = $directory . '/' . $filename;
            
            // Получаем путь к файлу (работает на Windows IIS)
            $tempPath = $file->getRealPath();
            
            // Если getRealPath() вернул пустую строку (проблема на Windows IIS)
            if (empty($tempPath)) {
                $tempPath = $file->getPathname();
            }
            
            // Проверяем что путь не пустой
            if (empty($tempPath) || !file_exists($tempPath)) {
                Log::error('Не удалось получить путь к временному файлу при сохранении копии', [
                    'filename' => $file->getClientOriginalName(),
                    'real_path' => $file->getRealPath(),
                    'pathname' => $file->getPathname()
                ]);
                return null;
            }
            
            // Читаем содержимое файла и сохраняем через Storage::put()
            $fileContents = file_get_contents($tempPath);
            
            if ($fileContents === false) {
                Log::error('Не удалось прочитать содержимое временного файла', [
                    'temp_path' => $tempPath
                ]);
                return null;
            }
            
            // Сохраняем файл
            $saved = Storage::disk('public')->put($filePath, $fileContents);
            
            if (!$saved) {
                Log::error('Storage::put() вернул false', [
                    'file_path' => $filePath
                ]);
                return null;
            }
            
            Log::info('Локальная копия файла успешно сохранена', [
                'file_path' => $filePath,
                'temp_path' => $tempPath
            ]);
            
            return '/storage/' . $filePath;
            
        } catch (\Exception $e) {
            Log::error('Ошибка сохранения локальной копии файла', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            return null;
        }
    }

    /**
     * Получение всех сообщений чата по phone_number_id и user_whatsapp
     * @param Request $request - содержит phone_number_id и user_whatsapp
     * @return \Illuminate\Http\JsonResponse
     */
    public function getChatMessages(Request $request)
    {
        try {
            $data = $request->validate([
                'phone_number_id' => 'required|string',
                'user_whatsapp' => 'required|string',
            ]);

            // Находим чат по phone_number_id и user_whatsapp
            $chatList = WhatsAppChatList::where('phone_number_id', $data['phone_number_id'])
                ->where('user_whatsapp', $data['user_whatsapp'])
                ->first();

            if (!$chatList) {
                return response()->json([
                    'status' => false,
                    'message' => 'Чат не найден',
                    'data' => []
                ], 404);
            }

            // Получаем все сообщения этого чата, отсортированные по дате создания
            $messages = WhatsAppChatMessages::where('chat_list_id', $chatList->id)
                ->orderBy('created_at', 'asc')
                ->get()
                ->map(function ($message) {
                    return [
                        'id' => $message->id,
                        'message' => $message->message,
                        'csc_file' => $message->csc_file, // Для CSC проекта: "caption, filename, url"
                        'message_id' => $message->message_id,
                        'type' => $message->type,
                        'user_id' => $message->user_id,
                        'direction' => $message->direction,
                        'status' => $message->status,
                        'response_to_message_id' => $message->response_to_message_id,
                        'has_response' => $message->has_response,
                        'error_code' => $message->error_code,
                        'error_message' => $message->error_message,
                        'created_at' => $message->created_at,
                        'updated_at' => $message->updated_at,
                    ];
                });

            return response()->json([
                'status' => true,
                'message' => 'Сообщения успешно получены',
                'data' => [
                    'chat_info' => [
                        'chat_list_id' => $chatList->id,
                        'phone_number_id' => $chatList->phone_number_id,
                        'user_whatsapp' => $chatList->user_whatsapp,
                        'new_messages' => $chatList->new_messages,
                        'last_time_message' => $chatList->last_time_message,
                    ],
                    'messages' => $messages,
                    'total_messages' => $messages->count(),
                ]
            ], 200);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'status' => false,
                'message' => 'Ошибка валидации',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            Log::error('Ошибка в getChatMessages: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json([
                'status' => false,
                'message' => 'Ошибка при получении сообщений: ' . $e->getMessage()
            ], 500);
        }
    }
}
