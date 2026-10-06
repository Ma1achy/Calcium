// The registry's glyph records and each one's **home** in the tree — the module,
// the exported symbol a renderer reads, and how the mark resolves at a rung.
//
// **Moved here from `test/contract/glyph-registry.test.ts`** (F1465), because a
// second reader needs the same map: `design-surfaces.ts`'s §006 census draws the
// registry's canonical set through these homes, and a census that kept its own
// copy of the mapping would be a second record of which tree symbol answers for
// which design mark — the thing C09 I123's row exists to hold in one place.
import { readFileSync } from "node:fs";

import type { Glyph } from "../../src/data/viewmodel/index.js";
import * as glyphModule from "../../src/presentation/blocks/glyphs.js";
import * as configModule from "../../src/shell/config.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

type Caps = TerminalCapabilities;
export type RegistryGlyph = {
  id: string;
  unicode?: string;
  ascii?: string;
  reservedCells?: number;
  collisionDomains?: readonly string[];
  status: string;
  asciiResolution?: string;
  semanticRole?: string;
  canonical?: boolean;
};

/** The registry file the homes are read against — named so a test can say which file it is about. */
export const REGISTRY_FILE = "docs/design/language/calcium-registry.json";
const registry = JSON.parse(readFileSync(REGISTRY_FILE, "utf8")) as {
  glyphs: RegistryGlyph[];
  delimiters: RegistryGlyph[];
};
/** Every current record, glyphs and delimiters — C09 I123's subject. */
export const records: readonly RegistryGlyph[] = [...registry.glyphs, ...registry.delimiters].filter(
  (g) => g.status === "current",
);

/**
 * Each record's home: the module, the exported symbol a renderer reads, and how
 * the mark is resolved from it at a capability. `domains` is the home's own
 * collision table, or `null` where the home has none (`glyph-registry.test.ts`'s
 * `NO_DOMAIN_TABLE` says why for each).
 */
export type Home = Readonly<{
  path: string;
  symbol: string;
  read: (caps: Caps) => string;
  domains: readonly string[] | null;
  token?: Glyph;
}>;

const vocab = (token: Glyph): Home => ({
  path: "src/presentation/blocks/glyphs.ts",
  symbol: "glyphFor",
  read: (caps) => glyphModule.glyphFor(token, caps),
  domains: glyphModule.GLYPH_DOMAINS[token],
  token,
});
const set = (key: keyof ReturnType<typeof glyphModule.glyphs>): Home => ({
  path: "src/presentation/blocks/glyphs.ts",
  symbol: "glyphs",
  read: (caps) => glyphModule.glyphs(caps)[key],
  domains: glyphModule.GLYPH_SET_DOMAINS[key],
});

export const HOMES: Readonly<Record<string, Home>> = {
  "work-unit": vocab("work-unit"),
  branch: vocab("continuation"),
  attention: vocab("warn"),
  success: vocab("ok"),
  focus: vocab("focus"),
  "disclosure-collapsed": vocab("expand"),
  disclosure: vocab("collapse"),
  question: vocab("question"),
  current: vocab("current"),
  failure: vocab("error"),
  "sort-desc": set("sortDesc"),
  "sort-asc": set("sortAsc"),
  "trend-up": set("trendUp"),
  "trend-down": set("trendDown"),
  "trend-flat": set("trendFlat"),
  rule: set("horizontal"),
  ellipsis: set("residue"),
  "choice-open": set("choiceOpen"),
  revert: set("revert"),
  "selection-rail": set("rail"),
  "tape-left": set("tapeLeft"),
  "tape-right": set("tapeRight"),
  "meter-fill": {
    path: "src/presentation/blocks/glyphs.ts",
    symbol: "barStyle",
    read: (caps) => glyphModule.barStyle(caps, "slant").on,
    domains: null,
  },
  reader: {
    path: "src/shell/config.ts",
    symbol: "PROMPT_SUBSTITUTION",
    // The prompt form carries its trailing gutter blank; the mark is the first cluster.
    read: (caps) => [...(caps.unicode === "ascii" ? configModule.PROMPT_SUBSTITUTION[1] : configModule.PROMPT_SUBSTITUTION[0])][0] ?? "",
    domains: null,
  },
};

/** The registry's canonical marks, in registry order — §006's census (`R-GLY-003`, `canonical: true`). */
export const canonicalRecords: readonly RegistryGlyph[] = registry.glyphs.filter(
  (g) => g.status === "current" && g.canonical === true,
);

/** The current records that are not canonical — §006's *supporting registered marks*. */
export const supportingRecords: readonly RegistryGlyph[] = registry.glyphs.filter(
  (g) => g.status === "current" && g.canonical !== true,
);

/** The current delimiters — §006's last line. */
export const delimiterRecords: readonly RegistryGlyph[] = registry.delimiters.filter((g) => g.status === "current");
