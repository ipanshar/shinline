<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Yard;
use App\Services\EntryPermitImportService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class PermitImportController extends Controller
{
    public function __construct(private EntryPermitImportService $importService)
    {
    }

    public function import(Request $request)
    {
        try {
            $validated = $request->validate([
                'rows' => 'required|array|min:1',
                'rows.*' => 'array',
                'yard_id' => 'required|integer|exists:yards,id',
                'one_permission' => 'required|boolean',
                'weighing_required' => 'nullable|boolean',
            ]);

            $yard = Yard::find($validated['yard_id']);
            if (!$yard) {
                return response()->json([
                    'status' => false,
                    'message' => 'Двор не найден',
                ], 404);
            }

            $result = $this->importService->import(
                $validated['rows'],
                $yard->id,
                $validated['one_permission'],
                $validated['weighing_required'] ?? null,
                $request->user()?->id,
            );

            return response()->json([
                'status' => true,
                'message' => 'Импорт завершен',
                'data' => $result,
            ]);
        } catch (ValidationException $exception) {
            return response()->json([
                'status' => false,
                'message' => 'Ошибка валидации',
                'errors' => $exception->errors(),
            ], 422);
        } catch (\Throwable $exception) {
            return response()->json([
                'status' => false,
                'message' => $exception->getMessage(),
            ], 500);
        }
    }
}