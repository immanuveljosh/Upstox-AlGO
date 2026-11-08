"use client";

import React from "react";
import { QuickStats } from "@/components/dashboard/QuickStats";
import { NiftyLivePrice } from "@/components/dashboard/NiftyLivePrice";
import { PositionCard } from "@/components/dashboard/PositionCard";
import { ManualOrderPanel } from "@/components/dashboard/ManualOrderPanel";
import LotSizeCalculator from "@/components/dashboard/LotSizeCalculator";
import { OrphanPositionsBanner } from "@/components/dashboard/OrphanPositionsBanner";
import { PageHeader } from "@/components/ui/DesignSystem";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Real-time Nifty 50 directional overview, open position telemetry, and execution controls."
      />

      {/* Orphan Positions Recovery Banner (only visible when unmatched broker positions exist) */}
      <OrphanPositionsBanner />

      {/* Row 1: KPI Stat Cards (max 4 per row) */}
      <QuickStats />

      {/* Row 2: Live Spot Price & Active Position Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <NiftyLivePrice />
        <PositionCard />
      </div>

      {/* Row 3: Manual Directional Execution & Read-Only Lot Size Helper */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <ManualOrderPanel />
        <LotSizeCalculator />
      </div>
    </div>
  );
}
