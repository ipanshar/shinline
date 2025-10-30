<?php

namespace App\Http\Controllers;

use App\Models\WhatsAppBusinesSeting;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use App\Models\Task;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class WhatsAppController extends Controller
{   
    protected $hostMessage;
    protected $bearer_token;
    protected $http_client;
    public function __construct()
    {
         $waba = WhatsAppBusinesSeting::first();
        $this->hostMessage = $waba->host.'/'. $waba->version .'/'. $waba->phone_number_id .'/messages';
        $this->bearer_token = $waba->bearer_token;
        $this->http_client = Http::withToken($this->bearer_token);
    }

    // Обработка входящих уведомлений от WhatsApp
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

    

    public function getMessageTemplateNewTask(Request $request)
    {
        $data = $request->validate([
                'task_id' => 'required|integer',
                'users' => 'required|array',
                'user_id' => 'required|integer',
            ]);
        $task = Task::where('id', $data['task_id'])->first();
       
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

        foreach ($data['users'] as $user_id){
            if (empty($user)) continue;
            $user_whatsapp = DB::table('users')->where('id', $user_id)->value('whatsapp_number');
            if (empty($user_whatsapp)) continue;

            // Здесь вы можете использовать номер WhatsApp пользователя
        }
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
