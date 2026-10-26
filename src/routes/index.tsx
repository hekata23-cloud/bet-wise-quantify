import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Calculator,
  MessageCircle,
  Radio,
  Settings,
  ArrowRight,
  Ticket,
  Trophy,
  Radar,
  Clock,
  Flame,
  Wrench,
  Dribbble,
  Sparkles,
  TrendingUp,
  Percent,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { hasKey } from "@/lib/storage";
import { useEffect, useState, useId } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Andromeda AI — Početna & Sharp Radar" },
      {
        name: "description",
        content:
          "Sveobuhvatna sportska analitika: Tiket Arhitekt, Zlatni tip, Kvote radar, HT/FT, BTTS i AI kalkulator.",
      },
      {
        name: "author",
        content: "Goran Pavić",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [status, setStatus] = useState({ gemini: false, groq: false, af: false });

  // Stanje za brzi Value & Kelly kalkulator
  const [quickOdds, setQuickOdds] = useState("2.10");
  const [quickProb, setQuickProb] = useState("55");

  useEffect(() => {
    setStatus({
      gemini: hasKey("gemini"),
      groq: hasKey("groq"),
      af: hasKey("apiFootball"),
    });
  }, []);

  // Izračun za brzi Value Bet
  const oddsNum = parseFloat(quickOdds.replace(",", ".")) || 0;
  const probNum = parseFloat(quickProb.replace(",", ".")) || 0;
  const p = probNum / 100;
  const fairOdds = p > 0 ? (1 / p).toFixed(2) : "—";
  const ev = oddsNum > 0 && p > 0 ? ((oddsNum * p - 1) * 100).toFixed(1) : "0.0";
  const evVal = parseFloat(ev);

  // Kelly kriterij (Half-Kelly)
  const b = oddsNum - 1;
  const q = 1 - p;
  const rawKelly = b > 0 ? (b * p - q) / b : 0;
  const halfKelly = Math.max(0, rawKelly * 0.5 * 100).toFixed(1);

  // Istaknuti Sharp Alati
  const sharpCards = [
    {
      to: "/tiket-arhitekt",
      title: "Tiket Arhitekt",
      badge: "HOT",
      desc: "Automatski složi optimiziran listić (Siguran, Value ili Mix) s pametnom raspodjelom rizika.",
      icon: Ticket,
      grad: "linear-gradient(135deg, #e11d2e 0%, #ff5252 100%)",
    },
    {
      to: "/zlatni-tip",
      title: "Zlatni Tip Dana",
      badge: "ELITE",
      desc: "Dnevni par s najvećom matematičkom prednošću (Edge) i najmanjom maržom kladionice.",
      icon: Trophy,
      grad: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    },
    {
      to: "/radar",
      title: "Kvote Radar",
      badge: "LIVE",
      desc: "Detektor pada kvota i anomalija na europskom tržištu u realnom vremenu.",
      icon: Radar,
      grad: "linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)",
    },
    {
      to: "/ht-ft",
      title: "HT/FT Sharp",
      badge: "POISSON",
      desc: "Dubinska analiza poluvrijeme/kraj (1/X, 2/1 preokreti i fiksna stanja na poluvremenu).",
      icon: Clock,
      grad: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
    },
    {
      to: "/btts-over",
      title: "2.5 & BTTS Sharp",
      badge: "GOLOVI",
      desc: "Specijalizirani filtri za Oba daju gol (GG) i Više/Manje od 2.5 gola s xG modelom.",
      icon: Flame,
      grad: "linear-gradient(135deg, #ec4899 0%, #be185d 100%)",
    },
    {
      to: "/pro-alati",
      title: "Pro Alati & Bankroll",
      badge: "PRO",
      desc: "Asian Handicap, Surebet arbitraža, kalkulator uloga i povijest točnosti modela.",
      icon: Wrench,
      grad: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    },
  ] as const;

  // AI Asistenti i Pregled
  const aiCards = [
    {
      to: "/kalkulator",
      title: "Kalkulator predikcija",
      desc: "Ručni unos xG, kvota, forme i motivacije uz detaljno Poisson i Kelly obrazloženje.",
      icon: Calculator,
      grad: "var(--gradient-primary)",
    },
    {
      to: "/chat",
      title: "AI Chat Mozak",
      desc: "Gemini 2.0 Flash + Groq Llama 3.3. Tvoj osobni sportski analitičar 24/7.",
      icon: MessageCircle,
      grad: "var(--gradient-accent)",
    },
    {
      to: "/uzivo",
      title: "Uživo Utakmice",
      desc: "Live rezultati i statistika izravno s terena s automatskim keširanjem.",
      icon: Radio,
      grad: "linear-gradient(135deg, oklch(0.45 0.19 25), oklch(0.97 0.004 20))",
    },
    {
      to: "/kosarka",
      title: "Košarka Sharp",
      desc: "NBA & Euroliga predikcije za hendikepe, ukupan broj poena i četvrtine.",
      icon: Dribbble,
      grad: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
    },
  ] as const;

  const oddsInputId = useId();
  const probInputId = useId();

  return (
    <div className="space-y-10 pb-12">
      {/* Glavno Zaglavlje */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-6 md:p-10 shadow-lg">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary font-medium">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Europa/Zagreb · Realno Vrijeme & Sharp Sindikat
          </div>

          <h1 className="mt-4 text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight">
            Tvoj{" "}
            <span
              style={{
                background: "var(--gradient-primary)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Andromeda AI
            </span>{" "}
            Centar za Predikcije
          </h1>

          <p className="mt-3 text-muted-foreground text-base sm:text-lg">
            Matematički modeli, Poissonova razdioba, praćenje pada kvota i Sharp filteri za precizne
            i matematički isplative oklade.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/tiket-arhitekt"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 shadow-md transition-all"
              style={{ boxShadow: "var(--shadow-glow)" }}
            >
              <Ticket className="h-4 w-4" /> Složi Tiket Arhitekt <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/zlatni-tip"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-5 py-3 text-sm font-medium hover:bg-secondary/80 transition-colors"
            >
              <Trophy className="h-4 w-4 text-amber-500" /> Zlatni Tip Dana
            </Link>
            <Link
              to="/postavke"
              className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-background/50 px-4 py-3 text-sm font-medium hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-4 w-4" /> Postavke API
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            <StatusChip label="Gemini AI" ok={status.gemini} />
            <StatusChip label="Groq AI" ok={status.groq} />
            <StatusChip label="API-Football" ok={status.af} />
          </div>
        </div>
      </section>

      {/* NOVA INTERAKTIVNA KARTICA: Brzi Value & Kelly Kalkulator */}
      <section className="rounded-3xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              <Zap className="h-4 w-4 text-amber-500" />
              Brzi Analizator Isplativosti
            </div>
            <h2 className="text-xl md:text-2xl font-bold mt-1">
              Ekspresni Value Bet & Kelly Kalkulator
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Unesi kvotu kladionice i procijenjenu vjerojatnost — odmah saznaj imaš li matematičku
              prednost (Edge).
            </p>
          </div>
          <Link
            to="/pro-alati"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline shrink-0"
          >
            Svi Pro Alati <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-12 items-center">
          {/* Polja za unos */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor={oddsInputId}
                className="text-xs font-medium text-muted-foreground flex items-center gap-1"
              >
                <TrendingUp className="h-3.5 w-3.5 text-primary" /> Ponuđena Kvota
              </label>
              <input
                id={oddsInputId}
                type="text"
                inputMode="decimal"
                value={quickOdds}
                onChange={(e) => setQuickOdds(e.target.value)}
                placeholder="npr. 2.10"
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <span className="text-[11px] text-muted-foreground">Kvota iz kladionice</span>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor={probInputId}
                className="text-xs font-medium text-muted-foreground flex items-center gap-1"
              >
                <Percent className="h-3.5 w-3.5 text-primary" /> Vjerojatnost (%)
              </label>
              <input
                id={probInputId}
                type="text"
                inputMode="decimal"
                value={quickProb}
                onChange={(e) => setQuickProb(e.target.value)}
                placeholder="npr. 55"
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <span className="text-[11px] text-muted-foreground">Tvoja / AI procjena</span>
            </div>
          </div>

          {/* Rezultati i indikatori */}
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-border/60 bg-background/60 p-3.5 text-center">
              <div className="text-[11px] font-medium text-muted-foreground">
                Prava Kvota (Fair)
              </div>
              <div className="text-xl font-bold tabular-nums mt-1">{fairOdds}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">bez marže</div>
            </div>

            <div
              className={`rounded-2xl border p-3.5 text-center transition-colors ${
                evVal > 0
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              <div className="text-[11px] font-medium">Expected Value</div>
              <div className="text-xl font-bold tabular-nums mt-1">
                {evVal > 0 ? `+${ev}%` : `${ev}%`}
              </div>
              <div className="text-[10px] opacity-80 mt-0.5">
                {evVal > 0 ? "Prednost igrača" : "Prednost kladionice"}
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/60 p-3.5 text-center">
              <div className="text-[11px] font-medium text-muted-foreground">Kelly Ulog (Pola)</div>
              <div className="text-xl font-bold tabular-nums mt-1 text-primary">{halfKelly}%</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">sigurniji ulog</div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/60 p-3.5 text-center flex flex-col justify-center items-center">
              <div className="text-[11px] font-medium text-muted-foreground">Sharp Preporuka</div>
              <div className="mt-1">
                {evVal > 5 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                    <ShieldCheck className="h-3 w-3" /> Jak Value
                  </span>
                ) : evVal > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-semibold text-blue-400">
                    Pozitivan
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Preskoči
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SEKCIJA 1: Istaknuti Sharp Alati */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Sharp Alati & Algoritmi
          </h2>
          <p className="text-sm text-muted-foreground">
            Specijalizirani analitički moduli za pojedine vrste tržišta i oklada.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sharpCards.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.to}
                to={c.to}
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="inline-flex h-12 w-12 items-center justify-center rounded-xl shadow-md text-white"
                    style={{ background: c.grad }}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-primary uppercase">
                    {c.badge}
                  </span>
                </div>
                <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
                  {c.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{c.desc}</p>
                <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Otvori modul{" "}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* SEKCIJA 2: AI Asistenti i Pregled */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">
            AI Mozak & Provjera Uživo
          </h2>
          <p className="text-sm text-muted-foreground">
            Interaktivni AI pomoćnici, ručni unos xG metrike i utakmice uživo.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {aiCards.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.to}
                to={c.to}
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 transition-all hover:-translate-y-1 hover:border-border"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <div
                  className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: c.grad }}
                >
                  <Icon className="h-5 w-5 text-primary-foreground" />
                </div>
                <h3 className="text-base font-semibold">{c.title}</h3>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{c.desc}</p>
                <div className="mt-3 inline-flex items-center gap-1 text-xs text-primary font-medium">
                  Pokreni{" "}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatusChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
        ok
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-destructive/30 bg-destructive/10 text-destructive"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-primary" : "bg-destructive"}`} />
      {label}: {ok ? "spreman" : "nedostaje"}
    </span>
  );
}
