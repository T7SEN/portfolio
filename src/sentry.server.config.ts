// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";

// DSN is designed-public (Sentry SDK guidance); kept in env so it can
// be swapped per environment without touching code. SDK no-ops when
// the value is empty, so a missing env var just disables reporting
// rather than crashing.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Sample 10% of traces in prod (quota-friendly), 100% in dev so
  // local debugging gets full visibility.
  tracesSampleRate: isProd ? 0.1 : 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});
