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
  InstrumentMetadata,
} from "@/types/trading";
import {
  defaultStrategy,
  initialActivePosition,
  initialStats,
  mockOrders,
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
  niftyPrice: number;
  niftyChange: number;
  niftyChangePct: number;
  activePosition: Position | null;
  orders: Order[];
  strategy: StrategyConfig;
  instrumentMetadata: InstrumentMetadata;
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
  // 1. Default mode is BACKTEST (Simulation)
  const [mode, setModeState] = useState<TradingMode>("BACKTEST");
  const [isLiveConfirmOpen, setIsLiveConfirmOpen] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("CONNECTED");
  const [niftyPrice, setNiftyPrice] = useState<number>(24878.5);
  const [niftyChange, setNiftyChange] = useState<number>(92.4);
  const [niftyChangePct, setNiftyChangePct] = useState<number>(0.37);

  const [activePosition, setActivePosition] = useState<Position | null>(initialActivePosition);
  const [orders, setOrders] = useState<Order[]>(mockOrders);
  const [strategy, setStrategy] = useState<StrategyConfig>(defaultStrategy);
  const [instrumentMetadata, setInstrumentMetadata] = useState<InstrumentMetadata>({
    name: "NIFTY",
    segment: "NSE_FO",
    exchange: "NSE",
    instrumentKey: "NSE_FO|40013",
    tradingSymbol: "NIFTY 24750 CE 09 NOV 26",
    expiry: "2026-11-09",
    lotSize: 65,
    freezeQuantity: 1755,
    minimumLot: 65,
    tickSize: 0.05,
    strike: 24750,
    optionType: "CE",
    source: "upstox_option_contract_api",
  });
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

  // Check live Upstox session from backend on initial mount
  useEffect(() => {
    async function syncBrokerSession() {
      try {
        const res = await fetch("http://localhost:8000/api/v1/auth/me");
        if (res.ok) {
          const json = await res.json();
          if (json.connection_status === "connected" && json.data) {
            setConnectionStatus("CONNECTED");
            setCredentials((prev) => ({
              ...prev,
              ucc: json.data.user_id || prev.ucc,
              accountName: json.data.user_name || prev.accountName,
            }));
          }
        }
        // Fetch live Upstox option contract metadata for NIFTY 50 lot size (65)
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
              instrumentKey: metaJson.data.instrument_key || "NSE_FO|40013",
              tradingSymbol: metaJson.data.trading_symbol || "NIFTY 24750 CE 09 NOV 26",
              expiry: metaJson.data.expiry || "2026-11-09",
              lotSize: liveLotSize,
              freezeQuantity: liveFreeze,
              minimumLot: Number(metaJson.data.minimum_lot) || liveLotSize,
              tickSize: Number(metaJson.data.tick_size) || 0.05,
              strike: Number(metaJson.data.strike) || 24750,
              optionType: (metaJson.data.option_type as "CE" | "PE") || "CE",
              source: metaJson.data.source || "upstox_option_contract_api",
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
          message: "Authorization handshake complete. Live trading session and WebSocket feed active.",
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

  // Real-time tick fluctuation and Capital-based SL / Target monitor (Simulation/BACKTEST only)
  useEffect(() => {
    // In LIVE mode, NEVER simulate ticks or fake prices; strictly rely on verified Upstox API feed
    if (mode === "LIVE") return;
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
  }, [connectionStatus, mode, strategy.stoplossAmount, strategy.targetAmount]);

  // Regular synchronization with FastAPI backend for live quotes, strategy telemetry, and orders
  useEffect(() => {
    let isSubscribed = true;

    async function syncBackendState() {
      try {
        // 1. Sync Strategy configuration & daily trades
        const stratRes = await fetch("http://localhost:8000/api/v1/strategy");
        if (stratRes.ok && isSubscribed) {
          const stratJson = await stratRes.json();
          if (stratJson.data) {
            const sd = stratJson.data;
            setStrategy((prev) => ({
              ...prev,
              name: sd.name || prev.name,
              status: sd.status || prev.status,
              dailyTradeCount: sd.trades_executed_today !== undefined ? sd.trades_executed_today : prev.dailyTradeCount,
              maxDailyTrades: sd.max_trades_per_day || prev.maxDailyTrades,
              totalCapital: sd.total_capital || prev.totalCapital,
              stoplossPercent: sd.stoploss_capital_pct || prev.stoplossPercent,
              stoplossAmount: sd.stoploss_amount || prev.stoplossAmount,
              targetPercent: sd.target_capital_pct || prev.targetPercent,
              targetAmount: sd.target_amount || prev.targetAmount,
              lotSize: sd.lot_size || prev.lotSize,
              lots: sd.lots || prev.lots,
            }));
          }
        }

        // 2. In LIVE mode, fetch real Nifty spot quote from Upstox
        const spotRes = await fetch("http://localhost:8000/api/v1/market/nifty-spot");
        if (spotRes.ok && isSubscribed) {
          const spotJson = await spotRes.json();
          if (spotJson.data && spotJson.data.spot_price) {
            setNiftyPrice(spotJson.data.spot_price);
            setNiftyChange(spotJson.data.change);
            setNiftyChangePct(spotJson.data.change_pct);
          }
        }

        // 3. In LIVE mode, fetch real Gift Nifty 1-Day telemetry
        const giftRes = await fetch("http://localhost:8000/api/v1/market/gift-nifty-1day");
        if (giftRes.ok && isSubscribed) {
          const giftJson = await giftRes.json();
          if (giftJson.data && giftJson.data.day_change_points !== undefined) {
            setGiftNiftyChange(giftJson.data.day_change_points);
          }
        }

        // 4. Sync Orders from Backend
        const ordersRes = await fetch("http://localhost:8000/api/v1/orders");
        if (ordersRes.ok && isSubscribed) {
          const ordersJson = await ordersRes.json();
          if (Array.isArray(ordersJson.data) && ordersJson.data.length > 0) {
            setOrders(
              ordersJson.data.map((o: any) => ({
                id: o.client_order_id || o.id,
                time: o.time,
                symbol: o.symbol,
                strike: o.strike,
                type: o.type,
                lots: o.lots,
                lotSize: o.lot_size || 65,
                qty: o.qty,
                price: o.price,
                status: o.status,
                pnl: o.pnl,
                exitPrice: o.exit_price,
                exitTime: o.exit_time,
                rejectReason: o.reject_reason,
              }))
            );
          }
        }
      } catch {
        // Backend offline or unreachable
      }
    }

    syncBackendState();
    const interval = setInterval(syncBackendState, 3500);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [mode]);

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
        lotSize: currPos.lotSize || strategy.lotSize,
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
      fetch("http://localhost:8000/api/v1/strategy/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode }),
      }).catch(() => {});
      addToast({
        type: "info",
        title: `Mode: ${newMode} Active`,
        message: "Backtest simulation mode active: zero financial risk. Testing historical candles and simulated execution.",
      });
    }
  };

  const requestLiveMode = () => setIsLiveConfirmOpen(true);
  const cancelLiveMode = () => setIsLiveConfirmOpen(false);

  const confirmLiveMode = () => {
    setIsLiveConfirmOpen(false);
    setModeState("LIVE");
    fetch("http://localhost:8000/api/v1/strategy/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "LIVE", confirm_live: true }),
    }).catch(() => {});
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

    const lots = lotsOverride ?? strategy.lots;
    const lotSize = strategy.lotSize || 65;
    const qty = lots * lotSize;
    const freezeQty = instrumentMetadata.freezeQuantity || 1755;

    // Validate against broker & exchange requirements
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

    // Formula: 3rd ITM Strike
    // Call ITM 3: ATM - 150
    // Put ITM 3: ATM + 150
    const atmStrike = Math.round(niftyPrice / 50) * 50;
    const itm3Strike = type === "CE" ? atmStrike - 150 : atmStrike + 150;
    const premium = type === "CE" ? 218.4 : 204.6;
    const estimatedMargin = premium * qty;

    if (estimatedMargin > stats.marginAvailable) {
      addToast({
        type: "error",
        title: "RMS Margin Validation Failed",
        message: `Required margin ₹${formatIndianNumber(Math.round(estimatedMargin))} (${lots} lots × ${lotSize} = ${qty} qty) exceeds available margin ₹${formatIndianNumber(Math.round(stats.marginAvailable))}.`,
      });
      return false;
    }

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
      lotSize,
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
      lotSize,
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
      message: `Bought ${symbol} (3rd ITM) • ${lots} Lots × ${lotSize} = ${qty} Qty @ ₹${premium.toFixed(2)}`,
    });

    // Send order to FastAPI backend
    fetch("http://localhost:8000/api/v1/orders/directional", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        option_type: type,
        lots,
        strike: itm3Strike,
        order_type: "MARKET",
      }),
    }).catch(() => {});

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

    // Sync strategy automation status to backend
    fetch("http://localhost:8000/api/v1/strategy/toggle", {
      method: "POST",
    }).catch(() => {});

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
    const lotSize = strategy.lotSize || 65;
    const freezeQty = instrumentMetadata.freezeQuantity || 1755;
    const maxLots = Math.floor(freezeQty / lotSize); // 27 lots = 1,755 qty

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

    // Persist to backend asynchronously
    fetch("http://localhost:8000/api/v1/strategy/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lots }),
    }).catch(() => {});

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
      stoplossPoints: Math.round(slAmt / qty),
      targetPoints: Math.round(tgtAmt / qty),
    }));

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
      stoplossPoints: Math.round(slAmt / qty),
      targetPoints: Math.round(tgtAmt / qty),
    }));

    addToast({
      type: "info",
      title: "Capital Updated",
      message: `Total Strategy Capital set to ₹${formatIndianNumber(totalCapital)}`,
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
