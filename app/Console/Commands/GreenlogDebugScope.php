<?php

namespace App\Console\Commands;

use App\Models\Greenlog\Location;
use App\Models\Greenlog\Plant;
use App\Models\User;
use App\Support\Greenlog\ResolvesGreenlogCompany;
use Illuminate\Console\Command;

class GreenlogDebugScope extends Command
{
    use ResolvesGreenlogCompany;

    protected $signature = 'greenlog:debug-scope {--user= : User id to inspect; if omitted, console auth falls back to default company}';

    protected $description = 'Show GreenLog effective company scope and scoped data counts.';

    public function handle(): int
    {
        $userId = $this->option('user');
        $user = $userId ? User::query()->find($userId) : auth()->user();

        if ($userId && ! $user) {
            $this->error("User #{$userId} not found.");

            return self::FAILURE;
        }

        $companyKey = $this->companyKeyForUser($user);

        $this->table(['Metric', 'Value'], [
            ['current user id', $user?->id ?? 'none'],
            ['user company', $user?->company ?: 'null'],
            ['effective company key', $companyKey],
            ['count greenlog_locations', Location::query()->where('company_key', $companyKey)->count()],
            ['count greenlog_plants', Plant::query()->where('company_key', $companyKey)->count()],
            ['total greenlog_locations', Location::query()->count()],
            ['total greenlog_plants', Plant::query()->count()],
        ]);

        return self::SUCCESS;
    }
}
