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
        $response = $next($request);

        // Разрешаем запросы из Telegram Mini App контекста
        $response->headers->set('Access-Control-Allow-Origin', '*');
        $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        $response->headers->set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Telegram-Init-Data');
        $response->headers->set('Access-Control-Max-Age', '3600');
        $response->headers->set('Access-Control-Allow-Credentials', 'true');

        // Для preflight запросов
        if ($request->getMethod() === 'OPTIONS') {
            return response('', 200)->withHeaders($response->headers->all());
        }

        return $response;
    }
}
