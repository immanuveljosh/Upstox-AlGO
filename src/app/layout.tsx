import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TradingProvider } from "@/context/TradingContext";
import { ShellLayout } from "@/components/layout/ShellLayout";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Upstox Algo Trading Desk | Nifty Directional Options",
  description:
    "Institutional dark-theme trading terminal for Nifty intraday index option directional trading (Call / Put) powered by Upstox v2 API.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <TradingProvider>
          <ShellLayout>{children}</ShellLayout>
        </TradingProvider>
      </body>
    </html>
  );
}

