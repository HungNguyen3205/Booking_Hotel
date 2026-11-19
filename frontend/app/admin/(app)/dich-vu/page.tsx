'use client';

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHead, RequirePerm } from '@/components/admin/shell';
import { useSession } from '@/components/admin/session';
import { ErrorState, Loading, useLoad } from '@/components/ui';
import { get } from '@/lib/api';
import { Tabs } from '@/components/admin/modules/common';
import { ServiceCatalog, Service } from '@/components/admin/modules/service-cards';
import { InventoryPanel } from '@/components/admin/modules/inventory';
import { PackagesPanel, Pkg } from '@/components/admin/modules/service-packages';

type Data = { services: Service[]; packages: Pkg[]; categories: Record<string, string>; category_images: Record<string, string> };
type Tab = 'services' | 'inventory' | 'combo';

function ServicesAndStock() {
  const { can } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const showServices = can('services.post');
  const showStock = can('inventory.view');
  const requested = params.get('tab') === 'kho' ? 'inventory' : params.get('tab') === 'combo' ? 'combo' : 'services';
  const tab: Tab = requested === 'inventory' && showStock ? 'inventory' : !showServices && showStock ? 'inventory' : requested === 'inventory' ? 'services' : requested;
  const d = useLoad(() => (showServices ? get<Data>('/admin/services') : Promise.resolve(null)), [showServices]);
  const setTab = (t: Tab) => router.replace(`${pathname}${t === 'services' ? '' : `?tab=${t === 'inventory' ? 'kho' : 'combo'}`}`, { scroll: false });

  return (
    <div className="page">
      <PageHead title="Dịch vụ & Kho" sub="Bấm thẻ dịch vụ để ghi vào phòng đang ở hoặc bán lẻ. Dịch vụ có liên kết kho tự trừ tồn đúng một lần." />
      <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'services', label: 'Dịch vụ', show: showServices },
        { key: 'inventory', label: 'Kho', show: showStock },
        { key: 'combo', label: 'Combo', show: showServices },
      ]} />
      {tab !== 'inventory' && (d.error ? <ErrorState error={d.error} onRetry={() => d.reload()} /> : !d.data ? <Loading /> : tab === 'services'
        ? <ServiceCatalog services={d.data.services} categories={d.data.categories} categoryImages={d.data.category_images} onChanged={() => d.reload(true)} />
        : <PackagesPanel packages={d.data.packages} services={d.data.services} onChanged={() => d.reload(true)} />)}
      {tab === 'inventory' && <InventoryPanel />}
    </div>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const { can } = useSession();
  return <RequirePerm perm={can('services.post') ? 'services.post' : 'inventory.view'}>{children}</RequirePerm>;
}

export default function ServicesPage() {
  return <Gate><Suspense fallback={<Loading />}><ServicesAndStock /></Suspense></Gate>;
}
