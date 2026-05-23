# Chat Stream Contract — `/api/chat` ↔ `cyber-chat.tsx`

Companion to SKILL.md "Subsystems → AI chat" and "Landmines → #1". The chat is
the most fragile contract in the repo: a Vercel AI SDK v6 server route paired
with a client component that does **not** use `@ai-sdk/react`'s `useChat`.
SKILL.md calls this "hand-parsed"; strictly speaking, only the **client** is
hand-parsed — the server uses the SDK's built-in `toTextStreamResponse()`. The
two sides are coupled by an undocumented wire format. Change one side without
the other and the chat renders empty messages with no error.

---

## The two sides

| Side   | File                                                                | Symbol                   |
| ------ | ------------------------------------------------------------------- | ------------------------ |
| Server | [`src/app/api/chat/route.ts`](../src/app/api/chat/route.ts)         | `POST` handler           |
| Client | [`src/components/cyber-chat.tsx`](../src/components/cyber-chat.tsx) | `CyberChat::sendMessage` |

If you change either side's wire format without updating the other in the same
change, the browser shows an empty assistant bubble. The network tab confirms
the response arrived; the client's parser silently produces `botContent === ''`
and `setMessages` overwrites the last assistant message with empty content.
There is no error to triage.

---

## Request shape

The client `fetch`es `POST /api/chat` with:

```jsonc
{
  "messages": [{ "id": "...", "role": "user" | "assistant", "content": "..." }, ...],
  "context": { "pathname": "/about" }
}
```

- **No Zod validation** on either field. The server trusts the client shape
  verbatim. `z` is imported in `route.ts` but never used (see Known tech debt).
- **No auth** — the chat is unauthenticated by design.
- **No rate limit** — see Known tech debt.

The client appends the current user message to the existing `messages` array
on every request, so each call sends the full session history.

---

## Server pipeline

```ts
// src/app/api/chat/route.ts
export const maxDuration = 30 // Vercel function timeout in seconds

export async function POST(req: Request) {
  const { messages, context } = await req.json()

  const serverTime = new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Riyadh',
    dateStyle: 'full',
    timeStyle: 'medium',
  })

  // Dead code — never passed to streamText. See Known tech debt #1.
  const recentMessages = messages.slice(-6)

  const result = streamText({
    model: groq('llama-3.1-8b-instant'),
    system: /* KNOWLEDGE_BASE + serverTime + context.pathname */,
    messages, // ← full history, not `recentMessages`
  })

  return result.toTextStreamResponse()
}
```

Key facts:

- **Model:** Groq `llama-3.1-8b-instant` via `@ai-sdk/groq`. Auto-reads
  `GROQ_API_KEY` from the environment — no explicit wiring; a missing key
  fails at request time, not boot time.
- **System prompt is assembled per request from three sources:**
  1. The inline `KNOWLEDGE_BASE` object — T7SEN's `identity`, `stack`,
     `projects`, `certifications`, `achievements`, `contact`, `secrets`, and
     `lore`. JSON-stringified into the prompt verbatim.
  2. `SERVER_TIME` in Asia/Riyadh timezone.
  3. `context.pathname` — drives a location-aware persona: "Home Grid" on
     `/`, "Bio-Data" on `/about`, "Armory Manager" on `/uses`, "Comms
     Officer" on `/guestbook`, "Mission Control" on `/dashboard`, "Uplink
     Operator" on `/contact`. Other paths get the default persona.
- **Directives** in the system prompt instruct the model to: stay in
  character as "T7SEN_AI", keep answers under 3 sentences by default, refuse
  PII requests with `⚠️ ACCESS_DENIED // ENCRYPTION_LEVEL_TOO_HIGH`, simulate
  dice rolls textually, treat `sudo` / "hidden files" prompts as a trigger
  to surface the `secrets` section.
- **History budget:** intended to be `messages.slice(-6)` (last 3 user + 3
  assistant) but the trimmed array is **never used** — `streamText` receives
  the unsliced `messages`. See Known tech debt #1.
- **Response:** `result.toTextStreamResponse()` emits the AI SDK v6 Data
  Stream Protocol (see "Wire format" below).
- **No Sentry capture** — see Known tech debt #6.

### Server error path

```ts
} catch (error) {
  console.error('AI API Error:', error)
  return new Response(
    JSON.stringify({ error: '⚠️ SYSTEM ALERT: Bandwidth Exceeded. Try again later.' }),
    { status: 429, headers: { 'Content-Type': 'application/json' } },
  )
}
```

Every server-side failure (Groq error, network, model timeout, bad input)
returns `429` with the same body. The client maps the non-OK status to its
own generic `ERR: CONNECTION_LOST`, so the bandwidth message is never
rendered. Errors do not reach Sentry from the server — only the client's
catch reports them.

---

## Wire format — the coupling point

`streamText().toTextStreamResponse()` emits the **Vercel AI SDK v6 Data Stream
Protocol**: newline-separated lines, each starting with a single-character
type tag followed by `:` and a JSON-encoded payload. The text channel is `0`:

```
0:"Hello "
0:"there"
0:"!"
```

Other channels exist in the protocol (`d:` for finish reason, `e:` for error
events, `t:` for tool calls, etc.) — this chat consumes **only** the `0`
channel. Any other prefixed line is appended as raw text by the client's
forgiving fallback, which is graceful-degradation, not a correct
implementation of the rest of the protocol.

`0:` is the load-bearing token. Removing it from the parser (or changing the
server to emit a different prefix) silently breaks the chat.

---

## Client pipeline

`CyberChat::sendMessage` in [cyber-chat.tsx](../src/components/cyber-chat.tsx)
handles three distinct paths.

### Path 1 — Client-side `/` commands (bypass the server)

Messages starting with `/` are intercepted before any fetch and resolved
locally on a 500 ms `setTimeout` to mimic a server round-trip:

| Command                         | Effect                                                         |
| ------------------------------- | -------------------------------------------------------------- |
| `/clear`                        | Purges `messages` state and `localStorage`                     |
| `/hack`                         | Sets `hackMode = true` for 5 s — renders the intrusion overlay |
| `/help`                         | Lists available commands                                       |
| `/time`                         | Renders `new Date().toLocaleTimeString()`                      |
| anything else starting with `/` | `⚠️ ERR: UNKNOWN_COMMAND "<text>"`                             |

These never hit `/api/chat`. Adding a new command goes here; do **not** push
command parsing to the server.

### Path 2 — Streaming chat (the contract)

```ts
const response = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messages: [...messages, userMessage],
    context: { pathname },
  }),
});

if (!response.ok) throw new Error(response.statusText);

const reader = response.body?.getReader();
const decoder = new TextDecoder();
let botContent = "";
let buffer = "";

const parseLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  if (trimmed.startsWith("0:")) {
    try {
      const jsonStr = trimmed.slice(2);
      if (jsonStr.startsWith('"')) botContent += JSON.parse(jsonStr);
      else botContent += jsonStr;
    } catch {
      botContent += trimmed.slice(2);
    }
  } else {
    botContent += trimmed;
  }
};

while (true) {
  const { done, value } = await reader.read();
  if (done) {
    if (buffer.trim()) parseLine(buffer);
    break;
  }
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? ""; // last (incomplete) line stays in buffer
  for (const line of lines) parseLine(line);
  // re-render the last assistant message with botContent so far
}
```

Robustness properties of the parser that are deliberate and load-bearing:

- **Chunks are buffered across `read()` calls.** A `0:"hel` split across two
  TCP frames doesn't lose the `lo"` half — the partial line is held in
  `buffer` until the next read.
- **The last (incomplete) line is held in the buffer**, not flushed
  prematurely. `lines.pop()` is what protects against mid-line splits.
- **`0:` lines whose payload is not JSON-quoted are appended raw.** Defensive
  fallback for non-conforming chunks.
- **`JSON.parse` failures on `0:` lines fall back to raw-append.** Same
  intent.
- **Non-`0:` lines are appended verbatim.** Graceful degradation if the
  server ever switches to plain text.
- **The progressive `setMessages` update inside the loop** is what makes the
  reply stream visually char-by-char rather than appearing all at once.

Removing the buffer, the `lines.pop()`, or the `parseLine` fallback branches
will produce intermittent character-loss bugs that surface only under network
chunking — they will not reproduce on localhost.

### Path 3 — Error fallback

```ts
} catch (error) {
  console.error(error)
  Sentry.captureException(error)
  setMessages((prev) => [
    ...prev,
    { id: 'error', role: 'assistant', content: 'ERR: CONNECTION_LOST' },
  ])
}
```

Server-returned `429` triggers `!response.ok` and lands here. The client
logs to Sentry (the only side that does); the server does not.

---

## Client state surface

| Surface                                               | Purpose                                                                                                                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `localStorage['t7sen_chat_history']`                  | Persists `messages` across sessions; `setMessages([])` removes the key                                                                                                                 |
| `window.speechSynthesis` (TTS)                        | Speaks assistant replies unless muted; selects a Google US / Zira / Samantha voice if available; strips Markdown (`\* # \``) before speaking                                           |
| `SpeechRecognition` / `webkitSpeechRecognition` (STT) | Voice input via the mic button; requests `mediaDevices.getUserMedia` for permission before starting, stops the captured tracks immediately, then starts the recognizer                 |
| Custom event `'open-ai-chat'`                         | External components can `window.dispatchEvent(new Event('open-ai-chat'))` to pop the chat — the command menu uses this                                                                 |
| Pathname-aware boot text                              | First-open assistant message varies by `usePathname()`: `/guestbook`, `/about`, `/uses`, `/contact` each have a custom greeting; other paths get `SYSTEM_ONLINE... WAITING_FOR_INPUT.` |
| `hackMode`                                            | 5-second overlay triggered by `/hack` — renders an `ACCESSING MAINFRAME` curtain over the chat                                                                                         |

GSAP is used twice: `useGSAP` for the elastic-pop open animation and a raw
`gsap.to` for the close. The close path is the only place in this file that
uses raw GSAP outside `useGSAP` — it runs inside an event handler and
`useGSAP` doesn't fit there. Both animations target `containerRef.current`.

---

## Known tech debt

Some of these are flagged in SKILL.md "Known tech debt"; others surfaced
writing this doc. None block today's chat from working; all are worth fixing
before the next non-trivial chat change.

| #   | Issue                                                                                                                                                                                                                                            | Severity | Notes                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`recentMessages = messages.slice(-6)` is dead code.**                                                                                                                                                                                          | High     | Either fix (`messages: recentMessages`) or delete the line. Long histories silently send the entire log to Groq each turn — token / latency cost grows with the session.                                                                                                                        |
| 2   | **`KNOWLEDGE_BASE` has stale facts.** Claims "Next.js 15" (actual 16.2.2), "Framer Motion" (not installed), "PostgreSQL / Supabase / Prisma / tRPC" (none in `package.json`).                                                                    | High     | T7SEN_AI gives visitors wrong stack info today. Realign against `package.json` and `SKILL.md` "Stack and versions" — and consider extracting to a typed source-of-truth so it stops drifting from reality.                                                                                      |
| 3   | **No rate limit on `/api/chat`.** AGENTS.md requires `checkRateLimit` on every user-facing write; chat is user-facing and burns paid Groq quota on each call.                                                                                    | High     | Add a `chat` rate-limit type (or reuse `core`). The IP-based limit pattern in `@/lib/rate-limit` applies — see `redis-and-rate-limiting.md`.                                                                                                                                                    |
| 4   | **No Zod validation on the request body.** Server trusts `messages` and `context.pathname` shape verbatim. `z` is imported but never used.                                                                                                       | Med      | The unused `z` import looks like an abandoned TODO. Wire a schema (`messages: array of { id, role: 'user' \| 'assistant', content }`, `context: { pathname: string }`) and remove the `eslint-disable`. Malformed input currently crashes `streamText` and falls through to the catch as a 429. |
| 5   | **Server uses raw `console.error`**, not `@/lib/logger`.                                                                                                                                                                                         | Low      | AGENTS.md mandates the logger. One-line swap.                                                                                                                                                                                                                                                   |
| 6   | **No `Sentry.captureException` server-side.** Errors only reach Sentry via the client's catch — with the client's stack, not the server's.                                                                                                       | Med      | Add `Sentry.captureException(error)` inside the route's `catch`.                                                                                                                                                                                                                                |
| 7   | **`/* eslint-disable @typescript-eslint/no-unused-vars */`** at the top of both files masks real unused vars: `z` in `route.ts`; the destructured `node` in the markdown `components` props and the `permErr` catch binding in `cyber-chat.tsx`. | Low      | Either use `z` for #4 above, or remove the import. For client unused vars, rename to `_node` / `_permErr` per the convention. Then drop the disable.                                                                                                                                            |
| 8   | **`@ai-sdk/react` is installed but unused.** SKILL.md flags this. The migration to `useChat` is the canonical fix for the coupling described above.                                                                                              | Med      | See "Migration path" below.                                                                                                                                                                                                                                                                     |
| 9   | **The `Message` type sends `id` to the server**, but AI SDK v6's `streamText` expects `CoreMessage` shape (`{ role, content }`). The extra `id` field is silently ignored today, but if the SDK ever tightens its input shape this breaks.       | Low      | Strip `id` before sending: `messages.map(({ role, content }) => ({ role, content }))`.                                                                                                                                                                                                          |

---

## Migration path — the `useChat` swap

`@ai-sdk/react@^3.0.147` is already in `package.json`. `useChat` consumes the
Data Stream Protocol natively — the server side already emits it. A migration
would:

1. **Verify the wire format end-to-end.** `streamText().toTextStreamResponse()`
   is documented to emit the protocol `useChat` consumes. Confirm against the
   AI SDK v6 changelog before swapping — minor versions have shifted the
   default protocol in the past.
2. **Replace the manual reader loop** in `sendMessage` with `useChat`'s
   `messages` / `append` / `setMessages` / `isLoading` API. The `parseLine`,
   `buffer`, and `lines.pop()` block all delete.
3. **Keep the client-side `/` command pre-handler outside `useChat`.**
   `useChat` has no notion of client-only commands; intercept before
   `append()`.
4. **Keep the `localStorage` persistence.** Use `useChat({ initialMessages })`
   to hydrate, and a `useEffect` on `messages` to write back. The
   `'t7sen_chat_history'` key contract stays.
5. **Keep the pathname-aware boot message.** Runs in the same `useEffect`
   that fires on open today; calls `setMessages` from `useChat`.
6. **Plumb `context.pathname` through `useChat`'s `body` option.** Today
   the body is rebuilt on each send; with `useChat` it's:
   ```ts
   useChat({ api: "/api/chat", body: { context: { pathname } } });
   ```
   Note that `pathname` is captured at hook-mount time — passing it via the
   render closure ensures route changes update it.
7. **Strip `id` from messages on the way out** (Known tech debt #9).

This is the canonical fix for the silent-empty-render risk. Until it lands,
the rule is: any change to the `/api/chat` response shape needs a matching
change to the parser in the same commit.

---

## Refusal triggers

Push back — with rationale — on any change that:

- Alters the `/api/chat` response shape (model swap to a non-AI-SDK
  transport, custom encoding, JSON-per-request instead of streaming) without
  updating the parser in `cyber-chat.tsx` in the same commit.
- Updates the parser to expect a non-`0:` prefix without first verifying the
  server emits it.
- Migrates to `useChat` without preserving the client-side `/` commands,
  `localStorage` persistence, pathname-aware boot, and `context.pathname`
  body plumbing — those are not part of `useChat` and need to be wired
  alongside.
- Removes the `buffer` / `lines.pop()` pattern in the parser. Network
  chunking will splice characters mid-line, and the buffer is the only
  protection against it.
- Adds a new client-side command by sending it to the server. Commands
  belong in the `if (text.startsWith('/'))` branch.
- Adds a feature to the chat without rate-limiting the route (Known tech
  debt #3 should be fixed first).

---

## See also

- SKILL.md "Subsystems" → "AI chat"
- SKILL.md "Landmines" #1 — "The AI chat stream is hand-parsed"
- SKILL.md "Known tech debt" — "Hand-rolled chat streaming"
- AGENTS.md "Critical rules" — "The AI chat stream is hand-parsed"
- [`redis-and-rate-limiting.md`](./redis-and-rate-limiting.md) — for the
  `checkRateLimit` pattern that Known tech debt #3 wants to apply here
- Source: [`src/app/api/chat/route.ts`](../src/app/api/chat/route.ts),
  [`src/components/cyber-chat.tsx`](../src/components/cyber-chat.tsx)
