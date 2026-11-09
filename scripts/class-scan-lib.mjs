// REQ-I18N-01: finds physical left and right styling, so Arabic in R2 is a
// translation, not a rebuild. scripts/class-scan.mjs runs it over src.
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";

// Tailwind values a position or spacing utility takes: a number, a fraction,
// px, auto, full, an arbitrary value or a CSS variable. Kept narrow so prose
// such as "left-hand" or "right-to-left" in a string is not a hit.
const VALUE = String.raw`(?:\d+(?:\.\d+)?|\d+/\d+|px|auto|full|\[[^\]]+\]|\([^)]+\))`;

// The banned list in code-style.md section 7 and i18n-rtl.md section 2.
// inset-x, px, mx and the rest of the two-sided utilities are allowed.
export const PHYSICAL_UTILITIES = [
  new RegExp(`^(?:ml|mr|pl|pr)-${VALUE}$`),
  new RegExp(`^(?:left|right)-${VALUE}$`),
  new RegExp(`^scroll-(?:ml|mr|pl|pr)-${VALUE}$`),
  /^text-(?:left|right)$/,
  /^border-[lr](?:-.+)?$/,
  /^rounded-(?:l|r|tl|tr|bl|br)(?:-.+)?$/,
  /^float-(?:left|right)$/,
];

// The same rule for CSS properties, in custom CSS and in JSX style objects.
const PHYSICAL_PROPERTY =
  /^(?:(?:margin|padding|scroll-margin|scroll-padding)-(?:left|right)|left|right|border-(?:left|right)(?:-(?:width|style|color))?|border-(?:top|bottom)-(?:left|right)-radius)$/;
const SIDE_VALUE_PROPERTY = /^(?:text-align|float|clear)$/;
const SIDE_VALUE = /^(?:left|right)$/;

export const SCANNED_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
];

// "md:hover:-ml-2!" to "ml-2": drops variants (split on colons outside
// brackets), the important marks and the negative sign.
function utilityOf(token) {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < token.length; index += 1) {
    const char = token[index];
    if (char === "[" || char === "(") depth += 1;
    else if (char === "]" || char === ")") depth -= 1;
    else if (char === ":" && depth === 0) start = index + 1;
  }
  return token
    .slice(start)
    .replace(/^!/, "")
    .replace(/!$/, "")
    .replace(/^-/, "");
}

// Arbitrary properties ("[margin-left:4px]") and arbitrary shorthand values
// ("m-[0_1rem_0_0]") carry plain CSS, so they get the CSS rule.
const ARBITRARY_PROPERTY = /^\[([a-z-]+):(.+)\]$/;
const ARBITRARY_SHORTHAND =
  /^(m|p|inset|scroll-m|scroll-p|rounded|border)-\[(.+)\]$/;
const SHORTHAND_PROPERTY = {
  m: "margin",
  p: "padding",
  inset: "inset",
  "scroll-m": "scroll-margin",
  "scroll-p": "scroll-padding",
  rounded: "border-radius",
  border: "border-width",
};

export function isPhysicalUtility(token) {
  const utility = utilityOf(token);
  if (PHYSICAL_UTILITIES.some((pattern) => pattern.test(utility))) return true;

  const property = ARBITRARY_PROPERTY.exec(utility);
  if (property) {
    return isPhysicalDeclaration(property[1], property[2].replaceAll("_", " "));
  }
  const shorthand = ARBITRARY_SHORTHAND.exec(utility);
  if (shorthand) {
    return isPhysicalDeclaration(
      SHORTHAND_PROPERTY[shorthand[1]],
      shorthand[2].replaceAll("_", " "),
    );
  }
  return false;
}

// Every physical utility in a class string, as written.
export function findPhysicalClasses(classes) {
  return classes
    .split(/\s+/)
    .filter((token) => token !== "" && isPhysicalUtility(token));
}

// Shorthands whose four values run top, right, bottom, left: they are
// physical when the right and left values differ.
const BOX_SHORTHAND =
  /^(?:margin|padding|inset|scroll-margin|scroll-padding|border-width|border-style|border-color)$/;

// Splits a CSS value on spaces outside brackets, so calc(1px + 2px) stays one
// value. "!important" is dropped.
function cssValues(value) {
  const values = [];
  let depth = 0;
  let current = "";
  for (const char of value.replace(/!important\s*$/i, "").trim()) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (/\s/.test(char) && depth === 0) {
      if (current) values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) values.push(current);
  return values;
}

// Mirroring a page swaps left and right; a shorthand is physical when that
// swap would change what it draws.
function isAsymmetricShorthand(name, value) {
  if (BOX_SHORTHAND.test(name)) {
    const values = cssValues(value);
    return values.length === 4 && values[1] !== values[3];
  }
  if (name === "border-radius") {
    // Corners run top-left, top-right, bottom-right, bottom-left, for the
    // horizontal radii and again after a "/" for the vertical ones.
    return value.split("/").some((part) => {
      const values = cssValues(part);
      const [a, b = a, c = a, d = b] = values;
      return values.length > 1 && (a !== b || c !== d);
    });
  }
  return false;
}

export function isPhysicalDeclaration(property, value) {
  const name = property.trim().toLowerCase();
  if (PHYSICAL_PROPERTY.test(name)) return true;
  if (isAsymmetricShorthand(name, value)) return true;
  return SIDE_VALUE_PROPERTY.test(name) && SIDE_VALUE.test(value.trim());
}

function kebab(name) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function scriptKind(fileName) {
  switch (extname(fileName)) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function isTemplateText(node) {
  return (
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  );
}

function literalText(node) {
  return ts.isStringLiteral(node) || isTemplateText(node) ? node.text : null;
}

// Class tokens live in string and template literals (className values, cx()
// arguments, constants). JSX text and comments are prose and are skipped.
export function findPhysicalInSource(text, fileName = "file.tsx") {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(fileName),
  );
  const hits = [];
  const lineOf = (node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  function styleProperties(node) {
    if (
      ts.isPropertyAssignment(node) ||
      ts.isShorthandPropertyAssignment(node)
    ) {
      const name = node.name.getText(source).replace(/^["'`]|["'`]$/g, "");
      const value = ts.isPropertyAssignment(node)
        ? (literalText(node.initializer) ?? "")
        : "";
      if (isPhysicalDeclaration(kebab(name), value)) {
        hits.push({ line: lineOf(node), match: node.getText(source) });
      }
    }
    ts.forEachChild(node, styleProperties);
  }

  function visit(node) {
    const literal = literalText(node);
    if (literal !== null) {
      for (const match of findPhysicalClasses(literal)) {
        hits.push({ line: lineOf(node), match });
      }
    }
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(source) === "style" &&
      node.initializer
    ) {
      styleProperties(node.initializer);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return hits;
}

const DECLARATION = /(^|[\s;{])(-?[A-Za-z][\w-]*)\s*:\s*([^;{}]*)/g;
const APPLY = /@apply\s+([^;{}]+)/g;

// Comments become spaces, keeping line numbers.
function withoutComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, " "),
  );
}

export function findPhysicalInCss(text) {
  const css = withoutComments(text);
  const hits = [];
  const lineAt = (index) => css.slice(0, index).split("\n").length;

  for (const match of css.matchAll(DECLARATION)) {
    const [, before, property, value] = match;
    if (isPhysicalDeclaration(property, value)) {
      hits.push({
        line: lineAt(match.index + before.length),
        match: `${property}: ${value.trim()}`,
      });
    }
  }
  for (const match of css.matchAll(APPLY)) {
    for (const token of findPhysicalClasses(match[1])) {
      hits.push({ line: lineAt(match.index), match: `@apply ${token}` });
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

export function scanFile(path, text = readFileSync(path, "utf8")) {
  return extname(path) === ".css"
    ? findPhysicalInCss(text)
    : findPhysicalInSource(text, path);
}

export function filesUnder(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && SCANNED_EXTENSIONS.includes(extname(entry.name)),
    )
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

// Every hit under dir, with its path relative to base.
export function scanTree(dir, base = process.cwd()) {
  const files = filesUnder(dir);
  const hits = files.flatMap((file) =>
    scanFile(file).map((hit) => ({
      file: relative(base, file).replaceAll("\\", "/"),
      ...hit,
    })),
  );
  return { files: files.length, hits };
}
