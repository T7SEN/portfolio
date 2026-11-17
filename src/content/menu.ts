import { site, type ShortcutKeys } from "./site";
import type { Link, StudySlug, Text } from "./types";

export type MenuCopy = {
  /** The dialog's name. */
  name: Text;
  /** The label over the project list, with the count from the study index. */
  workLabel: (count: number) => readonly [Text, Text];
  /** The project list's name. */
  listName: Text;
  /** A title shorter than the study's own, where the row has no room for it. */
  rowTitles: Partial<Record<StudySlug, Text>>;
  /** The preview beside the list, named for the project it shows. */
  previewName: (title: Text) => Text;
  readStudy: Text;
  /** The link row under the list, and its name. */
  pagesName: Text;
  pages: readonly Link[];
  /** The corner hints, shown only where a keyboard is likely. */
  closeHint: Text;
  commandsHint: (keys: ShortcutKeys) => Text;
};

// The menu's words, from the launch artboard (phase P5).
export const menuCopy = {
  name: "Menu",
  workLabel: (count) => ["Work", `${count} projects`],
  listName: "Work",
  rowTitles: { "making-of": "Making-of" },
  previewName: (title) => `Preview: ${title}`,
  readStudy: "Read the study",
  pagesName: "Pages",
  // Home first [T7SEN, 15 Nov 2026]: "the menu first item should be Home".
  pages: [
    { label: "Home", href: "/" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
    { label: "All work, no 3D", href: "/work" },
    { label: "v1 archive", href: "/v1" },
    site.github,
  ],
  closeHint: "Esc to close",
  commandsHint: (keys) => `${keys} for commands`,
} as const satisfies MenuCopy;
