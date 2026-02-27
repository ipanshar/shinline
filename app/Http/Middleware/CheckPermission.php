<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckPermission
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     * @param  string  $permission
     */
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $user = $request->user();

        if (!$user) {
            // Для API запросов - JSON, для Inertia - редирект
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json([
                    'status' => false,
                    'message' => 'Unauthorized',
                ], 401);
            }
            return redirect()->route('login');
        }

        if (!$user->hasPermission($permission)) {
            // Для API запросов - JSON, для Inertia - редирект с сообщением
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json([
                    'status' => false,
                    'message' => 'У вас нет разрешения: ' . $permission,
                ], 403);
            }
            // Для Inertia-страниц редирект на dashboard с сообщением об ошибке
            return redirect()->route('dashboard')->with('error', 'У вас нет доступа к этой странице');
        }

        return $next($request);
    }
}
