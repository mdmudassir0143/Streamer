import type { Metadata } from 'next';
import { Schibsted_Grotesk } from 'next/font/google';
import { Providers } from '@/components/Providers';
import './globals.css';

const schibsted = Schibsted_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-schibsted' });

export const metadata: Metadata = {
  title: 'StreamPilot',
  description: "Your AI trader can only touch what you've streamed. Bounded-exposure AI trading on HashKey Chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={schibsted.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
