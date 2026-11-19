<?php
namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Folio;
use App\Models\Room;
use App\Models\Stay;
use App\Models\User;
use App\Services\Context;

abstract class Controller
{
    protected function pid(): int
    {
        return Context::propertyId();
    }

    protected function user(): User
    {
        return auth()->user();
    }

    protected function allowed(string $permission): bool
    {
        return (bool) auth()->user()?->hasPermission($permission);
    }

    protected function booking(int $id): Booking
    {
        return Booking::where('property_id', $this->pid())->findOrFail($id);
    }

    protected function stay(int $id): Stay
    {
        return Stay::whereHas('booking', fn ($q) => $q->where('property_id', $this->pid()))->findOrFail($id);
    }

    protected function room(int $id): Room
    {
        return Room::where('property_id', $this->pid())->findOrFail($id);
    }

    protected function folio(int $id): Folio
    {
        return Folio::whereHas('booking', fn ($q) => $q->where('property_id', $this->pid()))->findOrFail($id);
    }

    /** Xuất CSV UTF-8 có BOM để Excel đọc đúng tiếng Việt. */
    protected function csv(string $filename, array $header, iterable $rows)
    {
        return response()->streamDownload(function () use ($header, $rows) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, $header);
            foreach ($rows as $row) fputcsv($out, array_map(fn ($v) => is_bool($v) ? ($v ? 'Có' : 'Không') : $v, $row));
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8', 'Cache-Control' => 'no-store']);
    }
}
