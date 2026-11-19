'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { get, post, setCsrf, setPropertyId } from '@/lib/api';
import { Loading } from '@/components/ui';

export type Property = { id: number; code: string; name: string; timezone: string; currency: string; check_in_time: string; check_out_time: string };
export type SessionUser = {
  id: number; name: string; email: string; role: string; role_name: string | null; permissions: string[]; properties: Property[];
};

type Ctx = {
  user: SessionUser;
  property: Property;
  can: (...perms: string[]) => boolean;
  logout: () => Promise<void>;
  switchProperty: (id: number) => void;
};
const SessionCtx = createContext<Ctx | null>(null);

export function useSession(): Ctx {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** Ẩn phần giao diện người dùng không có quyền. Backend vẫn kiểm tra quyền độc lập. */
export function Can({ perm, children }: { perm: string | string[]; children: ReactNode }) {
  const { can } = useSession();
  return can(...(Array.isArray(perm) ? perm : [perm])) ? <>{children}</> : null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [propertyId, setPid] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await get<{ csrf: string; user: SessionUser | null }>('/session');
      setCsrf(s.csrf);
      if (!s.user) {
        router.replace(`/admin/dang-nhap?next=${encodeURIComponent(pathname)}`);
        return;
      }
      let stored = 0;
      try { stored = Number(window.localStorage.getItem('glg.property')); } catch { /* bộ nhớ trình duyệt bị chặn */ }
      const pid = s.user.properties.find(p => p.id === stored)?.id ?? s.user.properties[0]?.id ?? null;
      if (pid) setPropertyId(pid);
      setPid(pid);
      setUser(s.user);
    } catch {
      router.replace('/admin/dang-nhap');
    }
  }, [router, pathname]);

  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onUnauthorized = () => router.replace(`/admin/dang-nhap?next=${encodeURIComponent(window.location.pathname)}`);
    window.addEventListener('glg:unauthorized', onUnauthorized);
    return () => window.removeEventListener('glg:unauthorized', onUnauthorized);
  }, [router]);

  if (!user) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Loading label="Đang kiểm tra phiên đăng nhập…" /></div>;
  const property = user.properties.find(p => p.id === propertyId);
  if (!property) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <p>Tài khoản chưa được phân quyền cơ sở nào. Liên hệ quản lý.</p></div>;
  }

  const value: Ctx = {
    user,
    property,
    can: (...perms) => perms.every(p => user.permissions.includes(p)),
    logout: async () => {
      await post('/logout').catch(() => undefined);
      setCsrf('');
      router.replace('/admin/dang-nhap');
    },
    switchProperty: id => {
      try { window.localStorage.setItem('glg.property', String(id)); } catch { /* bỏ qua */ }
      setPropertyId(id);
      setPid(id);
      router.refresh();
    },
  };
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
