// REQ-I18N-01: prints every physical left or right use under src and exits 1
// when there is one. The checks live in class-scan-lib.mjs.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { scanTree } from "./class-scan-lib.mjs";

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { files, hits } = scanTree("src");
  hits.forEach(({ file, line, match }) =>
    console.log(`FAIL ${file}:${line} ${match}`),
  );
  if (hits.length > 0) {
    console.log(`FAIL class-scan: ${hits.length} physical left or right uses`);
    process.exit(1);
  }
  console.log(`ok class-scan: ${files} files, no physical left or right`);
}
