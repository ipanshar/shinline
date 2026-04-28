<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class TelegramMiniAppCors
{
    /**
     * Handle an incoming request for Telegram Mini App.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $headers = [
            'Access-Control-Allow-Origin'  => '*',
            'Access-Control-Allow-Methods' => 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers' => 'Content-Type, X-Telegram-Init-Data, X-Requested-With',
            'Access-Control-Max-Age'       => '3600',
            // Намеренно НЕ устанавливаем Allow-Credentials, т.к. несовместимо с Allow-Origin: *
        ];

        // Preflight нужно обработать ДО вызова контроллера
        if ($request->getMethod() === 'OPTIONS') {
            return response('', 204, $headers);
        }

        $response = $next($request);

        foreach ($headers as $key => $value) {
            $response->headers->set($key, $value);
        }

        return $response;
    }
}
