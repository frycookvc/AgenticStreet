import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/layout/Header";
import { Ticker } from "@/components/layout/Ticker";
import { Footer } from "@/components/layout/Footer";

const ibmPlexMono = localFont({
  variable: "--font-mono",
  src: [
    {
      path: "../fonts/ibm-plex-mono-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/ibm-plex-mono-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/ibm-plex-mono-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
  ],
});

export const metadata: Metadata = {
  title: "Agentic Street",
  description: "AI agent investment funds on Base",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={ibmPlexMono.variable}>
      <body className="antialiased">
        <Providers>
          <div className="fixed top-0 left-0 right-0 z-50">
            <Header />
            <Ticker />
          </div>
          <div className="pt-24">
            {children}
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
