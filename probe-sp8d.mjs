import { checkSectionReferences, referenceFiles, specFiles, sectionsOf } from "./tools/enforce/commitments.mjs";
const all = [...new Set([...referenceFiles(), ...specFiles()])].sort();
const gated = all.filter((f) => !f.startsWith("docs/notes/") && f !== "docs/COMMITMENT_INVARIANT_AUDIT.md" && f !== "CLAUDE.md" && f !== "docs/README.md");
const { violations } = checkSectionReferences(gated);
const dg = violations.filter((v) => !/nothing before it says/.test(v.message));
const by = new Map();
for (const v of dg) { const k = /cites (\S+ §\S+)/.exec(v.message)?.[1] ?? "?"; by.set(k, (by.get(k) ?? 0) + 1); }
for (const [k, n] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`${String(n).padStart(3)}  ${k}`);
console.log("\nC26 declares:", [...sectionsOf("docs/components/C26_navigation.md")].join(" "));
console.log("C22 declares:", [...sectionsOf("docs/components/C22_composition_root.md")].join(" "));
