<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Yard;
use Illuminate\Support\Facades\Auth;

class YardCotroller extends Controller
{
   public function getYards(Request $request)
   {
    
    $yards = Yard::all();
    return response()->json([
        'status' => true,
        'message' => 'Yards retrieved successfully',
        'data' => $yards
    ]);
   }

    public function addYard(Request $request)
    {
     try{
     $request->validate([
          'name' => 'required|string|max:255',
     ]);
    
     $yard = Yard::create([
          'name' => $request->name,
     ]);
    
     return response()->json([
          'status' => true,
          'message' => 'Yard created successfully',
          'data' => $yard
     ], 200);}
     catch(\Exception $e){
          return response()->json([
               'status' => false,
               'message' => 'Error Creating Yard: ' . $e->getMessage(),
          ], 500);
     }
    }

    public function updateYard(Request $request)
    {
     try{
     $request->validate([
          'id' => 'required|integer|exists:yards,id',
          'name' => 'required|string|max:255',
          'strict_mode' => 'nullable|boolean',
          'weighing_required' => 'nullable|boolean',
     ]);
    
     $yard = Yard::find($request->id);
     $updateData = ['name' => $request->name];
     
     // Обновляем strict_mode если передан
     if ($request->has('strict_mode')) {
          $updateData['strict_mode'] = $request->strict_mode;
     }
     
     // Обновляем weighing_required если передан
     if ($request->has('weighing_required')) {
          $updateData['weighing_required'] = $request->weighing_required;
     }
     
     $yard->update($updateData);
    
     return response()->json([
          'status' => true,
          'message' => 'Yard updated successfully',
          'data' => $yard
     ],200);
     }catch(\Exception $e){
          return response()->json([
               'status' => false,
               'message' => 'Error Updating Yard: ' . $e->getMessage(),
          ], 500);
     }
    }
    public function deleteYard(Request $request)
    {
     $user = Auth::user();
     if (!$user) {
         return response()->json(['message' => 'Unauthorized'], 401);
     }
     $userRole = $user->roles->pluck('name');
     if (!$userRole->contains('Администратор')) {
         return response()->json(['message' => 'Forbidden'], 403);
     }
     $request->validate([
          'id' => 'required|integer|exists:yards,id',
     ]);
    
     $yard = Yard::find($request->id);
     $yard->delete();
    
     return response()->json([
          'status' => true,
          'message' => 'Yard deleted successfully',
     ]);
    }
    public function getYardById($yardName)
    {
     if ($yardName == null){
         return null;  
     }
     $yard = Yard::where('name', '=', $yardName )->first();
     if (!$yard) {
         $yard = Yard::create([
             'name' => $yardName,
         ]);
     }
     return $yard;
    }
}

