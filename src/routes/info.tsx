/* ============================================================
   INFO & ARCHITECTURE — Transparency / About App (v2)
   Stranica objašnjava tko je AI, koju matematiku koristi,
   koje sigurnosne zaštite postoje i odgovorno igranje.
   v2: dodana sekcija "Automatski audit" (SelfTestPanel) koja
   pokreće 18 matematičkih provjera motora direktno u pregledniku.
   ============================================================ */
import { createFileRoute } from "@tanstack/react-router";
import {
  BrainCircuit, Calculator, Dices, Goal, HeartPulse, Info,
  LineChart, ShieldCheck, Sigma, Users, Zap,
} from "lucide-react";
import { SelfTestPanel } from "@/components/SelfTestPanel";

export const Route = createFileRoute("/info")({
  head: () => ({
    meta: [{ title: "Info & Arhitektura · Precision Check" }],
  }),
  component: InfoPage,
});

const SARP_FAZE = [
  { n: 1, naziv: "Prikupljanje podataka", opis: "Fixture, kvote svih kladionica, forma, head-to-head, postave (Lineup Scanner)." },
  { n: 2, naziv: "Normalizacija", opis: "De-vig tržišta (uklanjanje marže), poravnanje kvota u poštene vjerojatnosti." },
  { n: 3, naziv: "Modeliranje", opis: "Poisson / Dixon–Coles očekivanja golova (λ), kalibracija prema formi i tržištu." },
  { n: 4, naziv: "Simulacija", opis: "Monte Carlo (10.000 iteracija po meču) — raspodjela ishoda, varijanca, CTG." },
  { n: 5, naziv: "Fuzija signala", opis: "Model ↔ tržište usporedba; nesuglasje >10 pp snižava povjerenje (A/B/C ocjena)." },
  { n: 6, naziv: "Selekcija", opis: "Anti-loss filter: SKIP / HIGH VOLATILITY kod konflikta signala ili entropije > 0.88." },
  { n: 7, naziv: "Izvedba", opis: "Tip, alternativni tip, edge, ¼ Kelly ulog, rizici, CLV praćenje i zapis u Dnevnik." },
];

const ALGORITMI = [
  { ikona: Sigma, naziv: "Bivarijantni Poisson + Dixon–Coles", opis: "Očekivanja golova i korelacija nisko-skorih ishoda; popravka za 0:0 i 1:0." },
  { ikona: Dices, naziv: "Monte Carlo Engine (10.000 iteracija)", opis: "Smanjenje varijance procjene: raspodjela rezultata, O/U, BTTS, HT/FT iz matrice." },
  { ikona: Users, naziv: "Dean Oliver Four Factors (košarka)", opis: "eFG%, TOV%, ORB%, FT rate × pace model za posjede, spread i totals." },
  { ikona: Goal, naziv: "Rukomet: GK učinkovitost & 2-min drag", opis: "Model isključenja 2 minute i golman-efikasnosti prilagođava tempo i ukupne golove." },
  { ikona: Calculator, naziv: "Frakcijski Kelly (0.25×)", opis: "Upravljanje ulogom: ¼ Kelly smanjuje rizik varijance, s ograničenjem po tipu." },
  { ikona: LineChart, naziv: "Shannon entropija", opis: "Mjeri kaotičnost meča; visoka entropija → niže povjerenje, SKIP preporuka." },
  { ikona: Zap, naziv: "Empirical Bayes + Kopula (BTTS)", opis: "Mali uzorak forme se smanjuje prema ligaškom prosjeku (strop 55%); BTTS kroz DC + Bivarijantni Poisson (ρ=0.08) + Frank kopulu." },
];

function Sekcija({ id, naslov, opis, children }: { id: string; naslov: string; opis?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="rounded-2xl border border-border/60 bg-card/60 p-5 sm:p-6">
      <h2 className="mb-1 text-lg font-bold tracking-tight">{naslov}</h2>
      {opis && <p className="mb-4 text-sm text-muted-foreground">{opis}</p>}
      {children}
    </section>
  );
}

function InfoPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      {/* Naslov */}
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15">
            <Info className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Info & Arhitektura</h1>
            <p className="text-sm text-muted-foreground">
              Kako Andromeda AI razmišlja — modeli, zaštite i transparentnost. Bez skrivanja: svaki tip je zapisan u Dnevniku i provjeriv.
            </p>
          </div>
        </div>
      </div>

      {/* a) IDENTITET & AI ENGINE */}
      <Sekcija
        id="identitet"
        naslov="Identitet & AI Engine — LUNA (Callisto)"
        opis="AI konsultant za sportsku analitiku i kvantitativno modeliranje."
      >
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15">
            <BrainCircuit className="h-7 w-7 text-violet-400" />
          </div>
          <div className="min-w-0 flex-1 space-y-2 text-sm leading-relaxed">
            <p>
              <span className="font-semibold text-violet-300">LUNA (alias Callisto)</span> je senior sportski analitičar
              i kvantitativni modelar. Njeni odgovori se automatski povezuju s Match Engine-om: kad analizira
              aktivnu utakmicu, u prompt dobije <span className="font-semibold">iste brojeve koje vidiš na kartici</span>
              {" "}(λ matrica, Monte Carlo raspodjela, Kelly ulog, ključne izostanke) — pravilo nulte kontradikcije:
              chatbot nikad ne izlazi s postotkom ili tipom koji odstupa od kartice.
            </p>
            <p className="text-muted-foreground">
              Orion je sekundarni agent za duboku statistiku, kretanje linija i alternativne sportove — dijeli isti
              kontekst i isto pravilo formata: prvo tip + sigurnost, pa matematičko obrazloženje.
            </p>
          </div>
        </div>
      </Sekcija>

      {/* b) MATEMATIČKA METODOLOGIJA */}
      <Sekcija
        id="matematika"
        naslov="Matematička metodologija — SARP Brain v4.0 & TITAN Protocol v10"
        opis="Svaka kartica prolazi kroz 7 kognitivnih faza prije nego što objavi tip."
      >
        {/* SARP faze */}
        <ol className="mb-6 grid gap-2 sm:grid-cols-2">
          {SARP_FAZE.map((f) => (
            <li key={f.n} className="flex gap-3 rounded-xl border border-border/50 bg-background/40 p-3">
              <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-emerald-500/15 text-sm font-bold text-emerald-400">
                {f.n}
              </div>
              <div>
                <div className="text-sm font-semibold">{f.naziv}</div>
                <div className="text-xs text-muted-foreground">{f.opis}</div>
              </div>
            </li>
          ))}
        </ol>

        {/* Algoritmi */}
        <div className="grid gap-2 sm:grid-cols-2">
          {ALGORITMI.map((a) => (
            <div key={a.naziv} className="flex gap-3 rounded-xl border border-border/50 bg-background/40 p-3">
              <a.ikona className="mt-0.5 h-5 w-5 flex-none text-cyan-400" />
              <div>
                <div className="text-sm font-semibold">{a.naziv}</div>
                <div className="text-xs text-muted-foreground">{a.opis}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl bg-cyan-500/10 p-3 text-xs text-cyan-200">
          <Zap className="mt-0.5 h-4 w-4 flex-none" />
          <span>
            TITAN Protocol v10: ansambl više modela (median + trimmed mean), kalibracija vjerojatnosti po kartici
            (Brier score u Dnevniku) i konsenzus samo kad modeli i tržište idu u istom smjeru.
          </span>
        </div>
      </Sekcija>

      {/* c) ANTI-ERROR & SAFETY SHIELD */}
      <Sekcija
        id="zastite"
        naslov="Anti-Error & Safety Shield"
        opis="Bolje propustiti tip nego igrati kaotičan meč — filteri koji štite bankroll."
      >
        <ul className="space-y-2 text-sm">
          <li className="flex gap-3 rounded-xl border border-border/50 bg-background/40 p-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-red-400" />
            <span>
              <span className="font-semibold">SKIP / NO-BET pravilo:</span> ako je statistički edge &lt; 3% prema
              de-vig tržištu, Shannon entropija &gt; 0.88 ili signali međusobno u konfliktu (model vs. forma vs. tržište),
              kartica označava meč kao SKIP / HIGH VOLATILITY i ne forsira tip. GOLD se ističe samo na edge ≥ 5%.
            </span>
          </li>
          <li className="flex gap-3 rounded-xl border border-border/50 bg-background/40 p-3">
            <Users className="mt-0.5 h-5 w-5 flex-none text-amber-400" />
            <span>
              <span className="font-semibold">Lineup Scanner:</span> kad su objavljene postave, izlazak golmana /
              braniča / veznjaka / napadača množi očekivanja golova (λ) i pomak se prikazuje u Lineup Radar panelu
              na svakoj kartici.
            </span>
          </li>
          <li className="flex gap-3 rounded-xl border border-border/50 bg-background/40 p-3">
            <LineChart className="mt-0.5 h-5 w-5 flex-none text-emerald-400" />
            <span>
              <span className="font-semibold">CLV (Closing Line Value):</span> aplikacija snima kvote svaki put kad ih
              dohvati i mjeri je li tvoj uloženi tip dobiven na boljoj kvoti od kasnijeg (closing) tržišta — proxy
              sigurnosti da igras s marginom, ne protiv nje.
            </span>
          </li>
          <li className="flex gap-3 rounded-xl border border-border/50 bg-background/40 p-3">
            <HeartPulse className="mt-0.5 h-5 w-5 flex-none text-violet-400" />
            <span>
              <span className="font-semibold">Kalibracija (Brier):</span> Dnevnik svaki tip provjerava stvarnim
              rezultatom i računa Brier score po kartici — model koji pretjeruje automatski dobiva oznaku
              &quot;smanji povjerenje&quot;.
            </span>
          </li>
        </ul>
      </Sekcija>

      {/* d) AUTOMATSKI AUDIT (samotest) */}
      <Sekcija
        id="audit"
        naslov="Automatski audit motora (samotest)"
        opis="18 matematičkih provjera koje garantira unutarnju konzistentnost: O/U zbrojevi, BTTS kopule, monotonija linija, EB shrinkage i pravilo nulte kontradikcije. Pokreće se lokalno — bez API-ja i bez trošenja kvote."
      >
        <SelfTestPanel />
      </Sekcija>

      {/* e) ODGOVORNO IGRANJE */}
      <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 sm:p-6">
        <h2 className="mb-2 text-lg font-bold text-amber-300">Odgovorno igranje & pravna napomena</h2>
        <p className="text-sm leading-relaxed text-amber-100/90">
          Sve predikcije u ovoj aplikaciji su <span className="font-semibold">probabilistički modeli</span> u
          informativne i analitičke svrhe. Nogomet, košarka i rukomet su neodredivi sportovi — nijedan model ne
          garantira ishod. Sadržaj nije savjet za klađenje, nije financijski savjet i ne jamči dobit. Sve podatke
          koristi odgovorno: kladite samo novac koji si možete priuštiti izgubiti, postavite limite i ne lovite
          gubitke. Klađenje je isključivo za punoljetne osobe (18+).
        </p>
        <p className="mt-2 text-xs text-amber-200/70">
          Ako osjećate da igranje prelazi u problem, potražite pomoć: nacionalni savjetovališta za ovisnost o
          kockanju, besplatne linije i resurse poput beGambleAware.org i gamblingtherapy.org.
        </p>
      </section>

      <p className="text-center text-xs text-muted-foreground">
        Precision Check · Andromeda AI — kvantitativni analitički sustav. Sve metrike se računaju lokalno u tvom pregledniku.
      </p>
    </div>
  );
}

