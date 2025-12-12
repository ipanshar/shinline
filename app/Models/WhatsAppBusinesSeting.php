<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WhatsAppBusinesSeting extends Model
{
    protected $fillable = [
        'phone_number_id',
        'waba_id',
        'business_account_id',
        'bearer_token',
        'host',
        'version',
        'is_active',
        'label',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    /**
     * Получить активную настройку WhatsApp
     */
    public static function getActive()
    {
        return self::where('is_active', true)->first() ?? self::first();
    }

    /**
     * Получить все настройки в формате для API
     */
    public static function getAllForApi()
    {
        $settings = self::all();
        if ($settings->isEmpty()) {
            return null;
        }

        // Группируем глобальные настройки (берём из первой записи)
        $first = $settings->first();
        
        return [
            'host' => $first->host,
            'version' => $first->version,
            'numbers' => $settings->map(function ($setting) {
                return [
                    'id' => (string) $setting->id,
                    'phone_number_id' => $setting->phone_number_id,
                    'waba_id' => $setting->waba_id,
                    'business_account_id' => $setting->business_account_id,
                    'bearer_token' => $setting->bearer_token,
                    'is_active' => $setting->is_active,
                    'label' => $setting->label,
                ];
            })->toArray(),
        ];
    }
}
