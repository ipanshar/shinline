<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $hasGuestVisitSupportIndex = Schema::hasIndex('guest_visit_permits', 'guest_visit_permits_guest_visit_id_support_idx');
        $hasEntryPermitSupportIndex = Schema::hasIndex('guest_visit_permits', 'guest_visit_permits_entry_permit_id_support_idx');
        $hasEntryPermitForeign = $this->hasForeignKey('guest_visit_permits', ['entry_permit_id']);
        $hasUniqueConstraint = Schema::hasIndex('guest_visit_permits', 'guest_visit_permits_unique', 'unique');

        Schema::table('guest_visit_permits', function (Blueprint $table) use ($hasGuestVisitSupportIndex, $hasEntryPermitSupportIndex) {
            if (! $hasGuestVisitSupportIndex) {
                $table->index('guest_visit_id', 'guest_visit_permits_guest_visit_id_support_idx');
            }

            if (! $hasEntryPermitSupportIndex) {
                $table->index('entry_permit_id', 'guest_visit_permits_entry_permit_id_support_idx');
            }
        });

        Schema::table('guest_visit_permits', function (Blueprint $table) use ($hasEntryPermitForeign, $hasUniqueConstraint) {
            if ($hasEntryPermitForeign) {
                $table->dropForeign(['entry_permit_id']);
            }

            if ($hasUniqueConstraint) {
                $table->dropUnique('guest_visit_permits_unique');
            }
        });

        DB::statement('ALTER TABLE guest_visit_permits MODIFY entry_permit_id BIGINT UNSIGNED NULL');

        $hasRevokedAtColumn = Schema::hasColumn('guest_visit_permits', 'revoked_at');
        $hasEntryPermitForeign = $this->hasForeignKey('guest_visit_permits', ['entry_permit_id']);
        $hasSubjectIndex = Schema::hasIndex('guest_visit_permits', 'guest_visit_permits_subject_idx');

        Schema::table('guest_visit_permits', function (Blueprint $table) use ($hasRevokedAtColumn, $hasEntryPermitForeign, $hasSubjectIndex) {
            if (! $hasRevokedAtColumn) {
                $table->timestamp('revoked_at')->nullable()->after('created_at');
            }

            if (! $hasEntryPermitForeign) {
                $table->foreign('entry_permit_id')->references('id')->on('entry_permits')->cascadeOnDelete();
            }

            if (! $hasSubjectIndex) {
                $table->index(['guest_visit_id', 'permit_subject_type'], 'guest_visit_permits_subject_idx');
            }
        });
    }

    public function down(): void
    {
        $hasEntryPermitForeign = $this->hasForeignKey('guest_visit_permits', ['entry_permit_id']);
        $hasSubjectIndex = Schema::hasIndex('guest_visit_permits', 'guest_visit_permits_subject_idx');
        $hasGuestVisitSupportIndex = Schema::hasIndex('guest_visit_permits', 'guest_visit_permits_guest_visit_id_support_idx');
        $hasEntryPermitSupportIndex = Schema::hasIndex('guest_visit_permits', 'guest_visit_permits_entry_permit_id_support_idx');
        $hasRevokedAtColumn = Schema::hasColumn('guest_visit_permits', 'revoked_at');

        Schema::table('guest_visit_permits', function (Blueprint $table) use ($hasEntryPermitForeign, $hasSubjectIndex, $hasGuestVisitSupportIndex, $hasEntryPermitSupportIndex, $hasRevokedAtColumn) {
            if ($hasEntryPermitForeign) {
                $table->dropForeign(['entry_permit_id']);
            }

            if ($hasSubjectIndex) {
                $table->dropIndex('guest_visit_permits_subject_idx');
            }

            if ($hasGuestVisitSupportIndex) {
                $table->dropIndex('guest_visit_permits_guest_visit_id_support_idx');
            }

            if ($hasEntryPermitSupportIndex) {
                $table->dropIndex('guest_visit_permits_entry_permit_id_support_idx');
            }

            if ($hasRevokedAtColumn) {
                $table->dropColumn('revoked_at');
            }
        });

        DB::statement('ALTER TABLE guest_visit_permits MODIFY entry_permit_id BIGINT UNSIGNED NOT NULL');

        $hasEntryPermitForeign = $this->hasForeignKey('guest_visit_permits', ['entry_permit_id']);
        $hasUniqueConstraint = Schema::hasIndex('guest_visit_permits', 'guest_visit_permits_unique', 'unique');

        Schema::table('guest_visit_permits', function (Blueprint $table) use ($hasEntryPermitForeign, $hasUniqueConstraint) {
            if (! $hasEntryPermitForeign) {
                $table->foreign('entry_permit_id')->references('id')->on('entry_permits')->cascadeOnDelete();
            }

            if (! $hasUniqueConstraint) {
                $table->unique(['guest_visit_id', 'entry_permit_id', 'permit_subject_type'], 'guest_visit_permits_unique');
            }
        });
    }

    private function hasForeignKey(string $table, array $columns): bool
    {
        foreach (Schema::getForeignKeys($table) as $foreignKey) {
            if (($foreignKey['columns'] ?? []) === $columns) {
                return true;
            }
        }

        return false;
    }
};