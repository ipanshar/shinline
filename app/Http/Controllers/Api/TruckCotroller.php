<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Truck;
use App\Models\TruckCategory;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class TruckCotroller extends Controller
{
    public function addTruck(Request $request)
    {
        try {
            $validate = $request->validate([
                'name' => 'nullable|string|max:255',
                'user_id' => 'required|integer',
                'plate_number' => 'required|string|max:255',
                'vin' => 'nullable|string|max:255',
                'truck_brand_id' => 'nullable|integer',
                'truck_category_id' => 'nullable|integer',
                'truck_model_id' => 'nullable|integer',
                'color' => 'nullable|string|max:255',
                'trailer_model_id' => 'nullable|integer',
                'trailer_type_id' => 'nullable|integer',
                'trailer_number' => 'nullable|string|max:255',
                'trailer_height' => 'nullable|numeric',
                'trailer_width' => 'nullable|numeric',
                'trailer_length' => 'nullable|numeric',
                'own' => 'nullable|boolean',
                'trailer_load_capacity' => 'nullable|numeric'
            ]);
            $truck = Truck::create($validate);
            $truck->save();
            return response()->json([
                'status' => true,
                'message' => 'Truck created successfully',
                'data' => $validate
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Creating Truck: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function updateTruck(Request $request)
    {
        try {
            $validate = $request->validate([
                'id' => 'required|integer',
                'name' => 'nullable|string|max:255',
                'user_id' => 'required|integer',
                'plate_number' => 'required|string|max:255',
                'truck_brand_id' => 'nullable|integer',
                'vin' => 'nullable|string|max:255',
                'truck_model_id' => 'nullable|integer',
                'color' => 'nullable|string|max:255',
                'trailer_model_id' => 'nullable|integer',
                'trailer_type_id' => 'nullable|integer',
                'trailer_number' => 'nullable|string|max:255',
                'trailer_height' => 'nullable|numeric',
                'trailer_width' => 'nullable|numeric',
                'trailer_length' => 'nullable|numeric',
                'trailer_load_capacity' => 'nullable|numeric',
                'own' => 'nullable|boolean',
                'truck_category_id' => 'nullable|integer'
            ]);
            $truck = Truck::find($validate['id']);
            if ($truck) {
                $truck->update($validate);
                return response()->json([
                    'status' => true,
                    'message' => "Truck updated successfully",
                    "data" => $validate
                ], 200);
            } else {
                return response()->json([
                    "status" => false,
                    "message" => "Truck not found"
                ], 404);
            }
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Updating Truck: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function getTrucks(Request $request)
    {
        try {

            $query = Truck::query();
            if ($request->has('user_id')) {
                $query->where('user_id', $request->input('user_id'));
            }
            if ($request->has('truck_id')) {
                $query->where('trucks.id', $request->input('truck_id'));
            }
            if ($request->has('plate_number')) {
                $query->where('plate_number', 'like', '%' . $request->input('plate_number') . '%');
            }
            if ($request->has('name')) {
                $query->where('name', 'like', '%' . $request->input('name') . '%');
            }
            if ($request->has('truck_brand_id')) {
                $query->where('truck_brand_id', $request->input('truck_brand_id'));
            }
            if ($request->has('truck_model_id')) {
                $query->where('truck_model_id', $request->input('truck_model_id'));
            }
            if ($request->has('truck_category_id')) {
                $query->where('truck_category_id', $request->input('truck_category_id'));
            }
            if ($request->has('vin')) {
                $query->where('vin', 'like', '%' . $request->input('vin') . '%');
            }
            if ($request->has('color')) {
                $query->where('color', 'like', '%' . $request->input('color') . '%');
            }
            if ($request->has('trailer_model_id')) {
                $query->where('trailer_model_id', $request->input('trailer_model_id'));
            }
            if ($request->has('trailer_number')) {
                $query->where('trailer_number', 'like', '%' . $request->input('trailer_number') . '%');
            }
            if ($request->has('trailer_type_id')) {
                $query->where('trailer_type_id', $request->input('trailer_type_id'));
            }
            
            $query->leftJoin('users', 'trucks.user_id', '=', 'users.id')
                ->leftJoin('truck_brands', 'trucks.truck_brand_id', '=', 'truck_brands.id')
                ->leftJoin('truck_models', 'trucks.truck_model_id', '=', 'truck_models.id')
                ->leftJoin('truck_categories', 'trucks.truck_category_id', '=', 'truck_categories.id')
                ->leftJoin('trailer_types', 'trucks.trailer_type_id', '=', 'trailer_types.id')
                ->leftJoin('trailer_models', 'trucks.trailer_model_id', '=', 'trailer_models.id')
                ->select('trucks.*', 'users.name as user_name', 'truck_brands.name as truck_brand_name', 'truck_models.name as truck_model_name', 'truck_categories.ru_name as truck_categories_name', 'trailer_types.name as trailer_type_name', 'trailer_models.name as trailer_model_name', 'trucks.own as truck_own')
                ->orderBy('trucks.created_at', 'desc');
            if ($request->has('limit')) {
                $query->limit($request->input('limit'));
            }
            $cur_page = 0;
            $last_page = 0;
            $trucks=[];
            if ($request->has('page')) {
                $trucks =  $query->paginate(100);
                $cur_page = $trucks->currentPage();
                $last_page = $trucks->lastPage();
                $trucks = $trucks->items();
            } else {
  
                $trucks =  $query->get();
            }
            if (empty($trucks)) {
                return response()->json([
                    'status' => false,
                    'message' => "No trucks found"
                ], 404);
            }
            return response()->json([
                'status' => true,
                'message' => "Truck found",
                "data" => $trucks,
                "current_page" => $cur_page,
                "last_page" => $last_page,
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Retrieving Truck: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function deleteTruck(Request $request)
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
            'id' => 'required|integer'
        ]);
        $truck = Truck::find($validate['id']);
        if ($truck) {
            $truck->delete();
            return response()->json([
                'status' => true,
                'message' => "Truck deleted successfully"
            ], 200);
        } else {
            return response()->json([
                'status' => false,
                'message' => "Truck not found"
            ], 404);
        }
    }

    public function attachTruckUser(Request $request)
    {
        $validate = $request->validate([
            'user_id' => 'required|integer',
            'truck_id' => 'required|integer'
        ]);
        $truck = Truck::find($validate['truck_id']);
        $user = User::find($validate['user_id']);
        if ($truck && $user) {
            $user->trucks()->syncWithoutDetaching([$truck->id]);
            return response()->json([
                'status' => true,
                'message' => "Truck attached to user successfully"
            ], 200);
        } else {
            return response()->json([
                'status' => false,
                'message' => "Truck or user not found"
            ], 404);
        }
    }
    public function detachTruckUser(Request $request)
    {
        $validate = $request->validate([
            'user_id' => 'required|integer',
            'truck_id' => 'required|integer'
        ]);
        $truck = Truck::find($validate['truck_id']);
        $user = User::find($validate['user_id']);
        if ($truck && $user) {
            $user->trucks()->detach([$truck->id]);
            return response()->json([
                'status' => true,
                'message' => "Truck detached from user successfully"
            ], 200);
        } else {
            return response()->json([
                'status' => false,
                'message' => "Truck or user not found"
            ], 404);
        }
    }
    public function getTruckByUser(Request $request)
    {
        $validate = $request->validate([
            'user_id' => 'required|integer'
        ]);
        $user = User::find($validate['user_id']);
        if ($user) {
            $trucks = $user->trucks()
            ->leftJoin('truck_brands', 'trucks.truck_brand_id', '=', 'truck_brands.id')
            ->leftJoin('truck_models', 'trucks.truck_model_id', '=', 'truck_models.id')
            ->leftJoin('truck_categories', 'trucks.truck_category_id', '=', 'truck_categories.id')
            ->leftJoin('trailer_types', 'trucks.trailer_type_id', '=', 'trailer_types.id')
            ->leftJoin('trailer_models', 'trucks.trailer_model_id', '=', 'trailer_models.id')
            ->select(
                'trucks.*',
                'truck_brands.name as truck_brand_name',
                'truck_models.name as truck_model_name',
                'truck_categories.ru_name as truck_categories_name',
                'trailer_types.name as trailer_type_name',
                'trailer_models.name as trailer_model_name'
            )
            ->orderBy('trucks.created_at', 'desc')
            ->get();

            return response()->json([
                'status' => true,
                'message' => "Trucks found",
                "data" => $trucks
            ], 200);
        } else {
            return response()->json([
                'status' => false,
                'message' => "User not found"
            ], 404);
        }
    }


    public function searchByPlate(Request $request)
    {
        $data = $request->validate([
            'plate_number' => 'required|string|max:255',
        ]);

        // нормализация: убираем пробелы, lowercase
        $normalized = mb_strtolower(str_replace(' ', '', $data['plate_number']));

        $truck = Truck::whereRaw("REPLACE(LOWER(plate_number), ' ', '') LIKE ?", ["%$normalized%"])
            ->leftJoin('truck_brands', 'trucks.truck_brand_id', '=', 'truck_brands.id')
            ->leftJoin('truck_models', 'trucks.truck_model_id', '=', 'truck_models.id')
            ->leftJoin('truck_categories', 'trucks.truck_category_id', '=', 'truck_categories.id')
            ->leftJoin('trailer_types', 'trucks.trailer_type_id', '=', 'trailer_types.id')
            ->leftJoin('trailer_models', 'trucks.trailer_model_id', '=', 'trailer_models.id')
            ->select([
                'trucks.id',
                'trucks.plate_number',
                'trucks.color',
                'trucks.vin',
                'truck_brands.name as truck_brand_name',
                'truck_models.name as truck_model_name',
                'truck_categories.ru_name as truck_category_name',
                'trailer_types.name as trailer_type_name',
                'trailer_models.name as trailer_model_name',
            ])
            ->first();

        if ($truck) {
            return response()->json([
                'found' => true,
                'data'  => $truck,
            ], 200);
        }

        return response()->json([
            'found' => false,
        ], 200);
    }

    public function getCategories()
    {
        $categories = TruckCategory::orderBy('name')->get();

        return response()->json([
            'status' => true,
            'message' => 'Категории грузовиков загружены',
            'data' => $categories,
        ], 200);
    }

}
