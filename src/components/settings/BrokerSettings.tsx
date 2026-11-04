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
  Zap,
  ExternalLink,
  Info,
  Layers,
} from "lucide-react";

export function BrokerSettings() {
  const { credentials, updateCredentials, connectionStatus, toggleConnection, addToast } =
    useTrading();

  const [apiKey, setApiKey] = useState(credentials.apiKey);
  const [apiSecret, setApiSecret] = useState(credentials.apiSecret);
  const [redirectUrl, setRedirectUrl] = useState(credentials.redirectUrl);
  const [accessToken, setAccessToken] = useState(credentials.accessToken);
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateCredentials({
      apiKey,
      apiSecret,
      redirectUrl,
      accessToken,
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

  const handleOAuthAuthorize = () => {
    setIsAuthorizing(true);
    const clientId = apiKey || credentials.apiKey || "22e100c2-59e7-4d4d-98a0-d69ae3b08c87";
    const callback = redirectUrl || credentials.redirectUrl || "http://localhost:8000/api/v1/auth/callback";
    const upstoxDialogUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(callback)}`;
    
    // Redirect browser to Upstox login dialog
    window.location.href = upstoxDialogUrl;
  };

  return (
    <div className="space-y-6">
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
              Manage your Upstox v2 Developer credentials, OAuth 2.0 authorization, and live session tokens.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ConnectionBadge />
            <button
              type="button"
              onClick={handleOAuthAuthorize}
              disabled={isAuthorizing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-slate-950 transition-all shadow-md shadow-emerald-950 cursor-pointer disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>{isAuthorizing ? "Redirecting..." : "Login with Upstox"}</span>
            </button>
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
                placeholder="e.g. 22e100c2-59e7-4d4d-98a0-d69ae3b08c87"
              />
            </div>
          </div>

          {/* API Secret */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              API Secret (Client Secret)
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Registered OAuth Redirect URI
              </label>
              <a
                href="https://account.upstox.com/developer/apps"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
              >
                <span>Upstox Developer Apps</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
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
                <span>{isCopied ? "Copied" : "Copy URI"}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Important: This must exactly match the Redirect URI registered in your Upstox Developer App console.
            </p>
          </div>

          {/* Active Access Token */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Active Access Token (Auto-renewed via OAuth 2.0 or Manual Override)
            </label>
            <div className="relative">
              <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type={showToken ? "text" : "password"}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-10 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 truncate"
                placeholder="eyJ0eXAiOiJKV1QiLC..."
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Save */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500">
              Active session UCC: <strong className="text-slate-300">{credentials.ucc}</strong> ({credentials.accountName})
            </span>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold transition-all shadow-md shadow-emerald-950 cursor-pointer"
              >
                Update API Credentials
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Upstox OAuth 2.0 Standard Architecture Guide Card */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-3">
        <div className="flex items-center gap-2 text-slate-200">
          <Info className="w-4 h-4 text-emerald-400" />
          <h4 className="text-xs font-bold uppercase tracking-wider">
            Upstox OAuth 2.0 Authorization Code Flow
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold mb-1">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-center leading-5 text-[10px]">1</span>
              <span>Authorization Request</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Customer is redirected to Upstox login dialog. Customer signs in via 2FA/TOTP.
            </p>
            <div className="mt-2 text-[10px] font-mono text-slate-500 truncate">
              api.upstox.com/v2/login/authorization/dialog
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-cyan-400 font-semibold mb-1">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-center leading-5 text-[10px]">2</span>
              <span>Callback with Code</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Upstox redirects to your registered redirect URI with a single-use authorization code.
            </p>
            <div className="mt-2 text-[10px] font-mono text-slate-500 truncate">
              ?code=xxxxxx&state=yyyyyy
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-amber-400 font-semibold mb-1">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-center leading-5 text-[10px]">3</span>
              <span>Token Exchange</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Backend server securely exchanges the code for the daily access token and activates the stream.
            </p>
            <div className="mt-2 text-[10px] font-mono text-slate-500 truncate">
              POST /v2/login/authorization/token
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
