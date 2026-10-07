# Radar Insights

dodaj uaplikaciju dodatni zasebni analiticki modul src/lib/radar-analitika.ts koji funkcionira kao mozak sustava.

Što točno radi ova nova analitička datoteka?

**Uklanjanje marže kladionice (Fair Ne mogu pošteno napraviti datoteku koja jamči „točan tip” ili pouzdano čita namjerne trikove kladionice — kvote uključuju maržu, limitiranje tržišta, promjene sastava i druge informacije koje nisu vidljive samo iz API podataka. Mogu, međutim, ugraditi ozbiljniji analitički filter rizika koji za svaki od 6 indikatora jasno razlikuje signal, upozorenje i preskok.

Plan:

Dodati zasebni modul analitike za zajedničke izračune: implicirane vjerojatnosti, maržu tržišta, normalizirane/fair vjerojatnosti, neuravnoteženost tržišta i kvalitetu dostupnih podataka.

Za BTTS, Over 1.5, Over 2.5, kornere, Under 3.5 i kazneni udarac dodati posebne provjere: formu timova, sukob između forme i kvota, odstupanje favorizirane strane, ekstremne ili nepotpune kvote te razinu pouzdanosti.

Integrirati taj modul u postojeće rezultate tako da svaki izračun daje: PROLAZI, GRANIČNO ili PRESKOČI, uz konkretan razlog upozorenja.

Neće automatski proglašavati „varku kladionice” kao činjenicu; prikazivat će provjerljive signale rizika, primjerice neuobičajenu maržu, sukob podataka i asimetriju tržišta.

Sačuvati postojeća pravila i ručne unose, a novi filter koristiti kao dodatnu zaštitu, ne kao zamjenu za njih.napravi da preko apija sva polja za kvote budu automatski popumnjenja kad ucitam utakmicu dpbro proveri projekt.Za ispravno rješenje trebaju se zamijeniti dvije datoteke, ne samo jedna:

src/lib/football.functions.ts

bira kladionicu s najpotpunijim tržištima

provjerava da postoje obje strane tržišta (npr. Over i Under)

ne koristi nevažeće ili ekstremne vrijednosti kao signal

vraća naziv izvora kvota radi provjere

src/components/Utakmice.tsx

više ne koristi stari cache s pogrešnim kvotama

prikazuje upozorenje kada API nema dovoljno kvalitetne podatke

ponovno učitava formu i kvote za odabranu utakmicu.daj neki doar servis za tocno ucitavanje svih kvota koja su potrebna za svaki indikator

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://bet-insight-radar-13.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/dce425f8-509a-413a-a553-52955652ad9c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
