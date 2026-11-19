import type { Metadata } from 'next';
import { ToastProvider } from '@/components/ui';
import './admin.css';
import './core.css';

// Khu quản trị: không lập chỉ mục, không đưa vào sitemap.
export const metadata: Metadata = {
  title: { default: 'Quản trị', template: '%s · Quản trị GLG' },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
