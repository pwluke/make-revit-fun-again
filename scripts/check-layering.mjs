// Enforces the sketch3d dependency rings. See docs/specs/2026-08-22-sketch-3d-design.md §4.
//
// The rings are the reason this feature ports to a plain three.js app: only `r3f/`
// is React-specific. Folder names alone decay into fiction within a day, so this
// check is the thing that actually holds the promise. Do not relax it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";

const RINGS_ROOT = "components/sketch3d";

const RULES = [
  {
    dir: `${RINGS_ROOT}/core`,
    forbidden: [/from ["']three/, /from ["']react/, /from ["']@react-three/],
    // core is the innermost ring: it may depend on nothing else in the feature.
    forbiddenRelativeRings: ["three", "r3f", "ui"],
  },
  {
    dir: `${RINGS_ROOT}/three`,
    forbidden: [/from ["']react/, /from ["']@react-three/],
    // three/ may depend inward on core/, but never on the React glue layer.
    forbiddenRelativeRings: ["r3f"],
  },
  {
    dir: `${RINGS_ROOT}/ui`,
    forbidden: [/from ["']three/, /from ["']@react-three/],
    // ui overlays the DOM; it must not depend on the React/R3F scene glue either.
    forbiddenRelativeRings: ["r3f"],
  },
];

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

// Relative imports (`../three/StrokeLayer`) never match a package-name regex like
// `from ["']three`, so a ring inversion via relative path was previously invisible.
// Resolve every relative import specifier back to the sketch3d ring it lands in and
// check that against the same rule set.
const ringOfImport = (fromFile, specifier) => {
  if (!specifier.startsWith(".")) return null;
  const fromDir = posix.dirname(fromFile.split("\\").join("/"));
  const resolved = posix.normalize(posix.join(fromDir, specifier));
  const rel = posix.relative(RINGS_ROOT, resolved);
  if (rel.startsWith("..")) return null;
  return rel.split("/")[0];
};

let failed = false;
for (const { dir, forbidden, forbiddenRelativeRings } of RULES) {
  for (const file of walk(dir)) {
    const source = readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(source)) {
        console.error(`✗ ${file} violates the ring rule: matched ${pattern}`);
        failed = true;
      }
    }

    const posixFile = file.split("\\").join("/");
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const specifier = match[1];
      const targetRing = ringOfImport(posixFile, specifier);
      if (targetRing && forbiddenRelativeRings?.includes(targetRing)) {
        console.error(
          `✗ ${file} violates the ring rule: relative import "${specifier}" reaches into ring "${targetRing}"`,
        );
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
