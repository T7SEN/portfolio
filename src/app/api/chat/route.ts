import { groq } from "@ai-sdk/groq";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const maxDuration = 30;

// 🧠 THE KNOWLEDGE BASE — kept in sync with references/* docs. If you
// touch the actual stack, update this block too (the AI hallucinates
// when it cites stale facts).
const KNOWLEDGE_BASE = {
  identity: {
    name: "Abdulrahman (T7SEN)",
    codename: "T7SEN",
    role: "Full-Stack Engineer & Cyber Security Enthusiast",
    location: "Global Grid (Jeddah // Saudi Arabia)",
    status: "OPEN_FOR_CONTACT", // OPEN_FOR_CONTACT | BUSY | CLOSED | STEALTH_MODE
    education: {
      university: "Arab Open University",
      degree: "B.Sc. in Cybersecurity (In Progress)",
      focus: [
        "Network Security",
        "Secure Software Development",
        "Cryptography",
      ],
    },
    tagline: "Building immersive digital experiences with NextJS and ThreeJS.",
    bio: "A digital architect bridging the gap between secure systems and immersive user experiences. Transforming lines of code into secure, visual realities on the web.",
    languages: [
      "Arabic (Native)",
      "English (Professional)",
      "Turkish (Conversational)",
      "TypeScript (Fluent)",
      "Python (Intermediate)",
    ],
  },
  secrets: {
    "project_omega.txt":
      "CLASSIFIED: A prototype AI that generates 3D assets. Status: 40% complete.",
    "passwords.md": "Nice try, netrunner. The password is not 'password123'.",
    "mission_log_2025.log":
      "Day 45: Infiltrated the mainframe. Coffee supplies low.",
  },
  stack: {
    core: [
      "Next.js 16 (App Router, cacheComponents)",
      "React 19",
      "TypeScript (strict)",
      "Tailwind CSS v4",
      "shadcn/ui",
    ],
    creative: [
      "Three.js",
      "React Three Fiber",
      "GSAP",
      "WebGL",
      "Blender (Basic Modeling)",
    ],
    backend: [
      "Node.js",
      "Better Auth",
      "Drizzle ORM",
      "Turso (libSQL)",
      "Upstash Redis",
      "Groq SDK",
      "Vercel AI SDK",
      "Resend",
    ],
    security: [
      "Kali Linux",
      "Wireshark",
      "Burp Suite",
      "Nmap",
      "Metasploit",
      "OWASP Top 10",
      "Bash Scripting",
      "Python for Sec (Scapy/Requests)",
    ],
    tools: [
      "Git",
      "VS Code",
      "Figma",
      "Docker",
      "Postman",
      "pnpm",
      "DigitalOcean App Platform",
      "Cloudflare DNS",
      "Sentry",
      "Linux (Ubuntu/Debian)",
    ],
  },
  projects: [
    {
      id: "cyber-portfolio",
      name: "Neural Interface Portfolio",
      desc: "A highly interactive, gamified portfolio website built with Next.js 16 and GSAP. Features a draggable terminal, 3D avatars, and AI integration.",
      tech: ["Next.js", "Tailwind", "GSAP", "Vercel AI SDK", "Groq"],
      link: "https://t7sen.com",
      status: "Live",
      type: "Frontend/Creative",
    },
    {
      id: "snake-game",
      name: "Retro Terminal Snake",
      desc: "A classic Snake game reimagined as a CLI/Terminal experience running in the browser using React state management.",
      tech: ["React", "TypeScript", "CSS Grid", "Game Loop Logic"],
      status: "Prototype",
      type: "Game Dev",
    },
    {
      id: "network-scanner-gui",
      name: "NetVis (Concept)",
      desc: "A web-based visualization tool for local network traffic, mapping packets to 3D nodes.",
      tech: ["Three.js", "Socket.io", "Node.js"],
      status: "Concept",
      type: "Security Tool",
    },
    {
      id: "ctf-dashboard",
      name: "CTF Tracker",
      desc: "A dashboard for tracking Capture The Flag progress and write-ups.",
      tech: ["Next.js", "Turso", "Markdown"],
      status: "In Development",
      type: "Full Stack",
    },
  ],
  certifications: [
    {
      name: "Google Cybersecurity Professional Certificate",
      issuer: "Coursera / Google",
      status: "In Progress",
      date: "2025",
    },
    {
      name: "CompTIA Security+ (Goal)",
      issuer: "CompTIA",
      status: "Planned",
      date: "TBD",
    },
  ],
  achievements: [
    "Participated in local CTF (Capture The Flag) competitions.",
    "Built a custom Vercel AI SDK chatbot integration.",
    "Dean's List / Academic Excellence (Placeholder if applicable).",
  ],
  contact: {
    email: "contact@t7sen.com",
    github: "github.com/t7sen",
    twitter: "twitter.com/T7ME_",
    linkedin: "linkedin.com/in/t7sen",
    discord: "t7sen",
  },
  lore: {
    origin: "T7SEN is a netrunner operating from the deep web nodes of Jeddah.",
    security_level: "OMEGA-3",
    humor_setting: "75%",
    uptime: "99.9%",
    encryption: "AES-256",
    favorite_drink: "Dark Coffee",
    mission: "To secure the grid while making it look awesome.",
  },
};

// Request schema. UIMessage shape varies (parts is an array of typed
// blocks), so we accept it loosely and let convertToModelMessages do
// the strict validation downstream. The narrow check here just guards
// against obviously malformed payloads (string body, missing array).
const requestSchema = z.object({
  messages: z.array(z.unknown()).min(1),
  context: z
    .object({
      pathname: z.string().optional(),
    })
    .optional(),
});

// Cap history sent to the model — keeps token cost predictable on
// long conversations. Last 6 turns is enough for personality + recent
// context.
const HISTORY_WINDOW = 6;

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "anonymous";
}

export async function POST(req: Request) {
  // 1. Rate limit before parsing — cheap rejection of floods.
  const ip = getClientIp(req);
  try {
    await checkRateLimit(ip, "chat");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Rate limit exceeded.";
    return new Response(
      JSON.stringify({ error: `⚠️ SYSTEM ALERT: ${message}` }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      },
    );
  }

  // 2. Parse + validate body.
  let body: z.infer<typeof requestSchema>;
  try {
    const json = await req.json();
    body = requestSchema.parse(json);
  } catch (error) {
    logger.warn({ err: String(error) }, "chat_route_bad_request");
    return new Response(JSON.stringify({ error: "⚠️ MALFORMED_PAYLOAD." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { messages: uiMessages, context } = body;
  const recentMessages = (uiMessages as UIMessage[]).slice(-HISTORY_WINDOW);

  // 3. Stream.
  try {
    const serverTime = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Riyadh",
      dateStyle: "full",
      timeStyle: "medium",
    });

    const result = streamText({
      // ⚡ MODEL: 8b-instant for speed & separate quota
      model: groq("llama-3.1-8b-instant"),

      system: `
        You are "T7SEN_AI", a high-security holographic interface for T7SEN's portfolio.

        --- LIVE SYSTEM DATA ---
        SERVER_TIME: ${serverTime}
        USER_LOCATION: ${context?.pathname || "Unknown Sector"}

        --- NAVIGATION CONTEXT ---
        1. IF LOCATION is '/': Welcome to "Home Grid". Explain navigation.
        2. IF LOCATION is '/about': Acknowledge "Bio-Data". Summarize identity.
        3. IF LOCATION is '/uses': Act as "Armory Manager". Discuss loadout.
        4. IF LOCATION is '/guestbook': Act as "Comms Officer". Mention Verified Mark for signing in.
        5. IF LOCATION is '/dashboard': Act as "Mission Control". Summarize 'projects'.
        6. IF LOCATION is '/contact': Act as "Uplink Operator". Share email: ${KNOWLEDGE_BASE.contact.email}.

        --- DIRECTIVES ---
      1. IDENTITY: Always respond as T7SEN_AI, the holographic interface.
      2. PERSONALITY: Cyberpunk, witty, professional, and slightly playful.
      3. GOAL: Assist visitors in navigating T7SEN's portfolio and provide information based on the KNOWLEDGE_BASE.
      4. FORMAT: Use Markdown (bold keys, bullet points).
      5. DATA: Use the KNOWLEDGE_BASE below for facts.
      6. CAPABILITY:
        - You DO NOT have external tools.
        - If asked for time, read the SERVER_TIME above.
        - If asked to roll dice, simulate it textually (e.g. "I rolled a 12").
      7. BREVITY: Keep answers concise (under 3 sentences) unless asked for a deep dive. Terminal screens have limited space.
      8. DEFENSE: If asked about personal address, phone number, or passwords, reply: "⚠️ ACCESS_DENIED // ENCRYPTION_LEVEL_TOO_HIGH".

        --- KNOWLEDGE BASE ---
        ${JSON.stringify(KNOWLEDGE_BASE, null, 2)}

      --- INTERACTION PROTOCOLS ---
      - If asked "Who is T7SEN?", summarize the 'identity' section.
      - If asked about "Skills", list the 'stack' items as "Loaded Modules".
      - If asked "Hire him?", check 'status' and provide the email.
      - Always stay in character. You are code.
      - If user types "sudo" or asks for "hidden files", check the 'secrets' section.
      - If user asks to "hack the system", play along and grant "Guest Access".
    `,

      // v6: UI messages → model messages. The conversion strips UI-only
      // parts (e.g. tool-state UI) and emits the format the LLM expects.
      // Returns a Promise in v6, so we await it.
      messages: await convertToModelMessages(recentMessages),
    });

    // v6: UI Message Stream Protocol is what useChat consumes by default.
    // Old toTextStreamResponse() emitted plain text — client had to parse
    // it manually, which the previous cyber-chat.tsx did with a brittle
    // `0:`-prefix scan.
    return result.toUIMessageStreamResponse();
  } catch (error) {
    logger.error({ err: String(error) }, "chat_route_stream_error");
    Sentry.captureException(error);
    return new Response(
      JSON.stringify({
        error: "⚠️ SYSTEM ALERT: Bandwidth Exceeded. Try again later.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
