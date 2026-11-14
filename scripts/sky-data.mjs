// Writes src/engine/sky/catalogue.ts from the two sky sources (D-146):
//   node scripts/sky-data.mjs <folder>
// where the folder holds hyg_v44.csv.gz (codeberg.org/astronexus/hyg) and
// ConstellationLines.dat (github.com/MarcvdSluys/ConstellationLines). The
// sources are not in the repository; the written file names them and their
// licences. It is formatted with the repository's Prettier settings.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import * as prettier from "prettier";
import { buildCatalogue, catalogueSource } from "./sky-data-lib.mjs";

export const CATALOGUE_PATH = fileURLToPath(
  new URL("../src/engine/sky/catalogue.ts", import.meta.url),
);

const folder = process.argv[2];
if (!folder) {
  console.error("Usage: node scripts/sky-data.mjs <folder with the sources>");
  process.exit(1);
}

const hyg = gunzipSync(readFileSync(join(folder, "hyg_v44.csv.gz"))).toString(
  "utf8",
);
const lines = readFileSync(join(folder, "ConstellationLines.dat"), "utf8");
const catalogue = buildCatalogue(hyg, lines);
const options = (await prettier.resolveConfig(CATALOGUE_PATH)) ?? {};
const source = await prettier.format(catalogueSource(catalogue), {
  ...options,
  filepath: CATALOGUE_PATH,
});
writeFileSync(CATALOGUE_PATH, source);
console.log(
  `${catalogue.stars.length} stars, ${catalogue.segments.length} lines, ` +
    `${catalogue.constellations.length} constellations, ${source.length} bytes`,
);
