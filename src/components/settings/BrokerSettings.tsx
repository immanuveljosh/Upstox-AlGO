"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTrading } from "@/context/TradingContext";
import { ConnectionBadge } from "@/components/ui/ConnectionBadge";
import { formatISTDateTime } from "@/lib/format";
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
  AlertCircle,
  UserCheck,
  LogOut,
  Clock,
  Activity,
  Check,
} from "lucide-react";

export function BrokerSettings() {
  const {
    credentials,
    updateCredentials,
    connectionStatus,
    toggleConnection,
    disconnectBroker,
    reconnectBroker,
    latencyMs,
    lastVerified,
    addToast,
  } = useTrading();

  const [apiKey, setApiKey] = useState(credentials.apiKey || "");
  const [apiSecret, setApiSecret] = useState("");
  const [redirectUrl, setRedirectUrl] = useState(
    credentials.redirectUrl || "http://localhost:8000/api/v1/auth/callback"
  );
  const [accessToken, setAccessToken] = useState("");
  const [hasConfiguredSecret, setHasConfiguredSecret] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Load genuine backend credentials on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("http://localhost:8000/api/v1/settings/all");
        if (res.ok) {
          const json = await res.json();
          const d = json.data;
          if (d) {
            if (d.api_key) setApiKey(d.api_key);
            if (d.redirect_uri) setRedirectUrl(d.redirect_uri);
            if (d.has_api_secret) setHasConfiguredSecret(true);
            if (d.access_token_masked) setAccessToken(d.access_token_masked);
          }
        }
      } catch {
        // Backend offline
      }
    }
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      addToast({
        type: "error",
        title: "Validation Error",
        message: "API Key (Client ID) cannot be empty.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload: Record<string, string> = {
        api_key: apiKey.trim(),
        redirect_uri: redirectUrl.trim(),
      };
      // Only include secret if user entered a new secret
      if (apiSecret.trim()) {
        payload.api_secret = apiSecret.trim();
      }
      // Only include token if user entered an unmasked token
      if (accessToken.trim() && !accessToken.includes("••••")) {
        payload.access_token = accessToken.trim();
      }

      const res = await fetch("http://localhost:8000/api/v1/settings/broker", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (res.ok) {
        if (apiSecret.trim()) {
          setHasConfiguredSecret(true);
          setApiSecret("");
        }
        updateCredentials({
          apiKey: apiKey.trim(),
          redirectUrl: redirectUrl.trim(),
          ucc: json.data?.user_id || credentials.ucc,
          accountName: json.data?.user_name || credentials.accountName,
        });

        if (json.data?.is_connected) {
          addToast({
            type: "success",
            title: "Upstox Live Verified",
            message: `Connected as ${json.data.user_name || "User"} (${json.data.user_id || "UCC"}).`,
          });
        } else {
          addToast({
            type: "info",
            title: "Credentials Saved",
            message: json.message || "Upstox credentials updated in backend database.",
          });
        }
      } else {
        addToast({
          type: "error",
          title: "Save Failed",
          message: json.message || "Failed to update broker credentials.",
        });
      }
    } catch (err: any) {
      addToast({
        type: "error",
        title: "Connection Error",
        message: err?.message || "Could not reach FastAPI server at http://localhost:8000.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyRedirect = () => {
    navigator.clipboard.writeText(redirectUrl);
    setIsCopied(true);
    addToast({
      type: "info",
      title: "Copied",
      message: "Redirect URI copied to clipboard.",
    });
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleOAuthAuthorize = async () => {
    setIsAuthorizing(true);
    try {
      // Obtain official Upstox OAuth URL with CSRF state protection from backend
      const res = await fetch("http://localhost:8000/api/v1/auth/login");
      const json = await res.json();

      if (res.ok && json.data?.authorization_url) {
        // Redirect browser to official Upstox dialog
        window.location.href = json.data.authorization_url;
      } else {
        addToast({
          type: "error",
          title: "OAuth Initialization Failed",
          message: json.message || "Could not generate Upstox OAuth authorization URL.",
        });
        setIsAuthorizing(false);
      }
    } catch {
      addToast({
        type: "error",
        title: "Backend Unreachable",
        message: "Failed to connect to backend on http://localhost:8000 to initiate OAuth flow.",
      });
      setIsAuthorizing(false);
    }
  };

  const handleManualVerify = async () => {
    setIsVerifying(true);
    await reconnectBroker();
    setIsVerifying(false);
  };

  const isConnected = connectionStatus === "CONNECTED";

  return (
    <div className="space-y-6">
      {/* Active Account Identity Card */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base font-bold text-white tracking-tight">
                Broker API: UPSTOX v2 LIVE
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase">
                Official Open API
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Live trading and historical data routed via official Upstox Python SDK v2 & OMS.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ConnectionBadge />

            {/* Login with Upstox Button */}
            <button
              type="button"
              onClick={handleOAuthAuthorize}
              disabled={isAuthorizing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-slate-950 transition-all shadow-md shadow-emerald-950 cursor-pointer disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>{isAuthorizing ? "Connecting..." : "Login with Upstox"}</span>
            </button>

            {/* Disconnect / Reconnect Button */}
            {isConnected ? (
              <button
                type="button"
                onClick={disconnectBroker}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors"
                title="Disconnect broker session"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleManualVerify}
                disabled={isVerifying}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors disabled:opacity-50"
                title="Verify connection with Upstox profile endpoint"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? "animate-spin text-emerald-400" : ""}`} />
                <span>Verify Status</span>
              </button>
            )}
          </div>
        </div>

        {/* Authenticated Trader Identity Diagnostics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 text-xs">
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Trader Account</span>
            </div>
            <div className="font-bold text-slate-100 font-mono">
              {credentials.accountName || "IMMANUVEL D"}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              UCC: <strong className="text-slate-300">{credentials.ucc || "5GC3MG"}</strong>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>API Ping Latency</span>
            </div>
            <div className="font-bold text-slate-100 font-mono">
              {isConnected ? (
                <span className="text-emerald-400">{latencyMs > 0 ? `${latencyMs} ms` : "Verified"}</span>
              ) : (
                <span className="text-slate-500">Offline</span>
              )}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              Upstox v2 Gateway
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-purple-400" />
              <span>Last Verification</span>
            </div>
            <div className="font-medium text-slate-200 font-mono text-[11px] truncate">
              {lastVerified ? formatISTDateTime(lastVerified) : "Never"}
            </div>
            <div className="text-[10px] text-slate-500">
              User Profile Handshake
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>Token Lifecycle</span>
            </div>
            <div className="font-semibold text-slate-200">
              {isConnected ? (
                <span className="text-emerald-400">24h Valid (Daily)</span>
              ) : connectionStatus === "TOKEN_EXPIRED" ? (
                <span className="text-amber-400">Expired Today</span>
              ) : (
                <span className="text-slate-500">No Active Token</span>
              )}
            </div>
            <div className="text-[10px] text-slate-500">
              Requires daily 2FA login
            </div>
          </div>
        </div>
      </div>

      {/* Upstox API Credentials Configuration Form */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-sm">
        <div className="pb-3 border-b border-slate-800">
          <h4 className="text-sm font-bold text-white tracking-tight">
            Upstox Developer App Credentials
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Registered on <a href="https://developer.upstox.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline font-medium">developer.upstox.com</a>. Secrets are stored encrypted in backend database.
          </p>
        </div>

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          {/* API Key (Client ID) */}
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
                required
              />
            </div>
          </div>

          {/* API Secret (Client Secret) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                API Secret (Client Secret)
              </label>
              {hasConfiguredSecret && (
                <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Configured in Database
                </span>
              )}
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type={showSecret ? "text" : "password"}
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-10 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
                placeholder={hasConfiguredSecret ? "•••••••••••• (Leave blank to keep existing secret)" : "Enter client secret"}
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

          {/* OAuth Redirect URI */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                OAuth Redirect URI
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
              Must exact-match the Redirect URL registered in your Upstox Developer App console.
            </p>

            <div className="mt-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-amber-200">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Redirect URI Invariant Check</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                If Upstox returns <code>UDAPI100016: Invalid Credentials</code>, copy <code>http://localhost:8000/api/v1/auth/callback</code> and update the Redirect URL on developer.upstox.com.
              </p>
            </div>
          </div>

          {/* Active Access Token (Manual or OAuth Generated) */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Active Upstox Access Token
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
            <p className="text-[11px] text-slate-500 mt-1">
              Automatically managed via OAuth 2.0 handshake. You may also paste a daily token manually.
            </p>
          </div>

          {/* Submit Save Button */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500">
              Active session UCC: <strong className="text-slate-300">{credentials.ucc || "5GC3MG"}</strong> ({credentials.accountName || "IMMANUVEL D"})
            </span>

            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold transition-all shadow-md shadow-emerald-950 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Update API Credentials"}
            </button>
          </div>
        </form>
      </div>

      {/* OAuth 2.0 Flow Architecture Guide */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-3">
        <div className="flex items-center gap-2 text-slate-200">
          <Info className="w-4 h-4 text-emerald-400" />
          <h4 className="text-xs font-bold uppercase tracking-wider">
            Upstox OAuth 2.0 Handshake Workflow
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold mb-1">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-center leading-5 text-[10px]">1</span>
              <span>Authorization Request</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Clicking <strong>Login with Upstox</strong> opens the official 2FA dialog with CSRF state protection.
            </p>
            <div className="mt-2 text-[10px] font-mono text-slate-500 truncate">
              api.upstox.com/v2/login/authorization/dialog
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-cyan-400 font-semibold mb-1">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-center leading-5 text-[10px]">2</span>
              <span>Code Callback Handshake</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Upstox sends a single-use authorization code to <code>/api/v1/auth/callback</code>.
            </p>
            <div className="mt-2 text-[10px] font-mono text-slate-500 truncate">
              ?code=xxxxxx&state=yyyyyy
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-amber-400 font-semibold mb-1">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-center leading-5 text-[10px]">3</span>
              <span>Secure Token Exchange</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              FastAPI backend exchanges the code with Upstox, validates profile identity, and activates OMS streaming.
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
