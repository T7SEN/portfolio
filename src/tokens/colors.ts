// The one source of the colour tokens (REQ-ENG-02). The engine imports this
// file and scripts/tokens-css.mjs writes src/app/tokens.css from it, so it
// stays framework-free and uses only syntax Node can strip without compiling.

export type Hex = `#${string}`;

export const colors = {
  void: "#07070A",
  surface: "#111116",
  raised: "#1C1C24",
  edge: "#66667C",
  muted: "#9A9AAB",
  text: "#EDEDF2",
  violet: "#A855F7",
  "logo-red": "#EF4444",
  "logo-blue": "#3B82F6",
  glow: "#A78BFA",
  danger: "#F87171",
  paper: "#F4F4F7",
} as const satisfies Readonly<Record<string, Hex>>;

export type ColorName = keyof typeof colors;
