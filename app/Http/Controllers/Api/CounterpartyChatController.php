<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WhatsAppChatList;
use App\Models\WhatsAppChatMessages;
use App\Models\WhatsAppBusinesSeting;
use App\Models\Сounterparty;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CounterpartyChatController extends Controller
{
    /**
     * Получить список чатов с контрагентами
     */
    public function getChatLists(Request $request)
    {
        try {
            // Получаем все чаты, связанные с контрагентами
            $chatLists = WhatsAppChatList::leftJoin('users', 'whats_app_chat_lists.user_id', '=', 'users.id')
                ->select(
                    'whats_app_chat_lists.*',
                    'users.name as user_name'
                )
                ->orderBy('whats_app_chat_lists.last_time_message', 'desc')
                ->get();

            // Для каждого чата пытаемся найти контрагента по WhatsApp номеру
            $chatLists = $chatLists->map(function ($chat) {
                $counterparty = Сounterparty::where('whatsapp', $chat->user_whatsapp)->first();
                $chat->counterparty_name = $counterparty ? $counterparty->name : null;
                $chat->counterparty_id = $counterparty ? $counterparty->id : null;
                return $chat;
            });

            return response()->json([
                'status' => true,
                'message' => 'Chat lists retrieved successfully',
                'data' => $chatLists,
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error retrieving chat lists: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Получить сообщения чата
     */
    public function getChatMessages(Request $request)
    {
        try {
            $validate = $request->validate([
                'chat_list_id' => 'required|integer',
            ]);

            $messages = WhatsAppChatMessages::where('chat_list_id', $validate['chat_list_id'])
                ->leftJoin('users', 'whats_app_chat_messages.user_id', '=', 'users.id')
                ->select(
                    'whats_app_chat_messages.*',
                    'users.name as user_name'
                )
                ->orderBy('whats_app_chat_messages.created_at', 'asc')
                ->get();

            // Для каждого сообщения с ответом находим исходное сообщение
            $messages = $messages->map(function ($message) {
                if ($message->response_to_message_id) {
                    $originalMessage = WhatsAppChatMessages::where('message_id', $message->response_to_message_id)
                        ->leftJoin('users', 'whats_app_chat_messages.user_id', '=', 'users.id')
                        ->select(
                            'whats_app_chat_messages.message',
                            'whats_app_chat_messages.created_at',
                            'whats_app_chat_messages.direction',
                            'users.name as user_name'
                        )
                        ->first();
                    
                    if ($originalMessage) {
                        $message->original_message = $originalMessage;
                    }
                }
                return $message;
            });

            return response()->json([
                'status' => true,
                'message' => 'Messages retrieved successfully',
                'data' => $messages,
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error retrieving messages: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Отправить сообщение (тестовое, без реальной отправки в WhatsApp)
     */
    public function sendMessage(Request $request)
    {
        try {
            $validate = $request->validate([
                'chat_list_id' => 'required|integer',
                'message' => 'required|string',
            ]);

            $user = Auth::user();
            if (!$user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            // Получаем информацию о чате
            $chatList = WhatsAppChatList::find($validate['chat_list_id']);
            if (!$chatList) {
                return response()->json([
                    'status' => false,
                    'message' => 'Chat not found'
                ], 404);
            }

            // Отправляем сообщение через WhatsApp API
            $whatsappController = new \App\Http\Controllers\WhatsAppController();
            $whatsappController->getMessageText(
                $validate['message'],
                $chatList->user_whatsapp,
                $user->id,
                1 // тип 1 для текстовых сообщений
            );

            // Обновляем время последнего сообщения в чате
            $chatList->last_time_message = now();
            $chatList->save();

            // Получаем последнее созданное сообщение
            $chatMessage = WhatsAppChatMessages::where('chat_list_id', $validate['chat_list_id'])
                ->where('direction', 'outgoing')
                ->orderBy('created_at', 'desc')
                ->first();

            // Добавляем информацию о пользователе
            if ($chatMessage) {
                $chatMessage->user_name = $user->name;
            }

            return response()->json([
                'status' => true,
                'message' => 'Message sent successfully',
                'data' => $chatMessage,
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error sending message: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Создать или получить чат с контрагентом
     */
    public function getOrCreateChat(Request $request)
    {
        try {
            $validate = $request->validate([
                'counterparty_id' => 'required|integer',
            ]);

            $counterparty = Сounterparty::find($validate['counterparty_id']);
            if (!$counterparty) {
                return response()->json([
                    'status' => false,
                    'message' => 'Counterparty not found'
                ], 404);
            }

            if (!$counterparty->whatsapp) {
                return response()->json([
                    'status' => false,
                    'message' => 'Counterparty does not have WhatsApp number'
                ], 400);
            }

            // Ищем существующий чат по WhatsApp номеру
            $chatList = WhatsAppChatList::where('user_whatsapp', $counterparty->whatsapp)->first();

            // Если чата нет, создаем новый
            if (!$chatList) {
                $phoneNumberId = null;
                $setting = WhatsAppBusinesSeting::first();
                if ($setting) {
                    $phoneNumberId = $setting->phone_number_id;
                }

                $chatList = WhatsAppChatList::create([
                    'user_id' => null, // Для контрагентов user_id может быть null
                    'phone_number_id' => $phoneNumberId, // Тестовый ID (nullable if not set)
                    'user_whatsapp' => $counterparty->whatsapp,
                    'new_messages' => 0,
                    'last_time_message' => now(),
                ]);
            }

            return response()->json([
                'status' => true,
                'message' => 'Chat retrieved successfully',
                'data' => [
                    'chat_id' => $chatList->id,
                    'chat_list' => $chatList,
                    'counterparty' => $counterparty,
                ],
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error getting chat: ' . $e->getMessage(),
            ], 500);
        }
    }
}
