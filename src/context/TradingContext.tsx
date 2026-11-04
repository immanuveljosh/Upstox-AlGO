"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
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
  updateRiskSettings: (slPercent: number, targetPercent: number) => void;
  updateCapital: (capital: number) => void;
  setGiftNiftyChange: (change: number) => void;
  triggerStrategyEntry: (overrideChange?: number) => boolean;
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
  // 1. Default mode is strictly PAPER TRADING
  const [mode, setModeState] = useState<TradingMode>("PAPER");
  const [isLiveConfirmOpen, setIsLiveConfirmOpen] = useState(false);

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

  const addToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Re-calculate dynamic 3rd ITM option whenever Spot or Gift Nifty changes
  useEffect(() => {
    const atm = Math.round(niftyPrice / 50) * 50;
    const change = strategy.giftNiftyChange;
    let signal: "BULLISH" | "BEARISH" | "NO_TRADE" = "NO_TRADE";
    let selectedOption = "None (No Trade Zone)";
    let entryPrice = 218.4;

    if (change >= 80.0) {
      signal = "BULLISH";
      const strike = atm - 150; // 3rd ITM Call
      selectedOption = `NIFTY ${strike} CE`;
      entryPrice = 218.4;
    } else if (change <= -80.0) {
      signal = "BEARISH";
      const strike = atm + 150; // 3rd ITM Put
      selectedOption = `NIFTY ${strike} PE`;
      entryPrice = 204.6;
    }

    setStrategy((prev) => ({
      ...prev,
      signal,
      selectedOption,
      entryPrice,
    }));
  }, [niftyPrice, strategy.giftNiftyChange]);

  // Real-time tick fluctuation and Capital-based SL / Target monitor
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

      // Update active position LTP & check capital-based SL (-5%) and Target (+6%)
      setActivePosition((pos) => {
        if (!pos) return null;
        const tickMove = (Math.random() - 0.47) * 0.4;
        const newLtp = parseFloat(Math.max(10, pos.ltp + tickMove).toFixed(2));
        const newPnl = parseFloat(((newLtp - pos.buyPrice) * pos.qty).toFixed(2));
        const newPct = parseFloat((((newLtp - pos.buyPrice) / pos.buyPrice) * 100).toFixed(2));

        // Capital risk conditions: 5% of strategy total capital, 6% Target
        const slCapitalLimit = strategy.stoplossAmount; // e.g. ₹10,000 on ₹2L
        const tgtCapitalLimit = strategy.targetAmount; // e.g. ₹12,000 on ₹2L

        if (newPnl <= -slCapitalLimit) {
          // Trigger Stop Loss auto exit
          setTimeout(() => {
            closePositionWithReason("STOP LOSS HIT (-5% Capital)");
          }, 0);
        } else if (newPnl >= tgtCapitalLimit) {
          // Trigger Target Profit auto exit
          setTimeout(() => {
            closePositionWithReason("TARGET REACHED (+6% Capital)");
          }, 0);
        }

        return {
          ...pos,
          ltp: newLtp,
          pnl: newPnl,
          pnlPercent: newPct,
        };
      });
    }, 2400);

    return () => clearInterval(interval);
  }, [connectionStatus, strategy.stoplossAmount, strategy.targetAmount]);

  // Helper: Close position with specific exit reason
  const closePositionWithReason = (reason: string) => {
    setActivePosition((currPos) => {
      if (!currPos) return null;
      const exitOrder: Order = {
        id: `ORD-EXIT-${Date.now().toString().slice(-5)}`,
        time: new Date().toLocaleTimeString("en-GB"),
        symbol: currPos.symbol,
        strike: currPos.strike,
        type: currPos.type,
        lots: currPos.lots,
        qty: currPos.qty,
        price: currPos.buyPrice,
        status: "CLOSED",
        exitPrice: currPos.ltp,
        exitTime: new Date().toLocaleTimeString("en-GB"),
        pnl: currPos.pnl,
        rejectReason: reason,
      };

      setOrders((prev) => [exitOrder, ...prev]);
      setStats((prev) => ({
        ...prev,
        todayPnl: prev.todayPnl + currPos.pnl,
        openPnl: 0,
        marginUsed: 0,
        marginAvailable: prev.totalCapital,
      }));

      addToast({
        type: currPos.pnl >= 0 ? "success" : "warning",
        title: `Auto Exit: ${reason}`,
        message: `${currPos.symbol} closed @ ₹${currPos.ltp}. Realized P&L: ₹${currPos.pnl.toFixed(2)}`,
      });

      return null;
    });
  };

  // Mode switching with safety check
  const setMode = (newMode: TradingMode) => {
    if (newMode === "LIVE") {
      requestLiveMode();
    } else {
      setModeState(newMode);
      addToast({
        type: "info",
        title: `Mode: ${newMode} Active`,
        message:
          newMode === "PAPER"
            ? "Paper Trading mode active: orders simulated safely without real capital risk."
            : "Backtest mode active: testing historical candles and option chain.",
      });
    }
  };

  const requestLiveMode = () => setIsLiveConfirmOpen(true);
  const cancelLiveMode = () => setIsLiveConfirmOpen(false);

  const confirmLiveMode = () => {
    setIsLiveConfirmOpen(false);
    setModeState("LIVE");
    addToast({
      type: "warning",
      title: "LIVE TRADING ACTIVATED",
      message: "Live mode active: real money orders will now be routed directly to Upstox OMS.",
    });
  };

  const toggleConnection = () => {
    if (connectionStatus === "CONNECTED") {
      setConnectionStatus("DISCONNECTED");
      addToast({
        type: "error",
        title: "Broker Disconnected",
        message: "Upstox WebSocket feed lost. Live updates suspended.",
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

  const openKillSwitchModal = () => setIsKillSwitchModalOpen(true);
  const closeKillSwitchModal = () => setIsKillSwitchModalOpen(false);

  const executeKillSwitch = () => {
    if (activePosition) {
      closePositionWithReason("KILL SWITCH EMERGENCY EXIT");
    }

    setStrategy((prev) => ({ ...prev, status: "STOPPED" }));
    setIsKillSwitchModalOpen(false);
    addToast({
      type: "error",
      title: "KILL SWITCH TRIGGERED",
      message: "Emergency stop engaged: All positions closed and strategy halted immediately.",
    });
  };

  // Execute directional trade strictly with 3rd ITM strike selection
  const executeManualOrder = (type: "CE" | "PE", lotsOverride?: number): boolean => {
    if (connectionStatus !== "CONNECTED" && mode === "LIVE") {
      addToast({
        type: "error",
        title: "Order Failed",
        message: "Cannot place order: Upstox broker connection is offline.",
      });
      return false;
    }

    // Daily 1-trade limit check
    if (strategy.dailyTradeCount >= strategy.maxDailyTrades) {
      addToast({
        type: "warning",
        title: "Daily Limit Reached",
        message: "Strategy limit of maximum 1 trade per day has already been utilized.",
      });
      return false;
    }

    const lots = lotsOverride || strategy.lots;
    const qty = lots * strategy.lotSize;

    // Formula: 3rd ITM Strike
    // Call ITM 3: ATM - 150
    // Put ITM 3: ATM + 150
    const atmStrike = Math.round(niftyPrice / 50) * 50;
    const itm3Strike = type === "CE" ? atmStrike - 150 : atmStrike + 150;
    const premium = type === "CE" ? 218.4 : 204.6;
    const orderId = `UPX-${Date.now().toString().slice(-6)}`;
    const time = new Date().toLocaleTimeString("en-GB");
    const symbol = `NIFTY ${itm3Strike} ${type}`;

    const newOrder: Order = {
      id: orderId,
      time,
      symbol,
      strike: itm3Strike,
      type,
      lots,
      qty,
      price: premium,
      status: "PLACED",
      pnl: 0,
    };

    setOrders((prev) => [newOrder, ...prev]);

    // Calculate Capital-based SL & Target
    const slPts = parseFloat((strategy.stoplossAmount / qty).toFixed(1));
    const tgtPts = parseFloat((strategy.targetAmount / qty).toFixed(1));

    setActivePosition({
      symbol,
      strike: itm3Strike,
      type,
      lots,
      qty,
      buyPrice: premium,
      ltp: premium,
      pnl: 0,
      pnlPercent: 0,
      stoploss: parseFloat((premium - slPts).toFixed(2)),
      target: parseFloat((premium + tgtPts).toFixed(2)),
      trailingSl: parseFloat((premium - 10).toFixed(2)),
      entryTime: time,
    });

    // Increment daily trade count
    setStrategy((prev) => ({
      ...prev,
      dailyTradeCount: prev.dailyTradeCount + 1,
    }));

    setStats((prev) => ({
      ...prev,
      marginUsed: prev.marginUsed + premium * qty,
      marginAvailable: Math.max(0, prev.marginAvailable - premium * qty),
      totalTrades: prev.totalTrades + 1,
    }));

    addToast({
      type: "success",
      title: `Order Placed (${mode} Mode)`,
      message: `Bought ${symbol} (3rd ITM) - ${lots} Lots (${qty} Qty) @ ₹${premium.toFixed(2)}`,
    });

    return true;
  };

  const closeActivePosition = () => {
    if (!activePosition) return;
    closePositionWithReason("Manual Square-off");
  };

  const toggleStrategy = () => {
    if (connectionStatus !== "CONNECTED" && mode === "LIVE") {
      addToast({
        type: "error",
        title: "Connection Required",
        message: "Live strategy automation cannot run while Upstox broker is disconnected.",
      });
      return;
    }

    const nextStatus = strategy.status === "RUNNING" ? "STOPPED" : "RUNNING";
    setStrategy((prev) => ({ ...prev, status: nextStatus }));
    addToast({
      type: nextStatus === "RUNNING" ? "success" : "info",
      title: `Strategy ${nextStatus}`,
      message:
        nextStatus === "RUNNING"
          ? "Gift Nifty Directional scanner is active. Monitoring 09:15-09:17 AM window."
          : "Strategy stopped. Automated order execution suspended.",
    });
  };

  const updateStrategyLots = (lots: number) => {
    if (lots < 1 || lots > 50) return;
    const qty = lots * strategy.lotSize;
    const slPts = Math.round(strategy.stoplossAmount / qty);
    const tgtPts = Math.round(strategy.targetAmount / qty);

    setStrategy((prev) => ({
      ...prev,
      lots,
      stoplossPoints: slPts,
      targetPoints: tgtPts,
    }));

    addToast({
      type: "info",
      title: "Lots Configured",
      message: `Configured ${lots} lots (${qty} qty). SL = ${slPts} pts, Target = ${tgtPts} pts.`,
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
      stoplossPoints: Math.round(slAmt / qty),
      targetPoints: Math.round(tgtAmt / qty),
    }));

    addToast({
      type: "success",
      title: "Risk Parameters Saved",
      message: `SL: ${stoplossPercent}% (₹${slAmt.toLocaleString()}) | Target: ${targetPercent}% (₹${tgtAmt.toLocaleString()})`,
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
      stoplossPoints: Math.round(slAmt / qty),
      targetPoints: Math.round(tgtAmt / qty),
    }));

    addToast({
      type: "info",
      title: "Capital Updated",
      message: `Total Strategy Capital set to ₹${totalCapital.toLocaleString()}`,
    });
  };

  const setGiftNiftyChange = (change: number) => {
    const pct = round2((change / 24900) * 100);
    setStrategy((prev) => ({
      ...prev,
      giftNiftyChange: change,
      giftNiftyChangePct: pct,
    }));
  };

  // Trigger strategy entry explicitly based on current or overridden Gift Nifty change
  const triggerStrategyEntry = (overrideChange?: number): boolean => {
    const change = overrideChange !== undefined ? overrideChange : strategy.giftNiftyChange;
    if (change >= 80.0) {
      return executeManualOrder("CE");
    } else if (change <= -80.0) {
      return executeManualOrder("PE");
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
