"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// File imports, not the site barrel, so this island ships only what it draws.
import { cx } from "@/components/site/class-names";
import { PillButton } from "@/components/site/pill";
import { TextLink } from "@/components/site/text-link";

export type CopyState = "idle" | "copied" | "failed";

type CopyAddressProps = {
  /** The address, shown as a mailto link and written to the clipboard. */
  email: string;
  href: string;
  copy: {
    /** The button's visible word. */
    label: string;
    /** The button's name, which starts with its visible word. */
    name: string;
    copied: string;
    failed: string;
  };
  className?: string;
};

/** How long "copied" stays on screen before the line clears. */
export const COPIED_MS = 4000;

const noSubscription = () => () => {};

/**
 * The contact address with a Copy button. The address and the words arrive as
 * props from the page, so they sit in the page's HTML and never in this
 * island's code. The result is announced politely and shown in words beside
 * the address (WCAG 4.1.3).
 */
export function CopyAddress({
  email,
  href,
  copy,
  className,
}: CopyAddressProps) {
  // The button needs script to work, so the static HTML leaves it out rather
  // than show a control that does nothing; the address stays a link.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const [state, setState] = useState<CopyState>("idle");
  // Counts presses: a second copy restarts the timer and is announced again,
  // even when the words are the same.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (state !== "copied") return;
    const timer = window.setTimeout(() => setState("idle"), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [state, attempt]);

  async function onCopy() {
    setAttempt((count) => count + 1);
    try {
      // Undefined outside a secure context, which throws here and lands in
      // the failed state with its way forward.
      await navigator.clipboard.writeText(email);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  const message =
    state === "copied" ? copy.copied : state === "failed" ? copy.failed : "";

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      {/* As tall as the button from the first paint, so it never moves the
          page when it arrives. */}
      <div className="flex min-h-11 flex-wrap items-center gap-x-3.5 gap-y-2">
        <TextLink href={href} className="text-lead wrap-anywhere">
          {email}
        </TextLink>
        {hydrated && (
          <PillButton
            aria-label={copy.name}
            data-state={state}
            onClick={onCopy}
          >
            {copy.label}
          </PillButton>
        )}
      </div>
      <p
        role="status"
        className={cx(
          "min-h-5 text-sm leading-5",
          state === "copied" ? "text-glow" : "text-text",
        )}
      >
        {message !== "" && <span key={attempt}>{message}</span>}
      </p>
    </div>
  );
}
