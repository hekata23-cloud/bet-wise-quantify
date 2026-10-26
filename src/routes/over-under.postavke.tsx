import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, KeyRound, Loader2, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { clearKey, loadKey, maskKey, saveKey, type SavedKey } from "@/lib/api-football-storage";
import { testApiFootballKey, type StatusResult } from "@/lib/api-football.functions";

export const Route = createFileRoute("/over-under/postavke")({
  head: () => ({
    meta: [
      { title: "Postavke — 2.5 Termometar" },
      { name: "description", content: "Unesi, testiraj i aktiviraj svoj API-Football ključ za 2.5 Termometar. Ključ ostaje spremljen samo na tvom uređaju." },
      { property: "og:title", content: "Postavke — 2.5 Termometar" },
      { property: "og:description", content: "Unos, test i aktivacija API-Football ključa." },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "hr_HR" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

// Zaštita od suspenzije: najmanje 20 sekundi između dvije provjere ključa.
const COOLDOWN_MS = 20_000;

function SettingsPage() {
  const runTest = useServerFn(testApiFootballKey);
  const [input, setInput] = useState("");
  const [saved, setSaved] = useState<SavedKey | null>(null);
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const lastTestRef = useRef(0);

  useEffect(() => {
    const existing = loadKey();
    if (existing) {
      setSaved(existing);
      setInput(existing.key);
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  async function handleTest() {
    const key = input.trim();
    if (key.length < 10) {
      setStatus({ ok: false, message: "Zalijepi cijeli ključ (najmanje 10 znakova)." });
      return;
    }
    const since = Date.now() - lastTestRef.current;
    if (since < COOLDOWN_MS) {
      setCooldown(Math.ceil((COOLDOWN_MS - since) / 1000));
      return;
    }
    if (busy) return;

    setBusy(true);
    setStatus(null);
    lastTestRef.current = Date.now();
    setCooldown(COOLDOWN_MS / 1000);
    try {
      const result = await runTest({ data: { key } });
      setStatus(result);
      if (result.ok) {
        const next: SavedKey = {
          key,
          active: true,
          savedAt: Date.now(),
          ...(result.plan ? { plan: result.plan } : {}),
          ...(result.account ? { account: result.account } : {}),
        };
        saveKey(next);
        setSaved(next);
      }
    } catch {
      setStatus({ ok: false, message: "Provjera nije uspjela. Pokušaj ponovno za koju minutu." });
    } finally {
      setBusy(false);
    }
  }

  function handleRemove() {
    clearKey();
    setSaved(null);
    setInput("");
    setStatus(null);
  }

  const disabled = busy || cooldown > 0;

  return (
    <main className="min-h-screen bg-surface px-4 py-6 font-sans text-ink sm:px-6">
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Link to="/over-under" className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink">
            <ArrowLeft className="size-4" /> Natrag na kalkulator
          </Link>
        </div>

        <header className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-xl border border-line bg-card text-cyan">
            <KeyRound className="size-7" />
          </span>
          <div>
            <h1 className="font-display text-3xl font-extrabold">POSTAVKE</h1>
            <p className="text-sm text-ink/75">Unesi svoj API-Football ključ, testiraj ga i aktiviraj.</p>
          </div>
        </header>

        <section className="panel space-y-4">
          <h2 className="flex items-center gap-2 font-display text-base font-bold uppercase">
            <ShieldCheck className="size-5 text-mint" /> API-Football ključ
          </h2>

          <label htmlFor="apikey" className="block">
            <span className="mb-2 block text-sm font-semibold text-ink/85">Ključ s dashboard.api-football.com</span>
            <input
              id="apikey"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setStatus(null);
              }}
              placeholder="npr. 3a7f9c1e2b8d4f60a1c5e9d7b3f2a648"
              className="h-12 w-full rounded-md border border-line bg-surface/65 px-4 font-display text-base tracking-wider text-ink outline-none placeholder:text-muted/50 focus:border-cyan focus:ring-2 focus:ring-cyan/20"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <Button type="button" size="lg" onClick={handleTest} disabled={disabled} className="shadow-button">
              {busy ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}
              {busy ? "PROVJERAVAM…" : cooldown > 0 ? `PRIČEKAJ ${cooldown}s` : "TESTIRAJ, SPREMI I AKTIVIRAJ"}
            </Button>
            {saved && (
              <Button type="button" size="lg" variant="outline" onClick={handleRemove}>
                <Trash2 className="size-5" /> Obriši ključ
              </Button>
            )}
          </div>

          {status && (
            <p
              role="status"
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${
                status.ok ? "border-win/50 bg-win/10 text-win" : "border-loss/50 bg-loss/10 text-loss"
              }`}
            >
              {status.ok ? <Check className="mt-0.5 size-4 shrink-0" /> : <X className="mt-0.5 size-4 shrink-0" />}
              <span>
                {status.message}
                {status.ok && status.plan ? ` Paket: ${status.plan}.` : ""}
                {status.ok && typeof status.used === "number" && typeof status.limit === "number"
                  ? ` Danas iskorišteno ${status.used} od ${status.limit} zahtjeva.`
                  : ""}
              </span>
            </p>
          )}

          {saved?.active && (
            <div className="rounded-md border border-line bg-surface/50 px-3 py-3 text-sm text-ink/80">
              <p className="font-semibold text-win">Ključ je aktivan na ovom uređaju.</p>
              <p className="mt-1 text-muted">Spremljen ključ: {maskKey(saved.key)}</p>
              {saved.account && <p className="text-muted">Račun: {saved.account}</p>}
            </div>
          )}
        </section>

        <section className="panel space-y-2 text-sm leading-relaxed text-ink/75">
          <h2 className="font-display text-base font-bold uppercase text-ink">Zaštita od blokade računa</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Provjera se šalje samo kad sam pritisneš tipku — nikad automatski.</li>
            <li>Između dvije provjere mora proći najmanje 20 sekundi.</li>
            <li>Šalje se jedan jedini zahtjev na provjeru stanja računa, bez ponavljanja.</li>
            <li>Ključ se čuva samo na ovom uređaju i nikome se ne prosljeđuje.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
