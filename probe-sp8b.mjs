import { checkSectionReferences, referenceFiles, specFiles } from "./tools/enforce/commitments.mjs";
const files = [...new Set([...referenceFiles(), ...specFiles()])].sort();
const { violations } = checkSectionReferences(files);
const unowned = new Map(), dangling = new Map();
for (const v of violations) {
  const f = v.file.replace(/:\d+$/, "");
  const m = /nothing before it says which document owns it/.test(v.message) ? unowned : dangling;
  m.set(f, (m.get(f) ?? 0) + 1);
}
console.log(`unowned files: ${unowned.size}`);
for (const [f, n] of [...unowned].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`  ${String(n).padStart(3)}  ${f}`);
console.log(`\ndangling in ${dangling.size} files:`);
for (const [f, n] of [...dangling].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`  ${String(n).padStart(3)}  ${f}`);
