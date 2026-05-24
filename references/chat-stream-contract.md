# Chat Stream Contract — `/api/chat` ↔ `cyber-chat.tsx`

Companion to SKILL.md "Subsystems → AI chat". The chat is built on the
Vercel AI SDK v6: the server emits the **UI Message Stream Protocol** via
`toUIMessageStreamResponse()`, and the client consumes it through
`useChat` from `@ai-sdk/react`. There is no hand-parsed wire format
anymore — the protocol coupling is owned by the SDK.

What still needs care is the local UX layer the SDK doesn't manage:
client-side `/` commands, `localStorage` persistence, pathname-aware
boot text, TTS, voice input, and the hackMode overlay. Those wrap
`useChat`; preserve them when refactoring.

---

## The two sides

| Side   | File                                                                | Symbol                              |
| ------ | ------------------------------------------------------------------- | ----------------------------------- |
| Server | [`src/app/api/chat/route.ts`](../src/app/api/chat/route.ts)         | `POST` handler                      |
| Client | [`src/components/cyber-chat.tsx`](../src/components/cyber-chat.tsx) | `CyberChat::submitText` + `useChat` |

The wire format is the AI SDK v6 UI Message Stream Protocol. As long as
the server returns `toUIMessageStreamResponse()` and the client uses
`useChat` with the default transport, the two sides stay aligned by the
SDK. Don't reach inside the protocol.

---

## Request shape

`useChat` posts to `/api/chat` with:

```jsonc
{
  "id": "cyber-chat-default",
  "messages": [
    {
      "id": "...",
      "role": "user" | "assistant",
      "parts": [{ "type": "text", "text": "..." }]
    },
    ...
  ],
  "context": { "pathname": "/about" }
}
```

- **`messages` is the v6 `UIMessage[]` shape** — each message has a
  `parts` array of typed blocks, not a flat `content` string. Plain
  chats only use `{ type: "text", text }` parts; tool calls / file
  parts / reasoning parts are unused here but the shape supports them.
- **`id` is a stable string (`"cyber-chat-default"`)** — passed
  explicitly to `useChat({ id })` so the hook doesn't fall back to
  `Math.random()` at mount time. That matters because `<CyberChat />`
  is mounted in the root layout and renders into every prerendered
  page, including `/_not-found` — Next 16's `cacheComponents: true`
  flags `Math.random()` during prerender as a bail-out.
- **`context.pathname`** is the current route. The server uses it to
  switch the system prompt persona (`/about` → "Bio-Data", `/uses` →
  "Armory Manager", etc.). It's passed per-call via the second
  argument's `body`:
  ```ts
  sendMessage({ text }, { body: { context: { pathname } } });
  ```
  Capturing pathname in the render closure means route changes update
  it on the next send.
- **Zod-validated** server-side — see "Server pipeline" below.
- **No auth** — the chat is unauthenticated by design.
- **Rate-limited** — IP-based, `"chat"` bucket in
  [`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts) (10 req / 60 s,
  60 s block). Tighter than `core` because Groq calls cost money.

---

## Server pipeline

```ts
// src/app/api/chat/route.ts (shape, not literal)
export const maxDuration = 30; // function timeout in seconds

const requestSchema = z.object({
  messages: z.array(z.unknown()).min(1),
  context: z.object({ pathname: z.string().optional() }).optional(),
});

const HISTORY_WINDOW = 6;

export async function POST(req: Request) {
  await checkRateLimit(getClientIp(req), "chat");
  const { messages: uiMessages, context } = requestSchema.parse(await req.json());
  const recent = (uiMessages as UIMessage[]).slice(-HISTORY_WINDOW);

  const result = streamText({
    model: groq("llama-3.1-8b-instant"),
    system: /* KNOWLEDGE_BASE + serverTime + context.pathname */,
    messages: await convertToModelMessages(recent),
  });

  return result.toUIMessageStreamResponse();
}
```

Key facts:

- **Model:** Groq `llama-3.1-8b-instant` via `@ai-sdk/groq`. Auto-reads
  `GROQ_API_KEY` from the environment — no explicit wiring; a missing
  key fails at request time, not boot time.
- **`convertToModelMessages` is async in v6.** It returns a `Promise`;
  forgetting the `await` is a hard type-check failure.
- **System prompt is assembled per request from three sources:**
  1. The inline `KNOWLEDGE_BASE` object — T7SEN's `identity`, `stack`,
     `projects`, `certifications`, `achievements`, `contact`, `secrets`,
     and `lore`. JSON-stringified into the prompt verbatim. Keep
     aligned with `package.json` and SKILL.md when the stack moves.
  2. `SERVER_TIME` in Asia/Riyadh timezone.
  3. `context.pathname` — drives the location-aware persona block.
- **History budget:** the last `HISTORY_WINDOW = 6` messages are sent
  to Groq. Older history stays in the client's `useChat` state and
  `localStorage` but is excluded from the model context — keeps token
  cost predictable on long conversations.
- **Directives** in the system prompt: stay in character as
  "T7SEN_AI", keep answers under 3 sentences by default, refuse PII
  requests with `⚠️ ACCESS_DENIED // ENCRYPTION_LEVEL_TOO_HIGH`,
  simulate dice rolls textually, treat `sudo` / "hidden files"
  prompts as a trigger to surface the `secrets` section.
- **Response:** `result.toUIMessageStreamResponse()` — the AI SDK v6
  UI Message Stream Protocol that `useChat` consumes by default.

### Server error path

```ts
try { /* rate limit */ } catch (e) { return 429 with Retry-After: 60 }
try { /* parse + validate */ } catch (e) { logger.warn(...); return 400 }
try { /* stream */ } catch (e) {
  logger.error({ err: String(e) }, "chat_route_stream_error");
  Sentry.captureException(e);
  return 500;
}
```

Three distinct failure modes, three distinct status codes. Rate-limit
failures don't hit Sentry (they're expected); validation and stream
failures do. The client's `onError` handler appends a synthetic
`"ERR: CONNECTION_LOST"` assistant message for any of them.

---

## Client pipeline

`CyberChat` in [cyber-chat.tsx](../src/components/cyber-chat.tsx) wraps
`useChat` with the SDK's `DefaultChatTransport`:

```ts
const transport = useMemo(
  () => new DefaultChatTransport({ api: "/api/chat" }),
  [],
);

const { messages, setMessages, sendMessage, status, stop } = useChat({
  id: "cyber-chat-default",
  transport,
  onFinish: ({ message }) => {
    play("success");
    speak(messageText(message));
  },
  onError: (err) => {
    Sentry.captureException(err);
    setMessages((prev) => [
      ...prev,
      makeTextMessage("assistant", "ERR: CONNECTION_LOST"),
    ]);
  },
});

const isLoading = status === "submitted" || status === "streaming";
```

`submitText(text)` handles three paths:

### Path 1 — Client-side `/` commands (bypass the server)

Messages starting with `/` are intercepted before `sendMessage`:

| Command                         | Effect                                                         |
| ------------------------------- | -------------------------------------------------------------- |
| `/clear`                        | `setMessages([])`; removes the `localStorage` key              |
| `/hack`                         | Sets `hackMode = true` for 5 s — renders the intrusion overlay |
| `/help`                         | Lists available commands                                       |
| `/time`                         | Renders `new Date().toLocaleTimeString()`                      |
| anything else starting with `/` | `⚠️ ERR: UNKNOWN_COMMAND "<text>"`                             |

Synthetic user + assistant messages are injected via `useChat`'s
`setMessages` on a 500 ms delay to mimic round-trip cadence. These
never hit `/api/chat`. Adding a new command goes here; do **not** push
command parsing to the server.

### Path 2 — Streaming chat

```ts
sendMessage({ text }, { body: { context: { pathname } } });
```

That's it. `useChat` handles request construction, stream parsing,
incremental `messages` updates, `status` transitions, and the
`onFinish` / `onError` callbacks. The last assistant message's `parts`
array grows in place as chunks arrive; the same `messages.map(...)`
render renders the streaming text char-by-char.

### Path 3 — Error fallback

```ts
onError: (err) => {
  Sentry.captureException(err);
  setMessages((prev) => [
    ...prev,
    makeTextMessage("assistant", "ERR: CONNECTION_LOST"),
  ]);
};
```

Any server error (400 / 429 / 500 / network) lands here. The client
reports to Sentry alongside the server's own capture for 500s — so
prod errors get both sides of the stack.

---

## Helper: `messageText(m: UIMessage): string`

A small utility that flattens a `UIMessage`'s `parts` array down to a
plain string by filtering for text parts. Used for TTS, ReactMarkdown
rendering, and the user-bubble fallback. Any non-text part type (tool
calls, files, reasoning) is silently dropped — if you start emitting
those server-side, extend this helper or render parts explicitly.

```ts
function messageText(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}
```

---

## Client state surface

| Surface                                               | Purpose                                                                                                                                                                                                                                                   |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `localStorage['t7sen_chat_history_v2']`               | Persists `useChat`'s `messages` (`UIMessage[]`) across sessions; `setMessages([])` removes the key. The `_v2` suffix marks the v6 shape (`{id, role, parts}`) — older `_v1` keys are not migrated.                                                        |
| `useChat({ id: "cyber-chat-default" })`               | Stable chat id, required for SSR determinism (see "Request shape" above)                                                                                                                                                                                  |
| `window.speechSynthesis` (TTS)                        | Speaks assistant replies on `onFinish` unless muted; selects a Google US / Zira / Samantha voice if available; strips Markdown (`\* # \``) before speaking                                                                                                |
| `SpeechRecognition` / `webkitSpeechRecognition` (STT) | Voice input via the mic button; requests `mediaDevices.getUserMedia` for permission before starting, stops the captured tracks immediately, then starts the recognizer                                                                                    |
| Custom event `'open-ai-chat'`                         | External components can `window.dispatchEvent(new Event('open-ai-chat'))` to pop the chat — the command menu uses this                                                                                                                                    |
| Pathname-aware boot text                              | First-open assistant message varies by `usePathname()`: `/guestbook`, `/about`, `/uses`, `/contact` each have a custom greeting; other paths get `SYSTEM_ONLINE... WAITING_FOR_INPUT.` Injected via `setMessages` when the chat opens with empty history. |
| `hackMode`                                            | 5-second overlay triggered by `/hack` — renders an `ACCESSING MAINFRAME` curtain over the chat                                                                                                                                                            |
| `stop()` on close                                     | `closeChat` calls `useChat`'s `stop()` if a stream is in flight so closing the panel doesn't leak the request                                                                                                                                             |

GSAP is used twice: `useGSAP` for the elastic-pop open animation and a
raw `gsap.to` for the close. The close path is the only place in this
file that uses raw GSAP outside `useGSAP` — it runs inside an event
handler and `useGSAP` doesn't fit there. Both animations target
`containerRef.current`.

---

## Why the stable `id` matters

`<CyberChat />` is mounted in the root layout (`src/app/layout.tsx`),
so it renders into every page in the tree — including statically
prerendered routes like `/_not-found`, `/`, `/about`, etc. The `useChat`
hook runs unconditionally (before the `if (!isOpen) return null;`
early-return), so SSR / prerender goes through it.

`useChat` without an `id` generates one via `Math.random()`. Next 16's
`cacheComponents: true` mode treats `Math.random()` during prerender as
a non-deterministic side effect and bails the page out with
`NEXT_PRERENDER_RANDOM_CLIENT`. The fix is to give the hook a stable
id — the only chat instance in the app is the one in the root layout,
so a static string (`"cyber-chat-default"`) is fine.

Don't move `<CyberChat />` into a per-page component just to work
around this — the floating chat is intentionally global.

---

## Resolved tech debt (was: Known tech debt before the migration)

The previous version of this doc tracked the hand-parsed protocol and
several adjacent issues. After the migration:

| #   | Issue                                                                 | Status                                                                          |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | `recentMessages = messages.slice(-6)` was dead code                   | Fixed — now actually passed to `streamText` via `convertToModelMessages`        |
| 2   | `KNOWLEDGE_BASE` stale facts (Next 15, Framer, Supabase…)             | Fixed — aligned with current `package.json` and SKILL.md                        |
| 3   | No rate limit on `/api/chat`                                          | Fixed — new `"chat"` bucket in `src/lib/rate-limit.ts`, 10/min                  |
| 4   | No Zod validation on request body                                     | Fixed — `requestSchema` validates `messages` array shape and `context.pathname` |
| 5   | Server used raw `console.error`                                       | Fixed — uses `@/lib/logger`                                                     |
| 6   | No `Sentry.captureException` server-side                              | Fixed — captured inside the stream catch                                        |
| 7   | `eslint-disable @typescript-eslint/no-unused-vars` masking unused `z` | Fixed — disable removed, `z` is now used                                        |
| 8   | `@ai-sdk/react` installed but unused                                  | Fixed — client uses `useChat`                                                   |
| 9   | Manual `0:`-prefix parser in client                                   | Fixed — `useChat` owns the wire format                                          |
| 10  | `Message.id` sent to server (v6 wants `CoreMessage` shape)            | Fixed — `convertToModelMessages` handles the conversion                         |

---

## Refusal triggers

Push back — with rationale — on any change that:

- Switches the server back to `toTextStreamResponse()` (or any other
  non-UI-message-stream response) without simultaneously moving the
  client off `useChat`. The pairing is load-bearing.
- Moves `<CyberChat />` out of the root layout without checking that
  the chat is still accessible from every route the command menu can
  open it from.
- Removes the stable `id` on `useChat` — the prerender will bail on
  `/_not-found` again.
- Removes the `convertToModelMessages` `await` — types break and the
  Promise would land in the model input as `[object Promise]`.
- Adds a new client-side command by sending it to the server. Commands
  belong in the `if (text.startsWith("/"))` branch.
- Adds a feature to the chat without keeping the rate limit on the
  route — Groq calls cost real money.
- Migrates the `_v2` localStorage key without a real reason. The shape
  jump from `{id, role, content}` to `UIMessage` already justified one
  rename; further churn invalidates returning users' history.

---

## See also

- SKILL.md "Subsystems" → "AI chat"
- AGENTS.md "Critical rules"
- [`redis-and-rate-limiting.md`](./redis-and-rate-limiting.md) — for
  the `checkRateLimit` pattern the chat route uses
- Source: [`src/app/api/chat/route.ts`](../src/app/api/chat/route.ts),
  [`src/components/cyber-chat.tsx`](../src/components/cyber-chat.tsx),
  [`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts)
