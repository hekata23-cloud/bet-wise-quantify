import { createServerFn } from "@tanstack/react-start";

export type StatusResult = {
  ok: boolean;
  message: string;
  account?: string | undefined;
  plan?: string | undefined;
  used?: number | undefined;
  limit?: number | undefined;
};

/**
 * Jedan jedini zahtjev prema /status (ne troši kvotu zahtjeva kod API-Football,
 * ali svejedno se poziva samo ručno, nikad automatski i nikad u petlji).
 */
export const testApiFootballKey = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string }) => {
    const key = (data?.key ?? "").trim();
    if (key.length < 10) throw new Error("Ključ izgleda prekratko.");
    return { key };
  })
  .handler(async ({ data }): Promise<StatusResult> => {
    let response: Response;
    try {
      response = await fetch("https://v3.football.api-sports.io/status", {
        headers: { "x-apisports-key": data.key },
      });
    } catch {
      return {
        ok: false,
        message: "Nije moguće doći do servisa. Provjeri internet i pokušaj ponovno za koju minutu.",
      };
    }

    if (response.status === 429) {
      return { ok: false, message: "Previše zahtjeva. Pričekaj minutu prije nove provjere." };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: "Ključ nije prihvaćen. Provjeri jesi li kopirao cijeli ključ." };
    }
    if (!response.ok) {
      return {
        ok: false,
        message: `Servis je vratio grešku (${response.status}). Pokušaj kasnije.`,
      };
    }

    const body = (await response.json()) as {
      errors?: unknown;
      response?: {
        account?: { firstname?: string; lastname?: string; email?: string };
        subscription?: { plan?: string; active?: boolean };
        requests?: { current?: number; limit_day?: number };
      };
    };

    const errors = body.errors;
    if (Array.isArray(errors) ? errors.length > 0 : errors && Object.keys(errors).length > 0) {
      const first = Array.isArray(errors)
        ? String(errors[0])
        : String(Object.values(errors as Record<string, unknown>)[0]);
      return { ok: false, message: first || "Ključ nije prihvaćen." };
    }

    const info = body.response;
    if (!info?.subscription) {
      return { ok: false, message: "Ključ nije prihvaćen." };
    }

    const name = [info.account?.firstname, info.account?.lastname].filter(Boolean).join(" ").trim();

    return {
      ok: true,
      message: "Ključ je ispravan i aktivan.",
      account: name || info.account?.email || undefined,
      plan: info.subscription.plan ?? undefined,
      used: info.requests?.current ?? undefined,
      limit: info.requests?.limit_day ?? undefined,
    };
  });
