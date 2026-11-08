const NAME = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*(?:=|$)/;

// Names listed in .env.example, in file order. Comments and blank lines are
// skipped; anything after "=" is ignored.
export function exampleNames(exampleText) {
  const names = [];
  for (const line of exampleText.split(/\r?\n/)) {
    const name = line.match(NAME)?.[1];
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

// Names with a non-empty value in a .env file. Values are read only to test
// for emptiness and never leave this function.
export function namesWithValues(envText) {
  const present = new Set();
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/,
    );
    if (!match) continue;
    const raw = match[2].trim();
    const quoted = raw.match(/^(['"`])(.*)\1/);
    // Unquoted values end at a comment: "KEY= # note" has no value.
    const value = quoted ? quoted[2] : raw.replace(/(?:^|\s+)#.*$/, "").trim();
    if (value.length > 0) present.add(match[1]);
  }
  return present;
}

// One line per name: "ok NAME" or "missing NAME". Never a value (REQ-SEC-01).
export function envReport(names, present, processEnv = {}) {
  return names.map((name) =>
    present.has(name) || (processEnv[name] ?? "").length > 0
      ? `ok ${name}`
      : `missing ${name}`,
  );
}
