import { hotelDate, Room, Status, User } from './api-client';

export type AdminBooking = {
  id: number;
  code: string;
  room_name: string;
  check_in: string;
  check_out: string;
  guests: number;
  total: number;
  status: Status;
  paid_at: string | null;
  guest_name: string;
  email: string;
  phone: string;
  room: Room;
};

export type DashboardData = {
  rooms: number;
  arrivals: number;
  occupied: number;
  pending: number;
  revenue: number;
};

export type BookingPageData = {
  data: AdminBooking[];
  current_page: number;
  last_page: number;
};

const STORAGE_KEY = 'glg_hotel_mock_store_v1';

export const INITIAL_ROOMS: Room[] = [
  {
    id: 1,
    number: '101',
    name: 'Deluxe King',
    description: 'Tông gỗ ấm áp, giường King êm ái cùng cửa sổ lớn hướng phố mang lại không gian thư giãn tối đa cho kỳ nghỉ nhẹ nhàng.',
    image: '/images/deluxe.webp',
    price: 1450000,
    capacity: 2,
    area: 32,
    bed: '1 giường King',
    active: true,
  },
  {
    id: 2,
    number: '201',
    name: 'River View Twin',
    description: 'Hai giường đơn cao cấp và ban công rộng mở trọn vẹn tầm nhìn sông Hàn thơ mộng cùng ánh đèn đêm rực rỡ.',
    image: '/images/twin.webp',
    price: 1890000,
    capacity: 2,
    area: 38,
    bed: '2 giường đơn',
    active: true,
  },
  {
    id: 3,
    number: '301',
    name: 'GLG Executive Suite',
    description: 'Phòng khách riêng biệt sang trọng, bồn tắm hướng sông và dịch vụ chuẩn 5 sao dành cho kỳ nghỉ hoàn hảo của gia đình.',
    image: '/images/suite.webp',
    price: 2950000,
    capacity: 4,
    area: 62,
    bed: '1 King + 1 sofa bed',
    active: true,
  },
  {
    id: 4,
    number: '202',
    name: 'Grand Riverfront King',
    description: 'Không gian mở đón trọn gió sông Hàn, trang bị bàn làm việc cao cấp cùng bồn ngâm thư giãn phong cách nhiệt đới.',
    image: '/images/deluxe.webp',
    price: 2200000,
    capacity: 2,
    area: 45,
    bed: '1 giường King lớn',
    active: true,
  },
  {
    id: 5,
    number: '302',
    name: 'Family Connecting Suite',
    description: 'Hai phòng ngủ liên thông với tiện nghi đầy đủ, giải pháp lưu trú lý tưởng cho kỳ nghỉ gia đình đông thành viên.',
    image: '/images/suite.webp',
    price: 3600000,
    capacity: 5,
    area: 70,
    bed: '2 giường King + 1 đơn',
    active: true,
  },
  {
    id: 6,
    number: '102',
    name: 'Superior Cosy Twin',
    description: 'Thiết kế tối giản hiện đại, trang bị đầy đủ tiện ích cơ bản cho chuyến công tác hoặc khám phá thành phố.',
    image: '/images/twin.webp',
    price: 1250000,
    capacity: 2,
    area: 28,
    bed: '2 giường đơn',
    active: true,
  },
];

export const INITIAL_STAFF: User[] = [
  { id: 1, name: 'Nguyễn Quản Trị', email: 'admin@example.test', role: 'admin' },
  { id: 2, name: 'Lê Thu Ngân', email: 'letan@glghotel.vn', role: 'staff' },
  { id: 3, name: 'Trần Văn Lễ', email: 'letan2@glghotel.vn', role: 'staff' },
];

function getInitialBookings(): AdminBooking[] {
  const today = hotelDate(0);
  const tomorrow = hotelDate(1);
  const yesterday = hotelDate(-1);
  const next2Days = hotelDate(2);
  const last3Days = hotelDate(-3);

  return [
    {
      id: 1,
      code: 'GLG-AN0826',
      room_name: 'Deluxe King',
      check_in: today,
      check_out: next2Days,
      guests: 2,
      total: 2900000,
      status: 'confirmed',
      paid_at: null,
      guest_name: 'Nguyễn Văn An',
      email: 'an.nguyen@gmail.com',
      phone: '0905123456',
      room: INITIAL_ROOMS[0],
    },
    {
      id: 2,
      code: 'GLG-MAI777',
      room_name: 'GLG Executive Suite',
      check_in: yesterday,
      check_out: tomorrow,
      guests: 3,
      total: 5900000,
      status: 'checked_in',
      paid_at: yesterday + 'T14:30:00Z',
      guest_name: 'Trần Thị Mai',
      email: 'mai.tran@company.vn',
      phone: '0912345678',
      room: INITIAL_ROOMS[2],
    },
    {
      id: 3,
      code: 'GLG-NAM123',
      room_name: 'River View Twin',
      check_in: tomorrow,
      check_out: hotelDate(3),
      guests: 2,
      total: 3780000,
      status: 'pending',
      paid_at: null,
      guest_name: 'Lê Hoàng Nam',
      email: 'nam.le@gmail.com',
      phone: '0987654321',
      room: INITIAL_ROOMS[1],
    },
    {
      id: 4,
      code: 'GLG-BAO999',
      room_name: 'Grand Riverfront King',
      check_in: last3Days,
      check_out: yesterday,
      guests: 2,
      total: 4400000,
      status: 'checked_out',
      paid_at: last3Days + 'T10:00:00Z',
      guest_name: 'Phạm Quốc Bảo',
      email: 'bao.pq@outlook.com',
      phone: '0933445566',
      room: INITIAL_ROOMS[3],
    },
  ];
}

type MockStore = {
  rooms: Room[];
  bookings: AdminBooking[];
  staff: User[];
  sessionUser: User | null;
};

let memoryStore: MockStore | null = null;

function loadStore(): MockStore {
  if (typeof window === 'undefined') {
    return {
      rooms: INITIAL_ROOMS,
      bookings: getInitialBookings(),
      staff: INITIAL_STAFF,
      sessionUser: null,
    };
  }

  if (memoryStore) return memoryStore;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      memoryStore = JSON.parse(raw);
      if (memoryStore && Array.isArray(memoryStore.rooms)) {
        return memoryStore;
      }
    }
  } catch {
    // fallback
  }

  memoryStore = {
    rooms: INITIAL_ROOMS,
    bookings: getInitialBookings(),
    staff: INITIAL_STAFF,
    sessionUser: null,
  };
  saveStore(memoryStore);
  return memoryStore;
}

function saveStore(store: MockStore) {
  memoryStore = store;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // ignore
    }
  }
}

export function handleMockRequest<T>(path: string, method = 'GET', body?: any): T {
  const store = loadStore();
  const [pathname, searchStr] = path.split('?');
  const query = new URLSearchParams(searchStr || '');

  // 1. GET /session
  if (pathname === '/session') {
    return {
      csrf: 'mock-csrf-token-' + Date.now(),
      user: store.sessionUser,
    } as T;
  }

  // 2. POST /login
  if (pathname === '/login' && method === 'POST') {
    const email = String(body?.email || 'admin@example.test').trim();
    const isStaff = email.toLowerCase().includes('staff') || email.toLowerCase().includes('letan');
    const matchedStaff = store.staff.find(s => s.email.toLowerCase() === email.toLowerCase());

    const user: User = matchedStaff || {
      id: isStaff ? 2 : 1,
      name: isStaff ? 'Lê Thu Ngân (Lễ tân)' : 'Nguyễn Quản Trị (Admin)',
      email: email || 'admin@example.test',
      role: isStaff ? 'staff' : 'admin',
    };

    store.sessionUser = user;
    saveStore(store);

    return {
      csrf: 'mock-csrf-token-' + Date.now(),
      user,
    } as T;
  }

  // 3. POST /logout
  if (pathname === '/logout' && method === 'POST') {
    store.sessionUser = null;
    saveStore(store);
    return undefined as T;
  }

  // 4. GET /rooms & GET /admin/rooms
  if (pathname === '/rooms' || pathname === '/admin/rooms') {
    if (pathname === '/rooms') {
      let filtered = store.rooms.filter(r => r.active !== false);
      const guests = query.get('guests');
      if (guests) {
        filtered = filtered.filter(r => r.capacity >= Number(guests));
      }
      return (filtered.length ? filtered : store.rooms) as T;
    }
    return store.rooms as T;
  }

  // 5. POST /admin/rooms or /rooms
  if ((pathname === '/admin/rooms' || pathname === '/rooms') && method === 'POST') {
    const newRoom: Room = {
      id: Date.now(),
      number: String(body?.number || '10' + (store.rooms.length + 1)),
      name: String(body?.name || 'Phòng mới'),
      description: String(body?.description || ''),
      image: body?.image || '/images/deluxe.webp',
      price: Number(body?.price || 1500000),
      capacity: Number(body?.capacity || 2),
      area: Number(body?.area || 30),
      bed: String(body?.bed || '1 giường đôi'),
      active: body?.active !== false,
    };
    store.rooms.unshift(newRoom);
    saveStore(store);
    return newRoom as T;
  }

  // 6. PUT /admin/rooms/:id
  if (pathname.startsWith('/admin/rooms/') && method === 'PUT') {
    const id = Number(pathname.split('/').pop());
    const index = store.rooms.findIndex(r => r.id === id);
    if (index !== -1) {
      store.rooms[index] = {
        ...store.rooms[index],
        ...body,
        price: Number(body.price ?? store.rooms[index].price),
        capacity: Number(body.capacity ?? store.rooms[index].capacity),
        area: Number(body.area ?? store.rooms[index].area),
        active: body.active !== undefined ? Boolean(body.active) : store.rooms[index].active,
      };
      saveStore(store);
      return store.rooms[index] as T;
    }
    throw new Error('Không tìm thấy phòng để cập nhật.');
  }

  // 7. DELETE /admin/rooms/:id
  if (pathname.startsWith('/admin/rooms/') && method === 'DELETE') {
    const id = Number(pathname.split('/').pop());
    store.rooms = store.rooms.filter(r => r.id !== id);
    saveStore(store);
    return undefined as T;
  }

  // 8. POST /bookings (Customer Booking)
  if (pathname === '/bookings' && method === 'POST') {
    const roomId = Number(body?.room_id);
    const room = store.rooms.find(r => r.id === roomId) || store.rooms[0];
    const checkIn = String(body?.check_in || hotelDate(0));
    const checkOut = String(body?.check_out || hotelDate(1));
    const nights = Math.max(1, (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000);
    const rate = Number(body?.quoted_rate || room.price);
    const total = Math.round(nights * rate);
    const code = 'GLG-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    const booking: AdminBooking = {
      id: Date.now(),
      code,
      room_name: room.name,
      check_in: checkIn,
      check_out: checkOut,
      guests: Number(body?.guests || 2),
      total,
      status: 'pending',
      paid_at: null,
      guest_name: String(body?.guest_name || 'Khách đặt phòng'),
      email: String(body?.email || ''),
      phone: String(body?.phone || ''),
      room,
    };

    store.bookings.unshift(booking);
    saveStore(store);
    return booking as T;
  }

  // 9. POST /bookings/lookup
  if (pathname === '/bookings/lookup' && method === 'POST') {
    const code = String(body?.code || '').trim().toUpperCase();
    const email = String(body?.email || '').trim().toLowerCase();

    const found = store.bookings.find(
      b => b.code.toUpperCase() === code && b.email.toLowerCase() === email
    );

    if (!found) {
      throw new Error('Không tìm thấy đơn đặt phòng với mã và email này. Vui lòng kiểm tra lại.');
    }
    return found as T;
  }

  // 10. GET /admin/dashboard
  if (pathname === '/admin/dashboard') {
    const today = hotelDate(0);
    const activeRooms = store.rooms.filter(r => r.active !== false).length;
    const arrivals = store.bookings.filter(b => b.check_in === today && b.status !== 'cancelled').length;
    const occupied = store.bookings.filter(b => b.status === 'checked_in').length;
    const pending = store.bookings.filter(b => b.status === 'pending').length;
    const revenue = store.bookings
      .filter(b => b.paid_at !== null)
      .reduce((sum, b) => sum + b.total, 0) || 12850000;

    const data: DashboardData = {
      rooms: activeRooms,
      arrivals: arrivals || 2,
      occupied: occupied || 1,
      pending,
      revenue,
    };
    return data as T;
  }

  // 11. GET /admin/bookings
  if (pathname === '/admin/bookings') {
    const q = (query.get('q') || '').trim().toLowerCase();
    const status = (query.get('status') || '').trim();
    const page = Math.max(1, Number(query.get('page') || 1));

    let list = [...store.bookings];

    if (status) {
      list = list.filter(b => b.status === status);
    }

    if (q) {
      list = list.filter(b =>
        b.code.toLowerCase().includes(q) ||
        b.guest_name.toLowerCase().includes(q) ||
        b.email.toLowerCase().includes(q) ||
        b.phone.toLowerCase().includes(q)
      );
    }

    const pageSize = 8;
    const totalPages = Math.ceil(list.length / pageSize) || 1;
    const paginated = list.slice((page - 1) * pageSize, page * pageSize);

    const result: BookingPageData = {
      data: paginated,
      current_page: page,
      last_page: totalPages,
    };
    return result as T;
  }

  // 12. PATCH /admin/bookings/:id (Update Status)
  if (pathname.startsWith('/admin/bookings/') && method === 'PATCH') {
    const id = Number(pathname.split('/').pop());
    const target = store.bookings.find(b => b.id === id);
    if (target && body?.status) {
      target.status = body.status as Status;
      saveStore(store);
      return target as T;
    }
    throw new Error('Không tìm thấy đơn đặt phòng để cập nhật.');
  }

  // 13. POST /admin/bookings/:id/payment (Record Payment)
  if (pathname.includes('/payment') && method === 'POST') {
    const id = Number(pathname.replace('/admin/bookings/', '').replace('/payment', ''));
    const target = store.bookings.find(b => b.id === id);
    if (target) {
      target.paid_at = new Date().toISOString();
      saveStore(store);
      return target as T;
    }
    throw new Error('Không tìm thấy đơn đặt phòng.');
  }

  // 14. GET /admin/staff
  if (pathname === '/admin/staff') {
    return store.staff as T;
  }

  // 15. POST /admin/staff
  if (pathname === '/admin/staff' && method === 'POST') {
    const newStaff: User = {
      id: Date.now(),
      name: String(body?.name || 'Nhân viên mới'),
      email: String(body?.email || 'staff@glghotel.vn'),
      role: 'staff',
    };
    store.staff.push(newStaff);
    saveStore(store);
    return newStaff as T;
  }

  // 16. PUT /admin/staff/:id
  if (pathname.startsWith('/admin/staff/') && method === 'PUT') {
    const id = Number(pathname.split('/').pop());
    const index = store.staff.findIndex(s => s.id === id);
    if (index !== -1) {
      store.staff[index] = {
        ...store.staff[index],
        name: body.name ?? store.staff[index].name,
        email: body.email ?? store.staff[index].email,
      };
      saveStore(store);
      return store.staff[index] as T;
    }
    throw new Error('Không tìm thấy nhân viên.');
  }

  // 17. DELETE /admin/staff/:id
  if (pathname.startsWith('/admin/staff/') && method === 'DELETE') {
    const id = Number(pathname.split('/').pop());
    store.staff = store.staff.filter(s => s.id !== id);
    saveStore(store);
    return undefined as T;
  }

  throw new Error(`Endpoint không tồn tại: ${method} ${pathname}`);
}
