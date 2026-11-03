"use client";

import React, { useState } from "react";
import { useTrading } from "@/context/TradingContext";
import { ConnectionBadge } from "@/components/ui/ConnectionBadge";
import {
  Key,
  Lock,
  Globe,
  RefreshCw,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";

export function BrokerSettings() {
  const { credentials, updateCredentials, connectionStatus, toggleConnection, addToast } =
    useTrading();

  const [apiKey, setApiKey] = useState(credentials.apiKey);
  const [apiSecret, setApiSecret] = useState(credentials.apiSecret);
  const [redirectUrl, setRedirectUrl] = useState(credentials.redirectUrl);
  const [showSecret, setShowSecret] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateCredentials({
      apiKey,
      apiSecret,
      redirectUrl,
    });
  };

  const handleCopyRedirect = () => {
    navigator.clipboard.writeText(redirectUrl);
    setIsCopied(true);
    addToast({
      type: "info",
      title: "Copied",
      message: "Redirect URL copied to clipboard.",
    });
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white tracking-tight">
              Broker API Connection (Upstox)
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage your Upstox v2 Developer credentials, WebSocket tokens, and OAuth callback.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ConnectionBadge />
          <button
            onClick={toggleConnection}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{connectionStatus === "CONNECTED" ? "Disconnect" : "Reconnect"}</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="mt-5 space-y-4">
        {/* API Key */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            API Key (Client ID)
          </label>
          <div className="relative">
            <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
              placeholder="e.g. ups_live_xxxxxxxxxxxx"
            />
          </div>
        </div>

        {/* API Secret */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            API Secret
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type={showSecret ? "text" : "password"}
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-10 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
              placeholder="••••••••••••••••"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Redirect URL */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            OAuth Redirect URL
          </label>
          <div className="relative flex items-center">
            <Globe className="w-4 h-4 absolute left-3 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={redirectUrl}
              onChange={(e) => setRedirectUrl(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-24 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500/50"
            />
            <button
              type="button"
              onClick={handleCopyRedirect}
              className="absolute right-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium flex items-center gap-1 transition-colors"
            >
              {isCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{isCopied ? "Copied" : "Copy"}</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Ensure this exact URL matches your registered Upstox developer console callback.
          </p>
        </div>

        {/* Submit Save */}
        <div className="pt-2 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Active session: <strong className="text-slate-300">{credentials.ucc}</strong> ({credentials.accountName})
          </span>

          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold transition-all shadow-md shadow-emerald-950 cursor-pointer"
          >
            Update API Credentials
          </button>
        </div>
      </form>
    </div>
  );
}

