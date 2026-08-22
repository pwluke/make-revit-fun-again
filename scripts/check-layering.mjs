// Enforces the sketch3d dependency rings. See docs/specs/2026-08-22-sketch-3d-design.md §4.
//
// The rings are the reason this feature ports to a plain three.js app: only `r3f/`
// is React-specific. Folder names alone decay into fiction within a day, so this
// check is the thing that actually holds the promise. Do not relax it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RULES = [
  {
    dir: "components/sketch3d/core",
    forbidden: [/from ["']three/, /from ["']react/, /from ["']@react-three/],
  },
  {
    dir: "components/sketch3d/three",
    forbidden: [/from ["']react/, /from ["']@react-three/],
  },
  {
    dir: "components/sketch3d/ui",
    forbidden: [/from ["']three/, /from ["']@react-three/],
  },
];

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

let failed = false;
for (const { dir, forbidden } of RULES) {
  for (const file of walk(dir)) {
    const source = readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(source)) {
        console.error(`✗ ${file} violates the ring rule: matched ${pattern}`);
        failed = true;
      }
    }
  }
}

if (failed) {
  console.error("\nsketch3d layering check FAILED — this breaks the portability promise.");
  process.exit(1);
}
console.log("✓ sketch3d layering check passed");
