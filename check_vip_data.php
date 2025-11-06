<?php
require __DIR__.'/vendor/autoload.php';

$app = require_once __DIR__.'/bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

echo "=== Проверка VIP грузовиков ===\n\n";

// Проверяем грузовики с VIP
$trucks = DB::table('trucks')
    ->select('id', 'plate_number', 'vip_level')
    ->whereIn('vip_level', [1, 2])
    ->get();

echo "Найдено VIP грузовиков: " . $trucks->count() . "\n\n";

foreach ($trucks as $truck) {
    echo "ID: {$truck->id} | Номер: {$truck->plate_number} | VIP: {$truck->vip_level}\n";
}

echo "\n=== Проверка посетителей ===\n\n";

// Проверяем последних посетителей
$visitors = DB::table('visitors')
    ->leftJoin('trucks', 'visitors.truck_id', '=', 'trucks.id')
    ->select(
        'visitors.id',
        'visitors.plate_number',
        'visitors.truck_id',
        'trucks.vip_level as truck_vip_level'
    )
    ->orderBy('visitors.id', 'desc')
    ->limit(10)
    ->get();

echo "Последние 10 посетителей:\n\n";

foreach ($visitors as $visitor) {
    echo "Visitor ID: {$visitor->id} | Номер: {$visitor->plate_number} | truck_id: " . 
         ($visitor->truck_id ?? 'NULL') . " | VIP: " . ($visitor->truck_vip_level ?? 'NULL') . "\n";
}

echo "\n=== Проверка конкретных номеров ===\n\n";

$testNumbers = ['777SL05', '027DVA09', '101SID16'];

foreach ($testNumbers as $number) {
    $truck = DB::table('trucks')
        ->where('plate_number', 'LIKE', '%' . str_replace(' ', '', $number) . '%')
        ->first();
    
    if ($truck) {
        echo "Номер: {$number} | truck_id: {$truck->id} | VIP: {$truck->vip_level}\n";
        
        $visitor = DB::table('visitors')
            ->where('plate_number', 'LIKE', '%' . $number . '%')
            ->orderBy('id', 'desc')
            ->first();
        
        if ($visitor) {
            echo "  -> Visitor truck_id: " . ($visitor->truck_id ?? 'NULL') . "\n";
        }
    } else {
        echo "Номер: {$number} | НЕ НАЙДЕН в trucks\n";
    }
    echo "\n";
}
