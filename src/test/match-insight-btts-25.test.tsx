import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MatchInsightPanel } from "../components/MatchInsightPanel";
import { goalsAnaliza } from "../lib/goals-motor";

describe("MatchInsightPanel and Goals Cards robustness", () => {
  it("renders MatchInsightPanel cleanly with full odds", () => {
    const goals = goalsAnaliza({
      kvote: { bttsDa: 1.8, bttsNe: 2.0, o25: 1.9, u25: 1.95, "1": 2.1, X: 3.4, "2": 3.6 },
      formaDom: null,
      formaGost: null,
      brojKladionica: 3,
    });

    const html = renderToString(
      <MatchInsightPanel
        utakmica={{
          id: 12345,
          home: "Arsenal",
          away: "Chelsea",
          league: "Premier League",
          country: "England",
          time: "2026-10-26T20:00:00Z",
        }}
        kvote={{ bttsDa: 1.8, bttsNe: 2.0, o25: 1.9, u25: 1.95, "1": 2.1, X: 3.4, "2": 3.6 }}
        brojKladionica={3}
        goals={goals}
      />
    );

    expect(html).toContain("Arsenal — Chelsea");
    expect(html).toContain("SARP Core Predikcija");
  });

  it("renders MatchInsightPanel cleanly even when odds are completely missing", () => {
    const goals = goalsAnaliza({
      kvote: {},
      formaDom: null,
      formaGost: null,
      brojKladionica: 0,
    });

    const html = renderToString(
      <MatchInsightPanel
        utakmica={{
          id: 99999,
          home: "Dinamo Zagreb",
          away: "Hajduk Split",
          league: "HNL",
          country: "Croatia",
        }}
        kvote={{}}
        brojKladionica={0}
        goals={goals}
      />
    );

    expect(html).toContain("Dinamo Zagreb — Hajduk Split");
  });
});
