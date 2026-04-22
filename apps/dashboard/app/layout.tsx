// Root layout — loads fonts, applies CSS variables, wraps all dashboard pages.
// Inter for UI text; JetBrains Mono for IDs, tool names, log entries.

import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Use distinct variable names so next/font and Tailwind v4 @theme don't collide.
// @theme references these via var(--font-inter) and var(--font-jetbrains-mono).
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Rind — Control Plane',
  description: 'Observability, safety, and security for AI agents.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-canvas text-foreground font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
