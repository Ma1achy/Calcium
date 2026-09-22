import { readFileSync, writeFileSync } from "node:fs";
const P = "docs/design/language/calcium-registry.json";
const reg = JSON.parse(readFileSync(P, "utf8"));

// **Domains are screen regions, and two of them nest.** A content row carries
// both its lead cells and the separators between its fields, so a mark in the
// lead and a mark inline meet on the same row and a reader can confuse them —
// which is why `:` as a collapsed-disclosure mark clashes with `:` as a field
// separator. A table header is a different row, so the sort marks may take `v`
// and `^` while disclosure keeps `v` in the lead.
reg.collisionDomains = {
  "content-row": { contains: ["row-lead", "inline"], note: "a transcript or table body row" },
  "row-lead": { contains: [], note: "the gutter and lead cells of a content row" },
  "inline": { contains: [], note: "between the fields of a content row" },
  "table-header": { contains: [], note: "a table's header row" },
  "border": { contains: [], note: "a frame's own rows and columns" },
  "plot": { contains: [], note: "inside a plot's drawing region" },
  "form-row": { contains: [], note: "a form or question row — reserved, its first renderer is M16" },
};

const DOMAIN = {
  "work-unit": ["row-lead"],
  branch: ["row-lead"],
  attention: ["row-lead"],
  "meter-fill": ["inline"],
  success: ["row-lead"],
  reader: ["row-lead"],
  focus: ["row-lead"],
  "disclosure-collapsed": ["row-lead"],
  disclosure: ["row-lead"],
  question: ["row-lead"],
  current: ["row-lead"],
  rule: ["border"],
  ellipsis: ["inline"],
  "choice-open": ["row-lead"],
  failure: ["row-lead"],
  "sort-desc": ["table-header"],
  "sort-asc": ["table-header"],
  "tape-left": ["inline"],
  "tape-right": ["inline"],
};

for (const g of [...reg.glyphs, ...reg.delimiters]) {
  const d = DOMAIN[g.id];
  if (!d) throw new Error(`${g.id} has no domain assignment`);
  g.collisionDomains = d;
}

const collapsed = reg.glyphs.find(g => g.id === "disclosure-collapsed");
collapsed.ascii = "(";   // `:` withdrawn — it is `GlyphSet.separator`, same row

const tmpl = id => ({
  id, unicode: "", ascii: "", semanticRole: "", tone: "muted",
  widthByCapability: { unicode: 1, ascii: 1 }, reservedCells: 1,
  collisionDomains: ["table-header"], accessibleName: "", status: "current",
  ruleIds: ["R-GLY-001"], canonical: true, widthClass: "ambiguous",
});
const desc = { ...tmpl("sort-desc"), unicode: "▾", ascii: "v",
  semanticRole: "sort descending", accessibleName: "sorted descending" };
const asc = { ...tmpl("sort-asc"), unicode: "▴", ascii: "^",
  semanticRole: "sort ascending", accessibleName: "sorted ascending" };
const at = reg.glyphs.findIndex(g => g.id === "current");
reg.glyphs.splice(at + 1, 0, desc, asc);

writeFileSync(P, JSON.stringify(reg, null, 2) + "\n");
console.log("id                     mark  ascii  domain");
for (const g of [...reg.glyphs, ...reg.delimiters])
  console.log(`  ${g.id.padEnd(22)} ${g.unicode}    ${JSON.stringify(g.ascii).padEnd(6)} ${g.collisionDomains.join(", ")}`);
console.log(`\n${reg.glyphs.length} glyphs, ${reg.glyphs.filter(g => g.canonical).length} canonical`);
