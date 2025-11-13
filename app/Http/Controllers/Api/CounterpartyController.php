<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Сounterparty;
use Illuminate\Support\Facades\Auth;
use Illuminate\Http\Request;

class CounterpartyController extends Controller
{
    public function getCounterparties(Request $request)
    {
        $counterparties = Сounterparty::query();
        
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

            $counterparty = Сounterparty::create($validate);

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
                'inn' => 'nullable|string|max:255|unique:сounterparties,inn,' . $request->input('id'),
                'address' => 'nullable|string|max:255',
                'phone' => 'nullable|string|max:255',
                'whatsapp' => 'nullable|string|max:255',
                'email' => 'nullable|email|max:255',
                'supervisor' => 'nullable|string|max:255',
                'contact_person' => 'nullable|string|max:255',
                'carrier_type' => 'nullable|boolean',
            ]);

            $counterparty = Сounterparty::find($validate['id']);
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

        $counterparty = Сounterparty::where('whatsapp', $whatsapp)->first();
        
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
}
