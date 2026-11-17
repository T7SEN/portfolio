// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  isExtensionOnlyMismatch,
  quietExtensionMismatch,
} from "./quiet-extension-mismatch";

// React's opening, with its own "- " list of causes before the link.
const OPENING = [
  "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:",
  "",
  "- A server/client branch `if (typeof window !== 'undefined')`.",
  "- Invalid HTML tag nesting.",
  "",
  "It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.",
  "",
  "%s%s",
].join("\n");

// Shaped as React 19 prints it: the message, the link, then the diff.
function report(...lines: string[]): string[] {
  return [
    OPENING,
    "https://react.dev/link/hydration-mismatch",
    ["", "  ...", "    <body", ...lines, "    >"].join("\n"),
  ];
}

const EXTENSIONS = [
  '-     inmaintabuse="1"',
  '-     bis_register="W3sibWFzdGVyIjp0cnVlfQ"',
  '-                           bis_skin_checked="1"',
  '-     data-darkreader-inline-stroke=""',
  '-     style={{--darkreader-inline-stroke:"currentColor"}}',
];

describe("the extension mismatch filter (development only)", () => {
  it("REQ-OPS-07 D-166 drops a report whose every page side line is an extension's attribute or Dark Reader style, a lone text line included", () => {
    const message = report(
      ...EXTENSIONS,
      "+       [FILL: the message form, built at P6]",
    ).join("\n");
    expect(isExtensionOnlyMismatch(message)).toBe(true);
  });

  it("REQ-OPS-07 D-166 keeps a report with any other attribute, a client side attribute or style, or a text difference with both sides", () => {
    for (const lines of [
      [...EXTENSIONS, '-     className="old"'],
      [...EXTENSIONS, '+     className="new"'],
      [...EXTENSIONS, '+     style={{color:"red"}}'],
      [...EXTENSIONS, '-     style={{color:"red"}}'],
      ["+       Client words", "-       Server words"],
      ["+       Client words"],
    ]) {
      expect(isExtensionOnlyMismatch(report(...lines).join("\n"))).toBe(false);
    }
  });

  it("REQ-OPS-07 D-166 keeps every other console message", () => {
    expect(isExtensionOnlyMismatch("Some other error")).toBe(false);
    expect(
      isExtensionOnlyMismatch(
        'Hydration failed because the server rendered text didn\'t match the client.\n-  bis_skin_checked="1"',
      ),
    ).toBe(false);
  });

  it("REQ-OPS-07 D-166 wraps console.error: the extension report is dropped with one note per load, anything else goes through untouched", () => {
    const error = vi.fn();
    const info = vi.fn();
    const target = { error, info } as unknown as Console;
    quietExtensionMismatch(target);

    target.error(...report(...EXTENSIONS));
    target.error(...report(...EXTENSIONS));
    expect(error).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);

    const real = report(...EXTENSIONS, '-     className="old"');
    target.error(...real);
    const thrown = new Error("boom");
    target.error(thrown);
    expect(error).toHaveBeenNthCalledWith(1, ...real);
    expect(error).toHaveBeenNthCalledWith(2, thrown);
  });
});
