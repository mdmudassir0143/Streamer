import { AppNav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      <main className="container page">{children}</main>
      <Footer />
    </>
  );
}
