// Released HISTORY: content, status, LINKS, membership and release identity.
// A digest beside the baseline is a tripwire; the anchor must be sealed externally.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));   // resolve beside this file
import { createHash } from "node:crypto";
const base = JSON.parse(readFileSync(join(here, "released-baseline.json"), "utf8"));
const reg  = JSON.parse(readFileSync(join(here, "calcium-registry.json"), "utf8"));
const now  = new Map(reg.rules.map(r => [r.id, r]));
const norm = v => !v ? [] : (Array.isArray(v) ? [...v].sort() : [v]);
let bad = 0; const fail = m => { console.error("  " + m); bad++; };

// membership + tamper anchor
if (Object.keys(base.rules).length !== base.count)
  fail(`baseline says ${base.count} ids, holds ${Object.keys(base.rules).length}`);
if (base.anchor?.sha256) {
  const canon = JSON.stringify(Object.fromEntries(
    Object.keys(base.rules).sort().map(k => [k, base.rules[k]])));
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
for (const [id, b] of Object.entries(base.rules)) {
  const r = now.get(id);
  if (!r) { fail(`${id}: RELEASED RULE DELETED`); continue; }
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
console.log(bad ? `FAIL · ${bad} history violations`
  : `OK · ${base.count} released rules: content, status, LINKS, membership and revision intact`);
process.exit(bad ? 1 : 0);
