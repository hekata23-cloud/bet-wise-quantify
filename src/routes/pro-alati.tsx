import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  asianHandicap, goalLineOver, countOver, statLambda, arbitrage, combo, kelly, liveMomentum,
  injuryAdjust, oneXtwo, bankrollStats, historyByCard, type Leg, type Role, type Bet, type HistPick,
} from "@/lib/pro-alati";

export const Route = createFileRoute("/pro-alati")({
  head: () => ({
    meta: [
      { title: "Pro Alati · Andromeda AI" },
      { name: "description", content: "Asian handicap, korneri i kartoni, bankroll, surebet, kombinacije, live momentum, ozljede i povijest točnosti." },
      { property: "og:title", content: "Pro Alati · Andromeda AI" },
      { property: "og:description", content: "8 profesionalnih kladioničarskih alata na jednom mjestu." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProAlati,
});

const TABS = ["Asian Handicap", "Korneri & kartoni", "Bankroll", "Surebet", "Kombinacije", "Live momentum", "Ozljede", "Povijest točnosti"] as const;
const n = (s: string) => parseFloat(String(s).replace(",", ".")) || 0;
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const fo = (o: number) => (Number.isFinite(o) ? o.toFixed(2) : "—");
const uid = () => Math.random().toString(36).slice(2);

function load<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
function usePersist<T>(k: string, d: T) {
  const [v, setV] = useState<T>(d);
  useEffect(() => setV(load(k, d)), [k]);
  const set = (x: T) => { setV(x); localStorage.setItem(k, JSON.stringify(x)); };
  return [v, set] as const;
}

const inp = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const btn = "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90";
function F({ label, v, set }: { label: string; v: string; set: (s: string) => void }) {
  return <label className="block text-xs text-muted-foreground">{label}<input className={inp + " mt-1"} inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} /></label>;
}
function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-4"><h2 className="text-lg font-semibold">{title}</h2>{children}</section>;
}
function Row({ k, v, hi }: { k: string; v: string; hi?: boolean }) {
  return <div className={`flex justify-between rounded-lg px-3 py-2 text-sm ${hi ? "bg-primary/15 text-primary font-semibold" : "bg-muted/40"}`}><span>{k}</span><span className="tabular-nums">{v}</span></div>;
}

function ProAlati() {
  const [tab, setTab] = useState(0);
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Pro Alati</h1>
        <p className="text-muted-foreground text-sm">Profesionalni alati za točnije tipove. λ (očekivani golovi) uzmi iz Pro Sharp skenera ili Prediktora.</p></div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t, i) => <button key={t} onClick={() => setTab(i)} className={`rounded-lg px-3 py-1.5 text-sm ${tab === i ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{i + 1}. {t}</button>)}
      </div>
      {[<AH />, <Stats />, <Bankroll />, <Surebet />, <Combo />, <Live />, <Injury />, <History />][tab]}
    </div>
  );
}

function AH() {
  const [lh, setLh] = useState("1.6"), [la, setLa] = useState("1.1"), [book, setBook] = useState("");
  const L = [-1.5, -1.25, -1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
  const G = [1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5];
  return (
    <Card title="Asian Handicap & linije golova">
      <div className="grid grid-cols-3 gap-3"><F label="λ domaćin" v={lh} set={setLh} /><F label="λ gost" v={la} set={setLa} /><F label="Kvota kladionice (opcija)" v={book} set={setBook} /></div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1"><div className="text-xs text-muted-foreground">Handicap domaćina — fer kvota</div>
          {L.map((l) => { const r = asianHandicap(n(lh), n(la), l); return <Row key={l} k={`AH ${l > 0 ? "+" : ""}${l}`} v={`${fo(r.fairOdds)}  (dobitak ${pct(r.win)})`} hi={n(book) > r.fairOdds * 1.02} />; })}
        </div>
        <div className="space-y-1"><div className="text-xs text-muted-foreground">Over linija golova — fer kvota</div>
          {G.map((g) => { const r = goalLineOver(n(lh), n(la), g); return <Row key={g} k={`Over ${g}`} v={`${fo(r.fairOdds)}  (dobitak ${pct(r.win)})`} hi={n(book) > r.fairOdds * 1.02} />; })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Označeno = kvota kladionice je 2%+ iznad fer kvote (value).</p>
    </Card>
  );
}

function Stats() {
  const [v, setV] = useState({ hF: "5.8", hA: "4.2", aF: "4.6", aA: "5.1", line: "9.5", cH: "2.1", cA: "2.3", ref: "4.4", cl: "4.5" });
  const s = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x });
  const lc = statLambda(n(v.hF), n(v.hA), n(v.aF), n(v.aA));
  const c = countOver(lc, n(v.line));
  const lk = ((n(v.cH) + n(v.cA)) + n(v.ref)) / 2;
  const k = countOver(lk, n(v.cl));
  return (
    <Card title="Korneri i kartoni">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <F label="Domaćin korneri za" v={v.hF} set={s("hF")} /><F label="Domaćin korneri protiv" v={v.hA} set={s("hA")} />
        <F label="Gost korneri za" v={v.aF} set={s("aF")} /><F label="Gost korneri protiv" v={v.aA} set={s("aA")} /><F label="Linija kornera" v={v.line} set={s("line")} />
      </div>
      <Row k={`Očekivano kornera ${lc.toFixed(2)} · Over ${v.line}`} v={`${pct(c.over)} · fer ${fo(1 / c.over)}`} hi />
      <Row k={`Under ${v.line}`} v={`${pct(c.under)} · fer ${fo(1 / c.under)}`} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <F label="Domaćin kartoni/utakmica" v={v.cH} set={s("cH")} /><F label="Gost kartoni/utakmica" v={v.cA} set={s("cA")} />
        <F label="Sudac prosjek kartona" v={v.ref} set={s("ref")} /><F label="Linija kartona" v={v.cl} set={s("cl")} />
      </div>
      <Row k={`Očekivano kartona ${lk.toFixed(2)} · Over ${v.cl}`} v={`${pct(k.over)} · fer ${fo(1 / k.over)}`} hi />
      <Row k={`Under ${v.cl}`} v={`${pct(k.under)} · fer ${fo(1 / k.under)}`} />
    </Card>
  );
}

function Bankroll() {
  const [bets, setBets] = usePersist<Bet[]>("pa.bets", []);
  const [bank, setBank] = usePersist<string>("pa.bank", "100");
  const [f, setF] = useState({ label: "", stake: "", odds: "", prob: "" });
  const st = bankrollStats(bets);
  const k = kelly(n(f.prob) / 100, n(f.odds));
  const upd = (id: string, p: Partial<Bet>) => setBets(bets.map((b) => (b.id === id ? { ...b, ...p } : b)));
  return (
    <Card title="Bankroll menadžer & CLV">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Row k="Oklada" v={String(st.count)} /><Row k="Profit" v={st.profit.toFixed(2)} hi={st.profit > 0} />
        <Row k="ROI" v={pct(st.roi)} /><Row k="Prosječni CLV" v={st.avgClv === null ? "—" : pct(st.avgClv)} hi={(st.avgClv ?? 0) > 0} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <F label="Bankroll" v={bank} set={setBank} /><F label="Tip" v={f.label} set={(x) => setF({ ...f, label: x })} />
        <F label="Kvota" v={f.odds} set={(x) => setF({ ...f, odds: x })} /><F label="Tvoja vjerojatnost %" v={f.prob} set={(x) => setF({ ...f, prob: x })} />
        <F label="Ulog" v={f.stake} set={(x) => setF({ ...f, stake: x })} />
      </div>
      {n(f.prob) > 0 && n(f.odds) > 1 && <Row k="Preporučeni ulog (¼ Kelly)" v={`${(k * n(bank)).toFixed(2)} (${pct(k)})`} hi={k > 0} />}
      <button className={btn} onClick={() => { if (n(f.odds) > 1 && n(f.stake) > 0) { setBets([{ id: uid(), label: f.label || "Tip", stake: n(f.stake), odds: n(f.odds), closing: null, result: null, ts: Date.now() }, ...bets]); setF({ label: "", stake: "", odds: "", prob: "" }); } }}>Dodaj okladu</button>
      <div className="space-y-2">
        {bets.map((b) => (
          <div key={b.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg bg-muted/40 p-2 text-sm md:flex md:items-center">
            <div className="min-w-0 truncate md:flex-1">{b.label} · {b.stake} @ {b.odds}</div>
            <input className="w-24 rounded border border-border bg-background px-2 py-1 text-xs" placeholder="Zadnja kvota" defaultValue={b.closing ?? ""} onBlur={(e) => upd(b.id, { closing: n(e.target.value) || null })} />
            <div className="flex gap-1 col-span-2">
              {(["win", "loss", "push"] as const).map((r) => <button key={r} onClick={() => upd(b.id, { result: r })} className={`rounded px-2 py-1 text-xs ${b.result === r ? "bg-primary text-primary-foreground" : "bg-background"}`}>{r === "win" ? "Prošao" : r === "loss" ? "Pao" : "Povrat"}</button>)}
              <button onClick={() => setBets(bets.filter((x) => x.id !== b.id))} className="rounded px-2 py-1 text-xs text-destructive">Obriši</button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">CLV: ako je tvoja kvota veća od zadnje kvote prije početka, dugoročno pobjeđuješ tržište.</p>
    </Card>
  );
}

function Surebet() {
  const [o, setO] = useState(["2.10", "3.60", "4.20"]), [bank, setBank] = useState("100"), [three, setThree] = useState(true);
  const odds = (three ? o : o.slice(0, 2)).map(n).filter((x) => x > 1);
  const r = odds.length >= 2 ? arbitrage(odds, n(bank)) : null;
  const lbl = three ? ["1", "X", "2"] : ["Strana A", "Strana B"];
  return (
    <Card title="Surebet / arbitraža">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={three} onChange={(e) => setThree(e.target.checked)} /> Tri ishoda (1X2)</label>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {lbl.map((l, i) => <F key={l} label={`Najbolja kvota ${l}`} v={o[i]} set={(x) => { const c = [...o]; c[i] = x; setO(c); }} />)}
        <F label="Ukupni ulog" v={bank} set={setBank} />
      </div>
      {r && <>
        <Row k={r.surebet ? "SUREBET — siguran profit" : "Nije surebet"} v={`${r.profitPct.toFixed(2)}%`} hi={r.surebet} />
        {r.stakes.map((s, i) => <Row key={i} k={`Ulog na ${lbl[i]}`} v={`${s.toFixed(2)} → isplata ${(s * odds[i]).toFixed(2)}`} />)}
      </>}
      <p className="text-xs text-muted-foreground">Unesi najbolju kvotu za svaki ishod s različitih kladionica.</p>
    </Card>
  );
}

function Combo() {
  const [legs, setLegs] = useState<Leg[]>([{ label: "", prob: 0.6, odds: 1.8, match: "" }]);
  const r = combo(legs.filter((l) => l.odds > 1 && l.prob > 0));
  const set = (i: number, p: Partial<Leg>) => setLegs(legs.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <Card title="Sastavljač kombinacija">
      {legs.map((l, i) => (
        <div key={i} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <F label="Utakmica" v={l.match} set={(x) => set(i, { match: x })} /><F label="Tip" v={l.label} set={(x) => set(i, { label: x })} />
          <F label="Vjerojatnost %" v={String(Math.round(l.prob * 100))} set={(x) => set(i, { prob: n(x) / 100 })} />
          <F label="Kvota" v={String(l.odds)} set={(x) => set(i, { odds: n(x) })} />
          <button className="text-xs text-destructive" onClick={() => setLegs(legs.filter((_, j) => j !== i))}>Ukloni</button>
        </div>
      ))}
      {legs.length < 5 && <button className={btn} onClick={() => setLegs([...legs, { label: "", prob: 0.6, odds: 1.8, match: "" }])}>Dodaj par</button>}
      <Row k="Stvarna vjerojatnost listića" v={pct(r.prob)} /><Row k="Ukupna kvota / fer kvota" v={`${fo(r.odds)} / ${fo(r.fairOdds)}`} />
      <Row k="Očekivana vrijednost (EV)" v={pct(r.ev)} hi={r.ev > 0} />
      {r.correlated.length > 0 && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">Upozorenje: više tipova s iste utakmice ({r.correlated.join(", ")}). Povezani su, pa stvarna vjerojatnost nije umnožak — kladionice to često ne dopuštaju.</p>}
    </Card>
  );
}

function Live() {
  const [v, setV] = useState({ minute: "60", lh: "1.5", la: "1.1", sotH: "5", sotA: "2", daH: "45", daA: "25", gH: "0", gA: "0" });
  const s = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x });
  const r = liveMomentum({ minute: n(v.minute), lh: n(v.lh), la: n(v.la), sotH: n(v.sotH), sotA: n(v.sotA), daH: n(v.daH), daA: n(v.daA) });
  const total = n(v.gH) + n(v.gA);
  return (
    <Card title="Live momentum">
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
        <F label="Minuta" v={v.minute} set={s("minute")} /><F label="Golovi domaćin" v={v.gH} set={s("gH")} /><F label="Golovi gost" v={v.gA} set={s("gA")} />
        <F label="λ domaćin (prije)" v={v.lh} set={s("lh")} /><F label="λ gost (prije)" v={v.la} set={s("la")} />
        <F label="Udarci u okvir D" v={v.sotH} set={s("sotH")} /><F label="Udarci u okvir G" v={v.sotA} set={s("sotA")} />
        <F label="Opasni napadi D" v={v.daH} set={s("daH")} /><F label="Opasni napadi G" v={v.daA} set={s("daA")} />
      </div>
      <Row k="Sljedeći gol — domaćin" v={pct(r.nextHome)} hi={r.nextHome > r.nextAway} />
      <Row k="Sljedeći gol — gost" v={pct(r.nextAway)} hi={r.nextAway > r.nextHome} />
      <Row k="Bez više golova" v={pct(r.noGoal)} />
      <Row k={`Over ${total + 0.5} (još barem 1 gol)`} v={`${pct(1 - r.noGoal)} · fer ${fo(1 / (1 - r.noGoal))}`} />
    </Card>
  );
}

function Injury() {
  const [lh, setLh] = useState("1.5"), [la, setLa] = useState("1.1");
  const [miss, setMiss] = useState<{ team: "home" | "away"; role: Role; key: boolean }[]>([]);
  const before = oneXtwo(n(lh), n(la)); const adj = injuryAdjust(n(lh), n(la), miss); const after = oneXtwo(adj.lh, adj.la);
  const roles: Role[] = ["napadac", "vezni", "obrana", "golman"];
  return (
    <Card title="Ozljede i postave">
      <div className="grid grid-cols-2 gap-3"><F label="λ domaćin" v={lh} set={setLh} /><F label="λ gost" v={la} set={setLa} /></div>
      {miss.map((m, i) => (
        <div key={i} className="flex flex-wrap gap-2 text-sm">
          <select className={inp + " w-auto"} value={m.team} onChange={(e) => setMiss(miss.map((x, j) => j === i ? { ...x, team: e.target.value as "home" | "away" } : x))}><option value="home">Domaćin</option><option value="away">Gost</option></select>
          <select className={inp + " w-auto"} value={m.role} onChange={(e) => setMiss(miss.map((x, j) => j === i ? { ...x, role: e.target.value as Role } : x))}>{roles.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          <label className="flex items-center gap-1"><input type="checkbox" checked={m.key} onChange={(e) => setMiss(miss.map((x, j) => j === i ? { ...x, key: e.target.checked } : x))} /> ključni igrač</label>
          <button className="text-xs text-destructive" onClick={() => setMiss(miss.filter((_, j) => j !== i))}>Ukloni</button>
        </div>
      ))}
      <button className={btn} onClick={() => setMiss([...miss, { team: "home", role: "napadac", key: true }])}>Dodaj igrača koji ne igra</button>
      <div className="grid md:grid-cols-2 gap-2">
        {([["1", before.h, after.h], ["X", before.d, after.d], ["2", before.a, after.a], ["Over 2.5", before.o25, after.o25], ["GG", before.gg, after.gg]] as const).map(([k, b, a]) =>
          <Row key={k} k={k} v={`${pct(b)} → ${pct(a)} · fer ${fo(1 / a)}`} hi={Math.abs(a - b) > 0.02} />)}
      </div>
      <Row k="Nove λ" v={`${adj.lh.toFixed(2)} : ${adj.la.toFixed(2)}`} />
    </Card>
  );
}

function History() {
  const [picks, setPicks] = usePersist<HistPick[]>("pa.history", []);
  const [f, setF] = useState({ card: "Pro Sharp", label: "", prob: "" });
  const stats = historyByCard(picks);
  const cards = ["Pro Sharp", "Zlatni tip", "Prediktor", "Kalkulator", "Termometar", "AI Prognoza", "AI Chat"];
  return (
    <Card title="Povijest točnosti po kartici">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <label className="block text-xs text-muted-foreground">Kartica<select className={inp + " mt-1"} value={f.card} onChange={(e) => setF({ ...f, card: e.target.value })}>{cards.map((c) => <option key={c}>{c}</option>)}</select></label>
        <F label="Tip" v={f.label} set={(x) => setF({ ...f, label: x })} /><F label="Dana vjerojatnost %" v={f.prob} set={(x) => setF({ ...f, prob: x })} />
        <button className={btn} onClick={() => { if (n(f.prob) > 0) { setPicks([{ id: uid(), card: f.card, label: f.label || "Tip", prob: n(f.prob) / 100, won: null, ts: Date.now() }, ...picks]); setF({ ...f, label: "", prob: "" }); } }}>Spremi tip</button>
      </div>
      {stats.map((s) => <Row key={s.card} k={`${s.card} · ${s.n} tipova`} v={`pogođeno ${pct(s.hitRate)} (očekivano ${pct(s.expected)}) · Brier ${s.brier.toFixed(3)}`} hi={s.hitRate >= s.expected} />)}
      <div className="space-y-1">
        {picks.map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-lg bg-muted/40 p-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{p.card} · {p.label} · {pct(p.prob)}</span>
            <button onClick={() => setPicks(picks.map((x) => x.id === p.id ? { ...x, won: true } : x))} className={`rounded px-2 py-1 text-xs ${p.won === true ? "bg-primary text-primary-foreground" : "bg-background"}`}>Prošao</button>
            <button onClick={() => setPicks(picks.map((x) => x.id === p.id ? { ...x, won: false } : x))} className={`rounded px-2 py-1 text-xs ${p.won === false ? "bg-destructive text-destructive-foreground" : "bg-background"}`}>Pao</button>
            <button onClick={() => setPicks(picks.filter((x) => x.id !== p.id))} className="text-xs text-destructive">×</button>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Brier ispod 0.20 = dobar model. Ako je pogođeno manje od očekivanog, kartica precjenjuje svoje tipove.</p>
    </Card>
  );
}
