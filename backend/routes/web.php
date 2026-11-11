<?php

use App\Http\Controllers\AdminController as Admin;
use App\Http\Controllers\BookingController as Booking;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::prefix('api')->group(function () {
    Route::get('/session', fn (Request $request) => ['csrf' => csrf_token(), 'user' => $request->user()]);
    Route::get('/rooms', [Booking::class, 'rooms'])->middleware('throttle:90,1');
    Route::post('/bookings', [Booking::class, 'store'])->middleware('throttle:15,1');
    Route::post('/bookings/lookup', [Booking::class, 'lookup'])->middleware('throttle:20,1');
    Route::post('/login', [Admin::class, 'login'])->middleware('throttle:8,1');
    Route::post('/logout', [Admin::class, 'logout'])->middleware('auth');
    Route::prefix('admin')->middleware('auth')->group(function () {
        Route::get('/dashboard', [Admin::class, 'dashboard']);
        Route::get('/bookings', [Admin::class, 'bookings']);
        Route::patch('/bookings/{id}', [Admin::class, 'status'])->whereNumber('id');
        Route::post('/bookings/{id}/payment', [Admin::class, 'pay'])->whereNumber('id');
        Route::get('/rooms', [Admin::class, 'rooms']);
        Route::middleware(\App\Http\Middleware\Administrator::class)->group(function () {
            Route::post('/rooms', [Admin::class, 'saveRoom']);
            Route::put('/rooms/{room}', [Admin::class, 'saveRoom']);
            Route::delete('/rooms/{room}', [Admin::class, 'removeRoom']);
            Route::get('/staff', [Admin::class, 'staff']);
            Route::post('/staff', [Admin::class, 'saveStaff']);
            Route::put('/staff/{employee}', [Admin::class, 'saveStaff']);
            Route::delete('/staff/{employee}', [Admin::class, 'removeStaff']);
        });
    });
});
