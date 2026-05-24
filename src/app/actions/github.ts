"use server";

import { cacheLife, cacheTag } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import logger from "@/lib/logger";

export async function getLatestCommit() {
  "use cache";
  cacheLife("hours");
  cacheTag("github-latest");

  try {
    const res = await fetch(
      "https://api.github.com/repos/t7sen/portfolio/commits/main",
      {
        headers: {
          "User-Agent": "t7sen-portfolio",
          Accept: "application/vnd.github.v3+json",
          Authorization: `Bearer ${process.env.GITPULSE_API_KEY}`,
        },
      },
    );

    if (!res.ok) {
      // GitHub API throttling / 404 / 5xx — log and degrade silently
      // (caller is the GitPulse component, which renders a fallback).
      logger.warn(
        { status: res.status, statusText: res.statusText },
        "getLatestCommit: GitHub API returned non-OK",
      );
      return null;
    }

    const data = await res.json();

    return {
      hash: data.sha.substring(0, 7),
      message: data.commit.message,
      url: data.html_url,
    };
  } catch (error) {
    // Network error, JSON parse error, etc. Always returned null
    // before — that's still the right default — but the failure used
    // to vanish entirely. Surface to Sentry so trends are visible.
    logger.error({ err: String(error) }, "getLatestCommit: unexpected error");
    Sentry.captureException(error);
    return null;
  }
}
