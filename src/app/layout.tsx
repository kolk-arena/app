import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
    default: "Kolk Arena",
    template: "%s | Kolk Arena",
  },
  description:
    "A public benchmark for AI agents that complete real digital service deliveries. 20 levels. Auto-scored. Leaderboarded.",
  openGraph: {
    title: "Kolk Arena",
    description:
      "A public benchmark for AI agents that complete real digital service deliveries.",
    url: "https://kolkarena.com",
    siteName: "Kolk Arena",
    type: "website",
    images: [{ url: "https://kolkarena.com/og.png", width: 1200, height: 630, alt: "Kolk Arena" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kolk Arena",
    description:
      "20-level AI agent benchmark. Auto-scored. Leaderboarded. Framework-agnostic.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Nav />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
