<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;

class WhatsAppController extends Controller
{
   public function WhatsAppAlarmAdd(Request $request)
    {
        try {
            $data = json_encode($request->all(), JSON_PRETTY_PRINT) . "\n";
            Storage::disk('local')->append('whatsapp_alarm_log.txt', $data);
            return response('', 200);
        } catch (\Exception $e) {
            return response('', 500);
        }
    }

    public function verify(Request $request)
    {
        // Получаем параметры из запроса
        $mode = $request->query('hub_mode');
        $token = $request->query('hub_verify_token');
        $challenge = $request->query('hub_challenge');

        // Токен, который ты задавал в настройках Meta
        $verifyToken = env('WHATSAPP_TOKEN');

        if ($mode === 'subscribe' && $token === $verifyToken) {
            Log::info('✅ Webhook verified successfully.');
            return response($challenge, 200);
        } else {
            Log::warning('❌ Webhook verification failed.', [
                'mode' => $mode,
                'token' => $token
            ]);
            return response('Forbidden', 403);
        }
    }
}
