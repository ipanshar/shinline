<?php

namespace App\Models\Greenlog;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Plant extends Model
{
    protected $table = 'greenlog_plants';

    protected $fillable = [
        'company_key',
        'created_by_user_id',
        'inventory_number',
        'name',
        'biological_name',
        'category',
        'status',
        'location_id',
        'species_id',
        'quantity',
        'unit_cost',
        'total_cost',
        'cost_source',
        'branch',
        'office',
        'room',
        'responsible_person',
        'plant_type',
        'height_value',
        'height_unit',
        'trunk_diameter_value',
        'trunk_diameter_unit',
        'condition_text',
        'gps_coordinates',
        'last_inspection_date',
        'condition_notes',
        'acquisition_date',
        'last_inventory_date',
        'watering_frequency_days',
        'fertilizing_frequency_days',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'unit_cost' => 'decimal:2',
            'total_cost' => 'decimal:2',
            'height_value' => 'decimal:2',
            'trunk_diameter_value' => 'decimal:2',
            'watering_frequency_days' => 'integer',
            'fertilizing_frequency_days' => 'integer',
            'last_inspection_date' => 'date',
            'acquisition_date' => 'date',
            'last_inventory_date' => 'date',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (self $plant): void {
            $plant->syncCostFields();
        });
    }

    public static function defaultUnitCostForCategory(?string $category): string
    {
        $normalized = mb_strtolower(trim((string) $category));

        if ($normalized === '') {
            return '50000.00';
        }

        if (
            str_contains($normalized, 'indoor')
            || str_contains($normalized, 'office')
            || str_contains($normalized, 'room')
            || str_contains($normalized, 'комнат')
        ) {
            return '5000.00';
        }

        return '50000.00';
    }

    private function syncCostFields(): void
    {
        $quantity = (float) ($this->quantity ?? 1);
        $manualUnitCost = (
            ($this->isDirty('unit_cost') && $this->unit_cost !== null)
            || ($this->cost_source === 'manual' && $this->unit_cost !== null)
        );

        if (! $manualUnitCost) {
            $this->unit_cost = self::defaultUnitCostForCategory($this->category);
            $this->cost_source = 'auto';
        } else {
            $this->cost_source = 'manual';
        }

        $this->total_cost = number_format($quantity * (float) $this->unit_cost, 2, '.', '');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'location_id');
    }

    public function species(): BelongsTo
    {
        return $this->belongsTo(PlantSpecies::class, 'species_id');
    }

    public function photos(): HasMany
    {
        return $this->hasMany(PlantPhoto::class, 'plant_id');
    }

    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class, 'plant_id');
    }

    public function careTasks(): HasMany
    {
        return $this->hasMany(CareTask::class, 'plant_id');
    }
}
