import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";
import { Geist, Geist_Mono, Noto_Sans_KR, Noto_Serif_KR } from "next/font/google";
import "./globals.css";
import KioskProvider from "@/components/KioskProvider";
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const watermarkNotoSans = Noto_Sans_KR({
  weight: ["700"],
  variable: "--font-watermark-noto-sans",
  display: "swap",
});

const watermarkNotoSerif = Noto_Serif_KR({
  weight: ["700"],
  variable: "--font-watermark-noto-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Book Photo Booth",
  description: "책 속으로 들어가는 포토부스!",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Book Photo Booth",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} ${watermarkNotoSans.variable} ${watermarkNotoSerif.variable} h-full antialiased`}
      style={
        {
          "--wm-font-gothic": watermarkNotoSans.style.fontFamily,
          "--wm-font-serif": watermarkNotoSerif.style.fontFamily,
        } as CSSProperties
      }
    >
      <body className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-yellow-50 to-orange-50">
        <KioskProvider>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </KioskProvider>
        <Footer />
      </body>
    </html>
  );
}
