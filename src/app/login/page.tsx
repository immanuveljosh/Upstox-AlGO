"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Zap,
  ArrowRight,
  TrendingUp,
  Activity,
  Lock,
  Layers,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [ucc, setUcc] = useState("298410");
  const [apiKey, setApiKey] = useState("ups_live_948a27b841a049e29f4a");

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate fast broker handshake
    setTimeout(() => {
      router.push("/");
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Background subtle grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b12_1px,transparent_1px),linear-gradient(to_bottom,#1e293b12_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Subtle top ambient glow */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-slate-950 font-black text-xl mb-3 shadow-xl shadow-emerald-950/60">
            ▲
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Upstox Algo Trading Desk
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
            Nifty Intraday Index Option Directional Trading System &bull; High Frequency Order Execution
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 md:p-8 shadow-2xl backdrop-blur-xl">
          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Upstox Client ID (UCC)
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={ucc}
                  onChange={(e) => setUcc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
                  placeholder="e.g. 298410"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                API Key
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
                  placeholder="e.g. ups_live_xxxxxxxx"
                />
              </div>
            </div>

            {/* Connect with Upstox Primary Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all duration-200 shadow-lg shadow-emerald-950/80 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Authorizing Upstox Session...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-current" />
                    <span>Connect with Upstox</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Quick Sandbox Link */}
          <div className="mt-4 pt-4 border-t border-slate-800/80 text-center">
            <button
              onClick={() => router.push("/")}
              className="text-xs text-slate-400 hover:text-emerald-400 transition-colors inline-flex items-center gap-1 font-medium"
            >
              <span>Explore Dashboard in Backtest Demo</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* System Safeguards Footer */}
        <div className="mt-6 grid grid-cols-3 gap-2 text-center text-[10px] text-slate-500">
          <div className="p-2 rounded-lg bg-slate-900/50 border border-slate-800/60">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-1" />
            <span>256-Bit Encrypted</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/50 border border-slate-800/60">
            <Activity className="w-3.5 h-3.5 text-cyan-400 mx-auto mb-1" />
            <span>18ms Tick Stream</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/50 border border-slate-800/60">
            <Lock className="w-3.5 h-3.5 text-amber-400 mx-auto mb-1" />
            <span>Kill Switch Ready</span>
          </div>
        </div>
      </div>
    </div>
  );
}

