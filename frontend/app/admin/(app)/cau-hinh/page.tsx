'use client';

import { useEffect, useState } from 'react';
import { PageHead, RequirePerm } from '@/components/admin/shell';
import { useSession } from '@/components/admin/session';
import { Tabs } from '@/components/admin/modules/common';
import { HotelSettings } from '@/components/admin/modules/settings-hotel';
import { RoomsSetup } from '@/components/admin/modules/settings-rooms';
import { RatesSetup } from '@/components/admin/modules/settings-rates';
import { WebsiteSetup } from '@/components/admin/modules/settings-website';
import { IntegrationsSetup } from '@/components/admin/modules/settings-integrations';
import { AuditLog } from '@/components/admin/modules/settings-audit';
import { AutomationSettings } from '@/components/admin/modules/settings-automation';

type Key = 'automation' | 'hotel' | 'rooms' | 'rates' | 'website' | 'integrations' | 'audit';

export default function SettingsPage() {
  const { can } = useSession();
  const tabs: { key: Key; label: string; show: boolean }[] = [
    { key: 'automation', label: 'Tự động hóa', show: can('settings.manage') },
    { key: 'rooms', label: 'Phòng & sơ đồ', show: can('rooms.view') },
    { key: 'rates', label: 'Giá & chính sách', show: can('rooms.view') },
    { key: 'hotel', label: 'Khách sạn', show: can('settings.manage') },
    { key: 'website', label: 'Website', show: can('settings.manage') },
    { key: 'integrations', label: 'Thanh toán & tích hợp', show: can('settings.manage') },
    { key: 'audit', label: 'Nhật ký', show: can('audit.view') },
  ];
  const [tab, setTab] = useState<Key>(tabs.find(t => t.show)?.key ?? 'rooms');
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab') as Key | null;
    if (wanted && tabs.some(t => t.key === wanted && t.show)) setTab(wanted);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <RequirePerm perm="rooms.view">
      <div className="page">
        <PageHead title="Cấu hình" sub="Mọi số lượng, giá, chính sách và bố cục đều chỉnh tại đây — không gắn cứng trong giao diện." />
        <Tabs value={tab} onChange={setTab} tabs={tabs} />
        {tab === 'automation' && <AutomationSettings />}
        {tab === 'hotel' && <HotelSettings />}
        {tab === 'rooms' && <RoomsSetup />}
        {tab === 'rates' && <RatesSetup />}
        {tab === 'website' && <WebsiteSetup />}
        {tab === 'integrations' && <IntegrationsSetup />}
        {tab === 'audit' && <AuditLog />}
      </div>
    </RequirePerm>
  );
}
