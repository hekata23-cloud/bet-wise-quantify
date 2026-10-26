import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fit1x2 } from "@/lib/obrnute-kvote";
import {
  dnbAhTablica,
  jeSigurnica,
  parseAsianHandicapLine,
  type SkellamLinija,
} from "@/lib/skellam-dnb";
import { dodajUKorpu, loadKorpa } from "@/lib/korpa";
import { useLigaFilter } from "@/lib/league-tier";
import { useUtakmiceDana, poredajZaSken, type Markets } from "@/hooks/use-utakmice-dana";
import { LeagueTierFilter } from "@/components/LeagueTierFilter";
import { SettingsModal } from "@/components/SettingsModal";
import type { ZtFixture } from "@/lib/zlatni-tip.functions";

export const Route = createFileRoute("/dnb-master")({
  head: () => ({
    meta: [
      { title: "DNB & Asian Handicap Master · Andromeda AI" },
      {
        name: "description",
        content:
          "Sigurnice s ≥78% prave vjerojatnosti: DNB i azijski hendikep (±0.25, ±0.5) po Skellamovoj razdiobi.",
      },
      { property: "og:title", content: "DNB & Asian Handicap Master · Andromeda AI" },
      {
        property: "og:description",
        content:
          "Niska varijanca, sidra za velike listiće — DNB i AH linije izračunate iz Poisson/Skellam modela.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Analiza = { f: ZtFixture; lh: number; la: number; linije: SkellamLinija[]; m: Markets };
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const MAX_SKEN = 12;
/** Najviše kredita po skeniranju (i utakmice bez kvota troše 1 kredit). */
const MAX_POKUSAJA = 25;

/** Naziv tržišta ovisi o kladionici ("Home/Away", "Draw No Bet"…) — traži ga fleksibilno. */
function nadjiTrziste(m: Markets, re: RegExp): Record<string, number> | undefined {
  return Object.entries(m).find(([k]) => re.test(k))?.[1];
}

function trzisnaKvota(m: Markets, l: SkellamLinija): number | undefined {
  const strana = l.tim === "1" ? "Home" : "Away";
  if (l.linija === null) {
    const cijene = nadjiTrziste(m, /^(home\/away|draw no bet)$/i);
    const kvota =
      cijene &&
      Object.entries(cijene).find(([k]) => k.trim().toLowerCase() === strana.toLowerCase())?.[1];
    return Number.isFinite(kvota) && kvota! > 1 ? kvota : undefined;
  }
  const ah = nadjiTrziste(m, /^asian handicap$/i) ?? {};
  const v = l.linija;
  const direct = ah[`${strana} ${v > 0 ? "+" : ""}${v}`] ?? ah[`${strana} ${v}`];
  if (Number.isFinite(direct) && direct! > 1) return direct;

  for (const [label, kvota] of Object.entries(ah)) {
    const match = label.trim().match(/^(Home|Away)\s+(.+)$/i);
    if (
      match &&
      match[1]!.toLowerCase() === strana.toLowerCase() &&
      parseAsianHandicapLine(match[2]!) === v &&
      Number.isFinite(kvota) &&
      kvota > 1
    )
      return kvota;
  }
  return undefined;
}

function Page() {
  const { fx, msg, setMsg, busy, setBusy, ucitajDan, kvote } = useUtakmiceDana();
  const { prolazi } = useLigaFilter();
  const [rez, setRez] = useState<Analiza[]>([]);
  const [settings, setSettings] = useState(false);
  const [uKorpi, setUKorpi] = useState<Set<string>>(new Set());

  useEffect(() => {
    const s = () => setUKorpi(new Set(loadKorpa().map((t) => t.id)));
    s();
    window.addEventListener("andromeda:korpa", s);
    return () => window.removeEventListener("andromeda:korpa", s);
  }, []);

  const vidljive = fx.filter((f) => prolazi(f.league));

  const skeniraj = async () => {
    setBusy(true);
    const out: Analiza[] = [];
    let pokusaja = 0,
      bezKvota = 0;
    try {
      // Prije: prvih 12 po vremenu — rano ujutro to su egzotične lige bez kvota pa nije bilo ništa.
      // Sada: prvo top lige, utakmice bez kvota se preskaču dok se ne nađe MAX_SKEN s kvotama.
      for (const f of poredajZaSken(vidljive)) {
        if (out.length >= MAX_SKEN || pokusaja >= MAX_POKUSAJA) break;
        pokusaja++;
        setMsg(`Analiziram ${f.home} — ${f.away}… (${out.length}/${MAX_SKEN} s kvotama)`);
        const m = await kvote(f);
        const w = m ? nadjiTrziste(m, /^match winner$/i) : undefined;
        if (!m || !w?.Home || !w.Draw || !w.Away) {
          bezKvota++;
          continue;
        }
        const { lh, la } = fit1x2(w.Home, w.Draw, w.Away);
        out.push({ f, lh, la, linije: dnbAhTablica(lh, la).filter(jeSigurnica), m });
        setRez([...out]);
      }
      const n = out.filter((a) => a.linije.length).length;
      setMsg(
        `Gotovo: analizirano ${out.length} utakmica s kvotama (${bezKvota} bez kvota preskočeno) — ${n} sa sigurnicama ≥78%.`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Greška");
    } finally {
      setBusy(false);
    }
  };

  const dodaj = (a: Analiza, l: SkellamLinija, kvota: number) => {
    const utakmica = `${a.f.home} - ${a.f.away}`;
    const tip =
      l.linija === null
        ? `DNB ${l.tim}`
        : `${l.tim === "1" ? "Domaćin" : "Gost"} ${l.linija > 0 ? "+" : ""}${l.linija}`;
    dodajUKorpu({
      id: `nogomet|${utakmica}|${l.linija === null ? "DNB" : "AH"}|${tip}`,
      sport: "nogomet",
      utakmica,
      liga: a.f.league,
      trziste: l.linija === null ? "DNB" : "Asian Handicap",
      tip,
      kvota,
      vjerojatnost: Math.min(0.99, l.win / Math.max(1e-9, 1 - l.push)),
      fixtureId: a.f.id,
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          🛡️ DNB & Sigurnice · Asian Handicap Master
        </h1>
        <p className="text-sm text-muted-foreground">
          Samo linije s ≥78% prave vjerojatnosti. Kod DNB-a remi vraća ulog (kvota 1.00) — idealna
          sidra za velike listiće.
        </p>
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <LeagueTierFilter />
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy}
            onClick={async () => {
              if (!(await ucitajDan())) setSettings(true);
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Učitaj utakmice dana
          </button>
          {fx.length > 0 && (
            <button
              disabled={busy}
              onClick={skeniraj}
              className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50"
            >
              Skeniraj sigurnice (do {MAX_SKEN})
            </button>
          )}
          <button
            onClick={() => setSettings(true)}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          >
            Postavke (API ključ)
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          1 kredit po utakmici (najviše {MAX_POKUSAJA} po skeniranju), utakmice s kvotama se pamte
          do kraja dana.{" "}
          {fx.length > 0 && `Prikazano ${vidljive.length}/${fx.length} po filteru liga.`}
        </p>
        {msg && <p className="text-sm">{msg}</p>}
      </div>

      {rez
        .filter((a) => a.linije.length)
        .map((a) => (
          <div key={a.f.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-semibold">
                {a.f.home} — {a.f.away}
              </div>
              <div className="text-xs text-muted-foreground">
                {a.f.league} · λ {a.lh.toFixed(2)} / {a.la.toFixed(2)}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {a.linije.map((l) => {
                const k = trzisnaKvota(a.m, l);
                const tip =
                  l.linija === null
                    ? `DNB ${l.tim}`
                    : `${l.tim === "1" ? "Domaćin" : "Gost"} ${l.linija > 0 ? "+" : ""}${l.linija}`;
                const id = `nogomet|${a.f.home} - ${a.f.away}|${l.linija === null ? "DNB" : "AH"}|${tip}`;
                const odabrano = uKorpi.has(id);
                return (
                  <button
                    key={l.oznaka}
                    disabled={!k}
                    onClick={() => k && dodaj(a, l, k)}
                    className={`rounded-lg border p-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${odabrano ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/40 hover:border-primary"}`}
                  >
                    <div className="font-semibold">{l.oznaka}</div>
                    <div className="text-lg font-bold tabular-nums">
                      {k ? k.toFixed(2) : `fer ${l.ferKvota.toFixed(2)}`}
                    </div>
                    <div className="tabular-nums opacity-80">
                      dobitak {pct(l.win)} · povrat {pct(l.push)}
                    </div>
                    {k && k * (l.win / (1 - l.push)) > 1 && (
                      <div className="mt-1 font-semibold">+EV</div>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Low Variance / Bankroll Builder · klik na kvotu dodaje tip u virtualni listić.
            </p>
          </div>
        ))}
      {rez.length > 0 && !rez.some((a) => a.linije.length) && (
        <p className="text-sm text-muted-foreground">
          Nijedna skenirana utakmica nema liniju ≥78%.
        </p>
      )}
      <SettingsModal
        open={settings}
        onClose={() => setSettings(false)}
        onSaved={() => setSettings(false)}
      />
    </div>
  );
}
