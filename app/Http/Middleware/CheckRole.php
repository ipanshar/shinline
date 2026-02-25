<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckRole
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     * @param  string  ...$roles  Одна или несколько ролей
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'status' => false,
                'message' => 'Unauthorized',
            ], 401);
        }

        // Администратор имеет доступ ко всему
        if ($user->isAdmin()) {
            return $next($request);
        }

        // Проверяем наличие хотя бы одной из указанных ролей
        if (!$user->hasAnyRole($roles)) {
            return response()->json([
                'status' => false,
                'message' => 'У вас нет необходимой роли',
            ], 403);
        }

        return $next($request);
    }
}
