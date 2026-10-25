import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Send,
  MessageCircle,
  Bot,
  User,
  Loader2,
  Trash2,
  Paperclip,
  FolderUp,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  Image as ImageIcon,
  FileText,
  FileArchive,
  File as FileIcon,
} from "lucide-react";
import { askAi, type ChatTurn } from "@/lib/ai-chat";
import { loadSniper, sniperActiveCount } from "@/lib/sniper";
import { loadTitan, titanActiveCount } from "@/lib/titan";
import { loadMastermind } from "@/lib/mastermind";
import { loadAntiError } from "@/lib/antierror";
import { loadJSON, saveJSON, hasKey } from "@/lib/storage";
import { toast } from "sonner";
import { processUploads, type ChatAttachment } from "@/lib/attachments";
import {
  createRecognizer,
  isVoiceSupported,
  speak,
  stopSpeaking,
  warmUpVoices,
  currentVoiceName,
  ASSISTANT_NAME,
  loadVoicePrefs,
} from "@/lib/voice";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: `Luna — AI chat mozak · Andromeda AI` },
      {
        name: "description",
        content:
          "Luna: glasovna hrvatska AI asistentica za predikcije. OpenRouter, Gemini, Groq i Hugging Face mozgovi.",
      },
      { property: "og:title", content: "Luna — AI chat mozak · Andromeda AI" },
      {
        property: "og:description",
        content: "Pričaj s Lunom na hrvatskom: oštri tipovi, Poisson, Kelly i analiza listića.",
      },
    ],
  }),
  component: ChatPage,
});

const KEY = "tm.chat.history";

function ChatPage() {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [processing, setProcessing] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [sniperCount, setSniperCount] = useState(0);
  const [antiOn, setAntiOn] = useState(false);
  const [titanCount, setTitanCount] = useState(0);
  const [mmOn, setMmOn] = useState(false);
  useEffect(() => {
    setSniperCount(sniperActiveCount(loadSniper()));
    setAntiOn(loadAntiError().enabled);
    setTitanCount(titanActiveCount(loadTitan()));
    setMmOn(loadMastermind().enabled);
  }, []);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ start: () => void; stop: () => void } | null>(null);

  useEffect(() => {
    setMessages(loadJSON<ChatTurn[]>(KEY, []));
    inputRef.current?.focus();
    warmUpVoices();
    if (loadVoicePrefs().autoSpeak) setVoiceMode(true);
  }, []);
  useEffect(() => {
    saveJSON(KEY, messages);
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setProcessing(true);
    try {
      const atts = await processUploads(files);
      setAttachments((prev) => [...prev, ...atts]);
      toast.success(`Dodano: ${atts.length} datoteka`);
    } catch (e) {
      toast.error("Greška pri obradi uploada: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = "";
      if (folderRef.current) folderRef.current.value = "";
    }
  }

  function removeAtt(id: string) {
    setAttachments((a) => a.filter((x) => x.id !== id));
  }

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if ((!text && attachments.length === 0) || loading) return;
    if (
      !hasKey("gemini") &&
      !hasKey("groq") &&
      !hasKey("openrouter") &&
      !hasKey("nvidia") &&
      !hasKey("huggingface")
    ) {
      toast.error("Postavi barem jedan AI ključ u Postavkama (OpenRouter je besplatan).");
      return;
    }
    const attSnapshot = attachments;
    const userTurn: ChatTurn = {
      role: "user",
      content: text || "(uploadao datoteke bez teksta)",
      ts: Date.now(),
      attachments: attSnapshot.map((a) => ({ name: a.name, kind: a.kind, path: a.path })),
    };
    setMessages((m) => [...m, userTurn]);
    setInput("");
    setAttachments([]);
    setLoading(true);
    try {
      const reply = await askAi(text, messages, attSnapshot, { voice: voiceMode });
      setMessages((m) => [...m, { role: "assistant", content: reply, ts: Date.now() }]);
      if (voiceMode) {
        setSpeaking(true);
        speak(reply, () => setSpeaking(false));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Greška");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function toggleMic() {
    if (!isVoiceSupported()) {
      toast.error("Ovaj preglednik ne podržava glasovni razgovor. Koristi Chrome ili Edge.");
      return;
    }
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = createRecognizer(
      (partial) => setInput(partial),
      (final) => {
        setInput(final);
        setListening(false);
        setTimeout(() => void send(final), 120);
      },
      (msg) => {
        toast.error("Mikrofon: " + msg);
        setListening(false);
      },
      () => setListening(false),
    );
    if (!rec) {
      toast.error("Ne mogu pokrenuti prepoznavanje govora.");
      return;
    }
    recRef.current = rec;
    setListening(true);
    stopSpeaking();
    rec.start();
  }

  function toggleVoiceMode() {
    const next = !voiceMode;
    setVoiceMode(next);
    if (!next) {
      stopSpeaking();
      setSpeaking(false);
    }
    toast(next ? "Glasovni način: uključen (govorim natrag)" : "Glasovni način: isključen");
    if (next) toast.message(`${ASSISTANT_NAME} govori glasom: ${currentVoiceName()}`);
  }

  function clearChat() {
    setMessages([]);
    saveJSON(KEY, []);
  }

  const suggestions = [
    "Daj mi tip za utakmice danas.",
    "Objasni mi Kelly kriterij za kvotu 2.1 i vjerojatnost 55%.",
    "Real vs Barca — što je pametniji tip, BTTS ili Over 2.5?",
    "Koje utakmice su uživo?",
    "Analiziraj ovaj kod (uploadaj ZIP ili mapu).",
    "Prepoznaj kvote na ovoj slici i daj mi tip.",
  ];

  const iconFor = (k: ChatAttachment["kind"]) =>
    k === "image" ? ImageIcon : k === "text" ? FileText : FileIcon;

  return (
    <div
      className="mx-auto max-w-4xl"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
      }}
    >
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: "var(--gradient-accent)" }}
          >
            <MessageCircle className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Luna — AI chat mozak</h1>
            <p className="text-sm text-muted-foreground">
              Zovi je Luna (ili Callisto) · ženski hrvatski glas · OpenRouter/Gemini/Groq/HF · upload slika, koda, ZIP-a i mapa
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mmOn && (
            <span className="rounded-lg border border-primary bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground">
              MASTERMIND v11
            </span>
          )}
          {sniperCount > 0 && (
            <span className="rounded-lg border border-primary/50 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
              Snajper v9: {sniperCount}
            </span>
          )}
          {titanCount > 0 && (
            <span className="rounded-lg border border-primary/50 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
              Titan v10: {titanCount}
            </span>
          )}
          {antiOn && (
            <span className="rounded-lg border border-primary/50 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
              ANTI-GREŠKA
            </span>
          )}
          <button
            onClick={toggleVoiceMode}
            title="Glasovni način (bot odgovara govorom)"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${voiceMode ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}
          >
            {voiceMode ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            {voiceMode ? "Glas: ON" : "Glas: OFF"}
          </button>
          {speaking && (
            <button
              onClick={() => {
                stopSpeaking();
                setSpeaking(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/20"
            >
              <VolumeX className="h-3.5 w-3.5" /> Stop
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
            >
              <Trash2 className="h-3.5 w-3.5" /> Obriši
            </button>
          )}
        </div>
      </header>

      <div className="rounded-2xl border border-border/60 bg-card">
        <div className="max-h-[60vh] min-h-[45vh] overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-10">
              <Bot className="mx-auto h-8 w-8 text-primary mb-3" />
              Pitaj me bilo što o predikcijama, kvotama, timovima, matematici iza tipova ili
              razvoju aplikacija. Možeš uploadati slike, kod, ZIP ili cijelu mapu — pa i pričati
              sa mnom na hrvatskom.
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div
                className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${m.role === "user" ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"}`}
              >
                {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div
                className={`prose prose-invert prose-sm max-w-[85%] rounded-2xl px-4 py-3 ${m.role === "user" ? "bg-accent/15 border border-accent/30" : "bg-secondary/60 border border-border"}`}
              >
                <ReactMarkdown>{m.content}</ReactMarkdown>
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 not-prose">
                    {m.attachments.map((a, k) => {
                      const Icon = iconFor(a.kind);
                      return (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 rounded-md bg-background/50 border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          <Icon className="h-3 w-3" /> {a.path}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-secondary/60 border border-border px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Razmišljam…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {attachments.length > 0 && (
          <div className="border-t border-border/60 px-3 py-2">
            <div className="flex flex-wrap gap-2">
              {attachments.map((a) => {
                const Icon =
                  a.kind === "image"
                    ? ImageIcon
                    : a.name.toLowerCase().endsWith(".zip")
                      ? FileArchive
                      : a.kind === "text"
                        ? FileText
                        : FileIcon;
                return (
                  <div
                    key={a.id}
                    className="group flex items-center gap-2 rounded-lg border border-border bg-secondary/60 pl-2 pr-1 py-1 text-xs"
                    title={a.path}
                  >
                    {a.kind === "image" && a.dataUrl ? (
                      <img
                        src={a.dataUrl}
                        alt={a.name}
                        className="h-8 w-8 rounded object-cover"
                      />
                    ) : (
                      <Icon className="h-4 w-4 text-primary" />
                    )}
                    <span className="max-w-[180px] truncate">{a.path}</span>
                    <button
                      onClick={() => removeAtt(a.id)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="border-t border-border/60 p-3">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            accept="*/*"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <input
            ref={folderRef}
            type="file"
            multiple
            className="hidden"
            // @ts-expect-error webkitdirectory nije u standardnom TS lib
            webkitdirectory=""
            directory=""
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <div className="flex items-end gap-2">
            <div className="flex flex-none flex-col gap-1">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={processing}
                title="Dodaj datoteke (slike, ZIP, kod, tekst)"
                className="inline-flex h-[22px] w-11 items-center justify-center rounded-lg border border-border bg-background/60 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => folderRef.current?.click()}
                disabled={processing}
                title="Uploadaj cijelu mapu"
                className="inline-flex h-[22px] w-11 items-center justify-center rounded-lg border border-border bg-background/60 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
              >
                <FolderUp className="h-3.5 w-3.5" />
              </button>
            </div>
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={
                listening
                  ? "🎙 Slušam… govori na hrvatskom"
                  : "Pitaj, priloži datoteke ili klikni mikrofon (HR govor)"
              }
              className="flex-1 resize-none rounded-xl border border-input bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={toggleMic}
              disabled={loading}
              title="Diktiraj (hrvatski)"
              className={`inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl border transition-colors ${listening ? "border-destructive/60 bg-destructive/20 text-destructive animate-pulse" : "border-border bg-background/60 text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              onClick={() => void send()}
              disabled={loading || (!input.trim() && attachments.length === 0)}
              className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-90"
              style={{ boxShadow: "var(--shadow-glow)" }}
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Tip: povuci i pusti datoteke bilo gdje u ovaj prozor. Slike vidi Gemini (vision),
            kod/tekst se ubacuje u kontekst, ZIP se raspakira, mapa se učitava rekurzivno.
          </p>
        </div>
      </div>
    </div>
  );
}