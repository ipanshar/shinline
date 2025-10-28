<?php

namespace App\Http\Controllers;

use App\Models\WhatsAppBusinesSeting;
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

    public function whatsappBusinessSettingsCreateOrUpdate(Request $request)
    {
        // Логика для обработки настроек WhatsApp Business
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

    public function whatsappBusinessSettingsGet(Request $request)
    {
        $settings = WhatsAppBusinesSeting::first();
        if ($settings) {
            return response()->json($settings, Response::HTTP_OK);
        } else {
            return response()->json(['message' => 'Настройки не найдены.'], Response::HTTP_NOT_FOUND);
        }
    }
}
