import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Stream Mind — AI-Powered Live Streaming",
  description: "The future of live content creation. AI co-pilot, instant edits, viral clips — all in real-time.",
  manifest: "/manifest.json",
  themeColor: "#000000",
  openGraph: {
    title: "Stream Mind — AI-Powered Live Streaming",
    description: "The future of live content creation. AI co-pilot, instant edits, viral clips — all in real-time.",
    type: "website",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
