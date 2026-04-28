<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
    <title>Shin-Line</title>
    <style>
        * { box-sizing: border-box; }
        html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 16px;
            color: #222222;
            -webkit-text-size-adjust: 100%;
        }
        #telegram-app {
            min-height: 100vh;
        }
        #tg-loading {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            font-size: 16px;
            color: #555;
        }
    </style>
    {{-- Telegram SDK FIRST — до любых скриптов --}}
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
</head>
<body>
    <div id="telegram-app">
        <div id="tg-loading" style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-size:16px;color:#555;">Загрузка…</div>
    </div>

    {{-- Перехватчик JS-ошибок — показывает их на экране (помогает отлаживать на мобильном) --}}
    <script>
        window.onerror = function(msg, src, line, col, err) {
            var el = document.getElementById('telegram-app');
            if (el) {
                el.innerHTML =
                    '<div style="padding:16px;font-family:sans-serif;">' +
                    '<p style="color:#c0392b;font-weight:bold;margin:0">JS Error</p>' +
                    '<p style="color:#c0392b;margin:8px 0 0">' + msg + '</p>' +
                    '<p style="font-size:12px;color:#888;margin:4px 0 0">' + src + ':' + line + '</p>' +
                    '<p style="font-size:12px;color:#888;margin:4px 0 0">TG SDK: ' + (window.Telegram ? "OK" : "NOT LOADED") + '</p>' +
                    '</div>';
            }
        };
        window.onunhandledrejection = function(e) {
            var el = document.getElementById('telegram-app');
            if (el) {
                el.innerHTML =
                    '<div style="padding:16px;font-family:sans-serif;">' +
                    '<p style="color:#c0392b;font-weight:bold;margin:0">Promise Error</p>' +
                    '<p style="color:#c0392b;margin:8px 0 0">' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)) + '</p>' +
                    '</div>';
            }
        };
    </script>

    @vite(['resources/js/telegram-miniapp.tsx'])

    <noscript>
        <div style="padding:16px;font-family:sans-serif;color:#c0392b;">
            Включите JavaScript для работы Mini App.
        </div>
    </noscript>
</body>
</html>
