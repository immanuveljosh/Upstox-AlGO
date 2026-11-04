"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState<string>("Exchanging single-use authorization code with Upstox...");
  const [userData, setUserData] = useState<{ userName?: string; ucc?: string }>({});

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");

    if (error) {
      setStatus("error");
      setMessage(errorDesc || error || "Upstox authorization was denied or cancelled.");
      return;
    }

    if (!code) {
      setStatus("error");
      setMessage("No authorization code received from Upstox redirect.");
      return;
    }

    const authCode = code;

    async function exchangeToken() {
      try {
        const response = await fetch(`http://localhost:8000/api/v1/auth/callback?code=${encodeURIComponent(authCode)}&format=json`);
        const json = await response.json();

        if (response.ok && json.connection_status === "connected") {
          setStatus("success");
          setMessage("Upstox session connected and encrypted token stored successfully.");
          setUserData({
            userName: json.data?.user_name,
            ucc: json.data?.ucc,
          });

          // Redirect to home dashboard
          setTimeout(() => {
            router.push("/?auth=connected");
          }, 1500);
        } else {
          setStatus("error");
          setMessage(json.message || "Failed to exchange authorization code for access token.");
        }
      } catch (err: any) {
        setStatus("error");
        setMessage(err?.message || "Could not reach backend API server at http://localhost:8000.");
      }
    }

    exchangeToken();
  }, [searchParams, router]);

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-8 shadow-2xl backdrop-blur-xl text-center max-w-md w-full">
      {status === "loading" && (
        <div className="space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            Authorizing Upstox Session
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {message}
          </p>
          <div className="text-[11px] font-mono text-slate-500 pt-2">
            POST https://api.upstox.com/v2/login/authorization/token
          </div>
        </div>
      )}

      {status === "success" && (
        <div className="space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            Handshake Successful!
          </h2>
          <p className="text-xs text-emerald-400 font-medium">
            {userData.userName ? `Welcome back, ${userData.userName} (${userData.ucc || "UCC"})` : message}
          </p>
          <p className="text-[11px] text-slate-400">
            Redirecting to Live Algo Desk...
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            Authentication Failed
          </h2>
          <p className="text-xs text-rose-300 bg-rose-950/30 border border-rose-900/40 rounded-lg p-3 text-left font-mono">
            {message}
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <Link
              href="/login"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition-colors"
            >
              <span>Try Logging In Again</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/settings"
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors py-1"
            >
              Verify API Credentials in Settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b12_1px,transparent_1px),linear-gradient(to_bottom,#1e293b12_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        <Suspense
          fallback={
            <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-8 text-center text-slate-400 text-xs">
              Loading OAuth callback...
            </div>
          }
        >
          <CallbackHandler />
        </Suspense>
      </div>
    </div>
  );
}
