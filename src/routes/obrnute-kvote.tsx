import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { analizirajObrnuto } from "@/lib/obrnute-kvote";

export const Route = createFileRoute("/obrnute-kvote")({
  head: () => ({
    meta: [
      { title: "Detektor obrnutih kvota · Andromeda AI" },
      { name: "description", content: "Otkrij kad je jeftina kvota zamka: provjera 2.5 golova i BTTS prema 1X2 slici utakmice." },
      { property: "og:title", content: "Detektor obrnutih kvota · Andromeda AI" },
      { property: "og:description", content: "Kad Manje 2.5 @1.65 izgleda sigurno, a stvarno prolazi Više — ovdje to vidiš unaprijed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const POLJA = [["k1", "1"], ["kx", "X"], ["k2", "2"], ["kOver", "Više 2.5"], ["kUnder", "Manje 2.5"], ["kGG", "GG"], ["kNG", "NG"]] as const;
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

function Page() {
  const [v, setV] = useState<Record<string, string>>({ k1: "2.10", kx: "3.40", k2: "3.50", kOver: "2.40", kUnder: "1.65", kGG: "1.80", kNG: "2.00" });
  const r = useMemo(() => {
    const n = (k: string) => Number((v[k] ?? "").replace(",", "."));
    return analizirajObrnuto({ k1: n("k1"), kx: n("kx"), k2: n("k2"), kOver: n("kOver"), kUnder: n("kUnder"), kGG: n("kGG"), kNG: n("kNG") });
  }, [v]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">🪤 Detektor obrnutih kvota</h1>
        <p className="text-sm text-muted-foreground">Kladionica često snizi stranu koju svi igraju. Ovdje se 2.5 golova i BTTS provjeravaju prema 1X2 slici — ako se ne slažu, jeftina strana je zamka.</p>
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-7">
        {POLJA.map(([k, l]) => (
          <label key={k} className="text-xs text-muted-foreground">{l}
            <input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground tabular-nums" />
          </label>
        ))}
      </div>
      {!r && <div className="text-sm text-muted-foreground">Unesi kvote 1, X i 2.</div>}
      {r && (
        <>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Box k="Očekivani golovi (1X2)" v={(r.lh + r.la).toFixed(2)} />
            <Box k="λ domaćin / gost" v={`${r.lh.toFixed(2)} / ${r.la.toFixed(2)}`} />
            <Box k="Pošteni Više 2.5" v={pct(r.pOver)} />
            <Box k="Pošteni GG" v={pct(r.pBtts)} />
          </div>
          {r.signali.map((s) => (
            <div key={s.trziste} className={`rounded-xl border p-4 ${s.razina === "ZAMKA" ? "border-destructive bg-destructive/10" : s.razina === "SUMNJIVO" ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>{s.trziste}</span>
                <span>{s.razina === "ZAMKA" ? "⚠️ ZAMKA" : s.razina === "SUMNJIVO" ? "Sumnjivo" : "✓ Usklađeno"}</span>
              </div>
              <p className="mt-1 text-sm">{s.tekst}</p>
              <div className="mt-2 text-xs tabular-nums text-muted-foreground">
                „{s.skupa}": tržište {pct(s.pTrzista)} · model {pct(s.pModela)} · razlika {(s.razlika * 100).toFixed(1)} pp
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Signal nije jamstvo — pokazuje gdje kvota proturječi ostatku ponude. Igraj manji ulog na „skupu" stranu samo kod oznake ZAMKA.</p>
        </>
      )}
    </div>
  );
}

function Box({ k, v }: { k: string; v: string }) {
  return <div className="rounded-lg bg-muted/50 p-2"><div className="text-[11px] text-muted-foreground">{k}</div><div className="font-semibold tabular-nums">{v}</div></div>;
}
