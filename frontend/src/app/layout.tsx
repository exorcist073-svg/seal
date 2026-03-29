import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { CustomCursor } from "@/components/oci/CustomCursor";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "900"],
});

export const metadata: Metadata = {
  title: "SĒAL — Secure Enclave Agent Layer",
  description:
    "Confidential, verifiable execution infrastructure for AI agents operating on-chain. Commit, attest, execute, deliver.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#f5f5f0] font-sans text-[#05058a]">
        <CustomCursor />
        {children}
      </body>
    </html>
  );
}
