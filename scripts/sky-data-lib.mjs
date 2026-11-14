// Turns the two sky sources into the catalogue the contact chapter draws
// (D-146): stars from the HYG database (codeberg.org/astronexus/hyg, CC
// BY-SA 4.0) and constellation lines from ConstellationLines.dat by Marc van
// der Sluys (github.com/MarcvdSluys/ConstellationLines, CC BY 4.0), whose
// lines are Bright Star Catalogue (HR) numbers. Pure functions, tested in
// sky-data-lib.test.mjs; sky-data.mjs reads the files and writes the result.

/** Stars this bright or brighter are kept, and every star a line uses. */
export const MAGNITUDE_LIMIT = 5;

/**
 * Close doubles the HYG database keeps as one row under the first star's HR
 * number; the line file names the second. Checked in hyg_v44 on 14 Nov 2026:
 * the second number has no row and the pair shares the first row's place.
 */
export const DOUBLES = Object.freeze({
  596: 595,
  888: 887,
  898: 897,
  1190: 1189,
  3206: 3207,
  4058: 4057,
  5506: 5505,
});

/** One CSV line into its fields; quoted fields may hold commas and "". */
export function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      fields.push(field);
      field = "";
    } else field += char;
  }
  fields.push(field);
  return fields;
}

/**
 * The line file: one row a stroke, "Abr count hr hr ...". A constellation
 * may have more than one row. Comments start with #.
 */
export function parseLines(text, doubles = DOUBLES) {
  const lines = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const row = raw.trim();
    if (row === "" || row.startsWith("#")) continue;
    const [abbreviation, countText, ...numbers] = row.split(/\s+/);
    const count = Number(countText);
    if (!abbreviation || !Number.isInteger(count) || numbers.length !== count) {
      throw new Error(`Bad line row: ${row}`);
    }
    const stroke = numbers.map((text) => {
      const hr = Number(text);
      if (!Number.isInteger(hr) || hr <= 0) throw new Error(`Bad HR: ${text}`);
      return doubles[hr] ?? hr;
    });
    const strokes = lines.get(abbreviation) ?? [];
    strokes.push(stroke);
    lines.set(abbreviation, strokes);
  }
  return lines;
}

const round = (value, places) => Number(value.toFixed(places));

/**
 * The catalogue: the constellations in the line file's order; per star its
 * right ascension in hours and declination in degrees (J2000), magnitude
 * and constellation index (-1 for none); per segment its two star indices,
 * constellation index and order within the constellation, every pair once.
 */
export function buildCatalogue(
  hygCsv,
  linesText,
  { magnitudeLimit = MAGNITUDE_LIMIT, doubles = DOUBLES } = {},
) {
  const lines = parseLines(linesText, doubles);
  const constellations = [...lines.keys()];
  const used = new Set([...lines.values()].flat(2));

  const rows = hygCsv.split(/\r?\n/);
  const head = parseCsvLine(rows[0] ?? "");
  const column = (name) => {
    const index = head.indexOf(name);
    if (index < 0) throw new Error(`No ${name} column`);
    return index;
  };
  const at = {
    hr: column("hr"),
    ra: column("ra"),
    dec: column("dec"),
    mag: column("mag"),
    con: column("con"),
    proper: column("proper"),
  };

  const stars = [];
  const indexOfHr = new Map();
  for (const row of rows.slice(1)) {
    if (row === "") continue;
    const fields = parseCsvLine(row);
    if (fields[at.proper] === "Sol") continue;
    const hr = fields[at.hr] ? Number(fields[at.hr]) : 0;
    const magnitude = Number(fields[at.mag]);
    const kept = magnitude <= magnitudeLimit || (hr > 0 && used.has(hr));
    if (!kept || (hr > 0 && indexOfHr.has(hr))) continue;
    if (hr > 0) indexOfHr.set(hr, stars.length);
    stars.push([
      round(Number(fields[at.ra]), 4),
      round(Number(fields[at.dec]), 3),
      round(magnitude, 2),
      constellations.indexOf(fields[at.con]),
    ]);
  }

  const missing = [...used].filter((hr) => !indexOfHr.has(hr));
  if (missing.length > 0) {
    throw new Error(`Line stars missing from the stars: ${missing.join(", ")}`);
  }

  const segments = [];
  constellations.forEach((abbreviation, constellation) => {
    const seen = new Set();
    for (const stroke of lines.get(abbreviation) ?? []) {
      for (let step = 0; step + 1 < stroke.length; step += 1) {
        const a = indexOfHr.get(stroke[step]);
        const b = indexOfHr.get(stroke[step + 1]);
        if (a === undefined || b === undefined || a === b) continue;
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (seen.has(key)) continue;
        seen.add(key);
        segments.push([a, b, constellation, seen.size - 1]);
      }
    }
  });

  return { constellations, stars, segments };
}

/** The catalogue as the TypeScript module the engine and the page import. */
export function catalogueSource({ constellations, stars, segments }) {
  return [
    "// Written by scripts/sky-data.mjs; do not edit by hand (D-146).",
    "//",
    "// Stars: an extract of the HYG database v4.4,",
    "// https://codeberg.org/astronexus/hyg, licensed under Creative Commons",
    "// Attribution-ShareAlike 4.0 International (CC BY-SA 4.0); this extract",
    "// is shared under the same licence.",
    "// Constellation lines: ConstellationLines.dat, Copyright (c) 2005-2026",
    "// Marc van der Sluys, https://github.com/MarcvdSluys/ConstellationLines,",
    "// licensed under Creative Commons Attribution 4.0 International",
    "// (CC BY 4.0), DOI 10.5281/zenodo.10397192.",
    "",
    "/** IAU abbreviations, in the order the indices below use. */",
    `export const SKY_CONSTELLATIONS = ${JSON.stringify(constellations)} as const;`,
    "",
    "/**",
    " * Four numbers a star: right ascension in hours and declination in",
    " * degrees (J2000), visual magnitude, constellation index (-1 for none).",
    " */",
    `export const SKY_STARS: readonly number[] = ${JSON.stringify(stars.flat())};`,
    "",
    "/**",
    " * Four numbers a constellation line: its two star indices, its",
    " * constellation index and its order within that constellation.",
    " */",
    `export const SKY_SEGMENTS: readonly number[] = ${JSON.stringify(segments.flat())};`,
    "",
  ].join("\n");
}
