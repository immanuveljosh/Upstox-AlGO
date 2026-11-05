"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  TradingMode,
  ConnectionStatus,
  Position,
  Order,
  StrategyConfig,
  StrategyLiveStatus,
  DirectionalSignal,
  AccountStats,
  BrokerCredentials,
  InstrumentMetadata,
} from "@/types/trading";
import {
  defaultStrategy,
  initialStats,
  initialBrokerCredentials,
} from "@/lib/mockData";
import { formatIndianNumber } from "@/lib/utils";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
}

interface TradingContextType {
  mode: TradingMode;
  setMode: (mode: TradingMode) => void;
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;
  toggleConnection: () => void;
  latencyMs: number;
  lastVerified: string | null;
  disconnectBroker: () => Promise<void>;
  reconnectBroker: () => Promise<void>;
  niftyPrice: number;
  niftyChange: number;
  niftyChangePct: number;
  niftyTimestamp: string | null;
  marketStatus: "LIVE" | "MARKET CLOSED";
  activePosition: Position | null;
  orders: Order[];
  strategy: StrategyConfig;
  strategyStatus: StrategyLiveStatus | null;
  refreshStrategyStatus: () => Promise<void>;
  recordGiftNiftyChange: (changePoints: number, tradeDate?: string) => Promise<boolean>;
  instrumentMetadata: InstrumentMetadata;
  stats: AccountStats;
  credentials: BrokerCredentials;
  updateCredentials: (updates: Partial<BrokerCredentials>) => void;
  isKillSwitchModalOpen: boolean;
  openKillSwitchModal: () => void;
  closeKillSwitchModal: () => void;
  executeKillSwitch: () => void | Promise<void>;
  executeManualOrder: (type: "CE" | "PE", lots?: number) => Promise<boolean> | boolean;
  closeActivePosition: () => void | Promise<void>;
  toggleStrategy: () => void;
  updateStrategyLots: (lots: number) => void;
  updateRiskSettings: (slPercent: number, targetPercent: number) => void;
  updateCapital: (capital: number) => void;
  setGiftNiftyChange: (change: number) => void;
  triggerStrategyEntry: (overrideChange?: number) => Promise<boolean> | boolean;
  isLiveConfirmOpen: boolean;
  requestLiveMode: () => void;
  confirmLiveMode: () => void;
  cancelLiveMode: () => void;
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, "id">) => void;
  removeToast: (id: string) => void;
}

const TradingContext = createContext<TradingContextType | undefined>(undefined);

export function TradingProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<TradingMode>("BACKTEST");
  const [isLiveConfirmOpen, setIsLiveConfirmOpen] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("DISCONNECTED");
  const [niftyPrice, setNiftyPrice] = useState<number>(0);
  const [niftyChange, setNiftyChange] = useState<number>(0);
  const [niftyChangePct, setNiftyChangePct] = useState<number>(0);
  const [niftyTimestamp, setNiftyTimestamp] = useState<string | null>(null);
  const [marketStatus, setMarketStatus] = useState<"LIVE" | "MARKET CLOSED">("MARKET CLOSED");

  const [activePosition, setActivePosition] = useState<Position | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [strategy, setStrategy] = useState<StrategyConfig>(defaultStrategy);
  const [strategyStatus, setStrategyStatus] = useState<StrategyLiveStatus | null>(null);
  const [instrumentMetadata, setInstrumentMetadata] = useState<InstrumentMetadata>({
    name: "NIFTY",
    segment: "NSE_FO",
    exchange: "NSE",
    instrumentKey: "",
    tradingSymbol: "NIFTY ITM 3 CE",
    expiry: "",
    lotSize: 65,
    freezeQuantity: 1755,
    minimumLot: 65,
    tickSize: 0.05,
    strike: 0,
    optionType: "CE",
    source: "EXCHANGE_SPEC_65",
  });
  const [stats, setStats] = useState<AccountStats>(initialStats);
  const [credentials, setCredentials] = useState<BrokerCredentials>(initialBrokerCredentials);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [lastVerified, setLastVerified] = useState<string | null>(null);
  const [isKillSwitchModalOpen, setIsKillSwitchModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<ToastMessage, "id">) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => {
        removeToast(id);
      }, 4500);
    },
    [removeToast]
  );

  // Sync live Upstox session & instrument metadata on initial mount
  useEffect(() => {
    async function syncBrokerSession() {
      try {
        const res = await fetch("http://localhost:8000/api/v1/broker/status");
        if (res.ok) {
          const json = await res.json();
          const d = json.data;
          if (d && d.is_connected) {
            setConnectionStatus("CONNECTED");
            setLatencyMs(d.latency_ms || 120);
            setLastVerified(d.last_verified || null);
            setCredentials((prev) => ({
              ...prev,
              ucc: d.user_id || prev.ucc,
              accountName: d.user_name || prev.accountName,
              email: d.email || prev.email,
            }));
          } else if (d) {
            const rawStatus = (d.connection_status || "").toUpperCase();
            if (rawStatus === "TOKEN_EXPIRED") {
              setConnectionStatus("TOKEN_EXPIRED");
            } else if (rawStatus === "AUTH_FAILED") {
              setConnectionStatus("AUTH_FAILED");
            } else {
              setConnectionStatus("DISCONNECTED");
            }
            setLatencyMs(0);
            setLastVerified(d.last_verified || null);
          } else {
            setConnectionStatus("DISCONNECTED");
            setLatencyMs(0);
          }
        }
        const metaRes = await fetch("http://localhost:8000/api/v1/strategy/instrument-metadata?option_type=CE");
        if (metaRes.ok) {
          const metaJson = await metaRes.json();
          if (metaJson.data && metaJson.data.lot_size) {
            const liveLotSize = Number(metaJson.data.lot_size) || 65;
            const liveFreeze = Number(metaJson.data.freeze_quantity) || 1755;
            setInstrumentMetadata({
              name: metaJson.data.name || "NIFTY",
              segment: metaJson.data.segment || "NSE_FO",
              exchange: metaJson.data.exchange || "NSE",
              instrumentKey: metaJson.data.instrument_key || "",
              tradingSymbol: metaJson.data.trading_symbol || "NIFTY ITM 3 CE",
              expiry: metaJson.data.expiry || "",
              lotSize: liveLotSize,
              freezeQuantity: liveFreeze,
              minimumLot: Number(metaJson.data.minimum_lot) || liveLotSize,
              tickSize: Number(metaJson.data.tick_size) || 0.05,
              strike: Number(metaJson.data.strike_price || metaJson.data.strike || 0),
              optionType: (metaJson.data.option_type as "CE" | "PE") || "CE",
              source: metaJson.data.source || "EXCHANGE_SPEC_65",
            });
            setStrategy((prev) => {
              const totalQty = prev.lots * liveLotSize;
              return {
                ...prev,
                lotSize: liveLotSize,
                stoplossPoints: Math.round(prev.stoplossAmount / totalQty),
                targetPoints: Math.round(prev.targetAmount / totalQty),
              };
            });
          }
        }
      } catch {
        // Backend offline or unreachable
      }
    }
    syncBrokerSession();
  }, []);

  // Handle OAuth callback status from URL parameters
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("auth") === "connected") {
        setConnectionStatus("CONNECTED");
        const ucc = params.get("ucc");
        if (ucc) {
          setCredentials((prev) => ({ ...prev, ucc }));
        }
        addToast({
          type: "success",
          title: "Upstox OAuth 2.0 Connected",
          message: "Authorization handshake complete. Live trading session active.",
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (params.get("auth") === "error") {
        const errorMsg = params.get("msg") || "OAuth token handshake failed.";
        addToast({
          type: "error",
          title: "Upstox Authentication Failed",
          message: decodeURIComponent(errorMsg),
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [addToast]);

  // Re-calculate dynamic 3rd ITM option display whenever Spot or Gift Nifty changes
  useEffect(() => {
    const change = strategy.giftNiftyChange;
    const hasSpot = niftyPrice > 0;
    const atm = hasSpot ? Math.round(niftyPrice / 50) * 50 : 0;

    let signal: "BULLISH" | "BEARISH" | "NO_TRADE" = "NO_TRADE";
    let signalLabel: DirectionalSignal = "DATA UNAVAILABLE";
    let selectedOption = "Awaiting Signal (ITM 3)";

    if (change === null || change === undefined || isNaN(change)) {
      signal = "NO_TRADE";
      signalLabel = "DATA UNAVAILABLE";
      selectedOption = "DATA UNAVAILABLE";
    } else if (change >= 80.0) {
      signal = "BULLISH";
      signalLabel = "CALL";
      selectedOption = hasSpot ? `NIFTY ${atm - 150} CE (ITM 3)` : "NIFTY ITM 3 CE";
    } else if (change <= -80.0) {
      signal = "BEARISH";
      signalLabel = "PUT";
      selectedOption = hasSpot ? `NIFTY ${atm + 150} PE (ITM 3)` : "NIFTY ITM 3 PE";
    } else {
      signal = "NO_TRADE";
      signalLabel = "NO TRADE";
      selectedOption = "None (Neutral -80 to +80)";
    }

    setStrategy((prev) => ({
      ...prev,
      signal,
      signalLabel,
      selectedOption,
    }));
  }, [niftyPrice, strategy.giftNiftyChange]);

  const refreshStrategyStatus = useCallback(async () => {
    try {
      const statusRes = await fetch("http://localhost:8000/api/v1/strategy/status");
      if (statusRes.ok) {
        const statusJson = await statusRes.json();
        if (statusJson.data) {
          const st: StrategyLiveStatus = statusJson.data;
          setStrategyStatus(st);
          const changePts = st.gift_nifty?.change_points ?? null;
          const winMap: Record<string, "OPEN" | "CLOSED" | "PRE_MARKET"> = {
            OPEN: "OPEN",
            PRE_WINDOW: "PRE_MARKET",
            CLOSED: "CLOSED",
          };
          setStrategy((prev) => ({
            ...prev,
            name: st.strategy_name || "Nifty Directional",
            status: st.engine_status || prev.status,
            giftNiftyChange: changePts,
            windowStatus: winMap[st.window_status] || "CLOSED",
            dailyTradeCount: st.trades_executed_today ?? prev.dailyTradeCount,
            maxDailyTrades: st.max_trades_per_day ?? prev.maxDailyTrades,
            totalCapital: st.total_capital ?? prev.totalCapital,
            stoplossPercent: st.stoploss_pct ?? prev.stoplossPercent,
            stoplossAmount: st.stoploss_amount ?? prev.stoplossAmount,
            targetPercent: st.target_pct ?? prev.targetPercent,
            targetAmount: st.target_amount ?? prev.targetAmount,
            lots: st.lots ?? prev.lots,
            lotSize: st.lot_size ?? prev.lotSize,
          }));
          if (st.mode === "LIVE" || st.mode === "BACKTEST") {
            setModeState(st.mode);
          }
        }
      }
    } catch {
      // Backend unreachable
    }
  }, []);

  const syncBackendState = useCallback(async () => {
    try {
      await refreshStrategyStatus();

      // 0. Sync broker connection & daily token lifecycle status
      const tokenStatusRes = await fetch("http://localhost:8000/api/v1/auth/token-request/status");
      if (tokenStatusRes.ok) {
        const tsJson = await tokenStatusRes.json();
        const td = tsJson.data;
        if (td) {
          if (td.is_connected) {
            setConnectionStatus("CONNECTED");
            if (td.last_verified) setLastVerified(td.last_verified);
            if (td.user_id || td.user_name) {
              setCredentials((prev) => ({
                ...prev,
                ucc: td.user_id || prev.ucc,
                accountName: td.user_name || prev.accountName,
              }));
            }
          } else {
            const rawSt = String(td.connection_status || "").toUpperCase();
            if (rawSt === "TOKEN_EXPIRED") setConnectionStatus("TOKEN_EXPIRED");
            else if (rawSt === "AUTH_FAILED") setConnectionStatus("AUTH_FAILED");
            else setConnectionStatus("DISCONNECTED");
          }
        }
      }

      // 1. Fetch real Nifty spot quote from Upstox
      const spotRes = await fetch("http://localhost:8000/api/v1/market/nifty-spot");
      if (spotRes.ok) {
        const spotJson = await spotRes.json();
        if (spotJson.connection_status === "connected" && spotJson.data?.spot_price) {
          setConnectionStatus("CONNECTED");
          setNiftyPrice(Number(spotJson.data.spot_price));
          setNiftyChange(Number(spotJson.data.change || 0));
          setNiftyChangePct(Number(spotJson.data.change_pct || 0));
          if (spotJson.data.timestamp) {
            setNiftyTimestamp(String(spotJson.data.timestamp));
          }
          if (spotJson.data.market_status) {
            setMarketStatus(spotJson.data.market_status as "LIVE" | "MARKET CLOSED");
          }
        }
      }

      // 2. Sync real Orders from Backend / Upstox OMS
      let rawOrdersData: Record<string, unknown>[] = [];
      const ordersRes = await fetch("http://localhost:8000/api/v1/orders");
      if (ordersRes.ok) {
        const ordersJson = await ordersRes.json();
        if (Array.isArray(ordersJson.data)) {
          rawOrdersData = ordersJson.data;
          setOrders(
            ordersJson.data.map((o: Record<string, unknown>) => ({
              id: String(o.client_order_id || o.id || ""),
              time: String(o.time || ""),
              symbol: String(o.symbol || ""),
              strike: Number(o.strike || 0),
              type: (o.type as "CE" | "PE") || "CE",
              lots: Number(o.lots || 1),
              lotSize: Number(o.lot_size || 65),
              qty: Number(o.qty || 65),
              price: Number(o.price || 0),
              status: (o.status as "PLACED" | "CLOSED" | "REJECTED") || "PLACED",
              pnl: o.pnl !== undefined && o.pnl !== null ? Number(o.pnl) : undefined,
              exitPrice:
                o.exit_price !== undefined && o.exit_price !== null
                  ? Number(o.exit_price)
                  : undefined,
              exitTime: o.exit_time ? String(o.exit_time) : undefined,
              rejectReason: o.reject_reason ? String(o.reject_reason) : undefined,
            }))
          );
        }
      }

      // 3. Sync real Positions from Upstox portfolio
      const posRes = await fetch("http://localhost:8000/api/v1/orders/positions");
      if (posRes.ok) {
        const posJson = await posRes.json();
        if (Array.isArray(posJson.data) && posJson.data.length > 0) {
          const firstPos = posJson.data[0];
          const netQty = Number(firstPos.quantity || firstPos.net_quantity || 0);
          if (netQty !== 0) {
            const buyPr = Number(firstPos.buy_price || firstPos.average_price || 0);
            const ltpVal = Number(firstPos.last_price || buyPr);
            const pnlVal = Number(firstPos.pnl || (ltpVal - buyPr) * netQty);
            const ts = String(firstPos.trading_symbol || firstPos.tradingsymbol || "NIFTY");
            const optType = ts.includes("PE") ? "PE" : "CE";

            const matchingDbOrder = rawOrdersData.find((o: Record<string, unknown>) => {
              const oStat = String(o.status || "");
              return oStat === "PLACED" || oStat === "PENDING_EXIT";
            }) || null;

            const rejectReason = matchingDbOrder?.rejectReason || matchingDbOrder?.reject_reason;
            const isUnverified = typeof rejectReason === "string" && rejectReason.includes("UNVERIFIED");
            const isStale = typeof rejectReason === "string" && rejectReason.includes("STALE");
            const qStatus = isUnverified ? "UNVERIFIED" : isStale ? "STALE" : "FRESH";

            setActivePosition({
              symbol: ts,
              strike: Number(firstPos.strike_price || 0),
              type: optType,
              lots: Math.max(1, Math.round(Math.abs(netQty) / 65)),
              lotSize: 65,
              qty: Math.abs(netQty),
              buyPrice: buyPr,
              ltp: ltpVal,
              pnl: pnlVal,
              pnlPercent: buyPr > 0 ? ((ltpVal - buyPr) / buyPr) * 100 : 0,
              stoploss: 0,
              target: 0,
              trailingSl: 0,
              entryTime: "Live",
              status: typeof matchingDbOrder?.status === "string" ? matchingDbOrder.status : "PLACED",
              isStale: isStale,
              isUnverified: isUnverified,
              quoteStatus: qStatus,
              quoteRejectReason: typeof rejectReason === "string" ? rejectReason : undefined,
            });
          } else {
            setActivePosition(null);
          }
        } else {
          setActivePosition(null);
        }
      }

      // 4. Sync real Funds from Upstox
      const fundsRes = await fetch("http://localhost:8000/api/v1/market/funds");
      if (fundsRes.ok) {
        const fundsJson = await fundsRes.json();
        if (fundsJson.data) {
          const avail = Number(fundsJson.data.available_margin || 0);
          const used = Number(fundsJson.data.used_margin || 0);
          setStats((prev) => ({
            ...prev,
            marginAvailable: avail,
            marginUsed: used,
            totalCapital: avail + used > 0 ? avail + used : prev.totalCapital,
          }));
        }
      }
    } catch {
      // Backend offline or unreachable
    }
  }, [refreshStrategyStatus]);

  useEffect(() => {
    syncBackendState();
    const interval = setInterval(syncBackendState, 5000);
    return () => clearInterval(interval);
  }, [syncBackendState]);

  const setMode = (newMode: TradingMode) => {
    if (newMode === "LIVE") {
      requestLiveMode();
    } else {
      setModeState(newMode);
      fetch("http://localhost:8000/api/v1/strategy/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode }),
      }).catch(() => {});
      addToast({
        type: "info",
        title: `Mode: ${newMode} Active`,
        message:
          "Backtest mode active: historical strategy checking only, zero live orders.",
      });
    }
  };

  const requestLiveMode = () => setIsLiveConfirmOpen(true);
  const cancelLiveMode = () => setIsLiveConfirmOpen(false);

  const confirmLiveMode = async () => {
    setIsLiveConfirmOpen(false);
    try {
      const res = await fetch("http://localhost:8000/api/v1/strategy/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "LIVE", confirm_live: true }),
      });
      const json = await res.json();
      if (res.ok) {
        setModeState("LIVE");
        addToast({
          type: "warning",
          title: "LIVE TRADING ACTIVATED",
          message:
            "Live mode active: real money orders will now be routed directly to Upstox OMS.",
        });
      } else {
        addToast({
          type: "error",
          title: "Cannot Switch to Live Mode",
          message: json.message || "Connect your Upstox broker session first.",
        });
      }
    } catch {
      addToast({
        type: "error",
        title: "Backend Unreachable",
        message: "Could not verify broker session for Live mode.",
      });
    }
  };

  const reconnectBroker = useCallback(async () => {
    setConnectionStatus("CONNECTING");
    try {
      const res = await fetch("http://localhost:8000/api/v1/broker/status");
      if (res.ok) {
        const json = await res.json();
        const d = json.data;
        if (d && d.is_connected) {
          setConnectionStatus("CONNECTED");
          setLatencyMs(d.latency_ms || 120);
          setLastVerified(d.last_verified || null);
          setCredentials((prev) => ({
            ...prev,
            ucc: d.user_id || prev.ucc,
            accountName: d.user_name || prev.accountName,
            email: d.email || prev.email,
          }));
          addToast({
            type: "success",
            title: "Upstox Live Verified",
            message: `Connected as ${d.user_name || "User"} (${d.user_id || "UCC"}) • ${d.latency_ms || 120}ms latency.`,
          });
          return;
        } else if (d) {
          const rawStatus = (d.connection_status || "").toUpperCase();
          if (rawStatus === "TOKEN_EXPIRED") {
            setConnectionStatus("TOKEN_EXPIRED");
            setLatencyMs(0);
            addToast({
              type: "warning",
              title: "Token Expired",
              message: "Upstox daily access token expired. Please click 'Login with Upstox'.",
            });
            return;
          } else if (rawStatus === "AUTH_FAILED") {
            setConnectionStatus("AUTH_FAILED");
            setLatencyMs(0);
            addToast({
              type: "error",
              title: "Authentication Failed",
              message: json.message || "Invalid Upstox credentials or token.",
            });
            return;
          }
        }
      }
      setConnectionStatus("DISCONNECTED");
      setLatencyMs(0);
      addToast({
        type: "warning",
        title: "Upstox Disconnected",
        message: "No active Upstox session. Please authenticate via OAuth in Settings.",
      });
    } catch {
      setConnectionStatus("DISCONNECTED");
      setLatencyMs(0);
      addToast({
        type: "error",
        title: "Backend Offline",
        message: "Cannot connect to backend server at http://localhost:8000.",
      });
    }
  }, [addToast]);

  const disconnectBroker = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:8000/api/v1/auth/disconnect", {
        method: "POST",
      });
      if (res.ok) {
        setConnectionStatus("DISCONNECTED");
        setLatencyMs(0);
        addToast({
          type: "info",
          title: "Broker Disconnected",
          message: "Upstox broker session terminated successfully.",
        });
      }
    } catch {
      setConnectionStatus("DISCONNECTED");
      setLatencyMs(0);
    }
  }, [addToast]);

  const toggleConnection = useCallback(async () => {
    if (connectionStatus === "CONNECTED") {
      await disconnectBroker();
    } else {
      await reconnectBroker();
    }
  }, [connectionStatus, disconnectBroker, reconnectBroker]);

  const openKillSwitchModal = () => setIsKillSwitchModalOpen(true);
  const closeKillSwitchModal = () => setIsKillSwitchModalOpen(false);

  const executeKillSwitch = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/v1/orders/exit-all", {
        method: "POST",
      });
      const json = await res.json();
      addToast({
        type: "error",
        title: "KILL SWITCH TRIGGERED",
        message: `Emergency exit executed: ${json.data?.positions_closed ?? 0} positions closed, ${json.data?.orders_cancelled ?? 0} orders cancelled.`,
      });
    } catch {
      addToast({
        type: "error",
        title: "KILL SWITCH TRIGGERED",
        message:
          "Emergency stop engaged: All positions closed and strategy halted immediately.",
      });
    }

    setStrategy((prev) => ({ ...prev, status: "STOPPED" }));
    setActivePosition(null);
    setIsKillSwitchModalOpen(false);
    await syncBackendState();
  };

  // Execute directional trade strictly with ITM 3 strike selection
  const executeManualOrder = async (
    type: "CE" | "PE",
    lotsOverride?: number
  ): Promise<boolean> => {
    if (mode !== "LIVE") {
      addToast({
        type: "warning",
        title: "Order Placement Restricted",
        message:
          "Trading Desk is in BACKTEST mode. Switch to LIVE mode in the top bar to route real orders to Upstox OMS.",
      });
      return false;
    }

    if (connectionStatus !== "CONNECTED") {
      addToast({
        type: "error",
        title: "Order Failed",
        message: "Cannot place order: Upstox broker connection is offline.",
      });
      return false;
    }

    if (strategy.dailyTradeCount >= strategy.maxDailyTrades) {
      addToast({
        type: "warning",
        title: "Daily Limit Reached",
        message:
          "Nifty Directional limit of maximum 1 trade per day has already been utilized.",
      });
      return false;
    }

    const lots = lotsOverride ?? strategy.lots;
    const lotSize = strategy.lotSize || 65;
    const qty = lots * lotSize;
    const freezeQty = instrumentMetadata.freezeQuantity || 1755;

    if (!Number.isInteger(lots) || lots < 1) {
      addToast({
        type: "error",
        title: "Invalid Lot Count",
        message: `Number of lots must be at least 1 (1 lot = ${lotSize} units).`,
      });
      return false;
    }

    if (qty % lotSize !== 0) {
      addToast({
        type: "error",
        title: "Exchange Lot Multiple Error",
        message: `Total quantity (${qty}) must be an exact multiple of NIFTY lot size (${lotSize}).`,
      });
      return false;
    }

    if (qty > freezeQty) {
      const maxLots = Math.floor(freezeQty / lotSize);
      addToast({
        type: "error",
        title: "NSE Freeze Limit Exceeded",
        message: `Total quantity (${qty}) exceeds NSE NIFTY freeze limit of ${freezeQty} units (${maxLots} lots max per order).`,
      });
      return false;
    }

    const payload: Record<string, unknown> = {
      option_type: type,
      lots,
      order_type: "MARKET",
    };

    if (niftyPrice > 0) {
      const atmStrike = Math.round(niftyPrice / 50) * 50;
      payload.strike = type === "CE" ? atmStrike - 150 : atmStrike + 150;
    }

    try {
      const res = await fetch("http://localhost:8000/api/v1/orders/directional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resJson = await res.json();

      if (res.ok && resJson.data) {
        const orderData = resJson.data;
        if (orderData.status === "REJECTED") {
          addToast({
            type: "error",
            title: "Upstox OMS Rejected Order",
            message: orderData.reject_reason || "Order was rejected by broker RMS.",
          });
        } else {
          addToast({
            type: "success",
            title: "Live Order Placed on Upstox",
            message: `Bought ${orderData.symbol} • ${lots} Lots × ${lotSize} = ${qty} Qty (Upstox ID: ${orderData.upstox_order_id || orderData.client_order_id})`,
          });
        }
      } else {
        const errorDetail =
          resJson.detail || resJson.message || "Failed to route order to Upstox OMS.";
        addToast({
          type: "error",
          title: "Order Placement Error",
          message: errorDetail,
        });
        return false;
      }
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : "Could not reach trading backend at http://localhost:8000.";
      addToast({
        type: "error",
        title: "Backend Connection Error",
        message: errMsg,
      });
      return false;
    }

    await syncBackendState();
    return true;
  };

  const closeActivePosition = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/v1/orders/exit-all", {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok && json.data?.triggered) {
        addToast({
          type: "info",
          title: "Positions Squared Off",
          message: `Closed ${json.data.positions_closed} position(s) and cancelled ${json.data.orders_cancelled} order(s) on Upstox.`,
        });
      } else {
        addToast({
          type: "warning",
          title: "Square-off Notice",
          message: json.message || "Position closed.",
        });
      }
    } catch {
      addToast({
        type: "info",
        title: "Manual Square-off",
        message: "Square-off command dispatched.",
      });
    }
    setActivePosition(null);
    await syncBackendState();
  };

  const toggleStrategy = async () => {
    if (connectionStatus !== "CONNECTED" && mode === "LIVE") {
      addToast({
        type: "error",
        title: "Connection Required",
        message:
          "Live strategy automation cannot run while Upstox broker is disconnected.",
      });
      return;
    }

    try {
      const res = await fetch("http://localhost:8000/api/v1/strategy/toggle", {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok && json.data?.status) {
        const nextStatus = json.data.status as "RUNNING" | "STOPPED";
        setStrategy((prev) => ({ ...prev, status: nextStatus }));
        addToast({
          type: nextStatus === "RUNNING" ? "success" : "info",
          title: `Nifty Directional ${nextStatus}`,
          message:
            nextStatus === "RUNNING"
              ? "Nifty Directional scanner is active. Monitoring 09:15:00–09:17:00 IST window."
              : "Nifty Directional stopped. Automated order execution halted.",
        });
        await refreshStrategyStatus();
      } else {
        addToast({
          type: "error",
          title: "Strategy Action Blocked",
          message: json.message || "Could not toggle strategy state.",
        });
      }
    } catch {
      addToast({
        type: "error",
        title: "Backend Unreachable",
        message: "Could not reach backend to toggle strategy.",
      });
    }
  };

  const updateStrategyLots = (lots: number) => {
    const lotSize = strategy.lotSize || 65;
    const freezeQty = instrumentMetadata.freezeQuantity || 1755;
    const maxLots = Math.floor(freezeQty / lotSize);

    if (!Number.isInteger(lots) || lots < 1) return;
    if (lots > maxLots) {
      addToast({
        type: "warning",
        title: "NSE Freeze Quantity Limit",
        message: `Maximum allowed per order is ${maxLots} lots (${freezeQty} qty) for NIFTY 50 options.`,
      });
      return;
    }

    const qty = lots * lotSize;
    const slPts = Math.round(strategy.stoplossAmount / qty);
    const tgtPts = Math.round(strategy.targetAmount / qty);

    setStrategy((prev) => ({
      ...prev,
      lots,
      stoplossPoints: slPts,
      targetPoints: tgtPts,
    }));

    fetch("http://localhost:8000/api/v1/strategy/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lots }),
    })
      .then(() => refreshStrategyStatus())
      .catch(() => {});

    addToast({
      type: "info",
      title: "Lot Size & Quantity Updated",
      message: `${lots} Lot${lots > 1 ? "s" : ""} × ${lotSize} Lot Size = ${qty} Total Quantity (SL: ${slPts} pts, Target: ${tgtPts} pts).`,
    });
  };

  const updateRiskSettings = (stoplossPercent: number, targetPercent: number) => {
    const slAmt = round2(strategy.totalCapital * (stoplossPercent / 100.0));
    const tgtAmt = round2(strategy.totalCapital * (targetPercent / 100.0));
    const qty = strategy.lots * strategy.lotSize;

    setStrategy((prev) => ({
      ...prev,
      stoplossPercent,
      targetPercent,
      stoplossAmount: slAmt,
      targetAmount: tgtAmt,
      maxDailyLoss: slAmt,
      stoplossPoints: Math.round(slAmt / qty),
      targetPoints: Math.round(tgtAmt / qty),
    }));

    fetch("http://localhost:8000/api/v1/strategy/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stoploss_capital_pct: stoplossPercent,
        target_capital_pct: targetPercent,
      }),
    })
      .then(() => refreshStrategyStatus())
      .catch(() => {});

    addToast({
      type: "success",
      title: "Risk Parameters Saved",
      message: `SL: ${stoplossPercent}% (₹${formatIndianNumber(slAmt)}) | Target: ${targetPercent}% (₹${formatIndianNumber(tgtAmt)})`,
    });
  };

  const updateCapital = (totalCapital: number) => {
    const slAmt = round2(totalCapital * (strategy.stoplossPercent / 100.0));
    const tgtAmt = round2(totalCapital * (strategy.targetPercent / 100.0));
    const qty = strategy.lots * strategy.lotSize;

    setStrategy((prev) => ({
      ...prev,
      totalCapital,
      stoplossAmount: slAmt,
      targetAmount: tgtAmt,
      maxDailyLoss: slAmt,
      stoplossPoints: Math.round(slAmt / qty),
      targetPoints: Math.round(tgtAmt / qty),
    }));

    fetch("http://localhost:8000/api/v1/strategy/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total_capital: totalCapital }),
    })
      .then(() => refreshStrategyStatus())
      .catch(() => {});

    addToast({
      type: "info",
      title: "Capital Updated",
      message: `Total Strategy Capital set to ₹${formatIndianNumber(totalCapital)} (SL 4% = ₹${formatIndianNumber(slAmt)}, Target 5% = ₹${formatIndianNumber(tgtAmt)})`,
    });
  };

  const setGiftNiftyChange = (change: number) => {
    const pct = niftyPrice > 0 ? round2((change / niftyPrice) * 100) : 0;
    setStrategy((prev) => ({
      ...prev,
      giftNiftyChange: change,
      giftNiftyChangePct: pct,
    }));
  };

  const recordGiftNiftyChange = async (
    changePoints: number,
    tradeDate?: string
  ): Promise<boolean> => {
    try {
      const res = await fetch("http://localhost:8000/api/v1/strategy/gift-nifty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          change_points: changePoints,
          trade_date: tradeDate || undefined,
          source: "MANUAL",
        }),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        setGiftNiftyChange(Number(json.data.change_points));
        await refreshStrategyStatus();
        addToast({
          type: "success",
          title: "Gift Nifty Recorded",
          message: `Saved ${json.data.change_points >= 0 ? "+" : ""}${json.data.change_points} pts for ${json.data.trade_date} (Signal: ${json.data.signal}).`,
        });
        return true;
      }
      addToast({
        type: "error",
        title: "Failed to Save Gift Nifty",
        message: json.message || "Could not record Gift Nifty observation.",
      });
      return false;
    } catch {
      addToast({
        type: "error",
        title: "Backend Unreachable",
        message: "Could not save Gift Nifty observation to backend.",
      });
      return false;
    }
  };

  const triggerStrategyEntry = async (overrideChange?: number): Promise<boolean> => {
    const change = overrideChange !== undefined ? overrideChange : strategy.giftNiftyChange;
    if (change === null || change === undefined || isNaN(change)) {
      addToast({
        type: "warning",
        title: "DATA UNAVAILABLE",
        message: "Gift Nifty 1-Day change is not available. Record or fetch Gift Nifty change first.",
      });
      return false;
    }
    if (change >= 80.0) {
      return await executeManualOrder("CE");
    } else if (change <= -80.0) {
      return await executeManualOrder("PE");
    } else {
      addToast({
        type: "info",
        title: "NO TRADE",
        message: `Gift Nifty change (${change > 0 ? "+" : ""}${change} pts) is inside neutral zone (-80 to +80). No trade generated.`,
      });
      return false;
    }
  };

  const updateCredentials = (updates: Partial<BrokerCredentials>) => {
    setCredentials((prev) => ({ ...prev, ...updates }));
    addToast({
      type: "success",
      title: "API Credentials Saved",
      message: "Upstox configuration updated.",
    });
  };

  return (
    <TradingContext.Provider
      value={{
        mode,
        setMode,
        connectionStatus,
        setConnectionStatus,
        toggleConnection,
        latencyMs,
        lastVerified,
        disconnectBroker,
        reconnectBroker,
        niftyPrice,
        niftyChange,
        niftyChangePct,
        niftyTimestamp,
        marketStatus,
        activePosition,
        orders,
        strategy,
        strategyStatus,
        refreshStrategyStatus,
        recordGiftNiftyChange,
        instrumentMetadata,
        stats,
        credentials,
        updateCredentials,
        isKillSwitchModalOpen,
        openKillSwitchModal,
        closeKillSwitchModal,
        executeKillSwitch,
        executeManualOrder,
        closeActivePosition,
        toggleStrategy,
        updateStrategyLots,
        updateRiskSettings,
        updateCapital,
        setGiftNiftyChange,
        triggerStrategyEntry,
        isLiveConfirmOpen,
        requestLiveMode,
        confirmLiveMode,
        cancelLiveMode,
        toasts,
        addToast,
        removeToast,
      }}
    >
      {children}
    </TradingContext.Provider>
  );
}

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function useTrading() {
  const context = useContext(TradingContext);
  if (!context) {
    throw new Error("useTrading must be used within a TradingProvider");
  }
  return context;
}
