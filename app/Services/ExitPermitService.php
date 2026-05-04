<?php

namespace App\Services;

use App\Models\ExitPermit;
use App\Models\EntryPermit;
use App\Models\TelegramBotChat;
use App\Models\User;
use App\Models\Visitor;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class ExitPermitService
{
    public function isRequiredForVisitor(Visitor $visitor): bool
    {
        $permit = $this->resolveEntryPermitForVisitor($visitor);

        return (bool) ($permit?->exit_permit_required ?? true);
    }

    public function findActiveForVisitor(Visitor $visitor): ?ExitPermit
    {
        return ExitPermit::query()
            ->active()
            ->where('visitor_id', $visitor->id)
            ->orderByDesc('id')
            ->first();
    }

    public function createForVisitor(Visitor $visitor, User $user, TelegramBotChat $chat, ?Carbon $validUntil = null, ?string $comment = null): ExitPermit
    {
        return DB::transaction(function () use ($visitor, $user, $chat, $validUntil, $comment) {
            $existing = $this->findActiveForVisitor($visitor);
            if ($existing) {
                return $existing;
            }

            return ExitPermit::create([
                'yard_id' => $visitor->yard_id,
                'truck_id' => $visitor->truck_id,
                'visitor_id' => $visitor->id,
                'plate_number' => $visitor->plate_number ?: ($visitor->truck?->plate_number ?? ''),
                'status' => ExitPermit::STATUS_ACTIVE,
                'valid_from' => now(),
                'valid_until' => $validUntil ?: now()->endOfDay(),
                'requested_by_user_id' => $user->id,
                'requested_by_telegram_chat_id' => $chat->id,
                'comment' => $comment,
            ]);
        });
    }

    public function markUsedForVisitor(Visitor $visitor, ?int $usedByUserId = null, ?int $reviewId = null): ?ExitPermit
    {
        return DB::transaction(function () use ($visitor, $usedByUserId, $reviewId) {
            $permit = $this->findActiveForVisitor($visitor);
            if (!$permit) {
                return null;
            }

            $permit->forceFill([
                'status' => ExitPermit::STATUS_USED,
                'used_at' => now(),
                'used_by_user_id' => $usedByUserId,
                'used_checkpoint_exit_review_id' => $reviewId,
            ])->save();

            return $permit;
        });
    }

    private function resolveEntryPermitForVisitor(Visitor $visitor): ?EntryPermit
    {
        if ($visitor->entry_permit_id) {
            $permit = EntryPermit::find($visitor->entry_permit_id);
            if ($permit) {
                return $permit;
            }
        }

        if (!$visitor->truck_id || !$visitor->yard_id) {
            return null;
        }

        return EntryPermit::query()
            ->where('truck_id', $visitor->truck_id)
            ->where('yard_id', $visitor->yard_id)
            ->whereHas('status', fn ($query) => $query->where('key', 'active'))
            ->where(function ($query) {
                $query->whereNull('end_date')
                    ->orWhere('end_date', '>=', now()->startOfDay());
            })
            ->orderByDesc('created_at')
            ->first();
    }
}
