# Optimizacija i Nadogradnja Orion & Luna Botova (Andromeda AI)

Sveobuhvatna nadogradnja i optimizacija AI prediktivnog ekosustava aplikacije Andromeda AI: pretvaranje **Orion bota** u nepopustljivog kvantitativno-matematičkog analitičara (Dixon-Coles, Poisson, Monte Carlo simulacije, Kelly kriterij, line movement, de-vig analiza) i **Luna bota** u vrhunsku SARP savjetnicu za kontekstualno-taktičku analizu mečeva, uz ugrađeni hibridni model podataka i pripremu novog projektnog ZIP paketa.

---

## Pregled i Potvrđene Odluke

> [!IMPORTANT]
> Na temelju vaših odgovora u fazi usklađivanja, definirani su temeljni stupovi implementacije:

- **Izvor podataka i izračuni**: Kombinacija lokalnog determinističkog matematičkog enginea (`predictor-engine.ts`, `radar-analitika.ts`, `prediction-integrity.ts`) i vanjskih sportskih API-ja (`api-football`, `kvote-servis`). Čak i u slučaju kašnjenja ili nedostatka vanjskih API kvota, sustav izračunava egzaktne matematičke vjerojatnosti bez nagađanja.
- **Podjela uloga (Dual-AI)**:
  - **ORION**: Čista matematika, brojevi, vjerojatnosne raspodjele (λ_dom, λ_gost), Monte Carlo (10.000 iteracija), frakcijski Kelly (25%), Shannonova entropija nesigurnosti i de-vig kvota. Bez čavrljanja, direktan i precizan.
  - **LUNA**: Dubinska SARP analiza (7 faza kognicije), taktički kontekst, dinamika svlačionice, motivacija, forma i prijateljski razgovor s korisnikom na prirodnom hrvatskom jeziku.
- **Isporuka ažuriranog koda**: Osvježavanje i generiranje čistog `.zip` paketa u mapi `public/andromeda-ai.zip` sa svim optimizacijama, pratećom dokumentacijom i skriptama.

---

## 1. Pregled i Glavni Koncept

- **Što donosi nadogradnja**: Povezivanje chat sučelja (i za Lunu i za Oriona) s realnim proračunskim jezgrama u aplikaciji. Umjesto da AI samo generira generički tekst, Orion i Luna dinamički pozivaju proračunski modul koji računa stvarne vjerojatnosti ishoda, uspoređuje ih s tržišnim kvotama i generira provjerljivi matematički *edge*.
- **Ciljna skupina**: Korisnici koji traže matematičku prednost (*value betting*) temeljenu na podacima, bez praznih obećanja i "dojava", uz transparentno prikazane rizike i optimalno upravljanje ulogom (bankroll management).
- **Ključna vrijednost**: Eliminacija halucinacija u sportskim tipovima zahvaljujući *Prediction Integrity Gate* filtru koji matematički blokira tipove s negativnim očekivanjem ili prevelikom entropijom.

---

## 2. Korisničko Iskustvo i Vizualni Dizajn

- **Tijek korisničkog sučelja**:
  1. Korisnik otvara chat s Lunom ili panel s Orionom (`/chat` ili Orion ladica).
  2. Korisnik odabire predložak (npr. Nogomet 1X2/BTTS/O-U, Košarka hendikep/total, Rukomet) ili upisuje proizvoljan meč.
  3. Sustav automatski pokreće kvantitativni engine: računa očekivane golove ($\lambda, \mu$), simulira 10.000 ishoda, provjerava tržišne kvote i primjenjuje SARP/Titan filtre.
  4. Orion isporučuje strukturirani telegrafski izračun s točnim brojkama, dok Luna nudi cjelovitu analizu s naglaskom na taktički kontekst i preporuku.
- **Vizualni identitet**:
  - Zadržavanje prepoznatljive tamne kibernetičke teme Andromede AI (tamno sivi i ugljeni tonovi, neonski crveni i plavi akcenti za tipove i sigurnost).
  - Jasno vizualno razdvajanje Orionovih matematičkih kartica (tablice vjerojatnosti, Shannon entropija, Kelly postotak) od Luninog konverzacijskog toka.
  - Ugrađeni indikatori integriteta (Zeleno za visoki Edge, Žuto za granični, Crveno za "Preskočiti / Visok rizik").

---

## 3. Ključne Arhitektonske Odluke

- **Odluka 1: Hibridni mehanizam predikcije (Local Math + Live API + LLM)**
  - *Pristup*: Ako je unesen Gemini/Groq/OpenRouter ključ, LLM djeluje kao tumač i strateg, ali su ulazni podaci i postoci strogo zadani iz lokalnog matematičkog enginea (`predictor-engine.ts`). Ako API ključevi nisu uneseni ili servisi zakažu, lokalni botovi i dalje isporučuju kompletnu matematičku analizu.
  - *Zašto*: Jamči 100% stabilnost i sprječava izmišljanje statistika.

- **Odluka 2: Stroga specijalizacija promptova i procesora za Oriona i Lunu**
  - *Pristup*: Orion dobiva posvećeni cjevovod koji zaobilazi standardni opširni razgovor i formatira odgovor u strogu telemetrijsku formu: `TIP | Sigurnost XX% | Edge +X.X%`, praćeno Poissonovim parametrima, Monte Carlo omjerom i Kellyjevim ulogom.
  - *Zašto*: Korisnik dobiva trenutni, jednoznačni uvid bez potrebe za čitanjem dugih odlomaka teksta.

- **Odluka 3: Automatizirana izrada i osvježavanje arhive projekta**
  - *Pristup*: Skripta koja nakon implementacije svih poboljšanja stvara čist i cjelovit `public/andromeda-ai.zip` spreman za preuzimanje direktno iz sučelja ili preuzimanjem statičke datoteke.

---

## 4. Tehnička Arhitektura i Tok Podataka

```
┌─────────────────────────────────────────────────────────────┐
│                    KORISNIČKO SUČELJE                       │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │     LUNA CHAT         │       │     ORION PANEL       │  │
│  │   (SARP / Kontekst)   │       │ (Kvantitativni brojevi)│ │
│  └───────────┬───────────┘       └───────────┬───────────┘  │
└──────────────┼───────────────────────────────┼──────────────┘
               ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  HIBRIDNI PREDIKTIVNI FILTER                │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │               API PODACI (Online sloj)              │   │
│   │    • API-Football (utakmice, postave, H2H, forma)   │   │
│   │    • Kvote servis (otvaranje, zatvaranje, de-vig)   │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              ▼                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │           LOKALNI KVANTITATIVNI ENGINE              │   │
│   │    • Dixon-Coles & Poisson model (λ_dom, λ_gost)    │   │
│   │    • Monte Carlo simulacija (10.000 utakmica)       │   │
│   │    • Frakcijski Kelly kriterij (25% preporuka)      │   │
│   │    • Shannonova entropija & Kvantna točnost v12     │   │
│   │    • Prediction Integrity Gate (blokada loših oklada)│ │
│   └──────────────────────────┬──────────────────────────┘   │
│                              ▼                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │             AI MODELI (Sinteza & Format)            │   │
│   │    • Gemini / Groq / OpenRouter / Nim               │   │
│   │    • Stroga primjena ORION & LUNA persona           │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   PUBLIC DISTRIBUCIJA                       │
│      • public/andromeda-ai.zip (ažuriran i spreman)         │
│      • Preuzimanje kroz Postavke ili izravni link           │
└─────────────────────────────────────────────────────────────┘
```

---

## Faze Implementacije (nakon odobrenja plana)

1. **Migracija baze koda**: Prijenos kompletnog repozitorija `bet-wise-quantify` u radni prostor i postavljanje ovisnosti.
2. **Optimizacija Oriona**: Nadogradnja `botovi.ts`, `Orion.tsx` i povezivanje s determinističkim matematičkim izračunima.
3. **Optimizacija Lune**: Usavršavanje SARP pravila, dekompozicije vjerojatnosti i integracije provjere integriteta.
4. **Pakiranje projekta**: Generiranje svježeg `.zip` arhiva u mapi `public/` i verifikacija stabilnosti aplikacije.
