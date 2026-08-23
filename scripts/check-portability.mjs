// Enforces the layering rule that makes components/sketch-to-3d portable:
// `core/` and `ui/` must not depend on the renderer, so moving to a different
// three.js scene only means replacing `r3f/`.
//
// Folder names alone do not enforce anything — this does.
//
//   node scripts/check-portability.mjs

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = "components/sketch-to-3d";
const SEALED = ["core", "ui"];
const FORBIDDEN = /from\s+["'](three|@react-three\/[^"']+)["']/g;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path);
  }
  return out;
}

const violations = [];

for (const folder of SEALED) {
  for (const file of await walk(join(ROOT, folder))) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(FORBIDDEN)) {
      const line = source.slice(0, match.index).split("\n").length;
      violations.push(`${relative(".", file)}:${line}  imports "${match[1]}"`);
    }
  }
}

if (violations.length > 0) {
  console.error(`\n  PORTABILITY VIOLATION — ${SEALED.join("/ and ")}/ must not import the renderer\n`);
  for (const v of violations) console.error(`    ${v}`);
  console.error(`\n  Renderer-specific code belongs in ${ROOT}/r3f/.\n`);
  process.exit(1);
}

console.log(`  portability OK — ${SEALED.join("/, ")}/ are renderer-free`);
