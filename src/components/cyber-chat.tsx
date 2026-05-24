"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Send,
  Cpu,
  X,
  Sparkles,
  Zap,
  Mic,
  MicOff,
  Terminal,
  Loader2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSfx } from "@/hooks/use-sfx";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import ReactMarkdown from "react-markdown";
import { usePathname } from "next/navigation";
import { HackerText } from "@/components/ui/hacker-text";
import * as Sentry from "@sentry/nextjs";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

// --- TYPES ---
interface SpeechRecognitionResult {
  [index: number]: { transcript: string };
  isFinal: boolean;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onerror:
    | ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void)
    | null;
  onresult:
    | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void)
    | null;
}

interface IWindow extends Window {
  SpeechRecognition?: { new (): SpeechRecognition };
  webkitSpeechRecognition?: { new (): SpeechRecognition };
}

const SUGGESTED_ACTIONS = [
  { label: "Identify", action: "Who are you?" },
  { label: "Tech Stack", action: "What is your stack?" },
  { label: "Projects", action: "Show me projects." },
  { label: "Contact", action: "How do I reach T7SEN?" },
];

// Persist under a versioned key — the v6 UIMessage shape ({id, role,
// parts: [{type, text}]}) is incompatible with the old {id, role,
// content} shape, so we deliberately don't migrate.
const HISTORY_KEY = "t7sen_chat_history_v2";

// Pull plain text out of a UIMessage's parts array. Used for TTS,
// ReactMarkdown rendering, and the message bubble fallback.
function messageText(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function makeTextMessage(role: "user" | "assistant", text: string): UIMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    parts: [{ type: "text", text }],
  };
}

export function CyberChat() {
  const pathname = usePathname();
  const { play } = useSfx();
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [input, setInput] = useState("");

  // ⚡ VOICE INPUT STATE
  const [isListening, setIsListening] = useState(false);
  const [isVoiceLoading, setIsVoiceLoading] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // ⚡ AUDIO OUTPUT STATE (TTS)
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    voicesRef.current = voices;
  }, [voices]);

  // ⚡ PERSISTENCE STATE
  const [isClient, setIsClient] = useState(false);

  // HACK MODE
  const [hackMode, setHackMode] = useState(false);

  // ⚡ TTS FUNCTION — reads from refs so the useChat onFinish closure
  // doesn't go stale across renders.
  const speak = useCallback((text: string) => {
    if (isMutedRef.current || typeof window === "undefined") return;

    // Clean text (remove Markdown symbols)
    const cleanText = text.replace(/[*#`]/g, "");

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);

    const preferredVoice = voicesRef.current.find(
      (v) =>
        v.name.includes("Google US English") ||
        v.name.includes("Zira") ||
        v.name.includes("Samantha"),
    );

    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 0.8;

    window.speechSynthesis.speak(utterance);
  }, []);

  // Memoize the transport so useChat doesn't tear it down per render.
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    [],
  );

  const { messages, setMessages, sendMessage, status, stop } = useChat({
    // Stable id avoids Math.random() during SSR, which trips Next 16's
    // cacheComponents prerender guard (Cyber Chat is mounted in the
    // root layout and therefore renders into /_not-found as well).
    id: "cyber-chat-default",
    transport,
    onFinish: ({ message }) => {
      play("success");
      speak(messageText(message));
    },
    onError: (err) => {
      console.error(err);
      Sentry.captureException(err);
      setMessages((prev) => [
        ...prev,
        makeTextMessage("assistant", "ERR: CONNECTION_LOST"),
      ]);
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  // 1. LOAD VOICES
  useEffect(() => {
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
    };
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // 2. LOAD HISTORY FROM STORAGE
  useEffect(() => {
    setIsClient(true);
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as UIMessage[];
        // Defensive: only hydrate if shape matches.
        if (
          Array.isArray(parsed) &&
          parsed.every((m) => Array.isArray(m.parts))
        ) {
          setMessages(parsed);
        }
      } catch (e) {
        console.error("Failed to load chat history", e);
      }
    }
    // setMessages is stable from useChat; intentionally omit from deps
    // to mirror the original mount-only effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3. SAVE HISTORY TO STORAGE — fires on every message tick, including
  // mid-stream chunks. Cheap (a few KB JSON.stringify) and means a
  // refresh during streaming still saves what we had.
  useEffect(() => {
    if (!isClient) return;
    if (messages.length > 0) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
    } else {
      localStorage.removeItem(HISTORY_KEY);
    }
  }, [messages, isClient]);

  // 4. BOOT MESSAGE — only when chat opens with empty history.
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      let bootText = "SYSTEM_ONLINE... WAITING_FOR_INPUT.";
      if (pathname === "/guestbook")
        bootText = "COMMS_STATION_ACTIVE. SIGN_IN_TO_LEAVE_TRACE.";
      else if (pathname === "/about")
        bootText = "BIO_DATABASE_ACCESSED. READY_FOR_QUERIES.";
      else if (pathname === "/uses")
        bootText = "ARMORY_ONLINE. LOADOUT_READY_FOR_INSPECTION.";
      else if (pathname === "/contact")
        bootText = "UPLINK_OPERATOR_ACTIVE. READY_FOR_COMMUNICATION.";

      setMessages([
        {
          id: "boot",
          role: "assistant",
          parts: [{ type: "text", text: bootText }],
        },
      ]);
    }
    // setMessages is stable; pathname/isOpen drive boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, messages.length, pathname]);

  // --- VOICE INPUT TOGGLE ---
  const toggleVoice = async () => {
    if (typeof window === "undefined") return;

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
        play("click");
      }
      return;
    }

    setIsVoiceLoading(true);

    try {
      const win = window as unknown as IWindow;
      const SpeechRecognitionConstructor =
        win.SpeechRecognition || win.webkitSpeechRecognition;

      if (!SpeechRecognitionConstructor) {
        alert("Voice input is not supported in this browser.");
        setIsVoiceLoading(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        alert("Microphone access blocked.");
        setIsVoiceLoading(false);
        return;
      }

      const recognition = new SpeechRecognitionConstructor();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
        setIsVoiceLoading(false);
        play("hover");
      };
      recognition.onend = () => {
        setIsListening(false);
        setIsVoiceLoading(false);
      };
      recognition.onerror = () => {
        setIsListening(false);
        setIsVoiceLoading(false);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const resultsArray = Array.from(
          event.results as unknown as SpeechRecognitionResult[],
        );
        const transcript = resultsArray
          .map((result) => result[0].transcript)
          .join("");
        setInput(transcript);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsVoiceLoading(false);
      alert("Voice failed to initialize.");
    }
  };

  useGSAP(() => {
    if (isOpen && containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        {
          scale: 0,
          opacity: 0,
          x: -40,
          y: 100,
          transformOrigin: "bottom left",
        },
        {
          scale: 1,
          opacity: 1,
          x: 0,
          y: 0,
          duration: 0.6,
          ease: "elastic.out(1, 0.75)",
        },
      );
    }
  }, [isOpen]);

  useEffect(() => {
    const handleOpen = () => {
      if (!isOpen) {
        play("click");
        setIsOpen(true);
      }
    };
    window.addEventListener("open-ai-chat", handleOpen);
    return () => window.removeEventListener("open-ai-chat", handleOpen);
  }, [isOpen, play]);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Handle a submit — either intercept slash commands (synthetic
  // messages, no network) or delegate to useChat.sendMessage.
  const submitText = (text: string) => {
    if (!text.trim() || isLoading) return;

    play("click");
    setInput("");
    window.speechSynthesis.cancel(); // Stop current speech

    if (text.startsWith("/")) {
      const command = text.toLowerCase().trim();

      // /clear is destructive — wipe and bail.
      if (command === "/clear") {
        setMessages([]);
        play("success");
        return;
      }

      // Echo the user command, then schedule a synthetic assistant
      // reply on a short delay (matches the original 500ms cadence).
      const userMsg = makeTextMessage("user", text);
      setMessages((prev) => [...prev, userMsg]);

      setTimeout(() => {
        let response = "";
        if (command === "/hack") {
          setHackMode(true);
          response =
            "⚠️ INTRUSION DETECTED. BYPASSING FIREWALL... ACCESS GRANTED.";
          play("error");
          setTimeout(() => setHackMode(false), 5000);
        } else if (command === "/help") {
          response =
            "**COMMANDS:**\n- `/clear`: Purge Logs\n- `/time`: Local Time";
        } else if (command === "/time") {
          response = `**LOCAL_TIME:** ${new Date().toLocaleTimeString()}`;
        } else {
          response = `⚠️ **ERR:** UNKNOWN_COMMAND "${text}".`;
        }

        const botMsg = makeTextMessage("assistant", response);
        setMessages((prev) => [...prev, botMsg]);

        if (command !== "/hack") speak(response);
        play("hover");
      }, 500);
      return;
    }

    // Real model call. Pathname context flows through the per-call
    // body — the server route reads it for navigation-aware system
    // prompts.
    sendMessage({ text }, { body: { context: { pathname } } });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitText(input);
  };
  const handleChipClick = (action: string) => {
    submitText(action);
  };
  const closeChat = () => {
    play("click");
    // Cancel any in-flight stream so closing the chat doesn't leak it.
    if (isLoading) stop();
    gsap.to(containerRef.current, {
      scale: 0,
      opacity: 0,
      x: -40,
      y: 100,
      duration: 0.3,
      ease: "back.in(1)",
      onComplete: () => setIsOpen(false),
    });
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed bottom-24 left-4 md:left-55 z-50 w-[90vw] md:w-95 h-125 flex flex-col overflow-hidden rounded-2xl border border-primary/20 shadow-2xl bg-background/80 backdrop-blur-xl supports-backdrop-filter:bg-background/60 dark:shadow-[0_0_40px_-10px_rgba(var(--primary-rgb),0.3)] transition-colors duration-300",
      )}
    >
      {hackMode && (
        <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center font-mono text-green-500 pointer-events-none">
          <Terminal className="h-16 w-16 mb-4 animate-pulse text-green-500" />
          <div className="text-2xl font-bold tracking-widest animate-bounce">
            ACCESSING MAINFRAME
          </div>
          <div className="absolute top-0 left-0 w-full h-1 bg-green-500 animate-scanline" />
        </div>
      )}

      {/* HEADER */}
      <div className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b border-primary/10 bg-primary/5 px-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 shadow-[0_0_10px_rgba(var(--primary),0.1)]">
            <Cpu className="h-5 w-5 text-primary animate-pulse" />
            <div className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background animate-ping" />
            <div className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold tracking-widest text-foreground font-mono">
              <HackerText text="AI_NET_LINK" />
            </span>
            <span className="text-[10px] text-primary font-mono uppercase tracking-widest opacity-80">
              Neural Link Active
            </span>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setIsMuted(!isMuted);
              play("click");
              window.speechSynthesis.cancel();
            }}
            className="p-2 rounded-full hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary"
            title={isMuted ? "Unmute Voice" : "Mute Voice"}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={closeChat}
            className="p-2 rounded-full hover:bg-destructive/10 transition-colors group"
          >
            <X className="h-5 w-5 text-muted-foreground group-hover:text-destructive transition-colors" />
          </button>
        </div>
      </div>

      {/* MESSAGES */}
      <div
        ref={scrollRef}
        className="relative z-10 flex-1 overflow-y-auto p-4 space-y-6 font-sans text-sm scrollbar-hide"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center space-y-4 opacity-60">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
              <div className="relative h-16 w-16 rounded-2xl bg-linear-to-tr from-primary/20 to-secondary/20 border border-primary/20 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">
                System Online
              </p>
              <p className="text-xs text-muted-foreground max-w-55">
                &quot;Ask me about T7SEN&apos;s tech stack, projects, or
                experience.&quot;
              </p>
            </div>
          </div>
        )}
        {messages.map((m) => {
          const text = messageText(m);
          return (
            <div
              key={m.id}
              className={cn(
                "flex flex-col max-w-[85%]",
                m.role === "user" ? "ml-auto items-end" : "items-start",
              )}
            >
              <div
                className={cn(
                  "relative px-4 py-3 text-sm shadow-sm backdrop-blur-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm"
                    : "bg-card border border-border/50 text-card-foreground rounded-2xl rounded-tl-sm shadow-md",
                )}
              >
                {m.role === "user" ? (
                  text
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none font-mono text-xs">
                    <ReactMarkdown
                      components={{
                        p: ({ ...props }) => (
                          <p
                            className="mb-2 last:mb-0 leading-relaxed"
                            {...props}
                          />
                        ),
                        ul: ({ ...props }) => (
                          <ul
                            className="list-disc pl-4 mb-2 space-y-1"
                            {...props}
                          />
                        ),
                        li: ({ ...props }) => (
                          <li className="text-primary/90" {...props} />
                        ),
                        strong: ({ ...props }) => (
                          <strong
                            className="text-primary font-bold tracking-wide"
                            {...props}
                          />
                        ),
                        code: ({ ...props }) => (
                          <code
                            className="bg-black/50 text-green-400 px-1 py-0.5 rounded border border-green-900/30 text-[10px]"
                            {...props}
                          />
                        ),
                      }}
                    >
                      {text}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground/60 mt-1.5 px-1 font-mono uppercase">
                {m.role === "user" ? "YOU" : "T7SEN_AI"}
              </span>
            </div>
          );
        })}
        {isLoading && (
          <div className="flex items-start ml-2">
            <div className="bg-card border border-border/50 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce delay-75" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce delay-150" />
            </div>
          </div>
        )}
      </div>

      {/* SUGGESTIONS */}
      <div className="px-3 pb-2 pt-2 flex gap-2 overflow-x-auto scrollbar-hide">
        {SUGGESTED_ACTIONS.map((chip) => (
          <button
            key={chip.label}
            onClick={() => handleChipClick(chip.action)}
            disabled={isLoading}
            className="shrink-0 px-3 py-1 text-[10px] font-mono border border-primary/20 rounded-full bg-primary/5 text-primary hover:bg-primary/20 hover:border-primary/50 transition-all active:scale-95 whitespace-nowrap"
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* INPUT */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 p-3 bg-background/50 backdrop-blur-md border-t border-primary/10"
      >
        <div className="relative flex items-center gap-2">
          <input
            className="flex-1 bg-muted/40 border border-transparent hover:border-primary/20 focus:border-primary/50 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 focus:bg-background transition-all"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isListening
                ? "Listening..."
                : "Enter command use /help for list of commands..."
            }
            autoFocus
          />

          <Button
            type="button"
            size="icon"
            onClick={toggleVoice}
            disabled={isVoiceLoading}
            className={cn(
              "h-10 w-10 rounded-xl transition-all border border-transparent",
              isListening
                ? "bg-red-500/20 text-red-500 border-red-500/50 animate-pulse hover:bg-red-500/30"
                : "bg-muted/40 text-muted-foreground hover:text-primary hover:bg-primary/10",
            )}
          >
            {isVoiceLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isListening ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>

          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim()}
            className={cn(
              "h-10 w-10 rounded-xl transition-all",
              input.trim()
                ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.3)] hover:scale-105"
                : "bg-muted/40 text-muted-foreground hover:bg-muted",
            )}
          >
            {isLoading ? (
              <Zap className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
