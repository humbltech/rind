// Root layout — loads fonts, applies CSS variables, wraps all dashboard pages.
// Inter for UI text; JetBrains Mono for IDs, tool names, log entries.

import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Aegis — Control Plane',
  description: 'Observability, safety, and security for AI agents.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-canvas text-foreground font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
