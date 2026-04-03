/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "T7SEN | Software Architect";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// --- HELPERS ---
async function fetchFont(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e) {
    return null;
  }
}

async function loadLocalImage(filename: string) {
  try {
    const filePath = join(process.cwd(), "public", filename);
    const buffer = await readFile(filePath);
    const base64 = buffer.toString("base64");
    return `data:image/png;base64,${base64}`;
  } catch (e) {
    console.warn(`Failed to load local image: ${filename}`, e);
    return null;
  }
}

export default async function Image() {
  const [fontBold, avatarData] = await Promise.all([
    fetchFont(
      "https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-Bold.ttf",
    ),
    loadLocalImage("Avatar.png"),
  ]);

  return new ImageResponse(
    <div
      tw="flex w-full h-full bg-black text-white relative items-center justify-center overflow-hidden"
      style={{ fontFamily: "JetBrains Mono" }}
    >
      {/* --- LAYER 1: CLEAN VOID --- */}
      {/* A subtle radial gradient to focus the eye, no color */}
      <div
        tw="absolute inset-0 flex"
        style={{
          background: "radial-gradient(circle at center, #111 0%, #000 80%)",
        }}
      />

      {/* Sharp Dot Grid */}
      <div
        tw="absolute inset-0 opacity-20 flex"
        style={{
          backgroundImage: "radial-gradient(#333 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      />

      {/* --- LAYER 2: CENTRAL IDENTITY --- */}
      <div tw="relative flex flex-row items-center gap-16 z-10">
        {/* Avatar: Clean & Sharp */}
        <div tw="relative w-64 h-64 flex items-center justify-center">
          {/* Decorative rotating bracket (Static) */}
          <div tw="absolute inset-0 border-2 border-white/10 rounded-full flex" />
          <div tw="absolute -inset-4 border border-green-500/30 rounded-full border-dashed flex" />

          {/* Main Image */}
          <div tw="w-56 h-56 rounded-full overflow-hidden border-4 border-black bg-black shadow-[0_0_0_4px_#22c55e] flex items-center justify-center">
            {avatarData ? (
              <img
                alt="OG_Img"
                src={avatarData}
                width="224"
                height="224"
                tw="w-full h-full object-cover"
              />
            ) : (
              <div tw="text-green-500 text-6xl font-bold flex">T7</div>
            )}
          </div>

          {/* Status Dot */}
          <div tw="absolute bottom-4 right-4 w-6 h-6 bg-green-500 rounded-full border-4 border-black flex" />
        </div>

        {/* Typography: Left Aligned, Bold */}
        <div tw="flex flex-col justify-center h-full">
          <div tw="flex items-center gap-3 mb-2">
            <div tw="px-2 py-1 bg-green-500 text-black text-xs font-bold tracking-widest flex">
              SYS_ADMIN
            </div>
            <div tw="text-gray-500 text-xs font-mono tracking-widest flex">
              // SAUDI_ARABIA
            </div>
          </div>

          <h1
            tw="text-9xl font-black text-white m-0 tracking-tighter leading-none flex"
            style={{ textShadow: "4px 4px 0px #22c55e" }}
          >
            T7SEN
          </h1>

          <div tw="h-1 w-24 bg-green-500 mt-6 mb-6 flex" />

          <p tw="text-3xl text-gray-300 font-bold tracking-tight flex m-0">
            Software Architect
          </p>

          <div tw="flex gap-4 mt-2 text-gray-500 font-mono text-sm">
            <span tw="flex">Next.js</span>
            <span tw="flex">•</span>
            <span tw="flex">React</span>
            <span tw="flex">•</span>
            <span tw="flex">CyberSec</span>
          </div>
        </div>
      </div>

      {/* --- LAYER 3: DECORATIVE CORNERS --- */}
      <div tw="absolute top-10 left-10 w-24 h-1 bg-white/20 flex" />
      <div tw="absolute top-10 left-10 w-1 h-24 bg-white/20 flex" />

      <div tw="absolute bottom-10 right-10 w-24 h-1 bg-green-500 flex" />
      <div tw="absolute bottom-10 right-10 w-1 h-24 bg-green-500 flex" />

      <div tw="absolute bottom-10 left-10 text-gray-600 font-mono text-xs flex">
        ID: 5ED6BCBB-F57B
      </div>
    </div>,
    {
      ...size,
      fonts: fontBold
        ? [
            {
              name: "JetBrains Mono",
              data: fontBold,
              style: "normal",
              weight: 700,
            },
          ]
        : undefined,
    },
  );
}
