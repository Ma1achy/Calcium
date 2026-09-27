// Released HISTORY: content, status, LINKS, membership and release identity.
// A digest beside the baseline is a tripwire; the anchor must be sealed externally.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));   // resolve beside this file
import { createHash } from "node:crypto";
const base = JSON.parse(readFileSync(join(here, "released-baseline.json"), "utf8"));
const reg  = JSON.parse(readFileSync(join(here, "calcium-registry.json"), "utf8"));
const norm = v => !v ? [] : (Array.isArray(v) ? [...v].sort() : [v]);
let bad = 0; const fail = m => { console.error("  " + m); bad++; };

// **Theme rules are sealed the way rules are** (AUTHORITY §Release 5): one walk
// over two maps, so a check added for one kind cannot be forgotten for the other.
const KINDS = [
  { name: "rules", label: "rule", records: reg.rules ?? [], sealed: base.rules ?? {}, count: base.count },
  { name: "themeRules", label: "theme rule", records: reg.themeRules ?? [], sealed: base.themeRules ?? {}, count: base.themeCount },
];

// membership + tamper anchor
for (const k of KINDS)
  if (k.count !== undefined && Object.keys(k.sealed).length !== k.count)
    fail(`baseline says ${k.count} ${k.label} ids, holds ${Object.keys(k.sealed).length}`);
if (base.anchor?.sha256) {
  const sorted = m => Object.fromEntries(Object.keys(m).sort().map(k => [k, m[k]]));
  // The rules-only form is the anchor every baseline before §Release 5 carried.
  const canon = base.themeRules === undefined
    ? JSON.stringify(sorted(base.rules))
    : JSON.stringify({ rules: sorted(base.rules), themeRules: sorted(base.themeRules) });
  const h = createHash("sha256").update(canon).digest("hex");
  if (h !== base.anchor.sha256)
    fail("baseline anchor mismatch — the baseline itself was edited");
}

// release identity — the field is meta.revision, not version
const rev = reg.meta?.revision;
if (base.registryRevision && base.registryRevision !== "unknown" && rev !== base.registryRevision)
  fail(`registry revision ${rev} ≠ baseline ${base.registryRevision} — re-release, do not edit`);

const LEGAL = { current: ["current", "superseded"], superseded: ["superseded"],
                example: ["example", "superseded"] };
for (const k of KINDS) {
  const now = new Map(k.records.map(r => [r.id, r]));
  // **Becoming current and being released are one commit** (AUTHORITY.md §Release).
  // Every check below walks the baseline, so a current record the baseline never
  // held was checked by nothing — 22 rules at revision 0.9, and one was rewritten
  // under its own ID with every gate green. This walks the registry instead.
  for (const r of k.records)
    if (r.status === "current" && !(r.id in k.sealed))
      fail(`${r.id}: CURRENT ${k.label.toUpperCase()} NOT RELEASED — run tools/design/release.mjs in the same commit`);

  for (const [id, b] of Object.entries(k.sealed)) {
    const r = now.get(id);
    if (!r) { fail(`${id}: RELEASED ${k.label.toUpperCase()} DELETED`); continue; }
    if (r.contentDigest !== b.digest) fail(`${id}: released digest changed`);
    if (!(LEGAL[b.status] ?? [b.status]).includes(r.status))
      fail(`${id}: ILLEGAL STATUS TRANSITION ${b.status} → ${r.status}`);
    // LINK IMMUTABILITY — reciprocal is not enough; the TARGET cannot change
    const wasBy = b.supersededBy, isBy = norm(r.supersededBy);
    if (wasBy.length && JSON.stringify(wasBy) !== JSON.stringify(isBy))
      fail(`${id}: supersededBy REDIRECTED ${wasBy.join(",")} → ${isBy.join(",") || "none"}`);
    const wasS = b.supersedes, isS = norm(r.supersedes);
    if (JSON.stringify(wasS) !== JSON.stringify(isS))
      fail(`${id}: supersedes list changed ${wasS.join(",")||"none"} → ${isS.join(",")||"none"}`);
    if (r.status === "superseded" && !isBy.length) fail(`${id}: superseded with no link`);
    for (const s of isBy) {
      const t = now.get(s);
      if (!t) fail(`${id}: supersededBy ${s} which does not exist`);
      else if (!norm(t.supersedes).includes(id)) fail(`${id} ↔ ${s}: link not reciprocal`);
    }
  }
}
const themes = Object.keys(base.themeRules ?? {}).length;
console.log(bad ? `FAIL · ${bad} history violations`
  : `OK · ${base.count} released rules and ${themes} released theme rules: content, status, LINKS, membership and revision intact`);
process.exit(bad ? 1 : 0);
