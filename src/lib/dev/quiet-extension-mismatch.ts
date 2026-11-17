// Development only [T7SEN, 15 Nov 2026]: browser extensions (one writes
// bis_skin_checked, bis_register and inmaintabuse on every element, Dark
// Reader its data-darkreader attributes and style variables) change the
// server's HTML before React hydrates, and React then reports an attribute
// mismatch the site did not cause, which the development overlay shows as an
// error on every load. This drops that one report, and only when every
// difference it lists is an extension's own: any other difference, or a text
// difference with both sides, still reaches the console and the overlay.
// Production React does not make this report at all.

/** Attributes browser extensions are known to write into a page. */
const EXTENSION_ATTRIBUTE =
  /^(?:bis_[\w-]+|inmaintabuse|data-darkreader-[\w-]+|cz-shortcut-listen|data-new-gr-c-s-check-loaded|data-gr-ext-installed|data-lt-installed|__processed_[\w-]+)$/;

const MISMATCH_OPENING =
  "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties";

// React's message lists its possible causes as "- " lines before this link;
// the diff comes after it, so only that part is read.
const MISMATCH_LINK = "https://react.dev/link/hydration-mismatch";

// A line of React's diff: "+" for the client's side, "-" for what the page
// held; an attribute is name=value, a style is style={{...}}.
const DIFF_LINE = /^\s*([+-])\s+(.*)$/;
const ATTRIBUTE_LINE = /^([\w:-]+)=/;
const STYLE_LINE = /^style=\{\{(.*)\}\}$/;

function isExtensionStyle(body: string): boolean {
  const names = body
    .split(",")
    .map((part) => part.split(":")[0]?.trim() ?? "")
    .filter(Boolean);
  return (
    names.length > 0 && names.every((name) => name.startsWith("--darkreader"))
  );
}

/**
 * Whether a console message is React's attribute mismatch report in which
 * every difference comes from a browser extension: every page side ("-")
 * line is an extension attribute or a Dark Reader style, at least one such
 * line is there, and no client side ("+") line is an attribute or a style,
 * so a lone "+" line can only be an element's text that React lists for
 * context.
 */
export function isExtensionOnlyMismatch(message: string): boolean {
  if (!message.includes(MISMATCH_OPENING)) return false;
  const link = message.indexOf(MISMATCH_LINK);
  if (link === -1) return false;
  let extensionLines = 0;
  for (const line of message.slice(link + MISMATCH_LINK.length).split("\n")) {
    const diffLine = DIFF_LINE.exec(line);
    if (diffLine === null) continue;
    const [, side, body = ""] = diffLine;
    const style = STYLE_LINE.exec(body);
    const attribute = ATTRIBUTE_LINE.exec(body);
    if (side === "+") {
      if (style !== null || attribute !== null) return false;
      continue;
    }
    if (style !== null && isExtensionStyle(style[1] ?? "")) {
      extensionLines += 1;
    } else if (
      attribute !== null &&
      EXTENSION_ATTRIBUTE.test(attribute[1] ?? "")
    ) {
      extensionLines += 1;
    } else {
      return false;
    }
  }
  return extensionLines > 0;
}

/**
 * Wraps console.error so the report above is dropped, with one quiet note in
 * its place per page load. Called from a module that loads with the root
 * layout's client code, which runs after the development overlay wraps
 * console.error itself, so this wrapper sees the report first.
 */
export function quietExtensionMismatch(target: Console = console): void {
  const error = target.error;
  let noted = false;
  target.error = function quietError(...args: unknown[]) {
    const message = args
      .filter((arg): arg is string => typeof arg === "string")
      .join("\n");
    if (isExtensionOnlyMismatch(message)) {
      if (!noted) {
        noted = true;
        target.info(
          "Development: a hydration mismatch caused only by browser extension attributes was hidden.",
        );
      }
      return;
    }
    error.apply(target, args);
  };
}

if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  quietExtensionMismatch();
}
