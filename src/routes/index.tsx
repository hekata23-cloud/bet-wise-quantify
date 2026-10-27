import { createFileRoute, Link } from "@tanstack/react-router";
import { Calculator, MessageCircle, Radio, Settings, ArrowRight } from "lucide-react";
import { hasKey } from "@/lib/storage";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Andromeda AI — Početna" },
      {
        name: "description",
        content:
          "Tri dashboarda: kalkulator predikcija, AI chat mozak i live nogomet. Sve na hrvatskom.",
      },
      // Dodana meta oznaka za autora:
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
  useEffect(() => {
    setStatus({
      gemini: hasKey("gemini"),
      groq: hasKey("groq"),
      af: hasKey("apiFootball"),
    });
  }, []);
  const cards = [
    {
      to: "/kalkulator",
      title: "Kalkulator predikcija",
      desc: "Ručno unesi xG, forme, kvote i motivaciju. Dobiješ BTTS, Over/Under i 1X2 tip s opširnim obrazloženjem.",
      icon: Calculator,
      grad: "var(--gradient-primary)",
    },
    {
      to: "/chat",
      title: "AI Chat mozak",
      desc: "Gemini 2.0 Flash + Groq Llama 3.3 70B fallback. Zna sve vrste predikcija, kvote, timove i matematiku iza njih.",
      icon: MessageCircle,
      grad: "var(--gradient-accent)",
    },
    {
      to: "/uzivo",
      title: "Uživo utakmice",
      desc: "Live utakmice iz API-Football-a s pametnim keširanjem — nikad ne prelazi dnevni limit.",
      icon: Radio,
      grad: "linear-gradient(135deg, oklch(0.45 0.19 25), oklch(0.97 0.004 20))",
    },
  ] as const;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-8 md:p-12">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Vrijeme zone Europe/Zagreb · realno vrijeme
          </div>
          <h1 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight">
            Tvoj <span style={{ background: "var(--gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Andromeda AI</span> za sportske predikcije
          </h1>
          <p className="mt-3 text-muted-foreground text-lg">
            Poisson, Kelly, indeks slučajnosti, srce indeks — sve što treba za britke,
            objašnjene tipove. Uz AI mozak koji ne troši tvoje tokene.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/kalkulator"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
              style={{ boxShadow: "var(--shadow-glow)" }}
            >
              Otvori kalkulator <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/postavke"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-5 py-3 text-sm font-medium hover:bg-secondary/80"
            >
              <Settings className="h-4 w-4" /> Postavi API ključeve
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            <StatusChip label="Gemini" ok={status.gemini} />
            <StatusChip label="Groq" ok={status.groq} />
            <StatusChip label="API-Football" ok={status.af} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.to}
              to={c.to}
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 transition-transform hover:-translate-y-1"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div
                className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ background: c.grad }}
              >
                <Icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{c.desc}</p>
              <div className="mt-4 inline-flex items-center gap-1 text-sm text-primary">
                Otvori <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}

function StatusChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${ok ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/30 bg-destructive/10 text-destructive"}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-primary" : "bg-destructive"}`} />
      {label}: {ok ? "spreman" : "nedostaje"}
    </span>
  );
}
