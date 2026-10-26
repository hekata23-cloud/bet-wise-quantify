import { useState } from "react";
import { CheckCircle2, PlayCircle, XCircle } from "lucide-react";
import { pokreniSelftest, type SelfTestIzvjestaj } from "@/lib/selftest";

/** Panel automatskog audita — poziva se s Info stranice (bez API-ja). */
export function SelfTestPanel() {
  const [izvjestaj, setIzvjestaj] = useState<SelfTestIzvjestaj | null>(null);
  const [trci, setTrci] = useState(false);

  const pokreni = () => {
    setTrci(true);
    // namjerno async pauza da UI stigne prikazati "trči…" (test je brz, < 1 s)
    setTimeout(() => {
      try {
        setIzvjestaj(pokreniSelftest());
      } catch (e) {
        setIzvjestaj({
          brTestova: 1,
          brProslo: 0,
          brPalih: 1,
          sviProsli: false,
          trajanjeMs: 0,
          testovi: [{ naziv: "Pokretanje audita", ok: false, detalj: String(e) }],
        });
      }
      setTrci(false);
    }, 30);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={pokreni}
          disabled={trci}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-60"
        >
          <PlayCircle className="h-4 w-4" />
          {trci ? "Testiram…" : "Pokreni samotest (18 provjera)"}
        </button>
        {izvjestaj && (
          <span
            className={`text-sm font-semibold ${izvjestaj.sviProsli ? "text-emerald-400" : "text-red-400"}`}
          >
            {izvjestaj.sviProsli
              ? `Sve prolazi: ${izvjestaj.brProslo}/${izvjestaj.brTestova} (${izvjestaj.trajanjeMs} ms)`
              : `PALO ${izvjestaj.brPalih} od ${izvjestaj.brTestova} testova!`}
          </span>
        )}
      </div>

      {izvjestaj && (
        <ul className="grid gap-1.5">
          {izvjestaj.testovi.map((t) => (
            <li
              key={t.naziv}
              className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/40 p-2 text-xs"
            >
              {t.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 flex-none text-red-400" />
              )}
              <div>
                <span className="font-semibold">{t.naziv}</span>
                <span className="text-muted-foreground"> — {t.detalj}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
