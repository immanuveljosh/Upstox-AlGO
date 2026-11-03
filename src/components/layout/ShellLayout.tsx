"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { KillSwitchModal } from "@/components/ui/KillSwitchModal";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { useTrading } from "@/context/TradingContext";
import { History } from "lucide-react";

export function ShellLayout({ children }: { children: React.ReactNode }) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const { mode } = useTrading();
  const pathname = usePathname();

  // If on login page, render full-bleed clean login screen
  if (pathname === "/login") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
        {children}
        <ToastContainer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Banner when in Backtest Mode */}
      {mode === "BACKTEST" && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-300 px-4 py-1.5 text-xs flex items-center justify-center gap-2 font-medium tracking-wide">
          <History className="w-3.5 h-3.5" />
          <span>
            <strong>BACKTEST SIMULATION MODE ACTIVE:</strong> Orders are simulated in paper sandbox using historical Nifty candles. Real Upstox capital is unaffected.
          </span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <TopBar onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)} />
          <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
            {children}
          </main>
        </div>
      </div>

      {/* Global Modals & Notifications */}
      <KillSwitchModal />
      <ToastContainer />
    </div>
  );
}
