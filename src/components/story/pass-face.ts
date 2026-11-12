// The markup the making-of pass viewer and the scroll story share. Each card
// of the viewer has a face (data-pass-face, its value the pass), marked
// data-live while the field draws the pass in it. Four empty marks sit in
// the face's corners (data-corner), placed with logical insets so the face
// keeps them in either reading direction; the story reads where the screen
// shows them (story-passes.ts).

/** The face's corners as the marks name them, by reading direction. */
export const FACE_CORNERS = [
  "top-start",
  "top-end",
  "bottom-end",
  "bottom-start",
] as const;

export type FaceCorner = (typeof FACE_CORNERS)[number];
