<?php
namespace App\Database;

use Illuminate\Database\SQLiteConnection;

/**
 * Giao dịch SQLite giành khóa ghi ngay khi bắt đầu (tương đương BEGIN IMMEDIATE).
 *
 * Laravel chỉ dùng `transaction_mode` trên PHP >= 8.4. Với PHP thấp hơn, giao dịch là DEFERRED:
 * hai yêu cầu cùng đọc rồi cùng nâng lên ghi sẽ nhận lỗi "database is locked" ngay lập tức.
 * Ở đây câu lệnh đầu tiên của giao dịch là một lệnh ghi không đổi dữ liệu, nên SQLite chờ theo
 * busy_timeout cho tới khi giao dịch trước hoàn tất — các yêu cầu đặt phòng được xếp hàng tuần tự.
 */
class ImmediateSQLiteConnection extends SQLiteConnection
{
    protected function executeBeginTransactionStatement()
    {
        parent::executeBeginTransactionStatement();
        if (version_compare(PHP_VERSION, '8.4.0', '<') && strtoupper((string) $this->getConfig('transaction_mode')) === 'IMMEDIATE') {
            try {
                $this->getPdo()->exec('DELETE FROM write_gate WHERE 1 = 0');
            } catch (\PDOException $e) {
                if (!str_contains($e->getMessage(), 'no such table')) throw $e; // lúc migrate lần đầu
            }
        }
    }
}
