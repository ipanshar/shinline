<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class WhatsAppController extends Controller
{
   public function WhatsAppAlarmAdd(Request $request)
    {
        try {
            $data = json_encode($request->all(), JSON_PRETTY_PRINT) . "\n";
            Storage::disk('local')->append('whatsapp_alarm_log.txt', $data);
            return response()->json(['message' => 'Запись успешно добавлена', 'data' => $request->all()], 201);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Ошибка при записи в файл', 'data' => $e->getMessage()], 500);
        }
    }
}
