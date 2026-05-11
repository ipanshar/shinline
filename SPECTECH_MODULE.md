# Spectech Module (Laravel + Inertia)

## What was added

- Backend model: `app/Models/SpectechRequest.php`
- Backend API controller: `app/Http/Controllers/Api/SpectechRequestController.php`
- Migration: `database/migrations/2026_05_08_100000_create_spectech_requests_table.php`
- Local-only demo users seeder: `database/seeders/LocalDemoUsersSeeder.php`
- Web routes + API routes: `routes/web.php`
- Inertia page methods: `app/Http/Controllers/RouteController.php`
- Sidebar menu group: `resources/js/components/app-sidebar.tsx`
- Frontend pages:
  - `resources/js/pages/spectech/catalog.tsx`
  - `resources/js/pages/spectech/requests.tsx`
  - `resources/js/pages/spectech/dashboard.tsx`
  - `resources/js/pages/spectech/locations.tsx`
- Frontend components:
  - `resources/js/components/spectech/NewRequestModal.tsx`
  - `resources/js/components/spectech/RequestCard.tsx`
  - `resources/js/components/spectech/MOCK_LOCATIONS.ts`

## RBAC permissions

Added in `database/seeders/PermissionsSeeder.php`:

- `spectech.view`
- `spectech.manage`

Default assignment:

- `Оператор`: `spectech.view`, `spectech.manage`
- `Снабженец`: `spectech.view`

## Routes

Web:

- `GET /spectech/catalog`
- `GET /spectech/requests`
- `GET /spectech/dashboard`
- `GET /spectech/locations`

API:

- `GET /spectech/api/requests`
- `POST /spectech/api/requests`
- `PATCH /spectech/api/requests/{id}/status`

## Local run checklist

1. Run migration for `spectech_requests`
2. Reseed permissions
3. Create local demo users only when needed
3. Build/check frontend types

Commands:

```zsh
cd /Users/akim/Desktop/shinline
php artisan migrate
php artisan db:seed --class=PermissionsSeeder
php artisan db:seed --class=LocalDemoUsersSeeder
npm install
npm run types
```

### Local demo users

Created only when you run the seeder manually:

- `admin` / `admin123` — Administrator
- `operator` / `operator123` — Operator
- `client` / `client123` — Supply role for testing access

This seeder is **not** called from `DatabaseSeeder`, so it stays local and manual.

## Notes

- `MOCK_LOCATIONS` stays hardcoded by design for now.
- Request creation supports up to 3 images as base64; backend stores them on `public` disk and returns URLs.


