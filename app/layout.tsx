import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BenchmarkProvider } from "@/components/benchmarks/benchmark-provider";
import { ProfilesProvider } from "@/components/profiles/profiles-provider";
import { ProductProvider } from "@/components/setup/product-provider";
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
  title: "Akif CPG — Pricing Architect",
  description:
    "Pricing, landed-cost and trade-spend planning platform for CPG brands and manufacturers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BenchmarkProvider>
          <ProfilesProvider>
            <ProductProvider>{children}</ProductProvider>
          </ProfilesProvider>
        </BenchmarkProvider>
      </body>
    </html>
  );
}
