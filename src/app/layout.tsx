import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { copy } from "@/i18n";
import { APP_CONFIG } from "@/lib/frontend/app-config";
import { Nav } from "./nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: copy.meta.titleDefault,
    template: copy.meta.titleTemplate,
  },
  description: copy.meta.description,
  openGraph: {
    title: APP_CONFIG.name,
    description: copy.meta.openGraphDescription,
    url: APP_CONFIG.canonicalOrigin,
    siteName: APP_CONFIG.name,
    type: "website",
    images: [{ url: `${APP_CONFIG.canonicalOrigin}/og.png`, width: 1200, height: 630, alt: APP_CONFIG.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: APP_CONFIG.name,
    description: copy.meta.twitterDescription,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang={copy.localeCode}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Nav />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
