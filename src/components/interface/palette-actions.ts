/**
 * Writes the text to the clipboard. True only once the browser says it is
 * written, so the palette never claims a copy that did not happen (rule
 * A11): no Clipboard API, a refused permission or an insecure page is false.
 * Call it inside the press: the write starts before the first await.
 */
export async function copyText(
  text: string,
  nav: Navigator | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): Promise<boolean> {
  try {
    const clipboard = nav?.clipboard;
    if (typeof clipboard?.writeText !== "function") return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Hands an address such as mailto to the browser, which opens its app. */
export function openAddress(href: string): void {
  window.location.assign(href);
}
