<?php

namespace App\Http\Controllers;

use App\Models\ClientRegistration;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Inertia\Inertia;

class ClientRegistrationController extends Controller
{
    /**
     * Показать форму регистрации (публичный доступ)
     */
    public function showForm()
    {
        return Inertia::render('client-registration');
    }

    /**
     * Сохранить данные клиента (публичный доступ)
     */
    public function store(Request $request)
    {
        // Очищаем номер телефона от лишних символов для проверки
        $cleanPhone = preg_replace('/[^0-9+]/', '', $request->phone);
        
        $validator = Validator::make($request->all(), [
            'full_name' => 'required|string|max:255|min:2',
            'iin' => 'required|string|size:12|regex:/^[0-9]+$/|unique:client_registrations,iin',
            'birth_date' => 'required|date|before:today|after:1900-01-01',
            'gender' => 'required|in:male,female',
            'phone' => 'required|string|max:20|min:10',
            'address' => 'required|string|max:1000|min:5',
        ], [
            'full_name.required' => 'Укажите ФИО',
            'full_name.min' => 'ФИО должно содержать минимум 2 символа',
            'full_name.max' => 'ФИО не должно превышать 255 символов',
            'iin.required' => 'Укажите ИИН',
            'iin.size' => 'ИИН должен содержать 12 цифр',
            'iin.regex' => 'ИИН должен содержать только цифры',
            'iin.unique' => 'Клиент с таким ИИН уже зарегистрирован',
            'birth_date.required' => 'Укажите дату рождения',
            'birth_date.date' => 'Некорректный формат даты',
            'birth_date.before' => 'Дата рождения должна быть в прошлом',
            'birth_date.after' => 'Некорректная дата рождения',
            'gender.required' => 'Укажите пол',
            'gender.in' => 'Некорректное значение пола',
            'phone.required' => 'Укажите номер телефона',
            'phone.min' => 'Номер телефона должен содержать минимум 10 символов',
            'phone.max' => 'Номер телефона не должен превышать 20 символов',
            'address.required' => 'Укажите адрес проживания',
            'address.min' => 'Адрес должен содержать минимум 5 символов',
            'address.max' => 'Адрес не должен превышать 1000 символов',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors()
            ], 422);
        }

        // Проверяем уникальность телефона (после очистки)
        $existingByPhone = ClientRegistration::where('phone', $cleanPhone)->first();
        if ($existingByPhone) {
            return response()->json([
                'success' => false,
                'errors' => [
                    'phone' => ['Клиент с таким номером телефона уже зарегистрирован']
                ]
            ], 422);
        }

        $registration = ClientRegistration::create([
            'full_name' => trim($request->full_name),
            'iin' => $request->iin,
            'birth_date' => $request->birth_date,
            'gender' => $request->gender,
            'phone' => $cleanPhone,
            'address' => trim($request->address),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Данные успешно сохранены',
            'data' => $registration
        ], 201);
    }

    /**
     * Получить список всех регистраций (для админки, требует авторизации)
     */
    public function index(Request $request)
    {   
        $registrations = ClientRegistration::orderBy('created_at', 'desc')->paginate(20);
        
        return response()->json($registrations);
    }

    /**
     * API: Получить регистрации за последние N дней (по умолчанию 5)
     * GET /api/client-registrations?days=5
     */
    public function apiList(Request $request)
    {
        $days = $request->input('days', 5);
        $days = max(1, min(30, (int)$days)); // Ограничиваем от 1 до 30 дней
        
        $registrations = ClientRegistration::where('created_at', '>=', now()->subDays($days))
            ->orderBy('created_at', 'desc')
            ->get();
        
        return response()->json([
            'success' => true,
            'filter' => [
                'days' => $days,
                'from_date' => now()->subDays($days)->toDateTimeString(),
                'to_date' => now()->toDateTimeString(),
            ],
            'count' => $registrations->count(),
            'data' => $registrations
        ]);
    }
}
