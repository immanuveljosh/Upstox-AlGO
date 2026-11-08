"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTrading } from "@/context/TradingContext";
import {
  LayoutDashboard,
  ClipboardList,
  LineChart,
  Settings,
  LogOut,
  X,
  Compass,
  History,
  TableProperties,
} from "lucide-react";

interface SidebarProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ isMobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { credentials, strategy } = useTrading();

  interface NavLinkItem {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string | null;
  }

  const navLinks: NavLinkItem[] = [
    {
      label: "Dashboard",
      href: "/",
      icon: LayoutDashboard,
    },
    {
      label: "Strategy",
      href: "/strategy",
      icon: Compass,
      badge: strategy.status === "RUNNING" ? "Running" : null,
    },
    {
      label: "Backtest",
      href: "/backtest",
      icon: History,
    },
    {
      label: "Trade History",
      href: "/trade-history",
      icon: TableProperties,
    },
    {
      label: "Orders",
      href: "/orders",
      icon: ClipboardList,
    },
    {
      label: "P&L",
      href: "/pnl",
      icon: LineChart,
    },
    {
      label: "Settings",
      href: "/settings",
      icon: Settings,
    },
  ];

  const handleLogout = () => {
    router.push("/login");
    if (onCloseMobile) onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-950 border-r border-slate-800 text-slate-300">
      {/* Brand Header */}
      <div className="flex items-center justify-between h-16 px-5 border-b border-slate-800">
        <Link
          href="/"
          onClick={onCloseMobile}
          className="flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
            ▲
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-slate-100 tracking-tight text-sm">
              Upstox Algo
            </span>
            <span className="text-xs text-slate-400">
              Nifty Directional
            </span>
          </div>
        </Link>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close Sidebar"
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main Navigation">
        {navLinks.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-slate-900 text-slate-100 border border-slate-800"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50 border border-transparent"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? "text-emerald-400" : "text-slate-400"
                  }`}
                />
                <span>{item.label}</span>
              </div>

              {item.badge && (
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Compact Account & Settings Link */}
      <div className="p-4 border-t border-slate-800 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="truncate">
            <span className="text-slate-200 font-medium">{credentials.accountName}</span>
            <span className="mx-1.5 text-slate-600">&bull;</span>
            <span className="font-mono">{credentials.ucc}</span>
          </div>
          <Link
            href="/settings"
            onClick={onCloseMobile}
            className="text-xs font-medium text-emerald-400 hover:text-emerald-300 shrink-0"
          >
            Settings
          </Link>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar (240px) */}
      <aside className="hidden lg:block w-60 shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile & Tablet Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <div className="relative w-60 max-w-xs h-full z-10">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
