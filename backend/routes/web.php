<?php

use App\Http\Controllers\Admin\BookingController as Bookings;
use App\Http\Controllers\Admin\CustomerController as Customers;
use App\Http\Controllers\Admin\FinanceController as Finance;
use App\Http\Controllers\Admin\FolioController as Folios;
use App\Http\Controllers\Admin\HousekeepingController as Housekeeping;
use App\Http\Controllers\Admin\InventoryController as Inventory;
use App\Http\Controllers\Admin\ReportController as Reports;
use App\Http\Controllers\Admin\RoomMapController as RoomMap;
use App\Http\Controllers\Admin\ServiceController as Services;
use App\Http\Controllers\Admin\SetupController as Setup;
use App\Http\Controllers\Admin\StaffController as Staff;
use App\Http\Controllers\Admin\StayController as Stays;
use App\Http\Controllers\AuthController as Auth;
use App\Http\Controllers\Site\SiteController as Site;
use App\Http\Controllers\WebhookController as Webhooks;
use Illuminate\Support\Facades\Route;

Route::pattern('id', '[0-9]+');

Route::prefix('api')->group(function () {
    Route::get('/health', fn () => ['ok' => true, 'time' => now()->toIso8601String()]);
    Route::get('/session', [Auth::class, 'session']);
    Route::post('/login', [Auth::class, 'login'])->middleware('throttle:8,1');
    Route::post('/logout', [Auth::class, 'logout'])->middleware('auth');
    Route::get('/media/{file}', [Webhooks::class, 'media']);
    Route::post('/webhooks/payments/{provider}', [Webhooks::class, 'payment'])->middleware('throttle:120,1');

    // ---------- Website công khai ----------
    Route::prefix('public')->middleware('throttle:120,1')->group(function () {
        Route::get('/site', [Site::class, 'site']);
        Route::get('/room-types/{slug}', [Site::class, 'roomType']);
        Route::get('/posts', [Site::class, 'posts']);
        Route::get('/posts/{slug}', [Site::class, 'post']);
        Route::get('/availability', [Site::class, 'availability'])->middleware('throttle:60,1');
        Route::post('/bookings', [Site::class, 'book'])->middleware('throttle:10,1');
        Route::post('/bookings/lookup', [Site::class, 'lookup'])->middleware('throttle:20,1');
        Route::post('/bookings/{code}/transfer-notice', [Site::class, 'transferNotice'])->middleware('throttle:5,1');
    });

    // ---------- Quản trị ----------
    Route::prefix('admin')->middleware(['auth', 'property'])->group(function () {
        Route::get('/dashboard', [Reports::class, 'dashboard'])->middleware('perm:dashboard.view');
        Route::get('/automation', [\App\Http\Controllers\Admin\AutomationController::class, 'index'])->middleware('perm:dashboard.view');
        Route::post('/automation/run', [\App\Http\Controllers\Admin\AutomationController::class, 'run'])->middleware('perm:settings.manage');

        Route::middleware('perm:rooms.view')->group(function () {
            Route::get('/room-map', [RoomMap::class, 'map']);
            Route::get('/calendar', [RoomMap::class, 'calendar']);
        });

        Route::middleware('perm:bookings.view')->group(function () {
            Route::get('/bookings', [Bookings::class, 'index']);
            Route::get('/bookings/options', [Bookings::class, 'options']);
            Route::get('/bookings/{id}', [Bookings::class, 'show']);
            Route::get('/availability', [Bookings::class, 'quote']);
            Route::get('/stays/{id}/free-rooms', [Bookings::class, 'freeRooms']);
        });
        Route::post('/bookings', [Bookings::class, 'store'])->middleware('perm:bookings.create');
        Route::middleware('perm:bookings.edit')->group(function () {
            Route::patch('/bookings/{id}', [Bookings::class, 'update']);
            Route::post('/bookings/{id}/confirm', [Bookings::class, 'confirm']);
            Route::post('/bookings/{id}/extend-hold', [Bookings::class, 'extendHold']);
            Route::post('/bookings/{id}/stays', [Bookings::class, 'addStay']);
            Route::post('/stays/{id}/assign-room', [Bookings::class, 'assignRoom']);
            Route::post('/stays/{id}/guests', [Stays::class, 'addGuest']);
            Route::delete('/stays/{id}/guests/{customerId}', [Stays::class, 'removeGuest'])->whereNumber('customerId');
        });
        Route::post('/bookings/{id}/cancel', [Bookings::class, 'cancel'])->middleware('perm:bookings.cancel');
        Route::post('/stays/{id}/check-in', [Stays::class, 'checkIn'])->middleware('perm:frontdesk.checkin');
        Route::post('/stays/{id}/check-out', [Stays::class, 'checkOut'])->middleware('perm:frontdesk.checkout');
        Route::post('/stays/{id}/check-out/quote', [Stays::class, 'checkoutQuote'])->middleware('perm:frontdesk.checkout');
        Route::middleware('perm:frontdesk.extend')->group(function () {
            Route::post('/stays/{id}/dates/quote', [Stays::class, 'quoteDates']);
            Route::post('/stays/{id}/dates', [Stays::class, 'changeDates']);
        });
        Route::middleware('perm:frontdesk.move')->group(function () {
            Route::post('/stays/{id}/move/quote', [Stays::class, 'quoteMove']);
            Route::post('/stays/{id}/move', [Stays::class, 'move']);
        });
        Route::get('/stays/export', [Stays::class, 'export'])->middleware('perm:guests.export');

        // Hồ sơ thanh toán
        Route::post('/folios/{id}/services', [Folios::class, 'postService'])->middleware('perm:services.post');
        Route::post('/stays/{id}/services', [Stays::class, 'postService'])->middleware('perm:services.post');
        Route::get('/stays/in-house', [Stays::class, 'inHouse'])->middleware('perm:services.post');
        Route::post('/folios/{id}/lines', [Folios::class, 'postLine']); // quyền kiểm tra theo loại dòng trong controller
        Route::post('/folio-lines/{id}/void', [Folios::class, 'voidLine'])->middleware('perm:services.void');
        Route::post('/bookings/{id}/payments', [Folios::class, 'collect'])->middleware('perm:payments.collect');
        Route::post('/bookings/{id}/refunds', [Folios::class, 'refund'])->middleware('perm:payments.refund');
        Route::middleware('perm:folios.split')->group(function () {
            Route::post('/bookings/{id}/folios', [Folios::class, 'create']);
            Route::post('/folios/{id}/move', [Folios::class, 'move']);
        });
        Route::middleware('perm:payments.view')->group(function () {
            Route::get('/payments', [Finance::class, 'payments']);
            Route::get('/payments/{id}/receipt', [Folios::class, 'receipt']);
            Route::get('/folios/{id}/statement', [Folios::class, 'statement']);
            Route::get('/payment-claims', [Folios::class, 'claims']);
            Route::get('/receivables', [Finance::class, 'receivables']);
            Route::get('/payment-methods', [Finance::class, 'methods']);
        });
        Route::middleware('perm:payments.collect')->group(function () {
            Route::post('/payment-claims/{id}/confirm', [Folios::class, 'confirmClaim']);
            Route::post('/payment-claims/{id}/reject', [Folios::class, 'rejectClaim']);
        });
        Route::middleware('perm:shifts.manage')->group(function () {
            Route::get('/shifts/current', [Finance::class, 'currentShift']);
            Route::get('/shifts', [Finance::class, 'shifts']);
            Route::post('/shifts', [Finance::class, 'openShift']);
            Route::post('/shifts/{id}/close', [Finance::class, 'closeShift']);
        });
        Route::middleware('perm:cashbook.manage')->group(function () {
            Route::get('/cash-entries', [Finance::class, 'cashEntries']);
            Route::post('/cash-entries', [Finance::class, 'storeCash']);
            Route::post('/cash-entries/{id}/reverse', [Finance::class, 'reverseCash']);
        });

        // Khách hàng
        Route::middleware('perm:guests.view')->group(function () {
            Route::get('/customers', [Customers::class, 'index']);
            Route::get('/customers/{id}', [Customers::class, 'show']);
            Route::get('/feedback', [Customers::class, 'feedbackList']);
        });
        Route::middleware('perm:guests.manage')->group(function () {
            Route::post('/customers', [Customers::class, 'store']);
            Route::patch('/customers/{id}', [Customers::class, 'update']);
            Route::post('/customers/{id}/merge', [Customers::class, 'merge']);
            Route::post('/feedback', [Customers::class, 'feedback']);
            Route::post('/feedback/{id}/resolve', [Customers::class, 'resolveFeedback']);
        });

        // Buồng phòng & kỹ thuật
        Route::middleware('perm:housekeeping.view')->group(function () {
            Route::get('/housekeeping/tasks', [Housekeeping::class, 'tasks']);
            Route::get('/maintenance', [Housekeeping::class, 'tickets']);
            Route::get('/lost-items', [Housekeeping::class, 'lostItems']);
        });
        Route::post('/housekeeping/tasks/{id}/assign', [Housekeeping::class, 'assign'])->middleware('perm:housekeeping.manage');
        Route::post('/housekeeping/tasks/{id}/start', [Housekeeping::class, 'start'])->middleware('perm:housekeeping.view');
        Route::post('/housekeeping/tasks/{id}/finish', [Housekeeping::class, 'finish'])->middleware('perm:housekeeping.view');
        Route::post('/housekeeping/tasks/{id}/inspect', [Housekeeping::class, 'inspect'])->middleware('perm:housekeeping.inspect');
        Route::post('/rooms/{id}/housekeeping', [Housekeeping::class, 'setStatus'])->middleware('perm:housekeeping.manage');
        Route::post('/maintenance', [Housekeeping::class, 'report'])->middleware('perm:maintenance.report');
        Route::patch('/maintenance/{id}', [Housekeeping::class, 'updateTicket'])->middleware('perm:maintenance.manage');
        Route::post('/lost-items', [Housekeeping::class, 'storeLost'])->middleware('perm:housekeeping.view');
        Route::patch('/lost-items/{id}', [Housekeeping::class, 'updateLost'])->middleware('perm:housekeeping.manage');

        // Dịch vụ
        Route::get('/services', [Services::class, 'index'])->middleware('perm:services.post');
        Route::post('/services/walk-in', [Services::class, 'walkInSale'])->middleware('perm:services.post', 'perm:payments.collect');
        Route::middleware('perm:services.manage')->group(function () {
            Route::post('/services', [Services::class, 'store']);
            Route::put('/services/{id}', [Services::class, 'update']);
            Route::post('/service-packages', [Services::class, 'savePackage']);
            Route::put('/service-packages/{id}', [Services::class, 'savePackage']);
        });

        // Kho
        Route::middleware('perm:inventory.view')->group(function () {
            Route::get('/inventory', [Inventory::class, 'index']);
            Route::get('/inventory/movements', [Inventory::class, 'movements']);
        });
        Route::middleware('perm:inventory.manage')->group(function () {
            Route::post('/inventory', [Inventory::class, 'store']);
            Route::put('/inventory/{id}', [Inventory::class, 'update']);
            Route::post('/inventory/movements', [Inventory::class, 'move']);
        });

        // Nhân sự
        Route::middleware('perm:staff.view')->group(function () {
            Route::get('/staff', [Staff::class, 'index']);
            Route::get('/roster', [Staff::class, 'roster']);
        });
        Route::middleware('perm:staff.manage')->group(function () {
            Route::post('/staff', [Staff::class, 'store']);
            Route::patch('/staff/{id}', [Staff::class, 'update']);
            Route::put('/roles/{key}', [Staff::class, 'saveRole'])->where('key', '[a-z_]+');
            Route::post('/roster', [Staff::class, 'saveRoster']);
            Route::delete('/roster/{id}', [Staff::class, 'deleteRoster']);
        });

        // Báo cáo & nhật ký
        Route::middleware('perm:reports.view')->group(function () {
            Route::get('/reports/summary', [Reports::class, 'summary']);
            Route::get('/reports/receivables', [Reports::class, 'receivables']);
        });
        Route::get('/reports/export/{type}', [Reports::class, 'export'])->middleware('perm:reports.export')->where('type', '[a-z-]+');
        Route::get('/audit', [Reports::class, 'audit'])->middleware('perm:audit.view');

        // Cấu hình phòng & sơ đồ
        Route::get('/setup/rooms', [Setup::class, 'rooms'])->middleware('perm:rooms.view');
        Route::middleware('perm:rooms.manage')->group(function () {
            Route::post('/setup/floors', [Setup::class, 'saveFloor']);
            Route::put('/setup/floors/{id}', [Setup::class, 'saveFloor']);
            Route::post('/setup/room-types', [Setup::class, 'saveRoomType']);
            Route::put('/setup/room-types/{id}', [Setup::class, 'saveRoomType']);
            Route::post('/setup/rooms', [Setup::class, 'saveRoom']);
            Route::put('/setup/rooms/{id}', [Setup::class, 'saveRoom']);
            Route::delete('/setup/rooms/{id}', [Setup::class, 'deleteRoom']);
            Route::post('/setup/rooms/{id}/archive', [Setup::class, 'archiveRoom']);
            Route::put('/setup/layout', [Setup::class, 'saveLayout']);
            Route::post('/setup/upload', [Setup::class, 'upload']);
        });
        Route::post('/rooms/{id}/blocks', [Setup::class, 'block'])->middleware('perm:maintenance.manage');
        Route::post('/room-blocks/{id}/release', [Setup::class, 'releaseBlock'])->middleware('perm:maintenance.manage');

        // Giá & chính sách
        Route::get('/setup/rates', [Setup::class, 'rates'])->middleware('perm:rooms.view');
        Route::middleware('perm:rates.manage')->group(function () {
            Route::post('/setup/rate-rules', [Setup::class, 'saveRule']);
            Route::put('/setup/rate-rules/{id}', [Setup::class, 'saveRule']);
            Route::post('/setup/rate-plans', [Setup::class, 'savePlan']);
            Route::put('/setup/rate-plans/{id}', [Setup::class, 'savePlan']);
            Route::post('/setup/policies', [Setup::class, 'savePolicy']);
            Route::put('/setup/policies/{id}', [Setup::class, 'savePolicy']);
        });

        // Cấu hình hệ thống
        Route::middleware('perm:settings.manage')->group(function () {
            Route::get('/setup/settings', [Setup::class, 'settings']);
            Route::put('/setup/property', [Setup::class, 'updateProperty']);
            Route::put('/setup/settings/{group}', [Setup::class, 'updateSettings'])->where('group', '[a-z_]+');
            Route::get('/setup/integrations', [Setup::class, 'integrations']);
            Route::get('/setup/notifications', [Setup::class, 'notifications']);
            Route::get('/setup/backups', [Setup::class, 'backups']);
            Route::put('/setup/payment-methods/{code}', [Setup::class, 'savePaymentMethod'])->where('code', '[a-z0-9_]+');
            Route::get('/setup/posts', [Setup::class, 'posts']);
            Route::post('/setup/posts', [Setup::class, 'savePost']);
            Route::put('/setup/posts/{id}', [Setup::class, 'savePost']);
            Route::post('/setup/media', [Setup::class, 'upload']);
        });
    });
});
