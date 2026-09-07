// tools/keymap-table.mjs — the key ladder as a generated table (C16 §6, I23).
//
// **The fixture's job is drift, in both directions.** KT1 says the file on disk
// is what the live keymap renders to, so a binding added without regenerating
// fails here; KT2 is the fabricated violation — a table rendered from a keymap
// with one more row is *not* the file, and the difference names the key — so
// KT1 cannot pass by comparing two empty strings. KT3–KT5 are the properties
// the table claims: every binding appears exactly once, the marked keys are
// exactly the ones bound at two or more targets, and the columns are
// `FOCUS_ORDER`.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  KEYS_DOC,
  LADDER_MARK,
  liveTable,
  renderKeymapTable,
  tabulate,
} from "../../tools/keymap-table.mjs";
import { defaultKeymap, keyText } from "../../src/interaction/router/keymap.js";
import { FOCUS_ORDER } from "../../src/interaction/router/focus.js";
import type { BuiltinBinding } from "../../src/interaction/router/types.js";

describe("tools/keymap-table.mjs — the ladder as a table", () => {
  it("KT1: docs/KEYS.md is the live keymap rendered — the table cannot drift", () => {
    const onDisk = readFileSync(KEYS_DOC, "utf8");
    expect(onDisk, `${KEYS_DOC} is stale; run \`npx tsx tools/keymap-table.mjs\``).toBe(
      liveTable(),
    );
  });

  it("KT2 (fabricated violation): a binding added to a copy of the keymap → the check fires and names the key", () => {
    // **Not a key the keymap already binds at `global`**, or the duplicate rule
    // would refuse it before the comparison ran and the row would prove the
    // wrong thing. `q` is unbound everywhere; measured below rather than assumed.
    expect(defaultKeymap.some((b) => b.key.name === "q"), "`q` is free").toBe(false);
    const extra: BuiltinBinding = { target: "global", key: { name: "q" }, action: "scrollTop" };
    const drifted = renderKeymapTable([...defaultKeymap, extra], FOCUS_ORDER);
    const onDisk = readFileSync(KEYS_DOC, "utf8");

    expect(drifted).not.toBe(onDisk);
    // The difference is the row, so a reader of the failure sees which key.
    const added = drifted.split("\n").filter((l) => !onDisk.includes(l));
    expect(added.some((l) => l.startsWith("| `q` |")), added.join("\n")).toBe(true);
  });

  it("KT3: every binding is in the table exactly once", () => {
    const t = tabulate(defaultKeymap, FOCUS_ORDER);
    const cells = t.rows.reduce((n, r) => n + r.cells.size, 0);
    expect(cells).toBe(defaultKeymap.length);
    expect(t.bindings).toBe(defaultKeymap.length);
    // And a duplicate `(target, key)` is refused here as `createKeymap` refuses
    // it, rather than one of the two silently winning the cell.
    const first = defaultKeymap[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(() => tabulate([...defaultKeymap, first], FOCUS_ORDER)).toThrow(/duplicate binding/);
  });

  it("KT4: the marked keys are exactly those bound at two or more targets", () => {
    const targetsOf = new Map<string, Set<string>>();
    for (const b of defaultKeymap) {
      const k = keyText(b.key);
      targetsOf.set(k, (targetsOf.get(k) ?? new Set()).add(b.target));
    }
    const expected = [...targetsOf.entries()]
      .filter(([, targets]) => targets.size > 1)
      .map(([k]) => k)
      .sort();

    const rendered = liveTable()
      .split("\n")
      .filter((l) => l.includes(` ${LADDER_MARK} |`))
      .map((l) => /^\| `([^`]+)`/.exec(l)?.[1] ?? "")
      .sort();

    expect(rendered).toEqual(expected);
    // **The set is not empty**, or the row is vacuous: C16 §6 names three
    // collisions the ladder resolves and the table must hold at least those.
    expect(expected).toEqual(expect.arrayContaining(["pageup", "pagedown", "tab", "m+v"]));
  });

  it("KT5: the columns are FOCUS_ORDER, in order", () => {
    const header = liveTable()
      .split("\n")
      .find((l) => l.startsWith("| key |"));
    expect(header).toBe(`| key | ${FOCUS_ORDER.join(" | ")} |`);
  });
});
