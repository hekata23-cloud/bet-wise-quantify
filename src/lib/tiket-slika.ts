/* ============================================================
   TIKET-SLIKA.TS — Share / Download Ticket (PNG exporter, v1)
   Generira stiliziranu PNG sliku tiketa na canvasu (bez
   vanjskih biblioteka) + dijeljenje preko Web Share API-ja
   kad je dostupan, inače preuzimanje datoteke.
   ============================================================ */
import type { KorpaTip } from "@/lib/korpa";
import { izracunajKorpuSmart } from "@/lib/korpa-smart";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function omotaj(ctx: CanvasRenderingContext2D, tekst: string, maxW: number): string[] {
  const rijeci = tekst.split(" ");
  const linije: string[] = [];
  let tren = "";
  for (const r of rijeci) {
    const proba = tren ? `${tren} ${r}` : r;
    if (ctx.measureText(proba).width > maxW && tren) {
      linije.push(tren);
      tren = r;
    } else tren = proba;
  }
  if (tren) linije.push(tren);
  return linije;
}

/** Nacrta tiket na canvas i vrati canvas (za testiranje ili daljnje korištenje). */
export function nacrtajTiket(tipovi: KorpaTip[], bankroll: number, kellyFrac: number): HTMLCanvasElement {
  const r = izracunajKorpuSmart(tipovi, { bankroll, kellyFrac });

  const W = 720;
  const pad = 36;
  const redH = 64;
  const H = 250 + tipovi.length * redH + 60;

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas nije dostupan");

  // pozadina
  ctx.fillStyle = "#0b0c10";
  ctx.fillRect(0, 0, W, H);
  // tanki glow border
  ctx.strokeStyle = "rgba(16,185,129,0.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, W - 16, H - 16);

  // header
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.fillText("ANDROMEDA AI — Tiket", pad, 64);
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillStyle = "#9ca3af";
  ctx.fillText(
    new Date().toLocaleString("hr-HR") + " · frakcijski Kelly · korelacijski motor",
    pad, 92,
  );

  // noge
  let y = 140;
  ctx.font = "bold 18px system-ui, sans-serif";
  tipovi.forEach((t, i) => {
    ctx.fillStyle = "rgba(16,185,129,0.18)";
    ctx.beginPath();
    ctx.roundRect(pad, y, W - 2 * pad, redH - 12, 10);
    ctx.fill();

    ctx.fillStyle = "#10b981";
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.fillText(`${i + 1}. ${t.sport.toUpperCase()}`, pad + 14, y + 24);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 17px system-ui, sans-serif";
    ctx.fillText(t.utakmica.slice(0, 44), pad + 14, y + 46);

    ctx.fillStyle = "#9ca3af";
    ctx.font = "14px system-ui, sans-serif";
    const opis = `${t.trziste}: ${t.tip} · model ${pct(t.vjerojatnost)}`;
    ctx.fillText(opis.slice(0, 46), pad + 14, y + 64 - 12);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px system-ui, monospace";
    ctx.textAlign = "right";
    ctx.fillText(t.kvota.toFixed(2), W - pad - 14, y + 44);
    ctx.textAlign = "left";

    y += redH;
  });

  // sažetak
  y += 6;
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.stroke();
  y += 34;

  const redovi: [string, string][] = [
    ["Ukupna kvota", r.kvota.toFixed(2)],
    ["Vjerojatnost (korelacijski korigirana)", pct(r.pKorigirana)],
    ["EV (korigirani)", `${r.edgeKorigirana >= 0 ? "+" : ""}${pct(r.edgeKorigirana)}`],
    ["Preporučeni ulog (Kelly)", `${r.ulogPerc.toFixed(2)}% = ${r.ulogIznos.toFixed(2)} €`],
  ];
  ctx.font = "17px system-ui, sans-serif";
  for (const [lijevo, desno] of redovi) {
    ctx.fillStyle = "#9ca3af";
    ctx.fillText(lijevo, pad, y);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 17px system-ui, monospace";
    ctx.textAlign = "right";
    ctx.fillText(desno, W - pad, y);
    ctx.textAlign = "left";
    ctx.font = "17px system-ui, sans-serif";
    y += 30;
  }

  // disclaimer
  ctx.fillStyle = "#6b7280";
  ctx.font = "12px system-ui, sans-serif";
  const disclaimer = omotaj(
    ctx,
    "Analitička procjena, ne jamstvo ishoda. Sadrži informacije — 18+. Odgovorno igranje.",
    W - 2 * pad,
  );
  disclaimer.forEach((l, i) => ctx.fillText(l, pad, H - 26 + i * 15));

  return c;
}

function canvasUFile(c: HTMLCanvasElement): Promise<File> {
  return new Promise((resolve, reject) => {
    c.toBlob((blob) => {
      if (!blob) { reject(new Error("PNG nije generiran")); return; }
      resolve(new File([blob], "andromeda-tiket.png", { type: "image/png" }));
    }, "image/png");
  });
}

/** Preuzmi PNG tiketa. */
export async function preuzmiTiket(tipovi: KorpaTip[], bankroll: number, kellyFrac: number): Promise<void> {
  const c = nacrtajTiket(tipovi, bankroll, kellyFrac);
  const f = await canvasUFile(c);
  const url = URL.createObjectURL(f);
  const a = document.createElement("a");
  a.href = url;
  a.download = f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Podijeli (Web Share API) ili preuzmi ako dijeljenje nije podržano. */
export async function podijeliTiket(tipovi: KorpaTip[], bankroll: number, kellyFrac: number): Promise<"podijeljeno" | "preuzeto"> {
  const c = nacrtajTiket(tipovi, bankroll, kellyFrac);
  const f = await canvasUFile(c);
  const nav = navigator as Navigator & { canShare?: (d: { files?: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [f] })) {
    await nav.share({ files: [f], title: "Andromeda AI — Tiket" });
    return "podijeljeno";
  }
  const url = URL.createObjectURL(f);
  const a = document.createElement("a");
  a.href = url;
  a.download = f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "preuzeto";
}
