import type { Metadata, Viewport } from 'next';
import '@fontsource/inter/vietnamese-400.css';
import '@fontsource/inter/vietnamese-500.css';
import '@fontsource/inter/vietnamese-600.css';
import '@fontsource/inter/vietnamese-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/playfair-display/vietnamese-500.css';
import '@fontsource/playfair-display/latin-500.css';
import '@fontsource/playfair-display/vietnamese-400-italic.css';
import '@fontsource/playfair-display/latin-400-italic.css';
import './globals.css';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'GLG HOTEL & SPA · Khách sạn tại 1081 Ngô Quyền, Đà Nẵng', template: '%s · GLG HOTEL & SPA' },
  description: 'GLG HOTEL & SPA — khách sạn boutique gần gũi thiên nhiên tại 1081 Ngô Quyền, Đà Nẵng. Xem loại phòng, tiện ích Mộc Spa và đặt phòng trực tiếp.',
  applicationName: 'GLG HOTEL & SPA',
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: '#233D35', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
