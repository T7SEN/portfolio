// Formats or checks exactly the files git would commit (tracked plus untracked,
// minus ignored), so local files kept out of git are never touched.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as prettier from "prettier";

const write = process.argv.includes("--write");

const files = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter((file) => file && existsSync(file));

let checked = 0;
let unformatted = 0;

for (const file of files) {
  const info = await prettier.getFileInfo(file, {
    ignorePath: ".prettierignore",
    resolveConfig: true,
  });
  if (info.ignored || !info.inferredParser) continue;

  const options = { ...(await prettier.resolveConfig(file)), filepath: file };
  const source = readFileSync(file, "utf8");
  checked += 1;
  if (await prettier.check(source, options)) continue;

  if (write) {
    writeFileSync(file, await prettier.format(source, options));
    console.log(`formatted ${file}`);
  } else {
    console.log(`not formatted: ${file}`);
    unformatted += 1;
  }
}

if (unformatted > 0) {
  console.log(`FAIL format: ${unformatted} of ${checked} files`);
  process.exit(1);
}
console.log(`ok format: ${checked} files`);
