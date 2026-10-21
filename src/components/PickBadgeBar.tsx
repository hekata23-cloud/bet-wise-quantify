import { izradiOznake, type Kandidat, type TipOznake } from "@/lib/pick-badges";

/* ═══════════════════════════════════════════════════════════════════
   PickBadgeBar — univerzalna traka oznaka preporuke (v1)
   ═══════════════════════════════════════════════════════════════════
   Na svakoj Match Card-i izdvaja DVIJE oznake:
     • "NAJVIŠA VJEROJATNOST" — p ≥ 65%, safe za listiće
     • "VALUE ŠPEKULACIJA / VISOKI KVOTE" — edge ≥ 4%, može imati
       nisku vjerojatnost → uvijek s upozorenjem o varijanci
   Primarni tip se izdaje SAMO ako p ≥ 55%.
   Uključuje POOR MARKET PRICE warning kad kvota ne isplati samca.
   ═══════════════════════════════════════════════════════════════════ */

const oznakeTekst: Record<TipOznake, string | null> = {
  primarni: "★ GLAVNI TIP",
  sigurnosni: "🛡 NAJVIŠA VJEROJATNOST (SAFE)",
  value: "💰 VALUE ŠPEKULACIJA · VISOKA VARIJANCA",
  blokiran: "✕ ISKLJUČENO (protivnička strana)",
  bez: null,
};

const oznakeKlase: Record<TipOznake, string> = {
  primarni: "bg-violet-500/20 text-violet-200 border-violet-400/50",
  sigurnosni: "bg-emerald-500/15 text-emerald-200 border-emerald-400/40",
  value: "bg-amber-500/15 text-amber-200 border-amber-400/40",
  blokiran: "bg-slate-600/20 text-slate-400 border-slate-500/30",
  bez: "",
};

type Props = {
  kandidati: Kandidat[];
  className?: string;
};

export default function PickBadgeBar({ kandidati, className = "" }: Props) {
  const o = izradiOznake(kandidati);
  if (!kandidati.length) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap gap-1.5">
        {kandidati.map((k) => {
          const t = o.oznake[k.tip] ?? "bez";
          const label = oznakeTekst[t];
          if (!label) return null;
          return (
            <span
              key={k.tip}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${oznakeKlase[t]}`}
            >
              {label} · {k.tip} {Math.round(k.p * 100)}%
            </span>
          );
        })}
      </div>
      {o.poruke.map((p, i) => (
        <p
          key={i}
          className={`text-[11px] leading-snug ${
            p.razina === "upozorenje"
              ? "text-amber-300 font-medium"
              : p.razina === "skip"
                ? "text-slate-400 italic"
                : "text-slate-300"
          }`}
        >
          {p.razina === "upozorenje" ? "⚠ " : p.razina === "skip" ? "⏸ " : ""}
          {p.tekst}
        </p>
      ))}
    </div>
  );
}

