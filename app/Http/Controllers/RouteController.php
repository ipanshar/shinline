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
    public function statistics(){
        return Inertia::render('Statisticspage');
    }
    public function warehouseGate(){
        return Inertia::render('warehouseGate');
    }
     public function warehouseKPP(){
        return Inertia::render('warehouseKPP');
    }
    public function dssSettings(){
        return Inertia::render('integration_dss_settings');
    }
    public function dssDevices(){
        return Inertia::render('integration_dss_devices');
    }
    public function dssZones(){
        return Inertia::render('integration_dss_zones');
    }
    public function taskHourlySchedule(){
        return Inertia::render('tasks/HourlySchedule');
    }
    public function operatorWorkplace(){
        return Inertia::render('tasks/OperatorWorkplace');
    }
    public function privacy(){
        return Inertia::render('privacy');
    }
    public function whatsappBusinessSettings(){
        return Inertia::render('integration_whatsapp_business');
    }

}
