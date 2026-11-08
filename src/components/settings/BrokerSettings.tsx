"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTrading } from "@/context/TradingContext";
import {
  Zap,
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
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  Smartphone,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, StatusBadge } from "@/components/ui/DesignSystem";

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
  const { addToast, disconnectBroker } = useTrading();

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

  // Collapsible sub-panel states
  const [tokenPanelOpen, setTokenPanelOpen] = useState(true);
  const [webhookPanelOpen, setWebhookPanelOpen] = useState(false);

  // Interaction loaders
  const [showSecret, setShowSecret] = useState(false);
  const [isTestingCreds, setIsTestingCreds] = useState(false);
  const [testResult, setTestResult] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);
  const [isUpdatingCreds, setIsUpdatingCreds] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isRequestingToken, setIsRequestingToken] = useState(false);
  const [appApprovalStatus, setAppApprovalStatus] = useState<
    | "idle"
    | "sending"
    | "sent"
    | "waiting"
    | "token_received"
    | "validated"
    | "failed"
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

  const fetchSettings = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch("http://localhost:8000/api/v1/settings/all");
        const json = await res.json();
        if (res.ok && json.data) {
          const d: BrokerSettingsData = json.data;
          setData(d);
          setApiKey(d.api_key || "");
          setRedirectUri(
            d.redirect_uri || "http://localhost:8000/api/v1/auth/callback"
          );
          setAutoEnabled(d.auto_request_enabled ?? true);
          setScheduledTime(d.scheduled_request_time || "08:45");

          if (d.is_connected) {
            if (
              appApprovalStatus === "waiting" ||
              appApprovalStatus === "sending"
            ) {
              setAppApprovalStatus("validated");
              setAppApprovalMessage(
                "Token validation successful. Connected to Upstox Live OMS."
              );
            }
          }
        }
      } catch {
        if (!silent) {
          addToast({
            type: "error",
            title: "Connection Failed",
            message:
              "Could not fetch settings from backend server at http://localhost:8000.",
          });
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [addToast, appApprovalStatus]
  );

  useEffect(() => {
    fetchSettings();
    const isPending =
      data?.token_request_status === "REQUESTED_PENDING" ||
      appApprovalStatus === "waiting";
    const pollInterval = isPending ? 2500 : 12000;
    const timer = setInterval(() => {
      fetchSettings(true);
    }, pollInterval);
    return () => clearInterval(timer);
  }, [fetchSettings, data?.token_request_status, appApprovalStatus]);

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/broker/status");
      const json = await res.json();
      if (res.ok && json.data?.is_connected) {
        addToast({
          type: "success",
          title: "Broker Connected",
          message: `Connected to Upstox Live OMS (${
            json.data.user_name || "Trader"
          } • UCC: ${json.data.user_id || "5GC3MG"}). Latency: ${
            json.data.latency_ms
          }ms`,
        });
      } else {
        addToast({
          type: "warning",
          title: "Verification Failed",
          message:
            json.message ||
            "Broker is disconnected. Login or request a token.",
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

  const handleTestCredentials = async () => {
    setIsTestingCreds(true);
    setTestResult(null);

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const keyToTest = apiKey.trim() || data?.api_key || "";
    const secretProvided =
      apiSecret.trim() || (data?.has_api_secret ? "configured" : "");
    const redirect = redirectUri.trim() || data?.redirect_uri || "";

    if (!keyToTest) {
      const res = { valid: false, message: "Client ID (API Key) is missing." };
      setTestResult(res);
      addToast({
        type: "error",
        title: "Validation Failed",
        message: res.message,
      });
      setIsTestingCreds(false);
      return;
    }

    if (!uuidRegex.test(keyToTest)) {
      const res = {
        valid: false,
        message:
          "Client ID must be a valid 36-character UUID (e.g., xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).",
      };
      setTestResult(res);
      addToast({ type: "error", title: "Format Error", message: res.message });
      setIsTestingCreds(false);
      return;
    }

    if (!secretProvided) {
      const res = {
        valid: false,
        message: "Client Secret is missing or unconfigured.",
      };
      setTestResult(res);
      addToast({
        type: "error",
        title: "Validation Failed",
        message: res.message,
      });
      setIsTestingCreds(false);
      return;
    }

    if (!redirect.includes("/api/v1/auth/callback")) {
      const res = {
        valid: false,
        message:
          "OAuth Redirect URI path must end with '/api/v1/auth/callback'.",
      };
      setTestResult(res);
      addToast({
        type: "error",
        title: "Redirect URI Error",
        message: res.message,
      });
      setIsTestingCreds(false);
      return;
    }

    try {
      const res = await fetch("http://localhost:8000/api/v1/broker/status");
      const json = await res.json();
      if (res.ok && json.data?.is_connected) {
        const msg = `Credentials active and verified live with Upstox Profile API (${
          json.data.user_name || "Trader"
        } • UCC: ${json.data.user_id || "5GC3MG"}). Latency: ${
          json.data.latency_ms
        }ms.`;
        setTestResult({ valid: true, message: msg });
        addToast({ type: "success", title: "Credentials Valid", message: msg });
      } else {
        const msg = `Format check passed! Client ID (${keyToTest.slice(
          0,
          8
        )}••••) is valid UUID and secret is configured. Complete Login via Upstox to connect session.`;
        setTestResult({ valid: true, message: msg });
        addToast({
          type: "info",
          title: "Credential Format Valid",
          message: msg,
        });
      }
    } catch {
      setTestResult({
        valid: false,
        message: "Backend verification service unreachable.",
      });
      addToast({
        type: "error",
        title: "Verification Failed",
        message: "Backend server is unreachable.",
      });
    } finally {
      setIsTestingCreds(false);
    }
  };

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
          message:
            json.message || "Upstox API credentials updated successfully.",
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
            message:
              "Configure your Upstox Client ID (API Key) before initiating OAuth login.",
          });
          return;
        }
        const redUri =
          redirectUri ||
          data?.redirect_uri ||
          "http://localhost:8000/api/v1/auth/callback";
        window.location.href = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${cid}&redirect_uri=${encodeURIComponent(
          redUri
        )}`;
      }
    } catch {
      const cid = (apiKey || data?.api_key || "").trim();
      if (!cid) {
        addToast({
          type: "error",
          title: "Missing API Key",
          message:
            "Configure your Upstox Client ID (API Key) before initiating OAuth login.",
        });
        return;
      }
      const redUri =
        redirectUri ||
        data?.redirect_uri ||
        "http://localhost:8000/api/v1/auth/callback";
      window.location.href = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${cid}&redirect_uri=${encodeURIComponent(
        redUri
      )}`;
    }
  };

  const handleRequestToken = async () => {
    setIsRequestingToken(true);
    setAppApprovalStatus("sending");
    setAppApprovalMessage("Sending request to Upstox API...");
    try {
      const res = await fetch(
        "http://localhost:8000/api/v1/auth/token-request?force=true",
        {
          method: "POST",
        }
      );
      const json = await res.json();

      if (res.ok && json.status === "success") {
        setAppApprovalStatus("waiting");
        setAppApprovalMessage(
          "Please open Upstox mobile app and approve the pending access token request."
        );
        addToast({
          type: "success",
          title: "Approval Request Sent",
          message:
            "Please open Upstox mobile app and approve the pending access token request.",
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

  const handleCancelRequest = async () => {
    setIsCancelingRequest(true);
    setAppApprovalStatus("idle");
    setAppApprovalMessage("");
    try {
      const res = await fetch(
        "http://localhost:8000/api/v1/auth/token-request/cancel",
        {
          method: "POST",
        }
      );
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

  const handleValidateWebhook = async () => {
    setIsValidatingWebhook(true);
    setWebhookResult(null);
    try {
      const res = await fetch(
        "http://localhost:8000/api/v1/auth/webhook/validate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
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
            message:
              json.data.diagnosis ||
              "Public HTTPS webhook endpoint could not be reached.",
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

  const handleSaveScheduler = async () => {
    setIsSavingScheduler(true);
    try {
      const res = await fetch(
        "http://localhost:8000/api/v1/auth/token-request/schedule",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            auto_request_enabled: autoEnabled,
            scheduled_request_time: scheduledTime,
          }),
        }
      );
      const json = await res.json();
      if (res.ok) {
        addToast({
          type: "success",
          title: "Scheduler Saved",
          message:
            json.message || "Daily token request scheduler updated.",
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
      message: `${
        type === "redirect" ? "OAuth Redirect URI" : "Notifier Webhook URL"
      } copied.`,
    });
  };

  const isConnected = data?.is_connected ?? false;
  const connStatus = data?.connection_status || "DISCONNECTED";
  const reqStatus = data?.token_request_status || "IDLE";
  const reqStatusLabel =
    data?.token_request_status_label ||
    (reqStatus === "NOTIFIER_URL_REQUIRED"
      ? "Console Configuration Required"
      : reqStatus === "REQUESTED_PENDING"
      ? "Request Pending Approval"
      : reqStatus === "APPROVED_ACTIVE" && isConnected
      ? "Token Verified"
      : connStatus === "AUTH_FAILED"
      ? "Authentication Failed"
      : "Console Configuration Required");

  const webhookEndpoint =
    data?.notifier_url ||
    data?.webhook_endpoint ||
    "https://radiation-handling-fired-lbs.trycloudflare.com/api/v1/auth/upstox/notifier";

  if (loading && !data) {
    return (
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-8 text-center">
        <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin mx-auto mb-3" />
        <span className="text-xs text-slate-400">
          Loading Upstox broker telemetry...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* SECTION A: BROKER CONNECTION STATUS & IDENTITY */}
      <Card
        title="Broker API: Upstox v2 / v3"
        subtitle="Live trading and historical data routed via official Upstox Open API."
        headerAction={
          <div className="flex flex-wrap items-center gap-2">
            {isConnected ? (
              <StatusBadge tone="success" dot>
                Connected ({data?.latency_ms ?? 95}ms)
              </StatusBadge>
            ) : connStatus === "TOKEN_EXPIRED" ? (
              <StatusBadge tone="warning">
                <KeyRound className="w-3.5 h-3.5" />
                Token Expired
              </StatusBadge>
            ) : connStatus === "AUTH_FAILED" ? (
              <StatusBadge tone="danger">
                <ShieldAlert className="w-3.5 h-3.5" />
                Auth Failed
              </StatusBadge>
            ) : (
              <StatusBadge tone="neutral">
                <WifiOff className="w-3.5 h-3.5" />
                Disconnected
              </StatusBadge>
            )}

            <button
              type="button"
              onClick={handleOAuthLogin}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Login with Upstox</span>
            </button>

            <button
              type="button"
              onClick={handleVerify}
              disabled={isVerifying}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isVerifying ? "animate-spin" : ""}`}
              />
              <span>Verify Status</span>
            </button>

            {isConnected && (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium border border-rose-500/30 transition-colors cursor-pointer"
              >
                <span>Disconnect</span>
              </button>
            )}
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-xs text-slate-400 block">Trader account</span>
            <div className="mt-1 font-semibold text-slate-100 text-sm truncate">
              {data?.user_name || "Immanuel D"}
            </div>
            <div className="text-xs font-mono text-slate-400 mt-0.5">
              UCC: {data?.user_id || "5GC3MG"}
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-xs text-slate-400 block">
              API ping latency
            </span>
            <div className="mt-1 font-mono font-semibold text-sm text-emerald-400 tabular-nums">
              {isConnected ? `${data?.latency_ms ?? 95}ms` : "--"}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Upstox v2 Gateway
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-xs text-slate-400 block">
              Last verification
            </span>
            <div className="mt-1 font-mono text-sm text-slate-200 tabular-nums">
              {data?.last_verified
                ? new Date(data.last_verified).toLocaleTimeString()
                : "Never"}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              User profile handshake
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-xs text-slate-400 block">
              Token lifecycle
            </span>
            <div
              className={`mt-1 font-semibold text-sm ${
                isConnected ? "text-emerald-400" : "text-amber-300"
              }`}
            >
              {isConnected ? "Active 24h session" : "Requires authorization"}
            </div>
            <div className="text-xs font-mono text-slate-400 mt-0.5 truncate">
              {data?.expires_at_ist || "Daily 03:30 AM IST"}
            </div>
          </div>
        </div>
      </Card>

      {/* SECTION B: API CREDENTIALS FORM */}
      <Card
        title="Upstox Developer App Credentials"
        subtitle={
          <>
            Registered on{" "}
            <a
              href="https://developer.upstox.com"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400 hover:underline inline-flex items-center gap-1"
            >
              developer.upstox.com <ExternalLink className="w-3 h-3" />
            </a>
            . Secrets are encrypted at rest with Fernet AES-128.
          </>
        }
      >
        <form onSubmit={handleUpdateCredentials} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                API Key (Client ID)
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <span className="text-xs text-slate-400 mt-1 block">
                Found in your Upstox Developer Console App Details.
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  API Secret (Client Secret)
                </label>
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {showSecret ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Hide secret</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>Show secret</span>
                    </>
                  )}
                </button>
              </div>
              <input
                type={showSecret ? "text" : "password"}
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder={
                  data?.has_api_secret
                    ? "•••••••••••• (Leave blank to keep existing)"
                    : "Enter App Client Secret"
                }
                className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <span className="text-xs text-slate-400 mt-1 block">
                Never shared with frontend. Encrypted at rest in backend
                database.
              </span>
            </div>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-lg border flex items-start gap-2.5 text-xs ${
                testResult.valid
                  ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/25 text-rose-300"
              }`}
            >
              {testResult.valid ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <span className="font-semibold">
                  {testResult.valid
                    ? "Credential check succeeded"
                    : "Credential validation failed"}
                </span>
                <p className="font-mono text-xs leading-relaxed opacity-90">
                  {testResult.message}
                </p>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300">
                OAuth Redirect URI
              </label>
              <span className="text-xs text-slate-400">
                Must match Upstox Developer Console exactly
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={redirectUri}
                onChange={(e) => setRedirectUri(e.target.value)}
                className="flex-1 px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(redirectUri, "redirect")}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors shrink-0 cursor-pointer"
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
            <span className="text-xs text-slate-400">
              Changes take effect immediately across background trading loops.
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleTestCredentials}
                disabled={isTestingCreds}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isTestingCreds ? "animate-spin" : ""
                  }`}
                />
                <span>Test Credentials</span>
              </button>
              <button
                type="submit"
                disabled={isUpdatingCreds}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isUpdatingCreds ? "animate-spin" : ""
                  }`}
                />
                <span>Save Credentials</span>
              </button>
            </div>
          </div>
        </form>
      </Card>

      {/* SECTION C: COLLAPSIBLE PANEL — DAILY TOKEN MANAGEMENT (v3 API) */}
      <section className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
        <button
          type="button"
          onClick={() => setTokenPanelOpen((prev) => !prev)}
          aria-expanded={tokenPanelOpen}
          className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-800/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <BellRing className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Daily Token Management (v3 API)
              </h3>
              <p className="text-[13px] text-slate-400">
                Semi-automated Upstox mobile app push approval and daily
                scheduler
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <StatusBadge
              tone={
                isConnected && data?.last_token_approved_ist
                  ? "success"
                  : appApprovalStatus === "waiting" ||
                    reqStatus === "REQUESTED_PENDING"
                  ? "warning"
                  : appApprovalStatus === "failed" ||
                    reqStatus === "REJECTED" ||
                    reqStatus === "FAILED"
                  ? "danger"
                  : "neutral"
              }
            >
              {isRequestingToken || appApprovalStatus === "sending"
                ? "Sending request..."
                : appApprovalStatus === "sent"
                ? "Approval request sent"
                : appApprovalStatus === "waiting" ||
                  reqStatus === "REQUESTED_PENDING"
                ? "Waiting for Upstox App approval"
                : isConnected && data?.last_token_approved_ist
                ? "Token validation successful"
                : data?.last_token_approved_ist && !isConnected
                ? "Token received"
                : appApprovalStatus === "failed" ||
                  reqStatus === "REJECTED" ||
                  reqStatus === "FAILED"
                ? "Request failed"
                : reqStatusLabel}
            </StatusBadge>
            {tokenPanelOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </button>

        {tokenPanelOpen && (
          <div className="p-6 border-t border-slate-800 space-y-5">
            <p className="text-[13px] text-slate-400 leading-relaxed">
              Triggers{" "}
              <code className="text-slate-200 font-mono text-xs">
                POST /v3/login/auth/token/request
              </code>
              . Upstox sends an approval notification to your mobile app. Once
              approved, the token is delivered to your Notifier Webhook and
              verified automatically.
            </p>

            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block">
                    Last token request
                  </span>
                  <span className="font-mono text-slate-200 mt-0.5 block">
                    {data?.last_token_request_ist || "None"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">
                    Last token approval
                  </span>
                  <span className="font-mono text-emerald-400 mt-0.5 block">
                    {data?.last_token_approved_ist || "None"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Token expiry</span>
                  <span className="font-mono text-slate-200 mt-0.5 block">
                    {data?.expires_at_ist || "03:30 AM IST Daily"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Next scheduled</span>
                  <span className="font-mono text-slate-200 mt-0.5 block">
                    {data?.next_scheduled_request_ist || "08:45 AM IST"}
                  </span>
                </div>
              </div>

              {(appApprovalStatus === "waiting" ||
                reqStatus === "REQUESTED_PENDING") && (
                <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-300 font-semibold">
                      <Smartphone className="w-4 h-4 text-amber-400" />
                      <span>Action required on mobile device</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelRequest}
                      disabled={isCancelingRequest}
                      className="text-xs text-amber-300 hover:text-white underline font-medium cursor-pointer"
                    >
                      Cancel request
                    </button>
                  </div>
                  <p className="font-semibold text-slate-100">
                    Please open Upstox mobile app and approve the pending access
                    token request.
                  </p>
                </div>
              )}

              {(appApprovalStatus === "failed" ||
                (reqStatus === "NOTIFIER_URL_REQUIRED" && data?.last_error)) && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="font-mono">
                    {appApprovalMessage ||
                      data?.last_error ||
                      "Request failed. Check credentials and registered webhook URL."}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-medium text-slate-300">
                    Daily token scheduler
                  </span>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoEnabled}
                    onChange={(e) => setAutoEnabled(e.target.checked)}
                    aria-label="Enable Daily Token Scheduler"
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                </label>

                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  aria-label="Scheduled Request Time"
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                />

                <button
                  type="button"
                  onClick={handleSaveScheduler}
                  disabled={isSavingScheduler}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                >
                  Save Schedule
                </button>
              </div>

              <button
                type="button"
                onClick={handleRequestToken}
                disabled={isRequestingToken}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isRequestingToken ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending request...</span>
                  </>
                ) : (
                  <>
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Request Upstox App Approval</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* SECTION D: COLLAPSIBLE PANEL — NOTIFIER WEBHOOK CONFIGURATION */}
      <section className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
        <button
          type="button"
          onClick={() => setWebhookPanelOpen((prev) => !prev)}
          aria-expanded={webhookPanelOpen}
          className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-800/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Notifier Webhook Configuration
              </h3>
              <p className="text-[13px] text-slate-400">
                Public HTTPS endpoint registered in Upstox Developer Console for
                automated token delivery
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <StatusBadge
              tone={webhookResult?.is_reachable ? "success" : "neutral"}
            >
              {webhookResult
                ? webhookResult.endpoint_status
                : data?.webhook_url_status || "HTTPS Endpoint"}
            </StatusBadge>
            {webhookPanelOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </button>

        {webhookPanelOpen && (
          <div className="p-6 border-t border-slate-800 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Backend public webhook URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookEndpoint}
                  className="flex-1 px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 font-mono text-xs select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(webhookEndpoint, "webhook")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors shrink-0 cursor-pointer"
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

            {webhookResult && (
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
                {webhookResult.diagnosis}
              </div>
            )}

            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5 text-xs text-slate-300">
              <span className="font-semibold text-slate-200 block">
                Upstox Developer Console registration steps:
              </span>
              <ol className="list-decimal list-inside space-y-1 text-slate-400">
                <li>
                  Open{" "}
                  <a
                    href="https://developer.upstox.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:underline"
                  >
                    developer.upstox.com
                  </a>{" "}
                  and select your app.
                </li>
                <li>
                  Paste the HTTPS Webhook URL above into the{" "}
                  <strong>Notifier Webhook Endpoint</strong> field and save.
                </li>
              </ol>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">
                Endpoint reachability does not confirm Developer Console
                registration.
              </span>
              <button
                type="button"
                onClick={handleValidateWebhook}
                disabled={isValidatingWebhook}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs border border-slate-700 transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isValidatingWebhook ? "animate-spin" : ""
                  }`}
                />
                <span>Validate Webhook Endpoint</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
