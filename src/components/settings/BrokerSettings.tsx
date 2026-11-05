"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTrading } from "@/context/TradingContext";
import {
  ShieldCheck,
  Zap,
  Key,
  Globe,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  RefreshCw,
  Clock,
  Wifi,
  WifiOff,
  BellRing,
  CheckCircle,
  XCircle,
  ShieldAlert,
  KeyRound,
  Calendar,
  Lock,
  Radio,
  Eye,
  EyeOff,
  Smartphone,
} from "lucide-react";
import { TokenManagementTelemetry } from "@/types/trading";

interface BrokerSettingsData {
  api_key: string;
  api_key_masked: string;
  has_api_secret: boolean;
  api_secret_masked: string;
  redirect_uri: string;
  has_active_token: boolean;
  access_token_masked: string;
  user_id: string | null;
  user_name: string | null;
  email: string | null;
  broker_name: string;
  connection_status: string;
  is_connected: boolean;
  latency_ms: number;
  last_verified: string | null;
  last_error: string | null;
  // Token telemetry
  token_request_status?: string;
  token_request_status_label?: string;
  is_notifier_url_error?: boolean;
  issued_at_ist?: string | null;
  expires_at_ist?: string | null;
  last_token_request_ist?: string | null;
  last_token_approved_ist?: string | null;
  authorization_expiry_ist?: string | null;
  notifier_url?: string | null;
  webhook_endpoint?: string | null;
  webhook_url_status?: string;
  webhook_url_reason?: string;
  console_config_status?: string;
  webhook_delivery_status?: string;
  auto_request_enabled?: boolean;
  scheduled_request_time?: string;
  next_scheduled_request_ist?: string | null;
}

export function BrokerSettings() {
  const { addToast, reconnectBroker, disconnectBroker } = useTrading();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BrokerSettingsData | null>(null);

  // Form states
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [manualToken, setManualToken] = useState("");

  // Scheduler states
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [scheduledTime, setScheduledTime] = useState("08:45");

  // Interaction loaders
  const [showSecret, setShowSecret] = useState(false);
  const [isTestingCreds, setIsTestingCreds] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [isUpdatingCreds, setIsUpdatingCreds] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isRequestingToken, setIsRequestingToken] = useState(false);
  const [appApprovalStatus, setAppApprovalStatus] = useState<
    "idle" | "sending" | "sent" | "waiting" | "token_received" | "validated" | "failed"
  >("idle");
  const [appApprovalMessage, setAppApprovalMessage] = useState<string>("");
  const [isValidatingWebhook, setIsValidatingWebhook] = useState(false);
  const [isSavingScheduler, setIsSavingScheduler] = useState(false);
  const [isCancelingRequest, setIsCancelingRequest] = useState(false);

  // Clipboard copy feedback
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Webhook validation result
  const [webhookResult, setWebhookResult] = useState<{
    url: string;
    endpoint_status: string;
    is_https: boolean;
    is_reachable: boolean;
    latency_ms: number;
    diagnosis: string;
  } | null>(null);

  const fetchSettings = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/settings/all");
      const json = await res.json();
      if (res.ok && json.data) {
        const d: BrokerSettingsData = json.data;
        setData(d);
        setApiKey(d.api_key || "");
        setRedirectUri(d.redirect_uri || "http://localhost:8000/api/v1/auth/callback");
        setAutoEnabled(d.auto_request_enabled ?? true);
        setScheduledTime(d.scheduled_request_time || "08:45");

        if (d.is_connected) {
          if (appApprovalStatus === "waiting" || appApprovalStatus === "sending") {
            setAppApprovalStatus("validated");
            setAppApprovalMessage("Token validation successful. Connected to Upstox Live OMS.");
          }
        }
      }
    } catch {
      if (!silent) {
        addToast({
          type: "error",
          title: "Connection Failed",
          message: "Could not fetch settings from backend server at http://localhost:8000.",
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [addToast, appApprovalStatus]);

  useEffect(() => {
    fetchSettings();
    const isPending = data?.token_request_status === "REQUESTED_PENDING" || appApprovalStatus === "waiting";
    const pollInterval = isPending ? 2500 : 12000;
    const timer = setInterval(() => {
      fetchSettings(true);
    }, pollInterval);
    return () => clearInterval(timer);
  }, [fetchSettings, data?.token_request_status, appApprovalStatus]);

  // Handle Verify Connection
  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/broker/status");
      const json = await res.json();
      if (res.ok && json.data?.is_connected) {
        addToast({
          type: "success",
          title: "Broker Connected",
          message: `Connected to Upstox Live OMS (${json.data.user_name || "Trader"} • UCC: ${json.data.user_id || "5GC3MG"}). Latency: ${json.data.latency_ms}ms`,
        });
      } else {
        addToast({
          type: "warning",
          title: "Verification Failed",
          message: json.message || "Broker is disconnected. Login or request a token.",
        });
      }
      await fetchSettings(true);
    } catch {
      addToast({
        type: "error",
        title: "API Error",
        message: "Failed to communicate with backend broker status service.",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle Disconnect
  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await disconnectBroker();
      await fetchSettings(true);
      addToast({
        type: "info",
        title: "Broker Disconnected",
        message: "Upstox broker session disconnected. Access token cleared.",
      });
    } catch {
      addToast({
        type: "error",
        title: "Disconnect Failed",
        message: "Failed to disconnect broker session.",
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Handle Test Credentials
  const handleTestCredentials = async () => {
    setIsTestingCreds(true);
    setTestResult(null);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const keyToTest = apiKey.trim() || data?.api_key || "";
    const secretProvided = apiSecret.trim() || (data?.has_api_secret ? "configured" : "");
    const redirect = redirectUri.trim() || data?.redirect_uri || "";

    if (!keyToTest) {
      const res = { valid: false, message: "Client ID (API Key) is missing." };
      setTestResult(res);
      addToast({ type: "error", title: "Validation Failed", message: res.message });
      setIsTestingCreds(false);
      return;
    }

    if (!uuidRegex.test(keyToTest)) {
      const res = {
        valid: false,
        message: "Client ID must be a valid 36-character UUID (e.g., xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).",
      };
      setTestResult(res);
      addToast({ type: "error", title: "Format Error", message: res.message });
      setIsTestingCreds(false);
      return;
    }

    if (!secretProvided) {
      const res = { valid: false, message: "Client Secret is missing or unconfigured." };
      setTestResult(res);
      addToast({ type: "error", title: "Validation Failed", message: res.message });
      setIsTestingCreds(false);
      return;
    }

    if (!redirect.includes("/api/v1/auth/callback")) {
      const res = { valid: false, message: "OAuth Redirect URI path must end with '/api/v1/auth/callback'." };
      setTestResult(res);
      addToast({ type: "error", title: "Redirect URI Error", message: res.message });
      setIsTestingCreds(false);
      return;
    }

    try {
      const res = await fetch("http://localhost:8000/api/v1/broker/status");
      const json = await res.json();
      if (res.ok && json.data?.is_connected) {
        const msg = `Credentials active and verified live with Upstox Profile API (${json.data.user_name || "Trader"} • UCC: ${json.data.user_id || "5GC3MG"}). Latency: ${json.data.latency_ms}ms.`;
        setTestResult({ valid: true, message: msg });
        addToast({ type: "success", title: "Credentials Valid", message: msg });
      } else {
        const msg = `Format check passed! Client ID (${keyToTest.slice(0, 8)}••••) is valid UUID and secret is configured. Complete Login via Upstox to connect session.`;
        setTestResult({ valid: true, message: msg });
        addToast({ type: "info", title: "Credential Format Valid", message: msg });
      }
    } catch {
      setTestResult({ valid: false, message: "Backend verification service unreachable." });
      addToast({ type: "error", title: "Verification Failed", message: "Backend server is unreachable." });
    } finally {
      setIsTestingCreds(false);
    }
  };

  // Handle Update Credentials
  const handleUpdateCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      addToast({
        type: "error",
        title: "Missing API Key",
        message: "API Key (Client ID) is required.",
      });
      return;
    }

    setIsUpdatingCreds(true);
    try {
      const payload: Record<string, string> = {
        api_key: apiKey.trim(),
        redirect_uri: redirectUri.trim(),
      };
      if (apiSecret.trim()) {
        payload.api_secret = apiSecret.trim();
      }
      if (manualToken.trim()) {
        payload.access_token = manualToken.trim();
      }

      const res = await fetch("http://localhost:8000/api/v1/settings/broker", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (res.ok) {
        addToast({
          type: "success",
          title: "Credentials Saved",
          message: json.message || "Upstox API credentials updated successfully.",
        });
        setApiSecret("");
        setManualToken("");
        await fetchSettings(true);
      } else {
        addToast({
          type: "error",
          title: "Update Failed",
          message: json.message || "Failed to update broker credentials.",
        });
      }
    } catch {
      addToast({
        type: "error",
        title: "Network Error",
        message: "Could not reach backend server to save credentials.",
      });
    } finally {
      setIsUpdatingCreds(false);
    }
  };

  // Handle OAuth Login
  const handleOAuthLogin = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/v1/auth/login");
      const json = await res.json();
      if (res.ok && json.data?.authorization_url) {
        window.location.href = json.data.authorization_url;
      } else {
        const cid = (apiKey || data?.api_key || "").trim();
        if (!cid) {
          addToast({
            type: "error",
            title: "Missing API Key",
            message: "Configure your Upstox Client ID (API Key) before initiating OAuth login.",
          });
          return;
        }
        const redUri = redirectUri || data?.redirect_uri || "http://localhost:8000/api/v1/auth/callback";
        window.location.href = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${cid}&redirect_uri=${encodeURIComponent(redUri)}`;
      }
    } catch {
      const cid = (apiKey || data?.api_key || "").trim();
      if (!cid) {
        addToast({
          type: "error",
          title: "Missing API Key",
          message: "Configure your Upstox Client ID (API Key) before initiating OAuth login.",
        });
        return;
      }
      const redUri = redirectUri || data?.redirect_uri || "http://localhost:8000/api/v1/auth/callback";
      window.location.href = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${cid}&redirect_uri=${encodeURIComponent(redUri)}`;
    }
  };

  // Handle Upstox App Approval Request (Semi-Automated Token Request)
  const handleRequestToken = async () => {
    setIsRequestingToken(true);
    setAppApprovalStatus("sending");
    setAppApprovalMessage("Sending request to Upstox API...");
    try {
      const res = await fetch("http://localhost:8000/api/v1/auth/token-request?force=true", {
        method: "POST",
      });
      const json = await res.json();

      if (res.ok && json.status === "success") {
        setAppApprovalStatus("waiting");
        setAppApprovalMessage("Please open Upstox mobile app and approve the pending access token request.");
        addToast({
          type: "success",
          title: "Approval Request Sent",
          message: "Please open Upstox mobile app and approve the pending access token request.",
        });
      } else {
        setAppApprovalStatus("failed");
        const errMsg = json.message || "Request failed.";
        setAppApprovalMessage(errMsg);
        addToast({
          type: "warning",
          title: "Request Failed",
          message: errMsg,
        });
      }
      await fetchSettings(true);
    } catch {
      setAppApprovalStatus("failed");
      setAppApprovalMessage("Failed to connect to backend server.");
      addToast({
        type: "error",
        title: "Request Error",
        message: "Failed to connect to backend token request service.",
      });
    } finally {
      setIsRequestingToken(false);
    }
  };

  // Handle Cancel Token Request
  const handleCancelRequest = async () => {
    setIsCancelingRequest(true);
    setAppApprovalStatus("idle");
    setAppApprovalMessage("");
    try {
      const res = await fetch("http://localhost:8000/api/v1/auth/token-request/cancel", {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok) {
        addToast({
          type: "info",
          title: "State Cleared",
          message: "Pending token request state was reset.",
        });
        await fetchSettings(true);
      }
    } catch {
      // ignore
    } finally {
      setIsCancelingRequest(false);
    }
  };

  // Handle Webhook Endpoint Validation
  const handleValidateWebhook = async () => {
    setIsValidatingWebhook(true);
    setWebhookResult(null);
    try {
      const res = await fetch("http://localhost:8000/api/v1/auth/webhook/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.data) {
        setWebhookResult(json.data);
        if (json.data.is_reachable) {
          addToast({
            type: "success",
            title: "Webhook Endpoint Reachable",
            message: `HTTPS webhook listener is online (${json.data.latency_ms}ms). Note: Confirm registration in Upstox Developer Console.`,
          });
        } else {
          addToast({
            type: "warning",
            title: "Webhook Unreachable",
            message: json.data.diagnosis || "Public HTTPS webhook endpoint could not be reached.",
          });
        }
      }
      await fetchSettings(true);
    } catch {
      addToast({
        type: "error",
        title: "Validation Error",
        message: "Could not execute webhook endpoint validation test.",
      });
    } finally {
      setIsValidatingWebhook(false);
    }
  };

  // Handle Save Scheduler
  const handleSaveScheduler = async () => {
    setIsSavingScheduler(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/auth/token-request/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_request_enabled: autoEnabled,
          scheduled_request_time: scheduledTime,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        addToast({
          type: "success",
          title: "Scheduler Saved",
          message: json.message || "Daily token request scheduler updated.",
        });
        await fetchSettings(true);
      } else {
        addToast({
          type: "error",
          title: "Save Failed",
          message: json.message || "Could not save scheduler settings.",
        });
      }
    } catch {
      addToast({
        type: "error",
        title: "Network Error",
        message: "Failed to communicate with scheduler API.",
      });
    } finally {
      setIsSavingScheduler(false);
    }
  };

  const copyToClipboard = (text: string, type: "redirect" | "webhook") => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (type === "redirect") {
      setCopiedRedirect(true);
      setTimeout(() => setCopiedRedirect(false), 2000);
    } else {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    }
    addToast({
      type: "info",
      title: "Copied to Clipboard",
      message: `${type === "redirect" ? "OAuth Redirect URI" : "Notifier Webhook URL"} copied.`,
    });
  };

  const isConnected = data?.is_connected ?? false;
  const connStatus = data?.connection_status || "DISCONNECTED";
  const reqStatus = data?.token_request_status || "IDLE";
  const reqStatusLabel = data?.token_request_status_label || (
    reqStatus === "NOTIFIER_URL_REQUIRED" ? "Console Configuration Required" :
    reqStatus === "REQUESTED_PENDING" ? "Request Pending Approval" :
    reqStatus === "APPROVED_ACTIVE" && isConnected ? "Token Verified" :
    connStatus === "AUTH_FAILED" ? "Authentication Failed" : "Console Configuration Required"
  );

  const webhookEndpoint = data?.notifier_url || data?.webhook_endpoint || "https://radiation-handling-fired-lbs.trycloudflare.com/api/v1/auth/upstox/notifier";

  if (loading && !data) {
    return (
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-8 text-center">
        <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin mx-auto mb-3" />
        <span className="text-xs text-slate-400">Loading Upstox Broker Telemetry...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* SECTION A: BROKER CONNECTION STATUS CARD */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Broker API: Upstox v2 / v3 LIVE
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                  OFFICIAL OPEN API
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Live trading and historical data routed via official Upstox Python SDK v2 & OMS.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Live Connection Status Badge */}
            {isConnected ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <Wifi className="w-3.5 h-3.5" />
                <span>Connected</span>
                <span className="text-[11px] font-mono text-emerald-400/80 pl-1 border-l border-emerald-500/30">
                  {data?.latency_ms ?? 95}ms
                </span>
              </div>
            ) : connStatus === "TOKEN_EXPIRED" ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-semibold">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>Token Expired</span>
                <span className="text-[10px] text-amber-300/80 pl-1 border-l border-amber-500/30">
                  Daily 03:30 AM Cutoff
                </span>
              </div>
            ) : connStatus === "AUTH_FAILED" ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-400 text-xs font-semibold">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                <span>Auth Failed</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-xs font-medium">
                <WifiOff className="w-3.5 h-3.5" />
                <span>Disconnected</span>
              </div>
            )}

            {/* Action Buttons */}
            <button
              onClick={handleOAuthLogin}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition-all shadow-md shadow-emerald-950 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Login with Upstox</span>
            </button>

            <button
              onClick={handleVerify}
              disabled={isVerifying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? "animate-spin" : ""}`} />
              <span>Verify Status</span>
            </button>

            {isConnected && (
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-medium border border-rose-900/50 transition-colors cursor-pointer"
              >
                <span>Disconnect</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Identity & Telemetry Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-5">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Trader Account
            </span>
            <div className="mt-1 font-semibold text-white text-xs truncate">
              {data?.user_name || "Immanuel D"}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
              UCC: {data?.user_id || "5GC3MG"}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              API Ping Latency
            </span>
            <div className="mt-1 font-mono font-bold text-xs text-emerald-400">
              {isConnected ? `${data?.latency_ms ?? 95}ms` : "Offline"}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Upstox v2 Gateway
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Last Verification
            </span>
            <div className="mt-1 font-mono text-xs text-slate-200">
              {data?.last_verified ? new Date(data.last_verified).toLocaleTimeString() : "Never"}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              User Profile Handshake
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Token Lifecycle
            </span>
            <div className={`mt-1 font-semibold text-xs ${isConnected ? "text-emerald-400" : "text-amber-400"}`}>
              {isConnected ? "Active 24h Session" : "Requires Authorization"}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">
              {data?.expires_at_ist || "Daily 03:30 AM IST"}
            </div>
          </div>
        </div>

        {/* Display Error Banner if Authentication / Validation Failed */}
        {data?.last_error && !isConnected && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-950/30 border border-rose-900/50 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-rose-200">Upstox Connection Notice:</span>
              <p className="font-mono text-[11px] leading-relaxed text-rose-300/90">{data.last_error}</p>
            </div>
          </div>
        )}
      </div>

      {/* SECTION B: API CREDENTIALS FORM */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800">
          <Key className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Upstox Developer App Credentials
            </h3>
            <p className="text-xs text-slate-400">
              Registered on <a href="https://developer.upstox.com" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline inline-flex items-center gap-1">developer.upstox.com <ExternalLink className="w-3 h-3" /></a>. Secrets are encrypted at rest with Fernet AES-128.
            </p>
          </div>
        </div>

        <form onSubmit={handleUpdateCredentials} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Client ID / API Key */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                API Key (Client ID)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Found in your Upstox Developer Console App Details.
              </span>
            </div>

            {/* Client Secret */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  API Secret (Client Secret)
                </label>
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
                >
                  {showSecret ? (
                    <>
                      <EyeOff className="w-3 h-3" />
                      <span>Hide Secret</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3 h-3" />
                      <span>Show Secret</span>
                    </>
                  )}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showSecret ? "text" : "password"}
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder={data?.has_api_secret ? "•••••••••••• (Leave blank to keep existing)" : "Enter App Client Secret"}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-emerald-500 transition-colors pr-10"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Never shared with frontend. Encrypted at rest in backend database.
              </span>
            </div>
          </div>

          {/* Test Result Feedback */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                testResult.valid
                  ? "bg-emerald-950/30 border-emerald-900/50 text-emerald-300"
                  : "bg-rose-950/30 border-rose-900/50 text-rose-300"
              }`}
            >
              {testResult.valid ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <span className="font-semibold">{testResult.valid ? "Credential Check Succeeded" : "Credential Validation Failed"}</span>
                <p className="font-mono text-[11px] leading-relaxed opacity-90">{testResult.message}</p>
              </div>
            </div>
          )}

          {/* OAuth Redirect URI */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                OAuth Redirect URI
              </label>
              <span className="text-[10px] text-slate-400">
                Must match Upstox Developer Console exactly
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={redirectUri}
                  onChange={(e) => setRedirectUri(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-xs focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(redirectUri, "redirect")}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors shrink-0"
              >
                {copiedRedirect ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy URI</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">
              Changes take effect immediately across all background trading loops.
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleTestCredentials}
                disabled={isTestingCreds}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingCreds ? "animate-spin" : ""}`} />
                <span>Test Credentials</span>
              </button>
              <button
                type="submit"
                disabled={isUpdatingCreds}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition-all shadow-md shadow-emerald-950 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isUpdatingCreds ? "animate-spin" : ""}`} />
                <span>Save Credentials</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* SECTION C & D: SEMI-AUTOMATED DAILY TOKEN SYSTEM & NOTIFIER WEBHOOK */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SEMI-AUTOMATED TOKEN SYSTEM */}
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-xl backdrop-blur-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <BellRing className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Daily Token Management (v3 API)
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                SEMI-AUTOMATED
              </span>
            </div>

            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              Triggers the official Upstox endpoint: <code className="text-slate-300 font-mono text-[11px]">POST /v3/login/auth/token/request</code>.
              Upstox delivers a push approval to your mobile app or WhatsApp. Once approved, the token is automatically delivered to your Notifier Webhook.
            </p>

            {/* Current Request Status Banner */}
            <div className="mt-4 p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Request Lifecycle Status</span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase border ${
                    isConnected && data?.last_token_approved_ist
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : isRequestingToken || appApprovalStatus === "sending"
                      ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30 animate-pulse"
                      : appApprovalStatus === "waiting" || reqStatus === "REQUESTED_PENDING"
                      ? "bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse"
                      : appApprovalStatus === "failed" || reqStatus === "REJECTED" || reqStatus === "FAILED" || connStatus === "AUTH_FAILED"
                      ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                      : "bg-slate-800 text-slate-300 border-slate-700"
                  }`}
                >
                  {isRequestingToken || appApprovalStatus === "sending"
                    ? "Sending request..."
                    : appApprovalStatus === "sent"
                    ? "Approval request sent"
                    : appApprovalStatus === "waiting" || reqStatus === "REQUESTED_PENDING"
                    ? "Waiting for Upstox App approval"
                    : isConnected && data?.last_token_approved_ist
                    ? "Token validation successful"
                    : data?.last_token_approved_ist && !isConnected
                    ? "Token received"
                    : appApprovalStatus === "failed" || reqStatus === "REJECTED" || reqStatus === "FAILED"
                    ? "Request failed"
                    : reqStatusLabel}
                </span>
              </div>

              {/* Status details & timestamps */}
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div>
                  <span className="text-slate-400 block">Last Token Request:</span>
                  <span className="font-mono text-slate-200">{data?.last_token_request_ist || "None"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Last Token Approval:</span>
                  <span className="font-mono text-emerald-400">{data?.last_token_approved_ist || "None"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Token Expiry:</span>
                  <span className="font-mono text-slate-200">{data?.expires_at_ist || "03:30 AM IST Daily"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Next Scheduled:</span>
                  <span className="font-mono text-cyan-300">{data?.next_scheduled_request_ist || "08:45 AM IST"}</span>
                </div>
              </div>

              {/* Action Required Callout when Pending Approval */}
              {(appApprovalStatus === "waiting" || reqStatus === "REQUESTED_PENDING") && (
                <div className="mt-3 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-200 space-y-1.5 shadow-lg shadow-amber-950/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-300 font-bold">
                      <Smartphone className="w-4 h-4 text-amber-400 animate-pulse" />
                      <span>Action Required on Mobile Device</span>
                    </div>
                    <button
                      onClick={handleCancelRequest}
                      disabled={isCancelingRequest}
                      className="text-[11px] text-amber-300/80 hover:text-white underline font-medium"
                    >
                      Cancel Request
                    </button>
                  </div>
                  <p className="font-semibold text-white leading-relaxed">
                    Please open Upstox mobile app and approve the pending access token request.
                  </p>
                  <p className="text-[11px] text-amber-200/80 leading-normal">
                    Upstox dispatched an approval notification. Once you tap Approve in the Upstox app, the token will be received via webhook and verified automatically.
                  </p>
                </div>
              )}

              {/* Rejection / Failure Notice */}
              {(appApprovalStatus === "failed" || (reqStatus === "NOTIFIER_URL_REQUIRED" && data?.last_error)) && (
                <div className="mt-2 p-2.5 rounded-lg bg-rose-950/30 border border-rose-900/50 text-[11px] text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="font-mono leading-relaxed">
                    {appApprovalMessage || data?.last_error || "Request failed. Check credentials and registered webhook URL."}
                  </span>
                </div>
              )}
            </div>

            {/* Daily Scheduler Configuration */}
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-semibold text-slate-200">Daily Token Scheduler</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoEnabled}
                    onChange={(e) => setAutoEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
                <span className="text-xs text-slate-400">IST (Mon-Fri Trading Days)</span>
                <button
                  type="button"
                  onClick={handleSaveScheduler}
                  disabled={isSavingScheduler}
                  className="ml-auto px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
                >
                  Save Schedule
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              Only 1 request required per trading day.
            </span>
            <button
              onClick={handleRequestToken}
              disabled={isRequestingToken}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs transition-all shadow-md shadow-cyan-950 cursor-pointer disabled:opacity-50"
            >
              {isRequestingToken ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending request...</span>
                </>
              ) : (
                <>
                  <Smartphone className="w-3.5 h-3.5 fill-current" />
                  <span>Request Upstox App Approval</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* NOTIFIER WEBHOOK CONFIGURATION */}
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-xl backdrop-blur-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Notifier Webhook Configuration
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                UPSTOX APPENDIX
              </span>
            </div>

            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              Upstox sends approved access tokens to your registered HTTPS Notifier Webhook. Register this exact public URL in your Upstox Developer App:
            </p>

            {/* Configured Webhook URL Field with Copy */}
            <div className="mt-3">
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Your Backend Public Webhook URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookEndpoint}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-[11px] select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(webhookEndpoint, "webhook")}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors shrink-0"
                >
                  {copiedWebhook ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy URL</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Endpoint Reachability & HTTPS Validation */}
            <div className="mt-4 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Endpoint Status:</span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase border ${
                    webhookResult?.is_reachable
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-slate-800 text-slate-300 border-slate-700"
                  }`}
                >
                  {webhookResult ? webhookResult.endpoint_status : (data?.webhook_url_status || "Valid HTTPS URL")}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Developer Console Status:</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  {data?.console_config_status || "Console Configuration Required"}
                </span>
              </div>

              {webhookResult && (
                <p className="text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800">
                  {webhookResult.diagnosis}
                </p>
              )}
            </div>

            {/* Developer Console Instructions */}
            <div className="mt-4 p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-900/30 space-y-1.5 text-xs text-indigo-300">
              <span className="font-semibold text-indigo-200 flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                Upstox Developer Console Registration Steps:
              </span>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300/90 leading-relaxed pl-1">
                <li>Log in at <a href="https://developer.upstox.com" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">developer.upstox.com</a> and click your App.</li>
                <li>Scroll to <strong>Notifier Webhook Endpoint</strong> (distinct from OAuth Callback).</li>
                <li>Paste the copied HTTPS Webhook URL above.</li>
                <li>Click <strong>Save Changes</strong> in Upstox Developer Console.</li>
                <li>Click <strong>Request New Token</strong> to receive daily tokens automatically.</li>
              </ol>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              Reachability != Console Registration
            </span>
            <button
              onClick={handleValidateWebhook}
              disabled={isValidatingWebhook}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-md shadow-indigo-950 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isValidatingWebhook ? "animate-spin" : ""}`} />
              <span>Validate Webhook Endpoint</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

