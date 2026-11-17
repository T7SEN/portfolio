/** The overlay on screen: the menu, the command palette, or none. */
export type Overlay = "menu" | "palette" | null;

export type OverlayStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): Overlay;
  getServerSnapshot(): null;
  /**
   * Shows one overlay; any other one closes, since only one is ever open
   * (REQ-NAV-03, REQ-NAV-04). Opening from nothing records the element that
   * had focus, so closing can give it back.
   */
  open(kind: "menu" | "palette"): void;
  close(): void;
  /** Closes that overlay when it is open, and opens it otherwise. */
  toggle(kind: "menu" | "palette"): void;
  /**
   * The element that had focus before the first overlay opened, once, for
   * the dialog that closes last to focus. Null while an overlay is still
   * open, so a dialog that closes because the other one opened takes
   * nothing; null too when the page itself had focus.
   */
  takeReturnFocus(): HTMLElement | null;
  /**
   * Hands the recorded focus from inside `from` to `to`: a control that goes
   * as an overlay opens (a sound panel's switch, when Ctrl K is pressed in
   * it) gives its place to one that stays (the pill), so closing the overlay
   * never leaves focus on the page's body.
   */
  passReturnFocus(from: Element, to: HTMLElement): void;
  /**
   * Replaces the recorded focus: a command that takes the visitor elsewhere
   * on the page (the palette's home chapters) hands that place over, so
   * focus follows the visitor there and the next Tab goes on from it
   * (WCAG 2.4.3).
   */
  setReturnFocus(element: HTMLElement): void;
};

// Body or the html element holds focus when nothing on the page does;
// giving it back would move nothing.
function focusedElement(doc: Document | undefined): HTMLElement | null {
  const active = doc?.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  return active === doc?.body || active === doc?.documentElement
    ? null
    : active;
}

// A plain store with no React import, read through useSyncExternalStore like
// the tier and calm stores. The overlays, the bar's buttons, the keys and the
// smooth scroll all read it, so none of them imports another.
export function createOverlayStore(
  getDocument: () => Document | undefined = () =>
    typeof document === "undefined" ? undefined : document,
): OverlayStore {
  const listeners = new Set<() => void>();
  let overlay: Overlay = null;
  let returnFocus: HTMLElement | null = null;

  function set(next: Overlay) {
    if (next === overlay) return;
    overlay = next;
    for (const listener of [...listeners]) listener();
  }

  function open(kind: "menu" | "palette") {
    if (overlay === null) returnFocus = focusedElement(getDocument());
    set(kind);
  }

  function close() {
    set(null);
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => overlay,
    getServerSnapshot: () => null,
    open,
    close,
    toggle(kind) {
      if (overlay === kind) close();
      else open(kind);
    },
    takeReturnFocus() {
      if (overlay !== null) return null;
      const element = returnFocus;
      returnFocus = null;
      return element;
    },
    setReturnFocus(element) {
      returnFocus = element;
    },
    passReturnFocus(from, to) {
      if (returnFocus !== null && from.contains(returnFocus)) {
        returnFocus = to;
      }
    },
  };
}

export const overlayStore = createOverlayStore();
