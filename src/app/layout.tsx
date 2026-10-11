import type {Metadata, Viewport} from 'next';
import './globals.css';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { KioskoPrintManager } from '@/components/kiosko-print-manager';

const faviconSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23FF8C00' d='M12 2.1c-.1 0-7.1 6.8-7.1 11.4 0 3.9 3.2 7.1 7.1 7.1V2.1z'/%3E%3Cpath fill='%2300BFFF' d='M12 2.1v18.5c3.9 0 7.1-3.2 7.1-7.1 0-4.6-7-11.4-7.1-11.4z'/%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: 'Colmadom - Gestión de Colmados',
  description: 'La plataforma SaaS definitiva para el colmado dominicano modernizado.',
  manifest: '/manifest.json',
  icons: {
    icon: faviconSvg,
    apple: faviconSvg,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Colmadom',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&display=swap" rel="stylesheet" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="font-body antialiased bg-background text-foreground overflow-x-hidden">
        <FirebaseClientProvider>
          <KioskoPrintManager />
          <SidebarProvider defaultOpen={false}>
            <div className="flex min-h-screen w-full">
              <AppSidebar />
              <main className="flex-1 overflow-auto bg-muted/10">
                {children}
              </main>
            </div>
            <Toaster />
          </SidebarProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
