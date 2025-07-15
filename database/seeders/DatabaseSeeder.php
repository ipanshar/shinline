<?php

namespace Database\Seeders;

use App\Models\DssApi;
use App\Models\DssSetings;
use App\Models\Role;
use App\Models\Status;
use App\Models\StatuseWeighing;
use App\Models\TrailerType;
use App\Models\Truck;
use App\Models\TruckBrand;
use App\Models\TruckCategory;
use App\Models\TruckModel;
use App\Models\User;
use App\Models\Yard;
// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

        // User::factory()->create([
        //     'name' => 'Админ',
        //     'login' => 'admin',
        //     'password' => Hash::make('admin'),
        //     'email' => 'admin@example.com',
        // ]);

        // Role::create([
        //     'name' => 'Администратор',
        // ]);
        // Role::create([
        //     'name' => 'Интегратор',
        // ]);
        // Role::create([
        //     'name' => 'Оператор',
        // ]);
        // Role::create([
        //     'name' => 'Охрана',
        // ]);
        // User::where('login', 'admin')->first()->roles()->attach(Role::where('name', 'Администратор')->first());
        // Status::create([
        //     'name' => 'Новый', 'key' => 'new'
        // ]);
        // Status::create([
        //     'name' => 'В работе', 'key' => 'in_work'
        // ]);
        // Status::create([
        //     'name' => 'Завершен', 'key' => 'completed'
        // ]);
        // Status::create([
        //     'name' => 'Отменен', 'key' => 'canceled'
        // ]);
        // Status::create([
        //     'name' => 'На доработке', 'key' => 'on_rework'
        // ]);
        // Status::create([
        //     'name' => 'На согласовании', 'key' => 'on_approval'
        // ]);
        // Status::create([
        //     'name' => 'На погрузке', 'key' => 'on_loading'
        // ]);
        // Status::create([
        //     'name' => 'На выгрузке', 'key' => 'on_unloading'
        // ]);
        // Status::create([
        //     'name' => 'На складе', 'key' => 'on_warehouse'
        // ]);
        // Status::create([
        //     'name' => 'На доставке', 'key' => 'on_delivery'
        // ]);
        // Status::create([
        //     'name' => 'На возврате', 'key' => 'on_return'
        // ]);
        // Status::create([
        //     'name' => 'На ремонте', 'key' => 'on_repair'
        // ]);
        // Status::create([
        //     'name' => 'Покинул территорию', 'key' => 'left_territory'
        // ]);
        // Status::create([
        //     'name' => 'На територии', 'key' => 'on_territory'
        // ]);
        // Status::create([
        //     'name' => 'Ожидает погрузки', 'key' => 'waiting_loading'
        // ]);
        // Status::create([
        //     'name' => 'Ожидает выгрузки', 'key' => 'waiting_unloading'
        // ]);
        // Status::create([
        //     'name' => 'Ожидает на складе', 'key' => 'waiting_warehouse'
        // ]);
        // Status::create([
        //     'name' => 'Ожидает на доставке', 'key' => 'waiting_delivery'
        // ]);
        // Status::create([
        //     'name' => 'Ожидает на возврате', 'key' => 'waiting_return'
        // ]);
        // Status::create([
        //     'name' => 'На взвешивании', 'key' => 'on_weighing'
        // ]);
        // Status::create([
        //     'name' => 'Активный ', 'key' => 'active'
        //  ]);
        // Status::create([
        //     'name' => 'Не активный', 'key' => 'not_active'
        // ]);

        // TrailerType::create([
        //     'name' => 'Тент',
        // ]);
        // TrailerType::create([
        //     'name' => 'Рефрижератор',
        // ]);
        // TrailerType::create([
        //     'name' => 'Изотерм',
        // ]);
        // TrailerType::create([
        //     'name' => 'Цистерна',
        // ]);

        // TrailerType::create([
        //     'name' => 'Термос',
        // ]);

        // TruckBrand::create(['name' => 'Mercedes-Benz']);
        // TruckBrand::create(['name' =>'Hyundai']);
        // TruckBrand::create(['name' =>'Scania']);
        // TruckBrand::create(['name' =>'DAF']);
        // TruckBrand::create(['name' =>'Renault']);
        // TruckBrand::create(['name' =>'Volvo']);
        // TruckBrand::create(['name' =>'Iveco']);
        // TruckBrand::create(['name' =>'MAN']);
        // TruckBrand::create(['name' =>'Kamaz']);
        // TruckBrand::create(['name' =>'KraZ']);
        // TruckBrand::create(['name' =>'Maz']);
        // TruckBrand::create(['name' =>'Tatra']);
        // TruckBrand::create(['name' =>'Isuzu']);
        // TruckBrand::create(['name' =>'Hino']);
        // TruckBrand::create(['name' =>'Fuso']);
        // TruckBrand::create(['name' =>'Nissan']);
        // TruckBrand::create(['name' =>'Mitsubishi']);
        // TruckBrand::create(['name' =>'Toyota']);
        // TruckBrand::create(['name' =>'Chevrolet']);
        // TruckBrand::create(['name' =>'Ford']);
        // TruckBrand::create(['name' =>'GMC']);
        // TruckBrand::create(['name' =>'Reno']);
        // TruckBrand::create(['name' =>'Pageot']);
        // TruckBrand::create(['name' =>'Panav']);
        // TruckBrand::create(['name' =>'Schmitz']);
        // TruckBrand::create(['name' =>'Geusens']);
        // TruckBrand::create(['name' =>'FAW']);

        // StatuseWeighing::create(['name' => 'До погрузки']);
        // StatuseWeighing::create(['name' => 'После погрузки']);
        // StatuseWeighing::create(['name' => 'До выгрузки']);
        // StatuseWeighing::create(['name' => 'После выгрузки']);

        // TruckCategory::create(['name' => 'Sedan', 'ru_name' => 'Седан']);
        // TruckCategory::create(['name' => 'Hatchback', 'ru_name' => 'Хэтчбек']);
        // TruckCategory::create(['name' => 'SUV', 'ru_name' => 'Внедорожник']);
        // TruckCategory::create(['name' => 'Truck', 'ru_name' => 'Грузовик']);
        // TruckCategory::create(['name' => 'Van', 'ru_name' => 'Фургон']);
        // TruckCategory::create(['name' => 'Bus', 'ru_name' => 'Автобус']);
        // TruckCategory::create(['name' => 'Coupe', 'ru_name' => 'Купе']);
        // TruckCategory::create(['name' => 'Convertible', 'ru_name' => 'Кабриолет']);
        // TruckCategory::create(['name' => 'Wagon', 'ru_name' => 'Универсал']);
        // TruckCategory::create(['name' => 'Pickup', 'ru_name' => 'Пикап']);
        // TruckCategory::create(['name' => 'Crossover', 'ru_name' => 'Кроссовер']);
        // TruckCategory::create(['name' => 'Limousine', 'ru_name' => 'Лимузин']);
        // TruckCategory::create(['name' => 'Microbus', 'ru_name' => 'Микроавтобус']);
        // TruckCategory::create(['name' => 'Minivan', 'ru_name' => 'Минивэн']);
        // TruckCategory::create(['name' => 'Roadster', 'ru_name' => 'Родстер']);
        // TruckCategory::create(['name' => 'Sport', 'ru_name' => 'Спорткар']);
        // TruckCategory::create(['name' => 'MPV', 'ru_name' => 'Многоцелевой автомобиль']);
        // TruckCategory::create(['name' => 'Large Truck', 'ru_name' => 'Большой грузовик']);
        // TruckCategory::create(['name' => 'Heavy Truck', 'ru_name' => 'Тяжелый грузовик']);
        // TruckCategory::create(['name' => 'Light Truck', 'ru_name' => 'Легкий грузовик']);   
        // TruckCategory::create(['name' => 'Medium Truck', 'ru_name' => 'Средний грузовик']);
        // TruckCategory::create(['name' => 'Flatbed Truck', 'ru_name' => 'Плоский грузовик']);
        // TruckCategory::create(['name' => 'Box Truck', 'ru_name' => 'Бортовой грузовик']);
        // TruckCategory::create(['name' => 'Reefer Truck', 'ru_name' => 'Рефрижераторный грузовик']);
        // TruckCategory::create(['name' => 'Tanker Truck', 'ru_name' => 'Цистерна']);
        // TruckCategory::create(['name' => 'Dump Truck', 'ru_name' => 'Самосвал']);
        // TruckCategory::create(['name' => 'Tow Truck', 'ru_name' => 'Эвакуатор']);
        // TruckCategory::create(['name' => 'Garbage Truck', 'ru_name' => 'Мусоровоз']);
        // TruckCategory::create(['name' => 'Fire Truck', 'ru_name' => 'Пожарная машина']);
        // TruckCategory::create(['name' => 'Ambulance', 'ru_name' => 'Скорая помощь']);

       // Yard::create(['name' => 'Шин-Лайн Байсерке']);

    //   $dssAdd =  DssSetings::create([
    //         'base_url' => 'http://10.210.0.250',
    //         'user_name' => 'system',
    //         'password' => 'Aa1834865',
    //         'client_type' => 'WINPC_V2']);

    //     DssApi::create([
    //         'api_name' => 'Authorize',
    //         'method' => 'POST',
    //         'request_url' => '/brms/api/v1.0/accounts/authorize',
    //         'dss_setings_id' => $dssAdd->id,
    //     ]);
    //      DssApi::create([
    //         'api_name' => 'KeepAlive',
    //         'method' => 'PUT',
    //         'request_url' => '/brms/api/v1.0/accounts/keepalive',
    //         'dss_setings_id' => $dssAdd->id,
    //     ]);
    //      DssApi::create([
    //         'api_name' => 'UpdateToken',
    //         'method' => 'POST',
    //         'request_url' => '/brms/api/v1.0/accounts/updateToken',
    //         'dss_setings_id' => $dssAdd->id,
    //     ]);
    //      DssApi::create([
    //         'api_name' => 'Unauthorize',
    //         'method' => 'POST',
    //         'request_url' => '/brms/api/v1.0/accounts/unauthorize',
    //         'dss_setings_id' => $dssAdd->id,
    //     ]);
    DssApi::create([
        'api_name' => 'VehicleCapture',
        'method' => 'POST',
        'request_url' => '/ipms/api/v1.1/entrance/vehicle-capture/record/fetch/page',
        'dss_setings_id' => 1,
    ]);
    }
}
