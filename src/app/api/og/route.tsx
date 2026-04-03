/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server"; // FIX: Import NextRequest
import { readFile } from "node:fs/promises";
import { join } from "node:path";

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
    // Read directly from the project's public directory
    const filePath = join(process.cwd(), "public", filename);
    const buffer = await readFile(filePath);
    const base64 = buffer.toString("base64");
    return `data:image/png;base64,${base64}`;
  } catch (e) {
    console.warn(`Failed to load local image: ${filename}`, e);
    return null;
  }
}

// FIX: Change argument type to NextRequest
export async function GET(request: NextRequest) {
  try {
    // FIX: Use request.nextUrl instead of new URL(request.url)
    // This prevents the "Prerender Interrupted" build error.
    const { searchParams } = request.nextUrl;

    // --- CONFIG ---
    const title = (searchParams.get("title") || "SYSTEM")
      .toUpperCase()
      .slice(0, 15);
    const description = (
      searchParams.get("description") || "Authorized Personnel Only"
    ).slice(0, 80);
    const section = (searchParams.get("section") || "CORE").toUpperCase();

    // PARALLEL FETCH
    const [fontBold, fontRegular, avatarData] = await Promise.all([
      fetchFont(
        "https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-Bold.ttf",
      ),
      fetchFont(
        "https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-Regular.ttf",
      ),
      loadLocalImage("Avatar.png"),
    ]);

    const fonts =
      fontBold && fontRegular
        ? [
            {
              name: "JB Mono Bold",
              data: fontBold,
              weight: 700 as const,
              style: "normal" as const,
            },
            {
              name: "JB Mono",
              data: fontRegular,
              weight: 400 as const,
              style: "normal" as const,
            },
          ]
        : undefined;

    return new ImageResponse(
      <div
        tw="flex w-full h-full bg-black text-white relative overflow-hidden"
        style={{ fontFamily: "JB Mono Bold" }}
      >
        {/* Background: Subtle Diagonal Lines */}
        <div
          tw="absolute inset-0 opacity-10 flex"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, #333 0px, #333 1px, transparent 1px, transparent 10px)",
          }}
        />

        {/* MAIN CONTAINER */}
        <div tw="flex w-full h-full p-8 border-[16px] border-[#111]">
          <div tw="flex w-full h-full border border-white/10 bg-[#050505] relative overflow-hidden">
            {/* LEFT: CONTENT AREA */}
            <div tw="flex flex-col justify-between w-[65%] h-full p-12 border-r border-white/10 bg-black">
              {/* Header */}
              <div tw="flex items-center" style={{ gap: "12px" }}>
                <div tw="w-3 h-3 bg-green-500 flex" />
                <span tw="text-green-500 font-mono text-sm tracking-widest flex">
                  //{section}_PROTOCOL
                </span>
              </div>

              {/* Main Title */}
              <div tw="flex flex-col">
                <h1 tw="text-7xl text-white m-0 leading-none tracking-tighter flex mb-6">
                  {title}
                </h1>
                <div tw="h-1 w-full bg-gray-900 flex">
                  <div tw="h-full w-32 bg-green-500 flex" />
                </div>
              </div>

              {/* Description */}
              <p
                tw="text-2xl text-gray-400 font-normal m-0 leading-snug flex"
                style={{ fontFamily: "JB Mono" }}
              >
                {description}
              </p>

              {/* Footer Stats */}
              <div tw="flex gap-6 mt-4">
                <div tw="flex flex-col">
                  <span tw="text-[10px] text-gray-600 uppercase tracking-widest mb-1 flex">
                    Security
                  </span>
                  <span tw="text-sm text-green-500 flex">ENCRYPTED</span>
                </div>
                <div tw="flex flex-col">
                  <span tw="text-[10px] text-gray-600 uppercase tracking-widest mb-1 flex">
                    Latency
                  </span>
                  <span tw="text-sm text-white flex">12ms</span>
                </div>
              </div>
            </div>

            {/* RIGHT: IDENTITY AREA */}
            <div tw="flex flex-col w-[35%] h-full relative items-center justify-center bg-[#080808]">
              {/* Grid Pattern Right */}
              <div
                tw="absolute inset-0 opacity-20 flex"
                style={{
                  backgroundImage: "radial-gradient(#555 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              />

              {/* Avatar Container */}
              <div tw="relative w-48 h-48 mb-6 flex items-center justify-center">
                {/* Decorative Rings */}
                <div tw="absolute -inset-4 border-2 border-green-500/20 rounded-full flex" />

                {/* Main Image Mask */}
                <div tw="w-full h-full rounded-full overflow-hidden border-2 border-green-500 flex bg-black items-center justify-center">
                  {avatarData ? (
                    <img
                      alt={`OG_Img_${section}`}
                      src={avatarData}
                      width="192"
                      height="192"
                      tw="w-full h-full"
                      style={{ objectFit: "cover" }}
                    />
                  ) : (
                    // Fallback in case file read fails
                    <div tw="text-green-500 text-4xl font-bold flex">T7</div>
                  )}
                </div>
              </div>

              <div tw="flex flex-col items-center">
                <span tw="text-2xl font-bold text-white tracking-widest flex">
                  T7SEN
                </span>
                <span tw="text-xs text-green-500 font-mono mt-1 flex">
                  @ARCHITECT
                </span>
              </div>
            </div>

            {/* Decorative Corner Tab */}
            <div tw="absolute top-0 right-0 bg-green-500 text-black text-[10px] font-bold px-3 py-1 flex">
              SYS_V2
            </div>
          </div>
        </div>
      </div>,
      {
        width: 1200,
        height: 630,
        fonts: fonts,
      },
    );
  } catch (error) {
    console.error(error);
    return new Response("Failed to generate", { status: 500 });
  }
}
