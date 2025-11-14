<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Counterparty;
use Illuminate\Support\Facades\Auth;
use Illuminate\Http\Request;

class CounterpartyController extends Controller
{
    public function getCounterparties(Request $request)
    {
        $counterparties = Counterparty::query();
        
        // Фильтрация по имени
        if ($request->has('name')) {
            $counterparties->where('name', 'like', '%' . $request->input('name') . '%');
        }
        
        // Фильтрация по ИНН
        if ($request->has('inn')) {
            $counterparties->where('inn', 'like', '%' . $request->input('inn') . '%');
        }
        
        // Фильтрация по WhatsApp
        if ($request->has('whatsapp')) {
            $counterparties->where('whatsapp', 'like', '%' . $request->input('whatsapp') . '%');
        }
        
        $counterparties = $counterparties->get();
        
        return response()->json([
            'status' => true,
            'message' => 'Counterparties retrieved successfully',
            'data' => $counterparties,
        ], 200);
    }

    public function addCounterparty(Request $request)
    {
        try {
            $validate = $request->validate([
                'name' => 'required|string|max:255',
                'inn' => 'required|string|max:255|unique:сounterparties,inn',
                'address' => 'nullable|string|max:255',
                'phone' => 'nullable|string|max:255',
                'whatsapp' => 'nullable|string|max:255',
                'email' => 'nullable|email|max:255',
                'supervisor' => 'nullable|string|max:255',
                'contact_person' => 'nullable|string|max:255',
                'carrier_type' => 'nullable|boolean',
            ]);

            // Очистка номера WhatsApp от знака + и пробелов
            if (!empty($validate['whatsapp'])) {
                $validate['whatsapp'] = str_replace(['+', ' '], '', $validate['whatsapp']);
            }

            $counterparty = Counterparty::create($validate);

            return response()->json([
                'status' => true,
                'message' => 'Counterparty created successfully',
                'data' => $counterparty
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Creating Counterparty: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function updateCounterparty(Request $request)
    {
        try {
            $validate = $request->validate([
                'id' => 'required|integer',
                'name' => 'nullable|string|max:255',
                'inn' => 'nullable|string|max:255|unique:counterparties,inn,' . $request->input('id'),
                'address' => 'nullable|string|max:255',
                'phone' => 'nullable|string|max:255',
                'whatsapp' => 'nullable|string|max:255',
                'email' => 'nullable|email|max:255',
                'supervisor' => 'nullable|string|max:255',
                'contact_person' => 'nullable|string|max:255',
                'carrier_type' => 'nullable|boolean',
            ]);

            $counterparty = Counterparty::find($validate['id']);
            if (!$counterparty) {
                return response()->json([
                    'status' => false,
                    'message' => 'Counterparty not found'
                ], 404);
            }

            // Очистка номера WhatsApp от знака + и пробелов
            if (!empty($validate['whatsapp'])) {
                $validate['whatsapp'] = str_replace(['+', ' '], '', $validate['whatsapp']);
            }

            $counterparty->update($validate);

            return response()->json([
                'status' => true,
                'message' => 'Counterparty updated successfully',
                'data' => $counterparty
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Updating Counterparty: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function deleteCounterparty(Request $request)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $userRole = $user->roles->pluck('name');
        if (!$userRole->contains('Администратор')) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $validate = $request->validate([
            'id' => 'required|integer',
        ]);

        $counterparty = Сounterparty::find($validate['id']);
        if (!$counterparty) {
            return response()->json([
                'status' => false,
                'message' => 'Counterparty not found'
            ], 404);
        }

        $counterparty->delete();

        return response()->json([
            'status' => true,
            'message' => 'Counterparty deleted successfully',
        ], 200);
    }

    public function getCounterparty(Request $request)
    {
        $validate = $request->validate([
            'id' => 'required|integer',
        ]);

        $counterparty = Сounterparty::find($validate['id']);
        if (!$counterparty) {
            return response()->json([
                'status' => false,
                'message' => 'Counterparty not found'
            ], 404);
        }

        return response()->json([
            'status' => true,
            'message' => 'Counterparty retrieved successfully',
            'data' => $counterparty,
        ], 200);
    }

    public function searchByWhatsApp(Request $request)
    {
        $validate = $request->validate([
            'whatsapp' => 'required|string',
        ]);

        // Очистка номера WhatsApp от знака + и пробелов для поиска
        $whatsapp = str_replace(['+', ' '], '', $validate['whatsapp']);

        $counterparty = Counterparty::where('whatsapp', $whatsapp)->first();
        
        if (!$counterparty) {
            return response()->json([
                'status' => false,
                'message' => 'Counterparty not found'
            ], 404);
        }

        return response()->json([
            'status' => true,
            'message' => 'Counterparty found',
            'data' => $counterparty,
        ], 200);
    }

    /**
     * Умный импорт контрагентов из Excel
     * Автоматически определяет колонки по ключевым словам
     */
    public function importCounterparties(Request $request)
    {
        try {
            $validate = $request->validate([
                'counterparties' => 'required|array',
                'counterparties.*' => 'array',
            ]);

            $imported = 0;
            $skipped = 0;
            $errors = [];

            foreach ($validate['counterparties'] as $index => $row) {
                try {
                    // Умное определение колонок
                    $name = $this->findColumnValue($row, ['наименование', 'название', 'предприятия', 'организация', 'компания', 'name']);
                    $inn = $this->findColumnValue($row, ['бин', 'иин', 'инн', 'bin', 'iin', 'inn']);
                    $address = $this->findColumnValue($row, ['адрес', 'юр', 'address']);
                    $email = $this->findColumnValue($row, ['email', 'e-mail', 'почта', 'mail']);
                    $supervisor = $this->findColumnValue($row, ['руководитель', 'директор', 'supervisor', 'director']);
                    $carrierType = $this->findColumnValue($row, ['международный', 'перевозчик', 'carrier']);
                    
                    // Ищем контактное лицо в отдельной колонке
                    $contactPerson = $this->findColumnValue($row, [
                        'диспетчер', 'диспетчер/контактное', 'контактное лицо', 'контакт',
                        'логистик', 'менеджер', 'ответственный'
                    ]);
                    
                    // Ищем телефон в отдельной колонке (ТОЛЬКО номера)
                    $phoneRaw = $this->findColumnValue($row, ['телефон', 'тел', 'phone']);
                    
                    // Если телефон не найден, ищем в безымянной колонке __EMPTY
                    if (empty($phoneRaw) && isset($row['__EMPTY'])) {
                        $phoneRaw = $row['__EMPTY'];
                    }
                    
                    $whatsappRaw = $this->findColumnValue($row, ['whatsapp', 'ватсап', 'вотсап', 'вацап']);

                    // Пропускаем строки без имени или ИНН
                    if (empty($name) || empty($inn)) {
                        $skipped++;
                        continue;
                    }
                    
                    // Обрабатываем телефон
                    $phone = null;
                    if ($phoneRaw) {
                        // Проверяем, есть ли в строке цифры (если только буквы - это не телефон)
                        if (preg_match('/\d/', $phoneRaw)) {
                            // Убираем все пробелы, дефисы, скобки
                            $phone = preg_replace('/[\s\-\(\)]/', '', trim($phoneRaw));
                            // Если начинается с 8, заменяем на +7
                            if (substr($phone, 0, 1) === '8') {
                                $phone = '+7' . substr($phone, 1);
                            }
                            // Если начинается с 7 (без +), добавляем +
                            if (substr($phone, 0, 1) === '7' && substr($phone, 0, 2) !== '+7') {
                                $phone = '+' . $phone;
                            }
                        }
                    }
                    
                    // Обрабатываем WhatsApp аналогично
                    $whatsapp = null;
                    if ($whatsappRaw) {
                        if (preg_match('/\d/', $whatsappRaw)) {
                            $whatsapp = preg_replace('/[\s\-\(\)]/', '', trim($whatsappRaw));
                            if (substr($whatsapp, 0, 1) === '8') {
                                $whatsapp = '+7' . substr($whatsapp, 1);
                            }
                            if (substr($whatsapp, 0, 1) === '7' && substr($whatsapp, 0, 2) !== '+7') {
                                $whatsapp = '+' . $whatsapp;
                            }
                        }
                    }
                    
                    // Если WhatsApp не найден, используем телефон
                    if (empty($whatsapp) && !empty($phone)) {
                        $whatsapp = $phone;
                    }

                    // Определяем тип перевозчика
                    $isCarrier = false;
                    if ($carrierType) {
                        $carrierType = mb_strtolower(trim($carrierType));
                        $isCarrier = in_array($carrierType, ['да', 'yes', '1', 'true', 'международный']);
                    }

                    // Проверяем дубликаты по ИНН
                    $existing = Counterparty::where('inn', $inn)->first();
                    if ($existing) {
                        $skipped++;
                        continue;
                    }

                    // Создаем контрагента
                    Counterparty::create([
                        'name' => trim($name),
                        'inn' => trim($inn),
                        'address' => $address ? trim($address) : null,
                        'phone' => $phone,
                        'whatsapp' => $whatsapp,
                        'email' => $email ? trim($email) : null,
                        'supervisor' => $supervisor ? trim($supervisor) : null,
                        'contact_person' => $contactPerson ? trim($contactPerson) : null,
                        'carrier_type' => $isCarrier,
                    ]);

                    $imported++;
                } catch (\Exception $e) {
                    $errors[] = "Строка " . ($index + 1) . ": " . $e->getMessage();
                }
            }

            return response()->json([
                'status' => true,
                'message' => "Импорт завершен. Добавлено: {$imported}, Пропущено: {$skipped}",
                'imported' => $imported,
                'skipped' => $skipped,
                'errors' => $errors,
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Ошибка импорта: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Поиск значения колонки по ключевым словам
     * Ищет по началу слова или точному совпадению, чтобы избежать ложных срабатываний
     */
    private function findColumnValue($row, $keywords)
    {
        foreach ($row as $key => $value) {
            $keyLower = mb_strtolower(trim($key));
            foreach ($keywords as $keyword) {
                $keywordLower = mb_strtolower($keyword);
                
                // Точное совпадение (с учетом пробелов и знаков)
                if ($keyLower === $keywordLower) {
                    return $value;
                }
                
                // Начинается с ключевого слова (например: "телефон 1", "телефон контактный")
                if (strpos($keyLower, $keywordLower) === 0) {
                    return $value;
                }
                
                // Содержит ключевое слово как отдельное слово (с пробелами вокруг)
                if (preg_match('/\b' . preg_quote($keywordLower, '/') . '\b/', $keyLower)) {
                    return $value;
                }
            }
        }
        return null;
    }
}
