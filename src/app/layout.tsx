import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'INVT Disparador',
  description: 'Agende e acompanhe campanhas para grupos de WhatsApp.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full font-sans antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto px-8 py-8 md:px-9 md:py-[30px]">{children}</main>
        </div>
      </body>
    </html>
  );
}
