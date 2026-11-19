<?php
namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CancellationPolicy;
use App\Models\Floor;
use App\Models\PaymentMethod;
use App\Models\Post;
use App\Models\RatePlan;
use App\Models\RateRule;
use App\Models\Room;
use App\Models\RoomBlock;
use App\Models\RoomType;
use App\Services\Audit;
use App\Services\Context;
use App\Services\NotificationService;
use App\Services\RoomBlockService;
use App\Services\Settings;
use App\Services\VietQr;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Cấu hình: khách sạn, tầng/phòng/loại phòng/sơ đồ, giá & chính sách, nội dung website, tích hợp. */
class SetupController extends Controller
{
    // ---------- Khách sạn & cấu hình chung ----------
    public function settings()
    {
        $groups = [];
        foreach (array_keys(Settings::DEFAULTS) as $key) $groups[$key] = Settings::get($key);
        return ['property' => Context::property(), 'settings' => $groups];
    }

    public function updateProperty(Request $request)
    {
        $d = $request->validate(['name' => 'required|string|max:160', 'address' => 'nullable|string|max:300', 'phone' => 'nullable|string|max:40',
            'email' => 'nullable|email|max:200', 'check_in_time' => 'required|date_format:H:i', 'check_out_time' => 'required|date_format:H:i']);
        $p = Context::property();
        $p->fill($d);
        $diff = Audit::diff($p);
        $p->save();
        Audit::log('settings.property', $p, 'Cập nhật thông tin khách sạn', null, $diff);
        return $p;
    }

    public function updateSettings(Request $request, string $group)
    {
        abort_unless(array_key_exists($group, Settings::DEFAULTS), 404);
        $rules = match ($group) {
            'booking' => ['hold_minutes_website' => 'integer|between:5,10080', 'hold_minutes_staff' => 'integer|between:5,10080', 'max_nights' => 'integer|between:1,365',
                'max_rooms_per_booking' => 'integer|between:1,50', 'hourly_enabled' => 'boolean', 'require_inspection' => 'boolean',
                'require_shift_for_cash' => 'boolean', 'rounding' => 'integer|in:1,100,500,1000,5000,10000'],
            'surcharges' => ['extra_adult' => 'integer|min:0', 'extra_child' => 'integer|min:0', 'extra_bed' => 'integer|min:0',
                'early_check_in' => 'integer|min:0', 'late_check_out' => 'integer|min:0'],
            'automation' => ['auto_no_show' => 'boolean', 'no_show_charge_fee' => 'boolean', 'daily_stayover_cleaning' => 'boolean', 'auto_assign_housekeeping' => 'boolean'],
            'automation_state' => abort(422, 'Trạng thái tự động hóa do hệ thống ghi.'),
            'payment_qr' => ['enabled' => 'boolean', 'bank_bin' => 'nullable|digits:6', 'bank_name' => 'nullable|string|max:100',
                'account_number' => 'nullable|alpha_num|max:19', 'account_name' => 'nullable|string|max:100'],
            'notifications' => ['email_enabled' => 'boolean', 'zalo_enabled' => 'boolean', 'booking_confirmation' => 'string|max:2000'],
            'policies' => ['booking' => 'string|max:10000', 'cancellation' => 'string|max:10000', 'privacy' => 'string|max:20000'],
            'site' => ['tagline' => 'nullable|string|max:120', 'hero_title' => 'nullable|string|max:160', 'hero_subtitle' => 'nullable|string|max:300',
                'about' => 'nullable|string|max:10000', 'amenities' => 'array', 'amenities.*.title' => 'required|string|max:120',
                'amenities.*.text' => 'nullable|string|max:300', 'amenities.*.icon' => 'nullable|string|max:20',
                'gallery' => 'array', 'gallery.*.url' => 'required|string|max:300', 'gallery.*.alt' => 'required|string|max:300',
                'map_url' => 'nullable|url|max:500', 'zalo' => 'nullable|string|max:100', 'facebook' => 'nullable|url|max:300'],
        };
        $d = $request->validate($rules);
        if ($group === 'payment_qr' && !empty($d['enabled'])) {
            abort_if(empty($d['bank_bin'] ?? Settings::value('payment_qr', 'bank_bin')) || empty($d['account_number'] ?? Settings::value('payment_qr', 'account_number')),
                422, 'Nhập mã BIN ngân hàng và số tài khoản trước khi bật QR.');
        }
        $value = Settings::put($group, $d);
        Audit::log("settings.$group", null, "Cập nhật cấu hình $group", null, $d);
        return $value;
    }

    /** Trạng thái tích hợp: chỉ báo "đang hoạt động" khi có cấu hình thật. */
    public function integrations()
    {
        $mailer = config('mail.default');
        return [
            ['key' => 'vietqr', 'name' => 'Mã QR chuyển khoản (VietQR)', 'status' => VietQr::configured() ? 'active' : 'not_configured',
                'detail' => 'Tạo mã QR cục bộ theo tài khoản ngân hàng. Tiền về chỉ được ghi nhận khi đối soát hoặc có webhook ngân hàng.'],
            ['key' => 'bank_webhook', 'name' => 'Webhook báo có ngân hàng', 'status' => config('hotel.payment_webhook_secret') ? 'active' : 'not_configured',
                'detail' => 'Đặt PAYMENT_WEBHOOK_SECRET trong .env và khai báo URL /api/webhooks/payments/{provider} ở nhà cung cấp.'],
            ['key' => 'email', 'name' => 'Email xác nhận đặt phòng', 'status' => NotificationService::emailConfigured() ? 'active' : 'not_configured',
                'detail' => "MAIL_MAILER hiện tại: $mailer. Cần SMTP thật và bật trong cấu hình thông báo."],
            ['key' => 'zalo', 'name' => 'Zalo OA', 'status' => 'pending_provider', 'detail' => 'Chưa có thông tin Zalo OA. Tin nhắn được ghi vào hàng đợi với trạng thái "chưa cấu hình".'],
            ['key' => 'einvoice', 'name' => 'Hóa đơn điện tử', 'status' => 'pending_provider', 'detail' => 'Chưa kết nối nhà cung cấp. Hệ thống chỉ in phiếu thu và bảng kê, không phát hành hóa đơn điện tử.'],
            ['key' => 'channel_manager', 'name' => 'OTA / Channel manager', 'status' => 'pending_provider', 'detail' => 'Chưa có nhà cung cấp và thông tin truy cập. Đặt phòng OTA nhập thủ công với nguồn "OTA".'],
            ['key' => 'residence', 'name' => 'Khai báo lưu trú', 'status' => 'manual', 'detail' => 'Xuất danh sách khách lưu trú (CSV) để khai báo thủ công. Chưa kết nối trực tiếp.'],
            ['key' => 'backup', 'name' => 'Sao lưu dữ liệu', 'status' => 'active', 'detail' => 'Lệnh `php artisan hotel:backup` (đặt lịch hằng ngày). Phục hồi theo hướng dẫn trong README.'],
        ];
    }

    public function notifications()
    {
        return \App\Models\NotificationOutbox::latest('id')->limit(100)->get();
    }

    public function backups()
    {
        $files = collect(Storage::disk('local')->files('backups'))->map(fn ($f) => ['name' => basename($f), 'size' => Storage::disk('local')->size($f),
            'created_at' => date('c', Storage::disk('local')->lastModified($f))])->sortByDesc('created_at')->values();
        return $files;
    }

    // ---------- Tầng, loại phòng, phòng, sơ đồ ----------
    public function rooms()
    {
        return [
            'floors' => Floor::where('property_id', $this->pid())->orderBy('level')->get(),
            'room_types' => RoomType::where('property_id', $this->pid())->orderBy('sort')->withCount('rooms')->get(),
            'rooms' => Room::with('type:id,name,code')->where('property_id', $this->pid())->orderBy('sort')->orderBy('number')->get(),
            'blocks' => RoomBlock::with('room:id,number')->whereHas('room', fn ($q) => $q->where('property_id', $this->pid()))
                ->whereNull('released_at')->where('end_date', '>', Context::today()->toDateString())->orderBy('start_date')->get(),
        ];
    }

    public function saveFloor(Request $request, ?int $id = null)
    {
        $d = $request->validate(['name' => 'required|string|max:60', 'level' => ['required', 'integer', 'between:-5,100',
            Rule::unique('floors')->where('property_id', $this->pid())->ignore($id)],
            'map_width' => 'required|integer|between:300,4000', 'map_height' => 'required|integer|between:200,4000',
            'landmarks' => 'nullable|array|max:40', 'landmarks.*.type' => 'required|in:stairs,elevator,entrance,facade,courtyard,corridor,reception,service,other',
            'landmarks.*.label' => 'required|string|max:60', 'landmarks.*.x' => 'required|integer|min:0', 'landmarks.*.y' => 'required|integer|min:0',
            'landmarks.*.w' => 'required|integer|min:10', 'landmarks.*.h' => 'required|integer|min:10', 'layout_confirmed' => 'boolean']);
        $floor = $id ? Floor::where('property_id', $this->pid())->findOrFail($id) : new Floor(['property_id' => $this->pid()]);
        $floor->fill($d)->save();
        Audit::log('setup.floor', $floor, "Lưu tầng {$floor->name}");
        return $floor;
    }

    public function saveRoomType(Request $request, ?int $id = null)
    {
        $d = $request->validate([
            'code' => ['required', 'string', 'max:20', Rule::unique('room_types')->where('property_id', $this->pid())->ignore($id)],
            'slug' => ['required', 'string', 'max:80', 'regex:/^[a-z0-9-]+$/', Rule::unique('room_types')->ignore($id)],
            'name' => 'required|string|max:120', 'short_description' => 'nullable|string|max:300', 'description' => 'nullable|string|max:5000',
            'area' => 'required|integer|between:5,500', 'bed' => 'nullable|string|max:120',
            'base_adults' => 'required|integer|between:1,10', 'max_adults' => 'required|integer|between:1,10', 'max_children' => 'required|integer|between:0,10',
            'max_occupancy' => 'required|integer|between:1,20', 'max_extra_beds' => 'required|integer|between:0,5',
            'base_rate' => 'required|integer|min:0|max:1000000000', 'hourly_rate' => 'nullable|integer|min:0',
            'amenities' => 'nullable|array|max:40', 'amenities.*' => 'string|max:80',
            'images' => 'nullable|array|max:20', 'images.*.url' => 'required|string|max:300', 'images.*.alt' => 'required|string|max:300',
            'seo_title' => 'nullable|string|max:160', 'seo_description' => 'nullable|string|max:300', 'active' => 'boolean', 'public' => 'boolean', 'sort' => 'integer',
        ]);
        abort_if($d['base_adults'] > $d['max_adults'] || $d['max_adults'] > $d['max_occupancy'], 422, 'Sức chứa không hợp lệ.');
        $type = $id ? RoomType::where('property_id', $this->pid())->findOrFail($id) : new RoomType(['property_id' => $this->pid()]);
        $type->fill($d);
        $diff = Audit::diff($type);
        $type->save();
        Audit::log(isset($diff['base_rate']) ? 'rates.base_rate' : 'setup.room_type', $type, "Lưu loại phòng {$type->name}", $request->input('reason'), $diff);
        return $type;
    }

    public function saveRoom(Request $request, ?int $id = null)
    {
        $d = $request->validate([
            'number' => ['required', 'string', 'max:20', Rule::unique('rooms')->where('property_id', $this->pid())->ignore($id)],
            'floor_id' => ['required', Rule::exists('floors', 'id')->where('property_id', $this->pid())],
            'room_type_id' => ['required', Rule::exists('room_types', 'id')->where('property_id', $this->pid())],
            'wing' => 'nullable|in:left,base,right', 'map_x' => 'integer|min:0', 'map_y' => 'integer|min:0', 'map_w' => 'integer|between:40,600',
            'map_h' => 'integer|between:30,600', 'door_side' => 'in:n,s,e,w', 'sort' => 'integer', 'notes' => 'nullable|string|max:500',
        ]);
        $room = $id ? $this->room($id) : new Room(['property_id' => $this->pid(), 'housekeeping' => 'clean']);
        if ($id && isset($d['room_type_id']) && $d['room_type_id'] !== $room->room_type_id) {
            abort_if(DB::table('stays')->where('room_id', $room->id)->whereIn('status', ['hold', 'confirmed', 'checked_in'])->exists(), 409,
                'Phòng đang có đặt phòng; chuyển khách sang phòng khác trước khi đổi loại phòng.');
        }
        $room->fill($d);
        $diff = Audit::diff($room);
        $room->save();
        Audit::log('setup.room', $room, "Lưu phòng {$room->number}", null, $diff);
        return $room->load('type:id,name,code');
    }

    /** Lưu vị trí nhiều ô phòng một lần (trình chỉnh sơ đồ). */
    public function saveLayout(Request $request)
    {
        $d = $request->validate(['rooms' => 'required|array|max:500', 'rooms.*.id' => 'required|integer', 'rooms.*.map_x' => 'required|integer|min:0',
            'rooms.*.map_y' => 'required|integer|min:0', 'rooms.*.map_w' => 'required|integer|between:40,600', 'rooms.*.map_h' => 'required|integer|between:30,600',
            'rooms.*.door_side' => 'required|in:n,s,e,w', 'rooms.*.wing' => 'nullable|in:left,base,right', 'rooms.*.floor_id' => 'nullable|integer']);
        DB::transaction(function () use ($d) {
            foreach ($d['rooms'] as $r) {
                $room = $this->room($r['id']);
                if (!empty($r['floor_id'])) Floor::where('property_id', $this->pid())->findOrFail($r['floor_id']);
                $room->update(collect($r)->except('id')->filter(fn ($v) => $v !== null)->all());
            }
        });
        Audit::log('setup.layout', null, 'Cập nhật bố cục sơ đồ ('.count($d['rooms']).' phòng)');
        return response()->noContent();
    }

    /** Ngừng sử dụng phòng (không xóa nếu đã có giao dịch). */
    public function archiveRoom(Request $request, int $id)
    {
        $d = $request->validate(['archived' => 'required|boolean', 'reason' => 'required|string|max:300']);
        $room = $this->room($id);
        if ($d['archived']) {
            abort_if(DB::table('room_nights')->where('room_id', $id)->whereNotNull('stay_id')->where('night', '>=', Context::today()->toDateString())->exists(), 409,
                'Phòng còn đặt phòng từ hôm nay trở đi. Chuyển khách trước khi ngừng sử dụng.');
        }
        $room->update(['archived_at' => $d['archived'] ? now() : null]);
        Audit::log($d['archived'] ? 'setup.room_archive' : 'setup.room_restore', $room, ($d['archived'] ? 'Ngừng sử dụng' : 'Sử dụng lại')." phòng {$room->number}", $d['reason']);
        return $room;
    }

    public function deleteRoom(int $id)
    {
        $room = $this->room($id);
        abort_if(DB::table('stays')->where('room_id', $id)->exists() || DB::table('room_nights')->where('room_id', $id)->exists()
            || DB::table('housekeeping_tasks')->where('room_id', $id)->exists(), 409, 'Phòng đã có giao dịch, chỉ có thể ngừng sử dụng.');
        Audit::log('setup.room_delete', $room, "Xóa phòng {$room->number} (chưa có giao dịch)");
        $room->delete();
        return response()->noContent();
    }

    public function block(Request $request, int $roomId, RoomBlockService $blocks)
    {
        $d = $request->validate(['type' => 'required|in:maintenance,out_of_service', 'start_date' => 'required|date_format:Y-m-d',
            'end_date' => 'required|date_format:Y-m-d', 'reason' => 'required|string|min:3|max:500']);
        return $blocks->create($this->room($roomId), $d['type'], $d['start_date'], $d['end_date'], $d['reason']);
    }

    public function releaseBlock(Request $request, int $blockId, RoomBlockService $blocks)
    {
        $d = $request->validate(['reason' => 'required|string|min:3|max:300']);
        $block = RoomBlock::whereHas('room', fn ($q) => $q->where('property_id', $this->pid()))->findOrFail($blockId);
        return $blocks->release($block, $d['reason']);
    }

    // ---------- Giá & chính sách ----------
    public function rates()
    {
        return [
            'room_types' => RoomType::where('property_id', $this->pid())->orderBy('sort')->get(['id', 'name', 'code', 'base_rate', 'hourly_rate']),
            'rate_plans' => RatePlan::where('property_id', $this->pid())->orderBy('sort')->get(),
            'rules' => RateRule::whereHas('roomType', fn ($q) => $q->where('property_id', $this->pid()))->orderBy('room_type_id')->orderByDesc('priority')->get(),
            'policies' => CancellationPolicy::where('property_id', $this->pid())->get(),
            'precedence' => [
                'priority cao hơn thắng',
                'cùng priority: Lễ > Mùa > Cuối tuần',
                'cùng loại: quy tắc riêng kế hoạch giá > quy tắc chung',
                'cùng hết: quy tắc tạo sau thắng',
                'không khớp quy tắc nào: giá cơ sở (ngày thường) của loại phòng',
                'sau đó áp dụng % điều chỉnh của kế hoạch giá và làm tròn',
            ],
        ];
    }

    public function saveRule(Request $request, ?int $id = null)
    {
        $d = $request->validate([
            'room_type_id' => ['required', Rule::exists('room_types', 'id')->where('property_id', $this->pid())],
            'rate_plan_id' => ['nullable', Rule::exists('rate_plans', 'id')->where('property_id', $this->pid())],
            'kind' => 'required|in:weekend,season,holiday', 'name' => 'required|string|max:120',
            'start_date' => 'nullable|date_format:Y-m-d|required_if:kind,season,holiday', 'end_date' => 'nullable|date_format:Y-m-d|after_or_equal:start_date|required_if:kind,season,holiday',
            'days_of_week' => 'nullable|array|required_if:kind,weekend', 'days_of_week.*' => 'integer|between:0,6',
            'price' => 'required|integer|min:0|max:1000000000', 'priority' => 'integer|between:0,1000', 'active' => 'boolean', 'reason' => 'required|string|max:300',
        ]);
        $reason = $d['reason'];
        unset($d['reason']);
        $rule = $id ? RateRule::whereHas('roomType', fn ($q) => $q->where('property_id', $this->pid()))->findOrFail($id) : new RateRule();
        $rule->fill($d);
        $diff = Audit::diff($rule);
        $rule->save();
        Audit::log('rates.rule', $rule, "Lưu quy tắc giá \"{$rule->name}\"", $reason, $diff);
        return $rule;
    }

    public function savePlan(Request $request, ?int $id = null)
    {
        $d = $request->validate([
            'code' => ['required', 'string', 'max:30', Rule::unique('rate_plans')->where('property_id', $this->pid())->ignore($id)],
            'name' => 'required|string|max:120', 'description' => 'nullable|string|max:1000',
            'cancellation_policy_id' => ['nullable', Rule::exists('cancellation_policies', 'id')->where('property_id', $this->pid())],
            'deposit_percent' => 'required|integer|between:0,100', 'adjust_percent' => 'required|integer|between:-90,200',
            'includes_breakfast' => 'boolean', 'public' => 'boolean', 'active' => 'boolean', 'sort' => 'integer', 'reason' => 'required|string|max:300',
        ]);
        $reason = $d['reason'];
        unset($d['reason']);
        $plan = $id ? RatePlan::where('property_id', $this->pid())->findOrFail($id) : new RatePlan(['property_id' => $this->pid()]);
        $plan->fill($d);
        $diff = Audit::diff($plan);
        $plan->save();
        Audit::log('rates.plan', $plan, "Lưu kế hoạch giá {$plan->name}", $reason, $diff);
        return $plan;
    }

    public function savePolicy(Request $request, ?int $id = null)
    {
        $d = $request->validate(['name' => 'required|string|max:120', 'description' => 'required|string|max:3000',
            'free_cancel_hours' => 'required|integer|between:0,8760', 'late_cancel_fee_percent' => 'required|integer|between:0,100',
            'no_show_fee_percent' => 'required|integer|between:0,100', 'refundable' => 'boolean']);
        $p = $id ? CancellationPolicy::where('property_id', $this->pid())->findOrFail($id) : new CancellationPolicy(['property_id' => $this->pid()]);
        $p->fill($d);
        $diff = Audit::diff($p);
        $p->save();
        Audit::log('rates.policy', $p, "Lưu chính sách {$p->name}", null, $diff);
        return $p;
    }

    public function savePaymentMethod(Request $request, string $code)
    {
        $d = $request->validate(['name' => 'required|string|max:80', 'type' => 'required|in:cash,bank_transfer,qr,card,other', 'active' => 'boolean', 'sort' => 'integer']);
        abort_unless(preg_match('/^[a-z0-9_]{2,30}$/', $code), 422, 'Mã phương thức không hợp lệ.');
        $m = PaymentMethod::updateOrCreate(['code' => $code], $d);
        Audit::log('settings.payment_method', $m, "Lưu phương thức thanh toán {$m->name}");
        return $m;
    }

    // ---------- Nội dung website ----------
    public function posts()
    {
        return Post::latest('id')->get();
    }

    public function savePost(Request $request, ?int $id = null)
    {
        $d = $request->validate(['type' => 'required|in:article,offer', 'title' => 'required|string|max:200',
            'slug' => ['nullable', 'string', 'max:120', 'regex:/^[a-z0-9-]+$/', Rule::unique('posts')->ignore($id)],
            'excerpt' => 'nullable|string|max:300', 'body' => 'required|string|max:50000', 'cover' => 'nullable|string|max:300', 'cover_alt' => 'nullable|string|max:300',
            'valid_from' => 'nullable|date_format:Y-m-d', 'valid_to' => 'nullable|date_format:Y-m-d', 'status' => 'required|in:draft,published']);
        $d['slug'] = $d['slug'] ?: Str::slug($d['title']);
        abort_if($d['cover'] && empty($d['cover_alt']), 422, 'Ảnh bìa cần mô tả (alt).');
        $post = $id ? Post::findOrFail($id) : new Post();
        $post->fill($d);
        if ($d['status'] === 'published' && !$post->published_at) $post->published_at = now();
        $post->save();
        Audit::log('content.post', $post, "Lưu bài \"{$post->title}\" ({$post->status})");
        return $post;
    }

    /** Tải ảnh lên (phòng, bài viết). Ảnh được phục vụ qua /api/media/{file}. */
    public function upload(Request $request)
    {
        $request->validate(['file' => 'required|file|mimes:jpg,jpeg,png,webp|max:6144']);
        $path = $request->file('file')->store('media', 'public');
        Audit::log('content.upload', null, 'Tải ảnh '.basename($path));
        return ['url' => '/api/media/'.basename($path)];
    }
}
