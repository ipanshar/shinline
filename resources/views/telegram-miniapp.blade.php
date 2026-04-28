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
        <div id="tg-loading">Загрузка…</div>
    </div>
    @vite(['resources/js/telegram-miniapp.tsx'])
</body>
</html>
