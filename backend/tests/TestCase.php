<?php
namespace Tests;

use App\Models\Booking;
use App\Models\Property;
use App\Models\Room;
use App\Models\RoomType;
use App\Models\User;
use App\Services\Context;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Context::reset();
        $this->travelTo(now()->setTime(9, 0));
        $this->seed(DatabaseSeeder::class);
        $this->owner = User::where('role', 'owner')->firstOrFail();
        Context::set(Property::firstOrFail());
        $this->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class);
        $this->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class);
    }

    protected function staff(string $role): User
    {
        $u = User::create(['name' => "Test $role", 'email' => "$role@test.local", 'password' => 'secret-password-1', 'role' => $role]);
        $u->properties()->attach(Property::first()->id);
        return $u;
    }

    protected function type(string $code): RoomType
    {
        return RoomType::where('code', $code)->firstOrFail();
    }

    protected function roomNo(string $number): Room
    {
        return Room::where('number', $number)->firstOrFail();
    }

    protected function day(int $offset): string
    {
        return now()->addDays($offset)->toDateString();
    }

    /** Tạo đặt phòng qua API admin. */
    protected function book(array $stay, array $extra = [], ?User $as = null)
    {
        return $this->actingAs($as ?? $this->owner)->postJson('/api/admin/bookings', $extra + [
            'source' => 'phone', 'status' => 'confirmed', 'customer' => ['full_name' => 'Khách Test', 'phone' => '0911'.random_int(100000, 999999)],
            'stays' => [$stay + ['adults' => 1]],
        ]);
    }

    protected function bookingOf($response): Booking
    {
        $response->assertCreated();
        return Booking::findOrFail($response->json('id'));
    }
}
