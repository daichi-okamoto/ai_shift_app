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
            self::Leader => 'チームリーダー',
            self::Member => 'メンバー',
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

