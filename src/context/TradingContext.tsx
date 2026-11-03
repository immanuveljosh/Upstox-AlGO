"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import {
  TradingMode,
  ConnectionStatus,
  Position,
  Order,
  StrategyConfig,
  AccountStats,
  BrokerCredentials,
} from "@/types/trading";
import {
  defaultStrategy,
  initialActivePosition,
  initialStats,
  mockOrders,
  initialBrokerCredentials,
} from "@/lib/mockData";

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
  niftyPrice: number;
  niftyChange: number;
  niftyChangePct: number;
  activePosition: Position | null;
  orders: Order[];
  strategy: StrategyConfig;
  stats: AccountStats;
  credentials: BrokerCredentials;
  updateCredentials: (updates: Partial<BrokerCredentials>) => void;
  isKillSwitchModalOpen: boolean;
  openKillSwitchModal: () => void;
  closeKillSwitchModal: () => void;
  executeKillSwitch: () => void;
  executeManualOrder: (type: "CE" | "PE", lots?: number) => boolean;
  closeActivePosition: () => void;
  toggleStrategy: () => void;
  updateStrategyLots: (lots: number) => void;
  updateRiskSettings: (slPoints: number, maxLoss: number) => void;
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, "id">) => void;
  removeToast: (id: string) => void;
}

const TradingContext = createContext<TradingContextType | undefined>(undefined);

export function TradingProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<TradingMode>("LIVE");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("CONNECTED");
  const [niftyPrice, setNiftyPrice] = useState<number>(24878.5);
  const [niftyChange, setNiftyChange] = useState<number>(92.4);
  const [niftyChangePct, setNiftyChangePct] = useState<number>(0.37);

  const [activePosition, setActivePosition] = useState<Position | null>(initialActivePosition);
  const [orders, setOrders] = useState<Order[]>(mockOrders);
  const [strategy, setStrategy] = useState<StrategyConfig>(defaultStrategy);
  const [stats, setStats] = useState<AccountStats>(initialStats);
  const [credentials, setCredentials] = useState<BrokerCredentials>(initialBrokerCredentials);
  const [isKillSwitchModalOpen, setIsKillSwitchModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (toast: Omit<ToastMessage, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Subtle real-time tick fluctuation when connected in LIVE mode
  useEffect(() => {
    if (connectionStatus !== "CONNECTED") return;

    const interval = setInterval(() => {
      const delta = (Math.random() - 0.48) * 1.5;
      setNiftyPrice((prev) => {
        const updated = parseFloat((prev + delta).toFixed(2));
        setNiftyChange((c) => parseFloat((c + delta).toFixed(2)));
        setNiftyChangePct((cp) => parseFloat((cp + delta / 248).toFixed(2)));
        return updated;
      });

      // Update position LTP if active
      setActivePosition((pos) => {
        if (!pos) return null;
        const tickMove = (Math.random() - 0.47) * 0.4;
        const newLtp = parseFloat(Math.max(10, pos.ltp + tickMove).toFixed(2));
        const newPnl = parseFloat(((newLtp - pos.buyPrice) * pos.qty).toFixed(2));
        const newPct = parseFloat((((newLtp - pos.buyPrice) / pos.buyPrice) * 100).toFixed(2));
        return {
          ...pos,
          ltp: newLtp,
          pnl: newPnl,
          pnlPercent: newPct,
        };
      });
    }, 2400);

    return () => clearInterval(interval);
  }, [connectionStatus]);

  const setMode = (newMode: TradingMode) => {
    setModeState(newMode);
    addToast({
      type: "info",
      title: `Switched to ${newMode} Mode`,
      message:
        newMode === "LIVE"
          ? "Orders will now be routed to Upstox Live OMS."
          : "Paper simulation active. Historical backtest replay enabled.",
    });
  };

  const toggleConnection = () => {
    if (connectionStatus === "CONNECTED") {
      setConnectionStatus("DISCONNECTED");
      addToast({
        type: "error",
        title: "Broker Disconnected",
        message: "Upstox WebSocket stream lost. Live updates suspended.",
      });
    } else {
      setConnectionStatus("RECONNECTING");
      setTimeout(() => {
        setConnectionStatus("CONNECTED");
        addToast({
          type: "success",
          title: "Broker Connected",
          message: "Upstox Live Stream & Order Gateway established (18ms).",
        });
      }, 900);
    }
  };

  const openKillSwitchModal = () => {
    if (connectionStatus !== "CONNECTED") {
      addToast({
        type: "warning",
        title: "Broker Offline",
        message: "Kill switch requires an active broker connection to route square-off commands.",
      });
      return;
    }
    setIsKillSwitchModalOpen(true);
  };

  const closeKillSwitchModal = () => setIsKillSwitchModalOpen(false);

  const executeKillSwitch = () => {
    if (connectionStatus !== "CONNECTED") return;

    // Close any active position
    if (activePosition) {
      const exitOrder: Order = {
        id: `ORD-KILL-${Date.now().toString().slice(-5)}`,
        time: new Date().toLocaleTimeString("en-GB"),
        symbol: activePosition.symbol,
        strike: activePosition.strike,
        type: activePosition.type,
        lots: activePosition.lots,
        qty: activePosition.qty,
        price: activePosition.buyPrice,
        status: "CLOSED",
        exitPrice: activePosition.ltp,
        exitTime: new Date().toLocaleTimeString("en-GB"),
        pnl: activePosition.pnl,
      };

      setOrders((prev) => [exitOrder, ...prev]);
      setActivePosition(null);
    }

    // Stop Strategy
    setStrategy((prev) => ({ ...prev, status: "STOPPED" }));

    // Update stats
    setStats((prev) => ({
      ...prev,
      openPnl: 0,
      marginUsed: 0,
      marginAvailable: prev.totalCapital,
    }));

    setIsKillSwitchModalOpen(false);
    addToast({
      type: "error",
      title: "KILL SWITCH TRIGGERED",
      message: "Emergency exit executed! All positions squared off & strategy halted.",
    });
  };

  const executeManualOrder = (type: "CE" | "PE", lotsOverride?: number): boolean => {
    if (connectionStatus !== "CONNECTED") {
      addToast({
        type: "error",
        title: "Order Failed",
        message: "Cannot place order: Upstox broker connection is offline.",
      });
      return false;
    }

    const lots = lotsOverride || strategy.lots;
    const qty = lots * strategy.lotSize;
    // Calculate ATM strike nearest 50
    const atmStrike = Math.round(niftyPrice / 50) * 50;
    const premium = type === "CE" ? 148.5 : 134.2;
    const orderId = `ORD-${Date.now().toString().slice(-5)}`;
    const time = new Date().toLocaleTimeString("en-GB");
    const symbol = `NIFTY ${atmStrike} ${type}`;

    const newOrder: Order = {
      id: orderId,
      time,
      symbol,
      strike: atmStrike,
      type,
      lots,
      qty,
      price: premium,
      status: "PLACED",
      pnl: 0,
    };

    setOrders((prev) => [newOrder, ...prev]);

    setActivePosition({
      symbol,
      strike: atmStrike,
      type,
      lots,
      qty,
      buyPrice: premium,
      ltp: premium,
      pnl: 0,
      pnlPercent: 0,
      stoploss: parseFloat((premium - strategy.stoplossPoints).toFixed(2)),
      target: parseFloat((premium + strategy.targetPoints).toFixed(2)),
      trailingSl: parseFloat((premium - 10).toFixed(2)),
      entryTime: time,
    });

    setStats((prev) => ({
      ...prev,
      marginUsed: prev.marginUsed + premium * qty,
      marginAvailable: prev.marginAvailable - premium * qty,
      totalTrades: prev.totalTrades + 1,
    }));

    addToast({
      type: "success",
      title: `Order Placed: ${symbol}`,
      message: `Bought ${lots} Lots (${qty} Qty) @ ₹${premium.toFixed(2)} [${mode}]`,
    });

    return true;
  };

  const closeActivePosition = () => {
    if (!activePosition) return;
    if (connectionStatus !== "CONNECTED") {
      addToast({
        type: "error",
        title: "Action Blocked",
        message: "Cannot close position: broker is disconnected.",
      });
      return;
    }

    const exitOrder: Order = {
      id: `ORD-EXIT-${Date.now().toString().slice(-5)}`,
      time: new Date().toLocaleTimeString("en-GB"),
      symbol: activePosition.symbol,
      strike: activePosition.strike,
      type: activePosition.type,
      lots: activePosition.lots,
      qty: activePosition.qty,
      price: activePosition.buyPrice,
      status: "CLOSED",
      exitPrice: activePosition.ltp,
      exitTime: new Date().toLocaleTimeString("en-GB"),
      pnl: activePosition.pnl,
    };

    setOrders((prev) => [exitOrder, ...prev]);
    setActivePosition(null);

    setStats((prev) => ({
      ...prev,
      todayPnl: prev.todayPnl + activePosition.pnl,
      openPnl: 0,
      marginUsed: 0,
      marginAvailable: prev.totalCapital,
    }));

    addToast({
      type: "info",
      title: `Square-off: ${activePosition.symbol}`,
      message: `Closed @ ₹${activePosition.ltp} | P&L: ₹${activePosition.pnl.toFixed(2)}`,
    });
  };

  const toggleStrategy = () => {
    if (connectionStatus !== "CONNECTED") {
      addToast({
        type: "error",
        title: "Connection Required",
        message: "Strategy automation cannot run while broker is disconnected.",
      });
      return;
    }

    const nextStatus = strategy.status === "RUNNING" ? "STOPPED" : "RUNNING";
    setStrategy((prev) => ({ ...prev, status: nextStatus }));
    addToast({
      type: nextStatus === "RUNNING" ? "success" : "warning",
      title: `Strategy ${nextStatus}`,
      message:
        nextStatus === "RUNNING"
          ? "Directional trend scanner active (Supertrend + EMA). Waiting for signal."
          : "Algo execution stopped. No new trades will be triggered automatically.",
    });
  };

  const updateStrategyLots = (lots: number) => {
    if (lots < 1 || lots > 50) return;
    setStrategy((prev) => ({ ...prev, lots }));
    addToast({
      type: "info",
      title: "Strategy Updated",
      message: `Lot size configured to ${lots} lots (${lots * defaultStrategy.lotSize} qty).`,
    });
  };

  const updateRiskSettings = (stoplossPoints: number, maxDailyLoss: number) => {
    setStrategy((prev) => ({
      ...prev,
      stoplossPoints,
      maxDailyLoss,
    }));
    addToast({
      type: "success",
      title: "Risk Parameters Saved",
      message: `Stoploss: ${stoplossPoints} pts | Daily Loss Cap: ₹${maxDailyLoss.toLocaleString()}`,
    });
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
        niftyPrice,
        niftyChange,
        niftyChangePct,
        activePosition,
        orders,
        strategy,
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
        toasts,
        addToast,
        removeToast,
      }}
    >
      {children}
    </TradingContext.Provider>
  );
}

export function useTrading() {
  const context = useContext(TradingContext);
  if (!context) {
    throw new Error("useTrading must be used within a TradingProvider");
  }
  return context;
}

