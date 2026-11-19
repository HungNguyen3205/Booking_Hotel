<?php
namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;

/** Nhật ký thao tác. Lọc khóa nhạy cảm trước khi lưu. */
class Audit
{
    private const SENSITIVE = ['password', 'id_number', 'id_number_hash', 'remember_token', 'request_hash', 'secret', 'token', 'api_key'];

    private static int $system = 0;

    /** Chạy một đoạn việc với danh nghĩa "Hệ thống" (tự động hóa): nhật ký không gắn người dùng. */
    public static function asSystem(callable $fn): mixed
    {
        self::$system++;
        try {
            return $fn();
        } finally {
            self::$system--;
        }
    }

    public static function log(string $action, ?Model $subject, string $summary, ?string $reason = null, array $changes = []): AuditLog
    {
        $request = request();
        return AuditLog::create([
            'user_id' => self::$system ? null : auth()->id(),
            'property_id' => Context::propertyIdOrNull(),
            'action' => $action,
            'subject_type' => $subject ? class_basename($subject) : null,
            'subject_id' => $subject?->getKey(),
            'summary' => mb_substr($summary, 0, 500),
            'reason' => $reason ? mb_substr($reason, 0, 500) : null,
            'changes' => $changes ? self::clean($changes) : null,
            'ip' => $request?->ip(),
        ]);
    }

    /** Ghi lại các trường thay đổi của model (gọi trước save). */
    public static function diff(Model $model): array
    {
        $out = [];
        foreach ($model->getDirty() as $key => $value) {
            $out[$key] = ['from' => $model->getOriginal($key), 'to' => $value];
        }
        return $out;
    }

    private static function clean(array $data): array
    {
        foreach ($data as $key => $value) {
            if (is_string($key) && in_array(strtolower($key), self::SENSITIVE, true)) {
                $data[$key] = '[ẩn]';
            } elseif (is_array($value)) {
                $data[$key] = self::clean($value);
            }
        }
        return $data;
    }
}
