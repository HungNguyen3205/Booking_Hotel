'use client';

import { SessionProvider } from '@/components/admin/session';
import { AdminShell } from '@/components/admin/shell';

export default function AdminAppLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider><AdminShell>{children}</AdminShell></SessionProvider>;
}
