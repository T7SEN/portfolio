// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";

// DSN is designed-public; pulled from env so it can differ per
// environment. SDK no-ops with an empty value so a missing env var
// just disables client-side reporting rather than crashing the page.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Add optional integrations for additional features
  integrations: [
    Sentry.replayIntegration(),
    Sentry.feedbackIntegration({
      // OPTIONAL: Customize the look to match your site
      colorScheme: "dark", // Forces dark mode to match your aesthetic
      triggerLabel: "Report a Bug", // Text on the button
      formTitle: "System Issue Report", // Title inside the modal
      submitBtnLabel: "Send Report",

      // Auto-inject the floating button
      autoInject: true,

      // Require email so you can reply to them
      isEmailRequired: true,
    }),
    // send console.log, console.warn, and console.error calls as logs to Sentry
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],

  // Sample 10% of traces in prod (quota-friendly), 100% in dev so
  // local debugging gets full visibility.
  tracesSampleRate: isProd ? 0.1 : 1.0,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Session replays are expensive — 1% in prod is plenty for spotting
  // patterns; 10% in dev for richer local repro.
  replaysSessionSampleRate: isProd ? 0.01 : 0.1,

  // Always capture replays around errors regardless of env — errors
  // are rare and high-signal, replays are what make them debuggable.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
