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
  Key,
  Globe,
  ExternalLink,
  Copy,
  CheckCircle2,
  Info,
  AlertCircle,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<"oauth" | "manual">("oauth");
  const [isLoading, setIsLoading] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedRedirect, setCopiedRedirect] = useState(false);

  const redirectUri = "http://localhost:8000/api/v1/auth/callback";

  const handleOAuthLogin = async () => {
    setIsLoading(true);
    setErrorMsg("");

    try {
      // Fetch dynamic authorization URL from backend
      const res = await fetch("http://localhost:8000/api/v1/auth/login");
      const data = await res.json();

      if (data.connection_status === "connected" && data.data?.authorization_url) {
        window.location.href = data.data.authorization_url;
      } else {
        setErrorMsg(
          data.message ||
            "Could not retrieve authorization URL. Configure your Upstox API credentials in Settings."
        );
        setIsLoading(false);
      }
    } catch {
      setErrorMsg(
        "Failed to connect to backend server. Ensure the backend is running at http://localhost:8000."
      );
      setIsLoading(false);
    }
  };

  const handleManualTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;

    setIsLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("http://localhost:8000/api/v1/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: manualToken.trim() }),
      });
      const data = await res.json();

      if (data.connection_status === "connected") {
        router.push("/?auth=connected");
      } else {
        setErrorMsg(data.message || "Failed to validate access token with Upstox.");
        setIsLoading(false);
      }
    } catch {
      setErrorMsg("Could not connect to backend server. Access token was not verified.");
      setIsLoading(false);
    }
  };

  const handleCopyRedirect = () => {
    navigator.clipboard.writeText(redirectUri);
    setCopiedRedirect(true);
    setTimeout(() => setCopiedRedirect(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Background subtle grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b12_1px,transparent_1px),linear-gradient(to_bottom,#1e293b12_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Subtle top ambient glow */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[550px] h-[320px] bg-emerald-500/10 blur-[130px] rounded-full pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-slate-950 font-black text-xl mb-3 shadow-xl shadow-emerald-950/60">
            ▲
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Upstox Algo Trading Desk
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
            Nifty 50 Intraday Directional Execution Desk &bull; Upstox v2 API
          </p>
        </div>

        {/* Auth Mode Toggle Tabs */}
        <div className="flex rounded-xl bg-slate-900 border border-slate-800 p-1 mb-4">
          <button
            type="button"
            onClick={() => setAuthMode("oauth")}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              authMode === "oauth"
                ? "bg-emerald-600 text-slate-950 shadow-md shadow-emerald-950/80"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>OAuth 2.0 Login (Recommended)</span>
          </button>
          <button
            type="button"
            onClick={() => setAuthMode("manual")}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              authMode === "manual"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Manual Access Token</span>
          </button>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 shadow-2xl backdrop-blur-xl">
          {errorMsg && (
            <div className="mb-4 p-3 rounded-lg bg-rose-950/40 border border-rose-900/50 text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          {authMode === "oauth" ? (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Secure Upstox OAuth 2.0 Handshake</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Your credentials are never handled directly by our server. You will be redirected to Upstox to sign in with your mobile OTP/TOTP, and an encrypted access token will be exchanged automatically.
                </p>
              </div>

              {/* Registered Redirect URI box */}
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span className="font-medium">Registered Redirect URI:</span>
                  <button
                    type="button"
                    onClick={handleCopyRedirect}
                    className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-[10px]"
                  >
                    {copiedRedirect ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedRedirect ? "Copied" : "Copy URI"}</span>
                  </button>
                </div>
                <div className="font-mono text-[11px] text-slate-300 truncate">
                  {redirectUri}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-slate-300 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Troubleshooting UDAPI100016 (Invalid Credentials):</span>
                </div>
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  The Redirect URL in your <a href="https://developer.upstox.com" target="_blank" rel="noopener noreferrer" className="underline text-emerald-400 font-medium">Upstox Developer Console</a> must exactly match <code>{redirectUri}</code>. Do not enter an Upstox URL like <em>api-v2.upstox.com/login...</em> or leave it mismatched.
                </p>
              </div>

              {/* OAuth Action Button */}
              <button
                type="button"
                onClick={handleOAuthLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all duration-200 shadow-lg shadow-emerald-950/80 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Redirecting to Upstox Sign-In...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-current" />
                    <span>Authorize with Upstox</span>
                    <ExternalLink className="w-3.5 h-3.5 ml-1" />
                  </>
                )}
              </button>
            </div>
          ) : (
            <form onSubmit={handleManualTokenSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Paste Upstox Access Token
                </label>
                <textarea
                  rows={3}
                  required
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 resize-none"
                  placeholder="eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOi..."
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Generate from{" "}
                  <a
                    href="https://account.upstox.com/developer/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:underline"
                  >
                    Upstox Developer Apps
                  </a>{" "}
                  &rarr; Click your app &rarr; Click <strong>Generate</strong>.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-all duration-200 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    <span>Activate Session with Token</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Quick Sandbox Link */}
          <div className="mt-4 pt-4 border-t border-slate-800/80 text-center">
            <button
              onClick={() => router.push("/")}
              className="text-xs text-slate-400 hover:text-emerald-400 transition-colors inline-flex items-center gap-1 font-medium"
            >
              <span>Explore Dashboard in Backtest Mode</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Safeguards Footer */}
        <div className="mt-6 grid grid-cols-3 gap-2 text-center text-[10px] text-slate-500">
          <div className="p-2 rounded-lg bg-slate-900/50 border border-slate-800/60">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-1" />
            <span>Official OAuth 2.0</span>
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
