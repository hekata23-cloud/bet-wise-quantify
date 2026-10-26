// ============================================================
// SGP BUILDER — Same Game Parlay s pravom (copula) vjerojatnošću
// Kombinira korelirane opcije IZ ISTOG meča; koristi
// sgp-copula.ts (jednofaktorska Gaussian copula), ne naivno množenje.
// Šalje gotov SGP u Korpu s izračunatim EV-om.
// ============================================================
import { useMemo, useState } from "react";
import { Layers, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { dodajUKorpu } from "@/lib/korpa";
import { izracunajSgp, type SgpStavka } from "@/lib/sgp-copula";

const LABELI: Record<string, string> = {
  "1": "1 · domaćin",
  X: "X · neriješeno",
  "2": "2 · gost",
  bttsDa: "GG — da",
  bttsNe: "NG — ne",
  o05: "O0.5",
  u05: "U0.5",
  o15: "O1.5",
  u15: "U1.5",
  o25: "O2.5",
  u25: "U2.5",
  o35: "O3.5",
  u35: "U3.5",
};

interface SgpBuilderProps {
  naslov: string;
  liga?: string;
  kvote: Record<string, number>;
  konsenzus: Record<string, number>;
}

export function SgpBuilder({ naslov, liga, kvote, konsenzus }: SgpBuilderProps) {
  const [odabrano, setOdabrano] = useState<string[]>([]);

  const kandidati: SgpStavka[] = useMemo(() => {
    return Object.entries(konsenzus ?? {})
      .filter(([k, p]) => typeof p === "number" && p > 0.05 && p < 0.95 && LABELI[k])
      .map(([k, p]) => ({
        kljuc: k,
        label: LABELI[k],
        p,
        kvota: kvote?.[k] ?? 1 / p, // bez tržišne kvote: fair cijena (edge = 0)
      }));
  }, [konsenzus, kvote]);

  const stavke = kandidati.filter((k) => odabrano.includes(k.kljuc));
  const izlaz = useMemo(() => izracunajSgp(stavke), [JSON.stringify(stavke)]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(kljuc: string) {
    setOdabrano((o) =>
      o.includes(kljuc) ? o.filter((x) => x !== kljuc) : [...o, kljuc].slice(0, 4),
    );
  }

  function dodaj() {
    if (!izlaz.isplativo || izlaz.konflikt || stavke.length === 0) return;
    dodajUKorpu({
      id: `nogomet|${naslov}|SGP|${stavke.map((s) => s.kljuc).join("+")}`,
      sport: "nogomet",
      utakmica: naslov,
      liga,
      trziste: "SGP",
      tip: stavke.map((s) => s.label).join(" + "),
      kvota: izlaz.kvota,
      vjerojatnost: izlaz.pCopula,
    });
    toast.success(`SGP dodan u Korpu — prava vjerojatnost ${(izlaz.pCopula * 100).toFixed(1)}%`);
  }

  return (
    <section className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Layers className="h-4 w-4 text-fuchsia-400" /> SGP Builder — kombinacija iz istog meča
        <span className="text-[10px] font-normal text-muted-foreground">
          Gaussian copula · max 4 noge
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {kandidati.map((k) => {
          const aktivan = odabrano.includes(k.kljuc);
          const imaKvotu = (kvote?.[k.kljuc] ?? 0) > 1;
          return (
            <button
              key={k.kljuc}
              onClick={() => toggle(k.kljuc)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
                aktivan
                  ? "border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-200"
                  : "border-border bg-card text-muted-foreground hover:border-fuchsia-500/40 hover:text-foreground"
              }`}
            >
              {k.label} <span className="tabular-nums opacity-70">{(k.p * 100).toFixed(0)}%</span>
              {!imaKvotu && <span className="ml-1 text-[9px] opacity-60">fair</span>}
            </button>
          );
        })}
      </div>

      {odabrano.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Odaberi 2–4 opcije iz istog meča (npr. GG + O2.5 ili 1 + O1.5). Motor računa PRAVU
          zajedničku vjerojatnost preko copule — naivno množenje bi kod ovakvih parova grešilo i do
          8pp.
        </p>
      ) : (
        <div className="mt-2 space-y-1.5 text-xs">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              Kombinirana kvota: <b className="tabular-nums">{izlaz.kvota.toFixed(2)}</b>
            </span>
            <span>
              Naivno ∏p: <b className="tabular-nums">{(izlaz.pNaivno * 100).toFixed(1)}%</b>
            </span>
            <span>
              Prava copula p:{" "}
              <b className="text-fuchsia-300 tabular-nums">{(izlaz.pCopula * 100).toFixed(1)}%</b>
            </span>
            <span>
              Korekcija:{" "}
              <b className={izlaz.korelacijaKorekcija >= 0 ? "text-emerald-400" : "text-red-400"}>
                {izlaz.korelacijaKorekcija > 0 ? "+" : ""}
                {izlaz.korelacijaKorekcija}pp
              </b>
            </span>
            <span>
              EV:{" "}
              <b className={izlaz.edge > 0 ? "text-emerald-400" : "text-red-400"}>
                {(izlaz.edge * 100).toFixed(1)}%
              </b>
            </span>
            <span>
              ¼ Kelly ulog: <b className="tabular-nums">{izlaz.kellyPct.toFixed(2)}%</b> banke
            </span>
          </div>
          {izlaz.upozorenja.map((u, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200/90"
            >
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 flex-none text-amber-400" /> {u}
            </div>
          ))}
          <button
            onClick={dodaj}
            disabled={!izlaz.isplativo || izlaz.konflikt}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Dodaj SGP u Korpu (s pravom vjerojatnošću)
          </button>
          {!izlaz.isplativo && !izlaz.konflikt && (
            <p className="text-[10px] text-muted-foreground">
              Nema pozitivnog EV-a na ovom SGP-u — gumb je zaključan.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
