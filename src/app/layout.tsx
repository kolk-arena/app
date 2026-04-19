import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { copy } from "@/i18n";
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
    title: copy.app.name,
    description: copy.meta.openGraphDescription,
    url: copy.app.canonicalOrigin,
    siteName: copy.app.name,
    type: "website",
    images: [{ url: `${copy.app.canonicalOrigin}/og.png`, width: 1200, height: 630, alt: copy.app.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: copy.app.name,
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
