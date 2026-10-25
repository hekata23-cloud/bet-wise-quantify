import type { LanguageDef } from "../types";

// Catalog of languages the platform teaches. The `speechTag` powers text-to-speech
// for the listening and shadowing modules; codes double as course ids.
export const LANGUAGES: LanguageDef[] = [
  {
    code: "en",
    name: "English",
    nativeName: "English",
    flag: "🇬🇧",
    speechTag: "en-US",
    blurb: "The global lingua franca — media, business and travel.",
  },
  {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    flag: "🇪🇸",
    speechTag: "es-ES",
    blurb: "Spoken by 500M+ people across Spain and Latin America.",
  },
  {
    code: "fr",
    name: "French",
    nativeName: "Français",
    flag: "🇫🇷",
    speechTag: "fr-FR",
    blurb: "The language of diplomacy, cuisine and francophone Africa.",
  },
  {
    code: "de",
    name: "German",
    nativeName: "Deutsch",
    flag: "🇩🇪",
    speechTag: "de-DE",
    blurb: "Europe's engineering and academic powerhouse.",
  },
  {
    code: "ja",
    name: "Japanese",
    nativeName: "日本語",
    flag: "🇯🇵",
    speechTag: "ja-JP",
    blurb: "Three scripts, rich politeness levels, anime and business alike.",
  },
  {
    code: "ko",
    name: "Korean",
    nativeName: "한국어",
    flag: "🇰🇷",
    speechTag: "ko-KR",
    blurb: "Hangul's logical alphabet makes it famously learnable.",
  },
];

export const LANGUAGE_BY_CODE: Record<string, LanguageDef> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l]),
);

export function getLanguage(code: string): LanguageDef | undefined {
  return LANGUAGE_BY_CODE[code];
}
