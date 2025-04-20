<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\TaskLoading;
use App\Models\TaskWeighing;
use Illuminate\Http\Request;

class TaskCotroller extends Controller
{
    public function getTasks(Request $request){
        try{
        $tasks = Task::query();
        if ($request->has('status_id')) {
            $tasks->where('status_id', $request->status_id);
        }
        if ($request->has('yard_id')) {
            $tasks->where('yard_id', $request->yard_id);
        }
        if ($request->has('user_id')) {
            $tasks->where('user_id', $request->user_id);
        }
        if ($request->has('truck_id')) {
            $tasks->where('truck_id', $request->truck_id);
        }
        if ($request->has('avtor')) {
            $tasks->where('avtor', $request->avtor);
        }
        if ($request->has('address')) {
            $tasks->where('address', 'like', '%' . $request->address . '%');
        }
        if ($request->has('phone')) {
            $tasks->where('phone', 'like', '%' . $request->phone . '%');
        }
        if ($request->has('plan_date')) {
            $tasks->where('plan_date', '>=', $request->plan_date);
        }
        if ($request->has('begin_date')) {
            $tasks->where('begin_date', '>=', $request->begin_date);
        }
        if ($request->has('end_date')) {
            $tasks->where('end_date', '<=', $request->end_date);
        }
        if ($request->has('search')) {
            $tasks->where(function($query) use ($request) {
                $query->where('name', 'like', '%' . $request->search . '%')
                      ->orWhere('description', 'like', '%' . $request->search . '%');
            });
        }
        $tasks->leftJoin('statuses', 'tasks.status_id', '=', 'statuses.id')
            ->leftJoin('users', 'tasks.user_id', '=', 'users.id')
            ->leftJoin('trucks', 'tasks.truck_id', '=', 'trucks.id')
            ->leftJoin('yards', 'tasks.yard_id', '=', 'yards.id')
            ->select('tasks.*', 'statuses.name as status_name','users.name as user_name', 'users.phone as user_phone','trucks.plate_number as truck_plate_number', 'yards.name as yard_name')
            ->orderBy('tasks.created_at', 'desc')
            ->get();
        if ($tasks->isEmpty()) {
            return response()->json([
                'status' => false,
                'message' => 'No tasks found',
                'data' => []
            ], 404);
        }
        $data = [];
        foreach ($tasks as $task) {
            $taskLoading = TaskLoading::query()
                ->where('task_id', $task->id)
              ->leftJoin('warehouses', 'task_loadings.warehouse_id', '=', 'warehouses.id')
              ->leftJoin('warehouse_gates', 'task_loadings.warehouse_gate_plan_id', '=', 'warehouse_gates.id')
              ->leftJoin('warehouse_gates', 'task_loadings.warehouse_gate_fact_id', '=', 'warehouse_gates.id')
              ->select('task_loadings.*', 'warehouses.name as warehouse_name', 'warehouse_gates.name as warehouse_gate_name')
                ->get();
            $taskWeighing = TaskWeighing::query()
                ->where('task_id', $task->id)
                ->leftJoin('statuse_weighings', 'task_weighings.statuse_weighing_id', '=', 'statuse_weighings.id')
                ->select('task_weighings.*', 'statuse_weighings.name as statuse_weighing_name')
                ->get();

                array_push($data, [
                    'id' => $task->id,
                    'name' => $task->name,
                    'user_id' => $task->user_id,
                    'user_name' => $task->user_name,
                    'user_phone' => $task->user_phone,
                    'status_name' => $task->status_name,
                    'status_id' => $task->status_id,
                    'truck_id' => $task->truck_id,
                    'avtor' => $task->avtor,
                    'description' => $task->description,
                    'address' => $task->address,
                    'phone' => $task->phone,
                    'plan_date' => $task->plan_date,
                    'begin_date' => $task->begin_date,
                    'end_date' => $task->end_date,
                    'yard_id' => $task->yard_id,
                    'status_name' => $task->status_name,
                    'truck_plate_number' => $task->truck_plate_number,
                    'yard_name' => $task->yard_name,
                    'created_at' => $task->created_at,
                    'task_loadings' => $taskLoading,
                    'task_weighings' => $taskWeighing,
                    
            ]);
        
            
        }
        return response()->json([
            'status' => true,
            'message' => 'Tasks retrieved successfully',
            'data' => $data,
        ], 200);
        }
        catch(\Exception $e){
            return response()->json([
                'status' => false,
                'message' => 'Error Retrieving Tasks: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function addTask(Request $request){
        try{
            $validate = $request->validate([
                'name' => 'required|string|max:255',
                'description' => 'string|max:255',
                'address' => 'string|max:255',
                'phone' => 'string|max:255',
                'plan_date' => 'date',
                'begin_date' => 'date',
                'end_date' => 'date',
                'yard_id' => 'required|integer',
                'user_id' => 'required|integer',
                'truck_id' => 'required|integer',
                'status_id' => 'required|integer',
            ]);
            $task = Task::create($validate);
            
            $task->save();
            $taskLoading = TaskLoading::create([
                'task_id' => $task->id,
                'warehouse_id' => $request->warehouse_id,
                'warehouse_gate_plan_id' => $request->warehouse_gate_plan_id,
                'warehouse_gate_fact_id' => $request->warehouse_gate_fact_id,
            ]);
            $taskLoading->save();
            $taskWeighing = TaskWeighing::create([
                'task_id' => $task->id,
                'statuse_weighing_id' => $request->statuse_weighing_id,
            ]);
            return response()->json([
                'status' => true,
                'message' => 'Task created successfully',
                'data' => $validate
            ], 200);
        }
        catch(\Exception $e){
            return response()->json([
                'status' => false,
                'message' => 'Error Creating Task: ' . $e->getMessage(),
            ], 500);
        }
    }
}
