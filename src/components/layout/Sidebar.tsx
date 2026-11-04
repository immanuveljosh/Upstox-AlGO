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
  Shield,
  Compass,
  History,
  Brain,
} from "lucide-react";

interface SidebarProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ isMobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { credentials, connectionStatus, strategy } = useTrading();

  interface NavLinkItem {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    badge: string | null;
    badgeColor?: string;
  }

  const navLinks: NavLinkItem[] = [
    {
      label: "Dashboard",
      href: "/",
      icon: LayoutDashboard,
      badge: null,
    },
    {
      label: "Strategy",
      href: "/strategy",
      icon: Compass,
      badge: strategy.status === "RUNNING" ? "ACTIVE" : "ITM 3",
      badgeColor:
        strategy.status === "RUNNING"
          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
          : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    },
    {
      label: "Backtest",
      href: "/backtest",
      icon: History,
      badge: "1M–1Y",
      badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    },
    {
      label: "Intelligence",
      href: "/strategy-intelligence",
      icon: Brain,
      badge: "PRO",
      badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    },
    {
      label: "Orders",
      href: "/orders",
      icon: ClipboardList,
      badge: "Live",
      badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    },
    {
      label: "P&L",
      href: "/pnl",
      icon: LineChart,
      badge: null,
    },
    {
      label: "Settings",
      href: "/settings",
      icon: Settings,
      badge: null,
    },
  ];

  const handleLogout = () => {
    router.push("/login");
    if (onCloseMobile) onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-950 border-r border-slate-800/80 text-slate-300">
      {/* Brand Header */}
      <div className="flex items-center justify-between h-16 px-5 border-b border-slate-800/80">
        <Link
          href="/"
          onClick={onCloseMobile}
          className="flex items-center gap-2.5 group"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-slate-950 font-black text-base shadow-md shadow-emerald-950">
            ▲
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white tracking-tight text-sm">
                UPSTOX ALGO
              </span>
              <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                PRO
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium tracking-wide">
              Nifty Directional Desk
            </span>
          </div>
        </Link>

        {/* Mobile close button */}
        <button
          onClick={onCloseMobile}
          aria-label="Close Sidebar"
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation links */}
      <div className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
        <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Main Console
        </div>

        {navLinks.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all group ${
                isActive
                  ? "bg-slate-900 text-white border border-slate-700/80 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive
                      ? "text-emerald-400"
                      : "text-slate-400 group-hover:text-slate-300"
                  }`}
                />
                <span className="tracking-wide">{item.label}</span>
              </div>

              {item.badge && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                    item.badgeColor ||
                    "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Broker Session Info */}
      <div className="p-3 mx-3 mb-3 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center justify-between text-xs mb-2">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-semibold text-slate-200 text-[11px]">
              {credentials.accountName}
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            UCC: {credentials.ucc}
          </span>
        </div>

        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400 border-t border-slate-800/80">
          <span>Broker API</span>
          <span
            className={`font-mono text-[10px] ${
              connectionStatus === "CONNECTED"
                ? "text-emerald-400"
                : "text-rose-400"
            }`}
          >
            {connectionStatus === "CONNECTED" ? "UPSTOX v2 LIVE" : "DISCONNECTED"}
          </span>
        </div>
      </div>

      {/* Logout button */}
      <div className="p-3 border-t border-slate-800/80">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Disconnect & Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative w-64 max-w-xs h-full z-10">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
