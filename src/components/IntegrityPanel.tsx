import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { integrityClass, type IntegrityResult } from "@/lib/prediction-integrity";

/**
 * Shared display of a Prediction Integrity Gate result.
 * compact = only the status chip; otherwise chip + score + calibrated % + reasons.
 */
export function IntegrityPanel({
  result,
  compact = false,
  title = "Provjera integriteta",
}: {
  result: IntegrityResult | null | undefined;
  compact?: boolean;
  title?: string;
}) {
  if (!result) return null;
  const Icon =
    result.status === "CERTIFICIRAN"
      ? ShieldCheck
      : result.status === "OPREZ"
        ? ShieldAlert
        : ShieldX;

  const chip = (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold ${integrityClass(result.status)}`}
      title={result.reasons.join("\n")}
    >
      <Icon className="h-3 w-3" />
      {result.status}
    </span>
  );
  if (compact) return chip;

  return (
    <div
      className={`mt-3 rounded-lg border p-3 text-left text-xs ${integrityClass(result.status)}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4" />
        <span className="font-bold uppercase tracking-wide">{title}</span>
        <span className="font-semibold">{result.label}</span>
        <span className="ml-auto font-mono">
          {result.score}/100 · kalibrirano {(result.probability * 100).toFixed(1)}%
          {result.rawProbability !== result.probability &&
            ` (model ${(result.rawProbability * 100).toFixed(1)}%)`}
          {result.evPercent !== null &&
            ` · EV ${result.evPercent >= 0 ? "+" : ""}${result.evPercent.toFixed(1)}%`}
        </span>
      </div>
      <ul className="mt-2 list-disc space-y-0.5 pl-4 opacity-90">
        {result.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  );
}
