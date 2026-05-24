import { withSentryConfig } from "@sentry/nextjs";
import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "react-icons/*",
      "date-fns",
      "lodash",
      "canvas-confetti",
      "gsap",
      "cobe",
    ],
  },

  cacheComponents: true,

  env: {
    NEXT_PUBLIC_DEPLOY_TIME: new Date().toISOString(),
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
      },
      {
        protocol: "https",
        hostname: "cdn.simpleicons.org",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            // 'unsafe-eval' dropped — current stack (Next 16, React 19,
            // GSAP 3, Three.js, Tailwind v4, Better Auth, AI SDK v6)
            // does not use eval() or new Function() at runtime. If a
            // future library needs it, prefer the nonce/hash path over
            // adding 'unsafe-eval' back.
            //
            // 'unsafe-inline' is still present on script-src and
            // style-src. Removing it requires per-request nonces, which
            // forces every page off static prerender — incompatible with
            // `cacheComponents: true`. See SKILL.md "Known tech debt"
            // for the deferred-fix rationale.
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://ssl.google-analytics.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' blob: data: https://cdn.discordapp.com https://cdn.simpleicons.org https://avatars.githubusercontent.com https://lh3.googleusercontent.com https://www.google-analytics.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.sentry.io https://api.lanyard.rest wss://api.lanyard.rest https://router.huggingface.co https://api-inference.huggingface.co https://www.google-analytics.com https://*.google-analytics.com https://api.liveblocks.io wss://api.liveblocks.io; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(self), geolocation=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
};

export default bundleAnalyzer(
  withSentryConfig(nextConfig, {
    org: "t7sen-c0",
    project: "portfolio",
    silent: !process.env.CI,
    widenClientFileUpload: true,
    tunnelRoute: "/monitoring",
    webpack: {
      treeshake: {
        removeDebugLogging: true,
      },
    },
  }),
);
