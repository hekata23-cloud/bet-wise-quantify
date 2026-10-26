// ============================================================
// HTFT-PANEL.TSX — 9 kombinacija + kratice + high-value filter
// Reusable: ubacuje se u bilo koju nogometnu karticu koja ima
// BetaAnalizu (celije iz htft-beta-motor). Klik = dodaj u Korpu.
// ============================================================
import { useMemo, useState } from "react";
import { Flame, ShoppingCart } from "lucide-react";
import type { Celija, Stanje } from "@/lib/htft-beta-motor";
import { dodajUKorpu } from "@/lib/korpa";

const REDOVI: Stanje[] = ["1", "X", "2"];
const STUPCI: Stanje[] = ["1", "X", "2"];
const KRATICE = ["1/1", "X/1", "1/X", "X/X", "2/2", "X/2"];

const RED_STANJE: Record<Stanje, string> = { "1": "Domaćin vodi", X: "Izjednačeno", "2": "Gost vodi" };

function toplaBoja(p: number): string {
  if (p >= 0.15) return "bg-emerald-500/25 border-emerald-500/50 text-emerald-200";
  if (p >= 0.09) return "bg-amber-500/20 border-amber-500/40 text-amber-200";
  if (p >= 0.05) return "bg-sky-500/10 border-sky-500/25 text-sky-200";
  return "bg-muted/40 border-border/30 text-muted-foreground";
}

export function HtFtPanel({
  utakmica,
  liga,
  celije,
  naslov = "HT/FT Prijelazna matrica",
}: {
  utakmica: string;
  liga?: string;
  celije: Celija[];
  naslov?: string;
}) {
  const [samoValue, setSamoValue] = useState(false);

  const karta = useMemo(() => {
    const m = new Map<string, Celija>();
    for (const c of celije) m.set(`${c.ht}/${c.ft}`, c);
    return m;
  }, [celije]);

  const najbolje = useMemo(
    () =>
      [...celije]
        .filter((c) => (samoValue ? c.ocjena === "A+" || c.ocjena === "A" : true))
        .sort((a, b) => b.p - a.p)
        .slice(0, 6),
    [celije, samoValue],
  );

  function uKorpu(c: Celija) {
    dodajUKorpu({
      id: `${utakmica}|HT/FT|${c.kod}`,
      sport: "nogomet",
      utakmica,
      liga,
      trziste: "HT/FT",
      tip: c.kod,
      kvota: Math.max(1.01, c.ferOdd),
      vjerojatnost: c.p,
    });
  }

  if (!celije?.length) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold">{naslov}</span>
        </div>
        <button
          onClick={() => setSamoValue((v) => !v)}
          className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
            samoValue
              ? "border-amber-500/60 bg-amber-500/15 text-amber-300"
              : "border-border/50 text-muted-foreground hover:bg-muted/60"
          }`}
        >
          ⚡ Samo high-value (A/A+)
        </button>
      </div>

      {/* Kratice — brzi pregled */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {KRATICE.map((kod) => {
          const c = karta.get(kod);
          if (!c) return null;
          return (
            <button
              key={kod}
              onClick={() => uKorpu(c)}
              title={`${c.label} — fer kvota ${c.ferOdd.toFixed(2)} · ocjena ${c.ocjena} · klik za Korpu`}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition hover:scale-105 ${toplaBoja(c.p)}`}
            >
              {kod}
              <span className="font-mono font-medium opacity-80">{(c.p * 100).toFixed(1)}%</span>
            </button>
          );
        })}
      </div>

      {/* Toplinska karta 3×3: HT redovi × FT stupci */}
      <div className="grid grid-cols-[auto_repeat(3,1fr)] gap-1 text-center text-[10px]">
        <div />
        {STUPCI.map((s) => (
          <div key={s} className="pb-1 font-bold text-muted-foreground">
            FT {s}
          </div>
        ))}
        {REDOVI.map((h) => (
          <div key={`red-${h}`} className="contents">
            <div className="flex items-center justify-end pr-2 font-bold text-muted-foreground">
              HT {h}
            </div>
            {STUPCI.map((f) => {
              const c = karta.get(`${h}/${f}`);
              return (
                <button
                  key={`${h}/${f}`}
                  onClick={() => c && uKorpu(c)}
                  className={`rounded-lg border px-2 py-2 transition hover:brightness-125 ${toplaBoja(c?.p ?? 0)}`}
                  title={c ? `${c.label} · fer kvota ${c.ferOdd.toFixed(2)} · ${c.ocjena}` : ""}
                >
                  <div className="font-bold">{c ? c.kod : `${h}/${f}`}</div>
                  <div className="font-mono opacity-80">{c ? (c.p * 100).toFixed(1) + "%" : "—"}</div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Top 6 po vjerojatnosti */}
      <div className="mt-3 space-y-1">
        {najbolje.map((c) => (
          <button
            key={c.kod}
            onClick={() => uKorpu(c)}
            className="flex w-full items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-1.5 text-[11px] hover:border-emerald-500/40"
          >
            <span className="w-12 font-bold">{c.kod}</span>
            <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">{c.label}</span>
            <span className="font-mono">{(c.p * 100).toFixed(1)}%</span>
            <span className="font-mono text-muted-foreground">@{c.ferOdd.toFixed(2)}</span>
            <span className="rounded bg-primary/15 px-1 font-bold text-primary">{c.ocjena}</span>
            <ShoppingCart className="h-3 w-3 text-emerald-400" />
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Redovi = stanje na poluvremenu ({REDOVI.map((s) => RED_STANJE[s]).join(" · ")}), stupci = konačan ishod.
        Klik na bilo koju kombinaciju dodaje je u Korpu s fer kvotom.
      </p>
    </div>
  );
}

