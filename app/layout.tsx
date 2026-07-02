import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from '@/components/Providers';
import { themeInitScript } from '@/lib/theme';
import { TAGLINE } from '@/lib/copy';

export const metadata: Metadata = {
  title: `WhatsVP — ${TAGLINE}`,
  description: `${TAGLINE} Discover events, join guilds, and connect with the communities around you.`,
  metadataBase: new URL('https://whatsvp.com'),
  openGraph: {
    title: 'WhatsVP',
    description: TAGLINE,
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
    { media: '(prefers-color-scheme: dark)', color: '#141412' },
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
