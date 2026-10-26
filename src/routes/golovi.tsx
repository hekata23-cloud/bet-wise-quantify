import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { getZtFixtures, getZtMatch, type ZtFixture } from "@/lib/zlatni-tip.functions";
import { analyze, matrix, type Analysis, type Outcome } from "@/lib/zlatni-engine";
import { getApiKey, guarded, resetGuard, zagrebDay } from "@/lib/zlatni-guard";
import {
  evaluatePredictionIntegrity,
  footballContradiction,
  integrityClass,
  type IntegrityResult,
} from "@/lib/prediction-integrity";

export const Route = createFileRoute("/golovi")({
  head: () => ({
    meta: [
      { title: "Golovi Pro · Andromeda AI" },
      {
        name: "description",
        content:
          "Profesionalna analiza golova i svih tipova iz API-Football kvota i statistike: Over/Under, GG, golovi timova, poluvrijeme uz integrirani Prediction Integrity Gate.",
      },
      { property: "og:title", content: "Golovi Pro · Andromeda AI" },
      {
        property: "og:description",
        content:
          "Golovi i svi tipovi iz jednog usklađenog modela, s value provjerom kvota i certifikatom integriteta.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Golovi,
});

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const fo = (p: number) => (p > 0 ? (1 / p).toFixed(2) : "—");

type Tip = {
  group: string;
  label: string;
  p: number;
  odd?: number;
  integrity?: IntegrityResult;
};

/** Sve linije golova izvedene iz iste Dixon-Coles matrice — nema proturječnih tipova. */
function goalTips(a: Analysis): Tip[] {
  const m = matrix(a.lh, a.la);
  const mh = matrix(a.lh * a.htShare, a.la * a.htShare);
  const sum = (mx: number[][], f: (i: number, j: number) => boolean) =>
    mx.reduce((s, r, i) => s + r.reduce((t, p, j) => t + (f(i, j) ? p : 0), 0), 0);
  const t: Tip[] = [];

  for (const l of [0.5, 1.5, 2.5, 3.5, 4.5]) {
    const o = sum(m, (i, j) => i + j > l);
    t.push(
      { group: "Ukupno golova", label: `Over ${l}`, p: o },
      { group: "Ukupno golova", label: `Under ${l}`, p: 1 - o },
    );
  }

  for (const l of [0.5, 1.5, 2.5]) {
    t.push({ group: "Golovi domaćina", label: `Domaćin Over ${l}`, p: sum(m, (i) => i > l) });
    t.push({ group: "Golovi gosta", label: `Gost Over ${l}`, p: sum(m, (_, j) => j > l) });
  }

  const gg = sum(m, (i, j) => i > 0 && j > 0);
  t.push(
    { group: "Oba daju gol", label: "GG", p: gg },
    { group: "Oba daju gol", label: "NG", p: 1 - gg },
  );
  t.push({
    group: "Oba daju gol",
    label: "GG + Over 2.5",
    p: sum(m, (i, j) => i > 0 && j > 0 && i + j > 2),
  });

  for (const l of [0.5, 1.5]) {
    t.push({ group: "1. poluvrijeme", label: `1.pol Over ${l}`, p: sum(mh, (i, j) => i + j > l) });
  }
  t.push({ group: "1. poluvrijeme", label: "1.pol GG", p: sum(mh, (i, j) => i > 0 && j > 0) });

  for (const [lbl, lo, hi] of [
    ["0-1 gol", 0, 1],
    ["2-3 gola", 2, 3],
    ["4+ golova", 4, 99],
  ] as const) {
    t.push({ group: "Raspon golova", label: lbl, p: sum(m, (i, j) => i + j >= lo && i + j <= hi) });
  }

  t.push(
    { group: "Čisti listovi", label: "Domaćin bez primljenog", p: sum(m, (_, j) => j === 0) },
    { group: "Čisti listovi", label: "Gost bez primljenog", p: sum(m, (i) => i === 0) },
  );

  return t;
}

function bestOf(a: Analysis) {
  const all: Tip[] = a.markets.flatMap((mk) =>
    mk.outcomes.map((o: Outcome) => ({ group: mk.name, label: o.label, p: o.p, odd: o.odd })),
  );
  const value = all
    .filter((x) => x.odd && x.p * x.odd > 1.03 && x.p >= 0.35)
    .sort((x, y) => x.p * (x.odd ?? 0) - y.p * (y.odd ?? 0))
    .reverse()
    .slice(0, 5);
  const safe = all
    .filter((x) => x.p >= 0.72 && x.p <= 0.93 && (!x.odd || x.odd >= 1.2))
    .sort((x, y) => y.p - x.p)
    .slice(0, 5);
  return { value, safe };
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ t, hi }: { t: Tip; hi?: boolean }) {
  const ev = t.odd ? t.p * t.odd - 1 : null;
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-3 py-2 text-sm ${
        hi ? "bg-primary/15 text-primary font-semibold" : "bg-muted/40"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate">{t.label}</span>
        {t.integrity && (
          <span
            className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-bold border ${integrityClass(
              t.integrity.status,
            )}`}
          >
            {t.integrity.status}
          </span>
        )}
      </div>
      <span className="tabular-nums text-xs sm:text-sm">
        {pct(t.p)} · fer {fo(t.p)}
        {t.odd ? ` · kvota ${t.odd}` : ""}
        {ev !== null ? ` · ${ev > 0 ? "+" : ""}${(ev * 100).toFixed(1)}%` : ""}
      </span>
    </div>
  );
}

function Golovi() {
  const [fx, setFx] = useState<ZtFixture[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<ZtFixture | null>(null);
  const [a, setA] = useState<Analysis | null>(null);

  const wait = (ms: number, why: string) =>
    setMsg(`Zaštita: ${why} — čekam ${Math.ceil(ms / 1000)} s…`);
  const err = (e: string) =>
    e === "RATE_LIMIT" ? "API traži kratku pauzu. Pričekaj 15 s pa klikni ponovno." : e;

  const loadDay = async () => {
    const apiKey = getApiKey();
    if (!apiKey) return setMsg("Upiši API-Football ključ u Postavkama.");
    setBusy(true);
    try {
      const r = await guarded(
        "fixtures",
        1,
        () => getZtFixtures({ data: { date: zagrebDay(), apiKey } }),
        wait,
      );
      if (r.error) {
        setMsg(err(r.error));
      } else {
        setFx(r.fixtures.filter((f) => ["NS", "TBD", "1H", "HT", "2H"].includes(f.status)));
        setMsg(`${r.fixtures.length} utakmica danas (ponovno učitavanje danas je besplatno).`);
      }
    } catch (e: any) {
      setMsg(e?.message ?? "Greška");
    } finally {
      setBusy(false);
    }
  };

  const pick = async (f: ZtFixture) => {
    const apiKey = getApiKey();
    if (!apiKey) return;
    setSel(f);
    setA(null);
    setBusy(true);
    setMsg(`Učitavam kvote i statistiku: ${f.home} — ${f.away}…`);
    try {
      const r = await guarded(
        `match.${f.id}`,
        2,
        () => getZtMatch({ data: { id: f.id, apiKey } }),
        wait,
      );
      if (r.error === "RATE_LIMIT" || r.error?.startsWith("ACCOUNT")) return setMsg(err(r.error));
      if (!Object.keys(r.markets).length && !r.home)
        return setMsg("Za ovu utakmicu još nema ni kvota ni statistike.");
      setA(analyze(r.markets, r.home, r.away));
      setMsg(
        r.bookmaker
          ? `Učitano ${Object.keys(r.markets).length} tržišta (${r.bookmaker}) + statistika timova.`
          : "Kvote još nisu objavljene — prognoza samo iz statistike (manje pouzdano).",
      );
    } catch (e: any) {
      setMsg(e?.message ?? "Greška");
    } finally {
      setBusy(false);
    }
  };

  const list = fx
    .filter((f) => `${f.home} ${f.away} ${f.league}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 60);
  const goals = a ? goalTips(a) : [];
  const groups = [...new Set(goals.map((g) => g.group))];
  const best = a ? bestOf(a) : null;

  const mainGoalRaw = goals
    .filter((g) => g.group === "Ukupno golova" && g.p >= 0.55)
    .sort((x, y) => Math.abs(0.68 - x.p) - Math.abs(0.68 - y.p))[0];

  const mainGoalIntegrity =
    a && mainGoalRaw
      ? evaluatePredictionIntegrity({
          probability: mainGoalRaw.p,
          odds: mainGoalRaw.odd,
          dataQuality: Object.keys(a.markets).length > 3 ? 0.9 : 0.6,
          contradictory: footballContradiction({
            selected: mainGoalRaw.label.includes("Over") ? "OVER_25" : "UNDER_25",
            over25: goals.find((g) => g.label === "Over 2.5")?.p,
            bttsYes: goals.find((g) => g.label === "GG")?.p,
          }),
          market: mainGoalRaw.group,
        })
      : null;

  const valueWithIntegrity =
    a && best
      ? best.value.map((t) => ({
          ...t,
          integrity: evaluatePredictionIntegrity({
            probability: t.p,
            odds: t.odd,
            dataQuality: Object.keys(a.markets).length > 3 ? 0.9 : 0.65,
            market: t.group,
          }),
        }))
      : [];

  const goldenIntegrity = a?.golden
    ? evaluatePredictionIntegrity({
        probability: a.golden.outcome.p,
        odds: a.golden.outcome.odd,
        dataQuality: Object.keys(a.markets).length > 3 ? 0.95 : 0.65,
        market: a.golden.market,
      })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Golovi Pro</h1>
        <p className="text-sm text-muted-foreground">
          Svi tipovi na golove i ostala tržišta iz jednog modela uz verifikaciju kroz Prediction
          Integrity Gate.
        </p>
      </div>

      <Card title="1. Odaberi utakmicu">
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy}
            onClick={loadDay}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Učitaj utakmice dana
          </button>
          <button
            onClick={() => {
              resetGuard();
              setMsg("Blokada poništena.");
            }}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          >
            Poništi blokadu
          </button>
          {fx.length > 0 && (
            <input
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="Traži tim ili ligu…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          )}
        </div>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        {fx.length > 0 && (
          <div className="max-h-72 overflow-y-auto space-y-1">
            {list.map((f) => (
              <button
                key={f.id}
                disabled={busy}
                onClick={() => pick(f)}
                className={`flex w-full gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                  sel?.id === f.id ? "bg-primary/15 text-primary" : "bg-muted/40 hover:bg-muted"
                }`}
              >
                <span className="shrink-0 tabular-nums">
                  {new Date(f.time).toLocaleTimeString("hr-HR", {
                    timeZone: "Europe/Zagreb",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {f.home} — {f.away}
                </span>
                <span className="hidden md:inline max-w-[40%] truncate text-xs text-muted-foreground">
                  {f.league}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {a && sel && best && (
        <>
          <Card title={`2. Pregled: ${sel.home} — ${sel.away}`}>
            <div className="grid gap-2 md:grid-cols-3 text-sm">
              <div className="rounded-lg bg-muted/40 p-3">
                Očekivani golovi
                <div className="text-xl font-bold tabular-nums">
                  {a.lh.toFixed(2)} : {a.la.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">
                  ukupno {(a.lh + a.la).toFixed(2)}
                </div>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                Najvjerojatniji rezultati
                <div className="font-semibold">
                  {a.topScores
                    .slice(0, 3)
                    .map((s) => `${s.score} (${pct(s.p)})`)
                    .join(" · ")}
                </div>
              </div>
              <div className="rounded-lg bg-primary/15 p-3 text-primary">
                Glavni tip na golove
                <div className="text-xl font-bold">
                  {mainGoalRaw ? `${mainGoalRaw.label} · ${pct(mainGoalRaw.p)}` : "—"}
                </div>
                {mainGoalIntegrity && (
                  <div className="mt-1 text-xs">
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 font-bold border ${integrityClass(
                        mainGoalIntegrity.status,
                      )}`}
                    >
                      {mainGoalIntegrity.label}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {a.golden && (
              <Row
                t={{
                  group: "",
                  label: `Glavni tip utakmice: ${a.golden.market} — ${a.golden.outcome.label}`,
                  p: a.golden.outcome.p,
                  odd: a.golden.outcome.odd,
                  integrity: goldenIntegrity ?? undefined,
                }}
                hi
              />
            )}

            {mainGoalIntegrity && mainGoalIntegrity.reasons.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs space-y-1">
                <span className="font-semibold text-muted-foreground">
                  Integritet modela (Bodovi: {mainGoalIntegrity.score}/100):
                </span>
                <ul className="list-disc pl-4 text-muted-foreground">
                  {mainGoalIntegrity.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {a.notes.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {a.notes.slice(0, 5).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Value tipovi (kvota veća od fer)">
              {valueWithIntegrity.length ? (
                valueWithIntegrity.map((t) => (
                  <Row key={t.group + t.label} t={{ ...t, label: `${t.group}: ${t.label}` }} hi />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nema tipa s dovoljnom prednošću — kladionica je ovdje točna. Ne forsiraj.
                </p>
              )}
            </Card>

            <Card title="Najsigurniji tipovi (72–93%)">
              {best.safe.length ? (
                best.safe.map((t) => (
                  <Row key={t.group + t.label} t={{ ...t, label: `${t.group}: ${t.label}` }} />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nema dovoljno sigurnog tipa.</p>
              )}
            </Card>
          </div>

          <Card title="3. Svi tipovi na golove">
            <div className="grid gap-4 md:grid-cols-2">
              {groups.map((g) => (
                <div key={g} className="space-y-1">
                  <div className="text-xs text-muted-foreground">{g}</div>
                  {goals
                    .filter((t) => t.group === g)
                    .map((t) => (
                      <Row key={t.label} t={t} hi={t.p >= 0.7} />
                    ))}
                </div>
              ))}
            </div>
          </Card>

          <Card title="4. Ostala tržišta (kvote kladionice)">
            <div className="grid gap-4 md:grid-cols-2">
              {a.markets.map((mk) => (
                <div key={mk.name} className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    {mk.name} · {mk.source === "tržište" ? "iz kvota" : "model"}
                  </div>
                  {mk.outcomes.map((o) => (
                    <Row
                      key={o.label}
                      t={{ group: mk.name, label: o.label, p: o.p, odd: o.odd }}
                      hi={o.label === mk.pick.label}
                    />
                  ))}
                </div>
              ))}
            </div>
          </Card>
          <p className="text-xs text-muted-foreground">
            Fer kvota = kvota bez marže. Igraj samo kad je kvota kladionice veća od fer kvote (+%).
            Kladi se odgovorno, 18+.
          </p>
        </>
      )}
    </div>
  );
}
