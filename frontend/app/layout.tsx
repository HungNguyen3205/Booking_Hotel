import type { Metadata } from 'next';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/vietnamese-400.css';
import '@fontsource/inter/vietnamese-600.css';
import '@fontsource/inter/vietnamese-700.css';
import '@fontsource/playfair-display/latin-500.css';
import '@fontsource/playfair-display/latin-400-italic.css';
import '@fontsource/playfair-display/vietnamese-500.css';
import '@fontsource/playfair-display/vietnamese-400-italic.css';
import './styles.css';

export const metadata: Metadata = {
  title: { default: 'GLG Hotel · Đà Nẵng', template: '%s · GLG Hotel' },
  description: 'Khám phá phòng nghỉ bên sông Hàn và đặt phòng trực tiếp tại GLG Hotel, Đà Nẵng.',
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="vi"><body>{children}</body></html>;
}
