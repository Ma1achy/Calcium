import { checkSectionReferences, referenceFiles, specFiles } from "./tools/enforce/commitments.mjs";
const all = [...new Set([...referenceFiles(), ...specFiles()])].sort();
const gated = all.filter((f) => !f.startsWith("docs/notes/") && f !== "docs/COMMITMENT_INVARIANT_AUDIT.md" && f !== "CLAUDE.md" && f !== "docs/README.md");
const { violations, resolved } = checkSectionReferences(gated);
const un = violations.filter((v) => /nothing before it says/.test(v.message));
const dg = violations.filter((v) => !/nothing before it says/.test(v.message));
console.log(`gated files: ${gated.length} of ${all.length} · resolved ${resolved}`);
console.log(`unowned ${un.length} in ${new Set(un.map((v) => v.file.replace(/:\d+$/, ""))).size} files`);
const byFile = new Map();
for (const v of un) { const f = v.file.replace(/:\d+$/, ""); byFile.set(f, (byFile.get(f) ?? 0) + 1); }
for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${f}`);
console.log(`dangling ${dg.length}`);
