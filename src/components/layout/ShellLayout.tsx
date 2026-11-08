"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { KillSwitchModal } from "@/components/ui/KillSwitchModal";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { CriticalAlertBanner } from "@/components/dashboard/CriticalAlertBanner";

export function ShellLayout({ children }: { children: React.ReactNode }) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/auth/callback") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans text-sm">
        {children}
        <ToastContainer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans text-sm selection:bg-emerald-500 selection:text-slate-950">
      <div className="flex-1 flex min-w-0">
        {/* Left Sidebar (240px desktop, drawer mobile) */}
        <Sidebar
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Main Content Column */}
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar
            onToggleMobileSidebar={() =>
              setIsMobileSidebarOpen(!isMobileSidebarOpen)
            }
          />
          <main className="flex-1 p-6 max-w-[1400px] w-full mx-auto space-y-6">
            <CriticalAlertBanner />
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
