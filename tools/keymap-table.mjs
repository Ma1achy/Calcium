// The key ladder as one table — target × key → action, in `FOCUS_ORDER`.
//
//     npx tsx tools/keymap-table.mjs            # rewrites docs/KEYS.md
//     npx tsx tools/keymap-table.mjs --check    # exit 1 if docs/KEYS.md is stale
//
// **The keymap is the one source of key meaning** (C16 I23) and `/help` renders
// from it, so the table cannot drift from dispatch. What could drift was the
// *documentation*: the ladder per scope was prose in C16 §6 and §5 and nowhere
// a table a reader could check against the code. This reads `defaultKeymap`
// and `FOCUS_ORDER` — imported, never parsed from source — and writes the one
// table. `test/unit/keymap-table.test.ts` fails when the written file and the
// live keymap disagree, and `make instruments` lists this file.
//
// **Columns are the ladder.** `FOCUS_ORDER`'s array order *is* the priority
// (C16 §3, A02 §2): the active target is the first whose condition holds, and
// `global` is consulted after it. So a key bound at two targets is not a
// conflict — `createKeymap` refuses only a duplicate `(target, key)` — and
// which action fires depends on which target is active. Those keys are marked,
// because they are the rows a reader of C16 §6's prose has to reconstruct by
// hand, and the three the prose names (`pageup`/`pagedown`, `tab`, `⌥v`) are
// not the whole set.
//
// **Stated blind spot.** This is the built-in table. A `BlockKeymap` an adapter
// attaches (C26, `Keymap.mergeBlock`) lands at `liveBlock` or `interaction` at
// runtime and is not here — the `interaction` column is empty by construction,
// which the table says rather than omits.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { defaultKeymap, keyText } from "../src/interaction/router/keymap.js";
import { FOCUS_ORDER } from "../src/interaction/router/focus.js";

export const KEYS_DOC = "docs/KEYS.md";

/** The mark on a key bound at more than one target. */
export const LADDER_MARK = "†";

/**
 * Sort key: by name, then by the modifiers' text — so `a`, `c+a`, `m+a` read as
 * one family rather than being scattered by the modifier prefix.
 *
 * @param {{name: string}} a
 * @param {{name: string}} b
 */
function byKey(a, b) {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  const ta = keyText(a);
  const tb = keyText(b);
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

/**
 * The table, as data: one row per distinct key, one cell per target.
 *
 * @param {readonly {target: string, key: {name: string, ctrl?: boolean, meta?: boolean, shift?: boolean}, action: string}[]} bindings
 * @param {readonly string[]} order
 * @returns {{ rows: Array<{ text: string, cells: Map<string, string>, ladder: boolean }>, bindings: number, ladder: number }}
 */
export function tabulate(bindings, order) {
  /** @type {Map<string, { key: {name: string}, cells: Map<string, string> }>} */
  const byText = new Map();
  for (const b of bindings) {
    if (!order.includes(b.target)) {
      throw new Error(`binding ${b.target}:${keyText(b.key)} names a target outside FOCUS_ORDER`);
    }
    const text = keyText(b.key);
    const row = byText.get(text) ?? { key: b.key, cells: new Map() };
    if (row.cells.has(b.target)) {
      // `createKeymap` refuses this at construction; the generator refuses it
      // too rather than writing a cell that silently keeps one of the two.
      throw new Error(`duplicate binding for ${b.target} ${text}`);
    }
    row.cells.set(b.target, b.action);
    byText.set(text, row);
  }
  const rows = [...byText.values()]
    .sort((a, b) => byKey(a.key, b.key))
    .map((r) => ({ text: keyText(r.key), cells: r.cells, ladder: r.cells.size > 1 }));
  return {
    rows,
    bindings: bindings.length,
    ladder: rows.filter((r) => r.ladder).length,
  };
}

/**
 * The markdown, deterministic in its inputs and nothing else — no date, no
 * commit, so a regeneration that changes nothing writes nothing new.
 *
 * @param {Parameters<typeof tabulate>[0]} bindings
 * @param {readonly string[]} order
 */
export function renderKeymapTable(bindings, order) {
  const t = tabulate(bindings, order);
  const out = [];
  out.push("# Key ladder");
  out.push("");
  out.push(
    "**Generated** by `npx tsx tools/keymap-table.mjs` from `defaultKeymap` " +
      "(`src/interaction/router/keymap.ts`) in `FOCUS_ORDER` (`src/interaction/router/focus.ts`). " +
      "Do not edit by hand: `test/unit/keymap-table.test.ts` fails when this file and the live keymap disagree.",
  );
  out.push("");
  out.push(
    "Columns left to right are the ladder's priority (C16 §3, A02 §2): the active target is the " +
      "first whose condition holds, and `global` is consulted after it. A key bound at two or more " +
      `targets is marked ${LADDER_MARK} — which action fires depends on which target is active, ` +
      "never on the row's position in the source. `interaction` holds no built-in binding: a block's " +
      "own keys land there at runtime when they collide with `global` or `liveBlock` (C16 I27), " +
      "and are outside this table.",
  );
  out.push("");
  out.push(`| key | ${order.join(" | ")} |`);
  out.push(`|---|${order.map(() => "---").join("|")}|`);
  for (const r of t.rows) {
    const cells = order.map((target) => r.cells.get(target) ?? "");
    out.push(`| \`${r.text}\`${r.ladder ? ` ${LADDER_MARK}` : ""} | ${cells.join(" | ")} |`);
  }
  out.push("");
  out.push(
    `${String(t.bindings)} bindings · ${String(t.rows.length)} keys · ` +
      `${String(t.ladder)} resolved by the ladder (${LADDER_MARK}).`,
  );
  out.push("");
  return out.join("\n");
}

/** The table for the live keymap. */
export function liveTable() {
  return renderKeymapTable(defaultKeymap, FOCUS_ORDER);
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const path = join(process.cwd(), KEYS_DOC);
  const want = liveTable();
  if (process.argv.includes("--check")) {
    let have = "";
    try {
      have = readFileSync(path, "utf8");
    } catch {
      have = "";
    }
    if (have !== want) {
      console.error(`${KEYS_DOC} is stale — run \`npx tsx tools/keymap-table.mjs\``);
      process.exit(1);
    }
    console.log(`${KEYS_DOC} — current`);
  } else {
    writeFileSync(path, want);
    const t = tabulate(defaultKeymap, FOCUS_ORDER);
    console.log(
      `${KEYS_DOC} — ${String(t.bindings)} bindings, ${String(t.rows.length)} keys, ` +
        `${String(t.ladder)} resolved by the ladder`,
    );
  }
}
