import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { LineupDeltaResult } from "@/lib/lineup-delta-engine";

export function LineupDeltaBadge({ delta }: { delta?: LineupDeltaResult | null }) {
  if (!delta || !delta.hasLineupAlert) return null;

  if (delta.defensiveRotationDetected) {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/15 px-2 py-1 text-[11px] font-bold tracking-wide text-amber-400 shadow-sm"
        title={delta.alertNotes.join(" | ")}
      >
        <ShieldAlert className="h-3.5 w-3.5 animate-pulse text-amber-400" />
        <span>LINEUP ALERT: DEFENSIVE ROTATION DETECTED</span>
        <span className="ml-1 rounded bg-amber-500/25 px-1 py-0.2 text-[9px] font-mono text-amber-300">
          +6.8% BTTS / +7.4% O2.5
        </span>
      </div>
    );
  }

  if (delta.primaryStrikerBenched) {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/50 bg-sky-500/15 px-2 py-1 text-[11px] font-bold tracking-wide text-sky-400 shadow-sm"
        title={delta.alertNotes.join(" | ")}
      >
        <AlertTriangle className="h-3.5 w-3.5 text-sky-400" />
        <span>LINEUP ALERT: STRIKER BENCHED</span>
        <span className="ml-1 rounded bg-sky-500/25 px-1 py-0.2 text-[9px] font-mono text-sky-300">
          -0.18 λ
        </span>
      </div>
    );
  }

  return null;
}
