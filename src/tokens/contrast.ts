import { colors } from "./colors";
import type { ColorName, Hex } from "./colors";

// WCAG 2.x relative luminance. WCAG 2.2 uses the sRGB threshold 0.04045
// where 2.0 printed 0.03928; no 8-bit channel value falls between them.
export function relativeLuminance(hex: Hex): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Not a six-digit hex colour: ${hex}`);

  const [r, g, b] = match.slice(1).map((pair) => {
    const channel = parseInt(pair, 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: Hex, b: Hex): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// 4.5 is WCAG 1.4.3 for text; 3 is 1.4.11 for borders, focus rings and shapes.
export type NeededRatio = 4.5 | 3;

export type ContrastPair = {
  readonly foreground: ColorName;
  readonly background: ColorName;
  readonly needs: NeededRatio;
  readonly use: string;
};

// Every pair the site uses, from visual-system.md section 2. A pair missing
// here is not checked, so a new pairing of tokens is added here first.
export const pairsInUse: readonly ContrastPair[] = [
  { foreground: "text", background: "void", needs: 4.5, use: "Body text" },
  {
    foreground: "text",
    background: "surface",
    needs: 4.5,
    use: "Body text on cards",
  },
  {
    foreground: "text",
    background: "raised",
    needs: 4.5,
    use: "Text on panels",
  },
  {
    foreground: "muted",
    background: "void",
    needs: 4.5,
    use: "Secondary text",
  },
  {
    foreground: "muted",
    background: "surface",
    needs: 4.5,
    use: "Secondary text on cards",
  },
  {
    foreground: "muted",
    background: "raised",
    needs: 4.5,
    use: "Secondary text on panels",
  },
  {
    foreground: "glow",
    background: "void",
    needs: 4.5,
    use: "Link arrows and hover text; also the focus ring",
  },
  {
    foreground: "glow",
    background: "surface",
    needs: 4.5,
    use: "Purple text on cards",
  },
  {
    foreground: "glow",
    background: "raised",
    needs: 3,
    use: "Focus ring on inputs",
  },
  {
    foreground: "void",
    background: "glow",
    needs: 4.5,
    use: "Primary pill label",
  },
  {
    foreground: "violet",
    background: "void",
    needs: 4.5,
    use: "Eyebrow, In progress badge and violet shapes",
  },
  {
    foreground: "violet",
    background: "surface",
    needs: 4.5,
    use: "In progress badge on cards",
  },
  {
    foreground: "logo-red",
    background: "void",
    needs: 3,
    use: "Purple mark",
  },
  {
    foreground: "logo-blue",
    background: "void",
    needs: 3,
    use: "Purple mark",
  },
  {
    foreground: "danger",
    background: "void",
    needs: 4.5,
    use: "Form errors",
  },
  {
    foreground: "danger",
    background: "surface",
    needs: 4.5,
    use: "Form errors on cards",
  },
  {
    foreground: "edge",
    background: "void",
    needs: 3,
    use: "Control borders",
  },
  {
    foreground: "edge",
    background: "surface",
    needs: 3,
    use: "Control borders on cards",
  },
  {
    foreground: "edge",
    background: "raised",
    needs: 3,
    use: "Input borders on panels",
  },
  {
    foreground: "void",
    background: "paper",
    needs: 4.5,
    use: "Dark logo and text on light surfaces; primary pill on hover",
  },
  {
    foreground: "paper",
    background: "void",
    needs: 4.5,
    use: "Link and pill hover text",
  },
  {
    foreground: "paper",
    background: "surface",
    needs: 4.5,
    use: "Link hover text on cards",
  },
];

export function pairRatio(pair: ContrastPair): number {
  return contrastRatio(colors[pair.foreground], colors[pair.background]);
}
