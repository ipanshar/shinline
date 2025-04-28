<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;

class RouteController extends Controller
{
    public function rolespermissions(){
        return Inertia::render('rolespermissions');
    }
    public function trucks(){
        return Inertia::render('trucks');
    }
    public function tasks(){
        return Inertia::render('tasks');
    }
    public function weighing(){
        return Inertia::render('weighing');
    }
    public function check(){
        return Inertia::render('check');
    }
    public function history(){
        return Inertia::render('history');
    }
    public function warehouses(){
        return Inertia::render('warehouses');
    }
    public function integration_dss(){
        return Inertia::render('integration_dss');
    }
    public function chat(){
        return Inertia::render('chat');
    }


}
