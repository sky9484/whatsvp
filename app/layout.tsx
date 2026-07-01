import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from '@/components/Providers';
import { themeInitScript } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'WhatsVP — KL Builder Scene',
  description: 'Discover events and connect with the Kuala Lumpur builder & founder community.',
  metadataBase: new URL('https://whatsvp.com'),
  openGraph: {
    title: 'WhatsVP',
    description: 'Live map of the KL builder & founder scene.',
    siteName: 'WhatsVP',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F5EF' },
    { media: '(prefers-color-scheme: dark)', color: '#161614' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-paper text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
