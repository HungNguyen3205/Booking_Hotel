<?php
namespace App\Providers;

use App\Database\ImmediateSQLiteConnection;
use Illuminate\Database\Connection;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        Connection::resolverFor('sqlite', fn ($pdo, $database, $prefix, $config) => new ImmediateSQLiteConnection($pdo, $database, $prefix, $config));
    }
}
