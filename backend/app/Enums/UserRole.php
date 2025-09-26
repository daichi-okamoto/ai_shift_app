<?php

namespace App\Enums;

enum UserRole: string
{
    case Admin = 'admin';
    case Leader = 'leader';
    case Member = 'member';

    public function label(): string
    {
        return match ($this) {
            self::Admin => '管理者',
            self::Leader => '編集者',
            self::Member => '一般',
        };
    }

    /**
     * Sanctum token abilities granted for this role.
     */
    public function abilities(): array
    {
        return match ($this) {
            self::Admin => ['admin', 'leader', 'member'],
            self::Leader => ['leader', 'member'],
            self::Member => ['member'],
        };
    }
}
