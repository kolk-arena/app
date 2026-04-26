import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { copy } from "@/i18n";
import { APP_CONFIG } from "@/lib/frontend/app-config";
import { Nav } from "./nav";
import { Footer } from "./footer";
import "./globals.css";

const productBrandName = "Kolk";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(APP_CONFIG.canonicalOrigin),
  title: {
    default: copy.meta.titleDefault,
    template: copy.meta.titleTemplate,
  },
  description: copy.meta.description,
  openGraph: {
    title: copy.meta.titleDefault,
    description: copy.meta.openGraphDescription,
    url: APP_CONFIG.canonicalOrigin,
    siteName: productBrandName,
    type: "website",
    images: [{ url: `${APP_CONFIG.canonicalOrigin}/og.png`, width: 1200, height: 630, alt: productBrandName }],
  },
  twitter: {
    card: "summary_large_image",
    title: copy.meta.titleDefault,
    description: copy.meta.twitterDescription,
    site: APP_CONFIG.twitterHandle,
    creator: APP_CONFIG.twitterHandle,
  },
  alternates: {
    types: {
      "application/json": [
        {
          title: "Kolk automation manifest",
          url: `${APP_CONFIG.canonicalOrigin}/ai-action-manifest.json`,
        },
      ],
      "text/markdown": [
        {
          title: "Kolk workspace file",
          url: `${APP_CONFIG.canonicalOrigin}/kolk_workspace.md`,
        },
      ],
      "text/plain": [
        {
          title: "Kolk LLM index",
          url: `${APP_CONFIG.canonicalOrigin}/llms.txt`,
        },
      ],
    },
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
        <Footer />
      </body>
    </html>
  );
}
