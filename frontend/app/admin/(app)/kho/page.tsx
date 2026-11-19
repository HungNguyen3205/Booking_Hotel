'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loading } from '@/components/ui';

/** Kho đã gộp vào "Dịch vụ & Kho"; giữ đường dẫn cũ. */
export default function InventoryRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/dich-vu?tab=kho'); }, [router]);
  return <Loading label="Đang chuyển tới Dịch vụ & Kho…" />;
}
