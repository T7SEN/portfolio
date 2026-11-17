"use client";

import { useEffect } from "react";

import { startSectionAddress } from "./section-address-session";

/**
 * Keeps the home page's address on the chapter being read, "/#work" and so
 * on (REQ-NAV-06, D-170; section-address-session.ts). Renders nothing, so
 * the static HTML is the same without it.
 */
export function SectionAddress() {
  useEffect(() => startSectionAddress(), []);
  return null;
}
