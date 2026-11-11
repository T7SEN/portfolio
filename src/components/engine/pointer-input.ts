/** Where the field is drawn, in viewport pixels. */
export type PointerArea = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PointerInputOptions = {
  /** Receives normalised device coordinates: -1 to 1 on both axes, y up. */
  send(x: number, y: number, active: boolean): void;
  /**
   * The field's box, read at most once per frame. An empty box counts as the
   * whole viewport.
   */
  area?: () => PointerArea;
  /** Replaced by a fake in unit tests. */
  target?: Window;
};

// Every listener is passive and none calls preventDefault, and touch-action is
// left alone, so the browser starts a scroll at once and the finger only
// stirs (REQ-SCR-06).
const LISTENER = { passive: true } as const;

type Position = { clientX: number; clientY: number };

/**
 * Stirs the field with the mouse, a pen or a finger, anywhere in the window.
 * Moves are sent at most once per animation frame, with the latest position.
 * Touch is read from touch events, not pointer events: once a finger starts a
 * scroll the browser cancels its pointer with pointercancel, while touchmove
 * goes on. Returns the stop, which removes every listener and releases an
 * active pointer.
 */
export function startPointerInput({
  send,
  area,
  target = window,
}: PointerInputOptions): () => void {
  let pending: Position | null = null;
  let last: Position | null = null;
  let isActive = false;
  let frame: number | null = null;
  let isStopped = false;

  function toDevice({ clientX, clientY }: Position): [number, number] {
    const box = area?.();
    const { left, top, width, height } =
      box !== undefined && box.width > 0 && box.height > 0
        ? box
        : {
            left: 0,
            top: 0,
            width: target.innerWidth,
            height: target.innerHeight,
          };
    if (width <= 0 || height <= 0) return [0, 0];
    return [
      ((clientX - left) / width) * 2 - 1,
      1 - ((clientY - top) / height) * 2,
    ];
  }

  function flush() {
    frame = null;
    if (pending === null) return;
    const position = pending;
    pending = null;
    last = position;
    isActive = true;
    const [x, y] = toDevice(position);
    send(x, y, true);
  }

  function move(position: Position) {
    pending = { clientX: position.clientX, clientY: position.clientY };
    frame ??= target.requestAnimationFrame(flush);
  }

  // A release is rare, so it goes out at once, at the last position sent.
  function release() {
    if (frame !== null) target.cancelAnimationFrame(frame);
    frame = null;
    pending = null;
    if (!isActive || last === null) return;
    isActive = false;
    const [x, y] = toDevice(last);
    send(x, y, false);
  }

  const onPointerMove = (event: PointerEvent) => {
    // A finger is followed through the touch listeners below.
    if (event.pointerType === "touch") return;
    move(event);
  };

  const onPointerOut = (event: PointerEvent) => {
    // No related target: the pointer left the window.
    if (event.pointerType === "touch" || event.relatedTarget !== null) return;
    release();
  };

  const onTouch = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (touch === undefined) release();
    else move(touch);
  };

  const listeners = [
    ["pointermove", onPointerMove],
    ["pointerout", onPointerOut],
    ["blur", release],
    ["touchstart", onTouch],
    ["touchmove", onTouch],
    ["touchend", onTouch],
    ["touchcancel", onTouch],
  ] as const;

  for (const [type, listener] of listeners) {
    target.addEventListener(type, listener as EventListener, LISTENER);
  }

  return () => {
    if (isStopped) return;
    isStopped = true;
    // Only capture identifies a listener for removal, and none uses it.
    for (const [type, listener] of listeners) {
      target.removeEventListener(type, listener as EventListener);
    }
    release();
  };
}
