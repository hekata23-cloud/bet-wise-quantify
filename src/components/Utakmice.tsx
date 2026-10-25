import { useEffect, useState } from "react";
import { getFixtures, getMatchBundle } from "@/lib/football.functions";
import { SettingsModal } from "./SettingsModal";

type Fixture = {
  id: number;
  time: string;
  league: string;
  home: string;
  away: string;
  homeId?: number;
  awayId?: number;
};

export type Loaded = {
  odds: Record<string, string>;
  corners: { line: number; over: number; under: number } | null;
  izvori?: Record<string, string>;
  upozorenja?: string[];
  bookmaker?: string | null;
  info?: any;
  match?: any;
};

const dan = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zagreb" });

export function Utakmice({ onLoad }: { onLoad: (d: Loaded, naziv: string) => void }) {
  const [list, setList] = useState<Fixture[]>([]);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  const checkKey = () => {
    const k = localStorage.getItem("kr-football-api-key");
    setHasKey(Boolean(k));
  };

  useEffect(() => {
    checkKey();
    const c = localStorage.getItem(`kr-fix-v3-${dan()}`);
    if (c) {
      const parsed = JSON.parse(c);
      if (parsed.length > 0 && parsed[0].homeId) {
        setList(parsed);
      }
    }
  }, []);

  const getKey = () => localStorage.getItem("kr-football-api-key") || undefined;

  const ucitaj = async (force = false) => {
    const key = `kr-fix-v3-${dan()}`;
    const cached = localStorage.getItem(key);
    if (cached && !force) {
      const parsed = JSON.parse(cached);
      if (parsed.length > 0 && parsed[0].homeId) {
        setList(parsed);
        return setMsg("Učitane već spremljene današnje utakmice (0 novih poziva).");
      }
    }

    setBusy(true);
    setMsg("Dohvaćam današnje utakmice...");
    const r = await getFixtures({ data: { date: dan(), apiKey: getKey() } });
    setBusy(false);

    if (r.error) return setMsg(r.error);
    localStorage.setItem(key, JSON.stringify(r.fixtures));

    // Briše starije verzije cachea
    Object.keys(localStorage)
      .filter((k) => (k.startsWith("kr-fix-") || k.startsWith("kr-form-") || k.startsWith("kr-odds-")) && !k.includes("v3"))
      .forEach((k) => localStorage.removeItem(k));

    setList(r.fixtures);
    setMsg(`Učitano ${r.fixtures.length} utakmica. Preostalo API poziva danas: ${r.remaining}`);
  };

  const BUNDLE_TTL = 10 * 60 * 1000;      // svjež bundel — otvori bez API poziva
  const STALE_TTL = 3 * 60 * 60 * 1000;   // do 3 h stari — samo kao zadnja šansa
  const bundleKey = (id: number) => `kr-bundle-v2-${id}`;

  const otvori = async (f: Fixture) => {
    const naziv = `${f.home} — ${f.away}`;
    const key = bundleKey(f.id);
    const cachedRaw = localStorage.getItem(key);

    // 1) Svjež bundel iz memorije → otvori odmah (0 novih API poziva).
    if (cachedRaw) {
      try {
        const p = JSON.parse(cachedRaw) as { t: number; r: any };
        const svjez = Date.now() - p.t < BUNDLE_TTL;
        const imaKvota = Object.keys(p.r?.odds ?? {}).some((k: string) => !k.startsWith("f"));
        if (svjez && imaKvota) {
          setMsg("");
          onLoad(
            { odds: p.r.odds, corners: p.r.corners, izvori: p.r.izvori, upozorenja: p.r.upozorenja, bookmaker: p.r.bookmaker },
            naziv,
          );
          return;
        }
      } catch { /* oštećen keš — idemo na API */ }
    }

    setBusy(true);
    let lastMsg = "";
    let loaded = false;

    // 2) Do 3 pokušaja unutar JEDNOG klika — API free plan ima minutni limit,
    //    pa se prvi pokušaj zna zaletjeti u 429. Stari kod je tražio da korisnik
    //    ručno klikne tri puta; sad app sama ponavlja.
    for (let pok = 1; pok <= 3 && !loaded; pok++) {
      setMsg(`Učitavam kvote i formu za ${naziv}... (pokušaj ${pok}/3)`);
      try {
        const r = await getMatchBundle({
          data: { id: f.id, homeId: f.homeId, awayId: f.awayId, apiKey: getKey() },
        });
        const imaKvota = Object.keys(r.odds ?? {}).some((k: string) => !k.startsWith("f"));
        if (imaKvota) {
          localStorage.setItem(key, JSON.stringify({ t: Date.now(), r }));
          setMsg("");
          onLoad(
            { odds: r.odds, corners: r.corners, izvori: r.izvori, upozorenja: r.upozorenja, bookmaker: r.bookmaker },
            naziv,
          );
          loaded = true;
          break;
        }
        lastMsg = r.error || "⚠️ Za ovu utakmicu API još nema dovoljno kvalitetnih kvota.";
      } catch (err: any) {
        lastMsg = `Greška: ${err?.message || "Neuspjelo učitavanje"}`;
      }
      if (pok < 3) await new Promise((res) => setTimeout(res, 6000));
    }

    // 3) Zadnja šansa: nedavni bundel iz memorije (do 3 h star) — bolje nego blokada.
    if (!loaded && cachedRaw) {
      try {
        const p = JSON.parse(cachedRaw) as { t: number; r: any };
        if (Date.now() - p.t < STALE_TTL) {
          setMsg(`⚠️ API trenutno ne daje nove podatke — otvaram memorirane kvote. (${lastMsg})`);
          onLoad(
            { odds: p.r.odds, corners: p.r.corners, izvori: p.r.izvori, upozorenja: p.r.upozorenja, bookmaker: p.r.bookmaker },
            naziv,
          );
          loaded = true;
        }
      } catch { /* ignoriraj */ }
    }

    if (!loaded) setMsg(lastMsg);
    setBusy(false);
  };

  const vidljive = list.filter((f) =>
    `${f.home} ${f.away} ${f.league}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <section className="mb-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-card-foreground">⚽ Utakmice dana ({dan()})</h2>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="rounded-lg border border-input bg-secondary/60 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-secondary"
            >
              ⚙️ {hasKey ? "Ključ unesen" : "Postavi ključ"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => ucitaj(true)}
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Učitavam..." : "Učitaj utakmice"}
          </button>
        </div>
        {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
        {list.length > 0 && (
          <>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Traži tim ili ligu…"
              className="mt-3 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
            <ul className="mt-3 max-h-80 overflow-y-auto divide-y divide-border">
              {vidljive.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => otvori(f)}
                    className="w-full px-2 py-2 text-left text-sm hover:bg-secondary"
                  >
                    <span className="font-bold text-primary">
                      {new Date(f.time).toLocaleTimeString("hr-HR", {
                        timeZone: "Europe/Zagreb",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>{" "}
                    <span className="text-foreground">
                      {f.home} — {f.away}
                    </span>
                    <span className="block text-xs text-muted-foreground">{f.league}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <SettingsModal
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          checkKey();
        }}
      />
    </>
  );
}
