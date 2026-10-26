// ============================================================
// ORION.TSX — Sekundarni AI agent: Data & Taktički Analitičar
// Vlastito lebdeće sučelje — ne dira /chat ni Luninu logiku.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { Send, ScanEye, X, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { askAi, type ChatTurn } from "@/lib/ai-chat";
import {
  ucitajKontekstMeca,
  izgradiKontekstTekst,
  ucitajKontekstTiketa,
  izgradiTiketTekst,
} from "@/lib/ai-context";
import { loadJSON, saveJSON, hasKey } from "@/lib/storage";
import {
  ORION_BRZI_UPITI,
  SPORT_PREDLOŠCI,
  formatOrionResponse,
  runQuantAnalytics,
} from "@/lib/botovi";

const KEY = "andromeda.orion.history";

export function Orion() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mecNaziv, setMecNaziv] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendingRef = useRef(false);
  const sendRef = useRef<(text?: string) => Promise<void>>(async () => {});

  useEffect(() => {
    const osvjezi = () => setMecNaziv(ucitajKontekstMeca()?.naslov ?? null);
    osvjezi();
    window.addEventListener("andromeda:mec-kontekst", osvjezi);
    return () => window.removeEventListener("andromeda:mec-kontekst", osvjezi);
  }, []);

  // Auto-analiza listića: Virtualna kladionica / Korpa postave pitanje u
  // localStorage ("pc.orion.pitanje") i pošalju događaj — Orion se otvori
  // i pitanje pošalje JEDNOM (ključ se odmah briše).
  useEffect(() => {
    const autoPitanje = () => {
      let q: string | null = null;
      try {
        q = window.localStorage.getItem("pc.orion.pitanje");
      } catch {
        q = null;
      }
      if (!q) return;
      try {
        window.localStorage.removeItem("pc.orion.pitanje");
      } catch {
        /* ignoriraj */
      }
      setOpen(true);
      // Čitaj najnoviju funkciju slanja; efekt se registrira samo jednom i
      // njegova izvorna send funkcija inače bi zadržala zastarjele poruke.
      setTimeout(() => {
        void sendRef.current(q!);
      }, 120);
    };
    autoPitanje();
    window.addEventListener("andromeda:orion-pitanje", autoPitanje);
    return () => window.removeEventListener("andromeda:orion-pitanje", autoPitanje);
  }, []);

  useEffect(() => {
    // Stari zapisi "Prazan odgovor" (iz pokvarene verzije) se ne učitavaju.
    setMessages(
      loadJSON<ChatTurn[]>(KEY, []).filter(
        (t) => t.content?.trim() && !/^prazan odgovor$/i.test(t.content.trim()),
      ),
    );
  }, []);
  useEffect(() => {
    saveJSON(KEY, messages.slice(-40));
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  async function send(text?: string) {
    const poruka = (text ?? input).trim();
    if (!poruka || sendingRef.current) return;
    // Orion radi hibridno: ako ima API ključ koristi AI + matematiku, a ako nema koristi lokalni kvantitativni engine
    const hasAnyKey =
      hasKey("gemini") ||
      hasKey("groq") ||
      hasKey("openrouter") ||
      hasKey("nvidia") ||
      hasKey("huggingface");
    if (!hasAnyKey && messages.length === 0) {
      toast.info("Orion: Kvantitativni matematički engine aktivan (Dixon-Coles & Monte Carlo).");
    }
    sendingRef.current = true;
    const korisnik: ChatTurn = { role: "user", content: poruka, ts: Date.now() };
    const nova = [...messages, korisnik];
    setMessages(nova);
    setInput("");
    setLoading(true);
    try {
      // Prva poruka nosi punu personu; ostale kratki podsjetnik.
      // Match Engine kontekst (SARP/λ/MC/SGP/live) se automatski ubrizgava.
      const kontekst = ucitajKontekstMeca();
      const tiket = ucitajKontekstTiketa();
      const blok = kontekst ? `\n\n${izgradiKontekstTekst(kontekst)}` : "";
      const blokTiket = tiket ? `\n\n${izgradiTiketTekst(tiket)}` : "";
      const poslano = `${poruka}${blok}${blokTiket}`;
      let odgovor = (
        await askAi(
          poslano,
          nova
            .slice(0, -1)
            .filter(
              (t) => t.content && t.content.trim() && !/^prazan odgovor$/i.test(t.content.trim()),
            ),
          [],
          { agent: "orion" },
        )
      ).trim();
      if (!odgovor || /^prazan odgovor$/i.test(odgovor)) {
        odgovor = formatOrionResponse(runQuantAnalytics(poruka, mecNaziv));
      }
      setMessages((m) => [...m, { role: "assistant", content: odgovor, ts: Date.now() }]);
    } catch {
      const fallback = formatOrionResponse(runQuantAnalytics(poruka, mecNaziv));
      setMessages((m) => [...m, { role: "assistant", content: fallback, ts: Date.now() }]);
    } finally {
      sendingRef.current = false;
      setLoading(false);
    }
  }

  sendRef.current = send;

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-card shadow-xl shadow-black/40 transition-transform hover:scale-105"
        title="ORION — Data & Taktički Analitičar"
        aria-label="Orion"
      >
        <ScanEye className="h-5 w-5 text-sky-400" />
      </button>

      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex h-[560px] max-h-[75vh] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl shadow-black/50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/60 bg-card/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <ScanEye className="h-4 w-4 text-sky-400" />
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  ORION
                  {mecNaziv && (
                    <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-sky-300">
                      MEC: {mecNaziv.length > 24 ? mecNaziv.slice(0, 24) + "…" : mecNaziv}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Data & Taktički Analitičar · tip → edge → matematika
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => {
                  setMessages([]);
                  saveJSON(KEY, []);
                }}
                className="rounded-lg p-1.5 hover:bg-muted/60"
                title="Novi razgovor"
                aria-label="Novi razgovor"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 hover:bg-muted/60"
                aria-label="Zatvori"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Poruke */}
          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <div className="space-y-2 pt-2">
                <p className="px-1 text-xs text-muted-foreground">
                  Orion daje prvo{" "}
                  <span className="font-semibold text-sky-400">tip + sigurnost % + edge</span>, pa
                  Poisson/Dixon-Coles, Monte Carlo, Kelly i entropiju. Bez čavrljanja.
                </p>
                {[...ORION_BRZI_UPITI, SPORT_PREDLOŠCI.kosarka.template].map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className="block w-full rounded-lg border border-border/50 bg-card/50 px-3 py-2 text-left text-[11px] hover:border-sky-500/40 hover:bg-sky-500/5"
                  >
                    {p.length > 90 ? p.slice(0, 90) + "…" : p}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-sm bg-primary/15"
                      : "rounded-bl-sm border border-border/40 bg-card/60"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Orion analizira podatke…
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Unos */}
          <div className="flex items-end gap-2 border-t border-border/60 bg-card/40 px-3 py-2.5">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Pitaj Oriona: tip, edge, taktika, kvote…"
              className="max-h-24 flex-1 resize-none rounded-xl border border-border/60 bg-background px-3 py-2 text-xs outline-none focus:border-sky-500/50"
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white transition hover:bg-sky-500 disabled:opacity-40"
              aria-label="Pošalji"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
