<?php
namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Services\AutomationService;
use App\Services\Context;
use App\Services\Settings;

/** Trạng thái và nhật ký những việc hệ thống tự làm. */
class AutomationController extends Controller
{
    public function index()
    {
        return [
            'settings' => Settings::get('automation'),
            'state' => Settings::get('automation_state'),
            'log' => AuditLog::where(fn ($q) => $q->where('property_id', $this->pid())->orWhereNull('property_id'))
                ->whereNull('user_id')->where(fn ($q) => $q->where('action', 'like', 'automation.%')->orWhereIn('action', ['booking.hold_expired', 'booking.no_show', 'payment.webhook', 'booking.confirm']))
                ->latest('id')->limit(50)->get(['id', 'action', 'summary', 'reason', 'created_at']),
        ];
    }

    /** Chạy ngay (không chờ lịch). */
    public function run(AutomationService $automation)
    {
        return $automation->runDaily(Context::property());
    }
}
