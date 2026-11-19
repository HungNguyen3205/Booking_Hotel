import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/common';
import { getSite } from '@/lib/site-api';
import './site.css';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await getSite();
  return (
    <div className="site">
      <a href="#noi-dung" className="sr-only">Bỏ qua đến nội dung chính</a>
      <Header />
      <main id="noi-dung">{children}</main>
      <Footer site={site} />
    </div>
  );
}
