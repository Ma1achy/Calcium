import { checkSectionReferences, referenceFiles, specFiles } from "./tools/enforce/commitments.mjs";
const files = [...new Set([...referenceFiles(), ...specFiles()])].sort();
const { violations, resolved } = checkSectionReferences(files);
console.log(`resolved ${resolved} · ${violations.length} violations`);
const byMsg = new Map();
for (const v of violations) {
  const k = /has no such section/.test(v.message) ? v.message.split("cites ")[1].split(",")[0] : "unowned";
  byMsg.set(k, (byMsg.get(k) ?? 0) + 1);
}
for (const [k, n] of [...byMsg].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${String(n).padStart(3)}  ${k}`);
