// @vitest-environment node
import { describe, expect, it } from "vitest";
import { envReport, exampleNames, namesWithValues } from "./env-lib.mjs";

describe("env check", () => {
  it("REQ-SEC-01 reads names from the example file and skips comments", () => {
    const example =
      "# a comment\nRESEND_API_KEY=\n\nNEXT_PUBLIC_POSTHOG_KEY=\n# OLD_NAME=\n";
    expect(exampleNames(example)).toEqual([
      "RESEND_API_KEY",
      "NEXT_PUBLIC_POSTHOG_KEY",
    ]);
  });

  it("REQ-SEC-01 counts only names with a non-empty value", () => {
    const local =
      'A=1\r\nB=\nC=""\n# D=1\nexport E=x\nF= # note\nG=abc # note\nH="a # b"\nI=#note\n';
    expect([...namesWithValues(local)].sort()).toEqual(["A", "E", "G", "H"]);
  });

  it("REQ-SEC-01 prints ok or missing and never a value", () => {
    const secret = "s3cr3t-value-123";
    const present = namesWithValues(`RESEND_API_KEY=${secret}\n`);
    const lines = envReport(
      ["RESEND_API_KEY", "TURNSTILE_SECRET_KEY", "CONTACT_TO_EMAIL"],
      present,
      { CONTACT_TO_EMAIL: secret },
    );
    expect(lines).toEqual([
      "ok RESEND_API_KEY",
      "missing TURNSTILE_SECRET_KEY",
      "ok CONTACT_TO_EMAIL",
    ]);
    expect(lines.join("\n")).not.toContain(secret);
  });
});
