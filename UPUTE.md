# Andromeda AI Beta — kako pokrenuti i instalirati

1. `bun install` (ili `npm install`)
2. `bun dev`
3. Otvori http://localhost:8080
4. Otvori **Postavke** i zalijepi ključeve (OpenRouter je besplatan i preporučen, uz Gemini/Groq/NVIDIA/HF i API-Football).

## Instalacija kao aplikacija (PWA) — PC i mobitel
Aplikacija ima web manifest (`public/manifest.webmanifest`) i ikone
(`pwa-192.png`, `pwa-512.png`, `apple-touch-icon.png`) s crveno-bijelom piramidom,
pa je Chrome prepoznaje kao instalabilnu.

- **Chrome / Edge / Brave (Windows, macOS, Linux):** ikona instalacije u adresnoj traci
  ili izbornik ⋮ → „Instaliraj Andromeda AI Beta“. Može i gumb u Postavkama → „Instaliraj aplikaciju“.
- **Android Chrome:** izbornik ⋮ → „Instaliraj aplikaciju“ / „Dodaj na početni zaslon“.
- **iPhone Safari:** Podijeli → „Dodaj na početni zaslon“.

Napomena: instalacija radi na objavljenoj (https) verziji. Unutar Lovable pregleda
(iframe) Chrome ne nudi instalaciju.

## Nove napredne postavke — Kvantna točnost v12
U Postavkama, kartica **Kvantna točnost v12**: 16 modula (kalibracija sigurnosti,
miks s tržištem, de-vig/edge/CLV, hijerarhijski Bayes, game-state hazard, utjecaj sastava,
profil sudca, vrijeme i teren, umor i putovanja, kazna za mali uzorak, regresija anomalija,
korelacija u kombinacijama, interval nesigurnosti, pravilo odustajanja, revizija protuslovlja,
post-mortem). Svi su uključeni po defaultu i **automatski se vežu na svaki odgovor chat bota**,
uz automatsko pokretanje OMNI motora i ansambl konsenzusa.

## Preuzimanje projekta
Postavke → „Preuzmi andromeda-ai.zip“ (ili direktno preuzmi `andromeda-ai.zip` / `bet-wise-quantify-fixed.zip` iz `public/`).

## Popravak „bijelog ekrana” pri objavi u Lovable-u
Problem bijelog ekrana (blank screen) nastao je jer su greškom u korijen projekta dodane datoteke:
1. `index.html` (s pozivom na `src/main.tsx`)
2. `src/App.tsx` (koji je vraćao prazan `<div></div>`)
3. `src/main.tsx` i `src/index.css`

Lovable projekt koristi TanStack Start (SSR s Nitro engineom), gdje se cijela struktura generira kroz `src/routes/__root.tsx` i `src/server.ts`. Kada se u korijenu nalazi `index.html`, Vite ga automatski učitava umjesto aplikacije i renderira prazan `App.tsx` (bijeli ekran).

Uklanjanjem tih datoteka i regeneracijom čistog paketa:
- TanStack Start SSR ponovno radi 100% ispravno.
- Svi moduli, rute (84+), stilovi i servisi se normalno učitavaju i prikazuju.
- Build i testovi prolaze bez greške.


## Andromeda AI Beta — što je novo
Usporedba s Ana 4 i Orion 8 pokazala je da su Ana 4 i Orion 8 gotovo identični (starija
„Andromeda AI” osnova; Ana 4 = Orion 8 + datoteke koje uzrokuju bijeli ekran). Andromeda
je već imao većinu njihovih popravaka i puno više modula, pa su preuzeta samo stvarna poboljšanja:

1. **Strogi TypeScript (iz Ana 4 `tsconfig.json`)** — uklonjeno 11 skrivenih grešaka tipova.
2. **Gemini rezervni proxy (iz Orion 8 / Ana 4)** — nova ruta `/api/public/gemini`. Ako direktni
   poziv Geminiju iz preglednika padne (mreža/CORS) ili ključ nije u pregledniku, a postoji
   `GEMINI_API_KEY` na poslužitelju, chat automatski ide preko poslužitelja.
3. **Proširen `.gitignore` (iz Orion 8)** — build mape (.output, .nitro, .wrangler…) ne ulaze u git.
4. Novi testovi `src/test/gemini-proxy.test.ts`.
5. Naziv aplikacije: **Andromeda AI Beta**.

Namjerno NIJE preuzeto (bilo bi lošije): `index.html`/`src/App.tsx`/`src/main.tsx` iz Ana 4
(bijeli ekran), izmišljene kvote u Zlatnom tipu iz Orion 8, stari API pozivi bez zaštite od
limita, stari Kelly/EV izračuni bez popravaka, ponovno uključivanje offline cachea.
