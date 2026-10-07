# Andromeda AI — kako pokrenuti i instalirati

1. `bun install` (ili `npm install`)
2. `bun dev`
3. Otvori http://localhost:8080
4. Otvori **Postavke** i zalijepi ključeve (OpenRouter je besplatan i preporučen, uz Gemini/Groq/NVIDIA/HF i API-Football).

## Instalacija kao aplikacija (PWA) — PC i mobitel
Aplikacija ima web manifest (`public/manifest.webmanifest`) i ikone
(`pwa-192.png`, `pwa-512.png`, `apple-touch-icon.png`) s crveno-bijelom piramidom,
pa je Chrome prepoznaje kao instalabilnu.

- **Chrome / Edge / Brave (Windows, macOS, Linux):** ikona instalacije u adresnoj traci
  ili izbornik ⋮ → „Instaliraj Andromeda AI“. Može i gumb u Postavkama → „Instaliraj aplikaciju“.
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
Postavke → „Preuzmi andromeda-ai.zip“ (paket je u `public/andromeda-ai.zip`).
