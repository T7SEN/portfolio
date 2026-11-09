import type { Marker } from "./types";

const MARKER = /^\[(?:FILL|CONFIRM)[^\]]*\]$/;

/** True when the whole text is a marker, for example a link with no address yet. */
export function isMarker(text: string): text is Marker {
  return MARKER.test(text);
}
