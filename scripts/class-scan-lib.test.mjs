// @vitest-environment node
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findPhysicalClasses,
  findPhysicalInCss,
  findPhysicalInSource,
  isPhysicalUtility,
  scanTree,
} from "./class-scan-lib.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = fileURLToPath(new URL("../src", import.meta.url));

const PHYSICAL = [
  "ml-2",
  "mr-4",
  "pl-3",
  "pr-0",
  "ml-auto",
  "mr-px",
  "pl-[3px]",
  "pr-(--gutter)",
  "pl-2.5",
  "left-0",
  "right-4",
  "left-1/2",
  "right-full",
  "left-[10%]",
  "text-left",
  "text-right",
  "border-l",
  "border-r",
  "border-l-2",
  "border-r-edge",
  "rounded-l",
  "rounded-r",
  "rounded-l-md",
  "rounded-tl",
  "rounded-tr",
  "rounded-bl",
  "rounded-br",
  "rounded-tr-lg",
  "float-left",
  "float-right",
  "scroll-ml-2",
  "scroll-mr-4",
  "scroll-pl-6",
  "scroll-pr-8",
  "-ml-2",
  "-left-4",
  "-mr-px",
  "md:ml-2",
  "hover:pr-3",
  "md:hover:-ml-2",
  "lg:text-right",
  "group-hover:border-l-4",
  "[&>svg]:left-0",
  "data-[state=open]:right-[3px]",
  "!ml-2",
  "ml-2!",
];

const LOGICAL = [
  "ms-2",
  "me-4",
  "ps-3",
  "pe-0",
  "-ms-2",
  "-me-3",
  "start-0",
  "end-4",
  "start-1/2",
  "inset-s-0",
  "inset-e-0",
  "inset-x-0",
  "inset-0",
  "px-4",
  "mx-auto",
  "text-start",
  "text-end",
  "border-s",
  "border-e-2",
  "border-s-edge",
  "border-x",
  "rounded-s",
  "rounded-e-md",
  "rounded-ss",
  "rounded-se",
  "rounded-es",
  "rounded-ee",
  "float-start",
  "float-end",
  "scroll-ms-2",
  "scroll-ps-4",
  "scroll-px-4",
  "scroll-mx-2",
  "md:ps-4",
  "rtl:-scale-x-100",
  "rounded-lg",
  "rounded-t-md",
  "rounded-b",
  "border-raised",
  "border-edge",
  "border-t",
  "space-x-4",
  "translate-x-2",
  "top-4",
  "bottom-0",
  "text-lead",
  "left",
  "right",
  "right-to-left",
  "left-hand",
  "ml",
];

describe("physical utility tokens", () => {
  it.each(PHYSICAL)("REQ-I18N-01 flags %s", (token) => {
    expect(isPhysicalUtility(token)).toBe(true);
  });

  it.each(LOGICAL)("REQ-I18N-01 allows %s", (token) => {
    expect(isPhysicalUtility(token)).toBe(false);
  });

  it("REQ-I18N-01 returns the physical tokens of a class string as written", () => {
    expect(
      findPhysicalClasses("flex  md:-ml-2 ps-4\n text-right rounded-lg"),
    ).toEqual(["md:-ml-2", "text-right"]);
  });
});

describe("source files", () => {
  it("REQ-I18N-01 finds classes in className strings, template strings, cx() calls and constants", () => {
    const source = [
      'const LINE = "left-0 top-0";',
      "export function A({ wide }: { wide: boolean }) {",
      "  return (",
      '    <div className="flex ml-2">',
      '      <p className={`p-2 ${wide ? "pr-4" : "pe-4"} border-l`} />',
      '      <span className={cx("text-right", wide && "ms-2")} />',
      "    </div>",
      "  );",
      "}",
    ].join("\n");

    expect(findPhysicalInSource(source, "a.tsx")).toEqual([
      { line: 1, match: "left-0" },
      { line: 4, match: "ml-2" },
      { line: 5, match: "pr-4" },
      { line: 5, match: "border-l" },
      { line: 6, match: "text-right" },
    ]);
  });

  it("REQ-I18N-01 skips comments, JSX text and prose strings", () => {
    const source = [
      "// Physical ml-2 and text-left are banned; this comment is prose.",
      "/* left-0 right-0 */",
      'const note = "Read right to left, then turn left-hand.";',
      "export function B() {",
      '  return <p className="ps-4">Move ml-2 left, text-right</p>;',
      "}",
    ].join("\n");

    expect(findPhysicalInSource(source, "b.tsx")).toEqual([]);
  });

  it("REQ-I18N-01 finds physical properties in JSX style objects and allows logical ones", () => {
    const source = [
      "export const C = () => (",
      "  <div",
      '    style={{ marginLeft: 4, textAlign: "right", insetInlineStart: 0 }}',
      "  />",
      ");",
      "export const D = () => (",
      '  <div style={{ marginInlineStart: 4, textAlign: "start", top: 0 }} />',
      ");",
    ].join("\n");

    expect(findPhysicalInSource(source, "c.tsx")).toEqual([
      { line: 3, match: "marginLeft: 4" },
      { line: 3, match: 'textAlign: "right"' },
    ]);
  });
});

describe("CSS files", () => {
  it("REQ-I18N-01 finds physical properties and @apply classes", () => {
    const css = [
      ".a { margin-left: 1rem; padding-right: 2px; }",
      ".b {",
      "  left: 0;",
      "  right: auto;",
      "  border-left: 1px solid;",
      "  border-right-width: 2px;",
      "  border-top-left-radius: 4px;",
      "  text-align: left;",
      "  float: right;",
      "  scroll-margin-left: 1rem;",
      "}",
      ".c { @apply flex ml-2; }",
    ].join("\n");

    expect(
      findPhysicalInCss(css).map(({ line, match }) => [line, match]),
    ).toEqual([
      [1, "margin-left: 1rem"],
      [1, "padding-right: 2px"],
      [3, "left: 0"],
      [4, "right: auto"],
      [5, "border-left: 1px solid"],
      [6, "border-right-width: 2px"],
      [7, "border-top-left-radius: 4px"],
      [8, "text-align: left"],
      [9, "float: right"],
      [10, "scroll-margin-left: 1rem"],
      [12, "@apply ml-2"],
    ]);
  });

  it("REQ-I18N-01 allows logical properties, custom properties, selectors and comments", () => {
    const css = [
      "/* margin-left: 0; text-align: right */",
      "a:hover { color: red; }",
      ".a:where(:dir(rtl), [dir='rtl'] *) {",
      "  margin-inline-start: 1rem;",
      "  padding-inline-end: 2px;",
      "  inset-inline-start: 0;",
      "  border-inline-start: 1px solid;",
      "  border-start-start-radius: 4px;",
      "  text-align: start;",
      "  float: inline-end;",
      "  --left: 1px;",
      "  transition: left 0.2s;",
      "}",
      ".b { @apply ms-2 text-end; }",
    ].join("\n");

    expect(findPhysicalInCss(css)).toEqual([]);
  });
});

describe("arbitrary properties and shorthands", () => {
  it.each([
    "[margin-left:4px]",
    "md:[left:0]",
    "[text-align:right]",
    "m-[0_1rem_0_0]",
    "inset-[0_auto_0_0]",
    "rounded-[4px_0]",
  ])("REQ-I18N-01 flags %s", (token) => {
    expect(isPhysicalUtility(token)).toBe(true);
  });

  it.each([
    "[margin-inline-start:4px]",
    "m-[0_1rem_0_1rem]",
    "p-[1rem]",
    "rounded-[4px]",
    "border-[1px]",
    "before:content-[attr(data-reserve)]",
  ])("REQ-I18N-01 allows %s", (token) => {
    expect(isPhysicalUtility(token)).toBe(false);
  });

  it("REQ-I18N-01 flags shorthands whose right and left sides differ", () => {
    const css = [
      ".a { margin: 0 1rem 0 0; }",
      ".b { padding: calc(1px + 2px) 0 calc(1px + 2px) 1px; }",
      ".c { inset: 0 auto 0 0 !important; }",
      ".d { border-radius: 4px 0 0 4px; }",
      ".e { border-radius: 4px / 2px 6px; }",
    ].join("\n");

    expect(findPhysicalInCss(css).map(({ line }) => line)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("REQ-I18N-01 allows shorthands that mirror to themselves", () => {
    const css = [
      ".a { margin: 0 auto; }",
      ".b { padding: 1px 2px 3px 2px; }",
      ".c { inset: 0; }",
      ".d { border-radius: 4px 4px 0 0; }",
      ".e { border-radius: 50%; }",
    ].join("\n");

    expect(findPhysicalInCss(css)).toEqual([]);
  });
});

describe("the repo", () => {
  it("REQ-I18N-01 src has no physical left or right utilities or properties", () => {
    const { files, hits } = scanTree(SRC, ROOT);
    expect(files).toBeGreaterThan(0);
    expect(hits).toEqual([]);
  });
});
