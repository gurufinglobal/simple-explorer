import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { MuiProvider } from "@/components/mui-provider";
import { WalletPortfolioHydrator } from "@/components/wallet/wallet-portfolio-hydrator";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Guru Chain 라이트 Scanner",
  description: "지갑 연동과 체인 탐색을 제공하는 웹 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <MuiProvider>
          <WalletPortfolioHydrator />
          {children}
        </MuiProvider>
      </body>
    </html>
  );
}
