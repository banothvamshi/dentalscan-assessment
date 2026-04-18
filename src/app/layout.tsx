import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DentalScan AI",
  description:
    "AI-powered dental scan management. Capture, analyze, and collaborate on dental imagery with your care team.",
  keywords: ["dental", "scan", "AI", "telehealth", "dentistry"],
  authors: [{ name: "DentalScan AI" }],
  openGraph: {
    title: "DentalScan AI",
    description: "AI-powered dental scan management",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
