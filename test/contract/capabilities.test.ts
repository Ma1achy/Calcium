// C02 tier 2 — contract. The promised interface holds.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SCAN_BUDGET_MS } from "../support/budget.js";

import { checkSourceScans } from "../../tools/enforce/source-scans.mjs";
import {
  DEGRADATION,
  detectCapabilities,
  type TerminalCapabilities,
} from "../../src/terminal/capabilities.js";

// This file walks `src/`; `budget.ts` carries the measurement and why the 5 s
// default is not a margin. Re-measure before raising it.
vi.setConfig({ testTimeout: SCAN_BUDGET_MS });

const FIELDS: readonly (keyof TerminalCapabilities)[] = [
  "colourDepth",
  "unicode",
  "ambiguousWidth",
  "backgroundPolarity",
  "synchronisedUpdate",
  "bracketedPaste",
  "mouse",
  "imageProtocol",
  "altScreen",
];

/** The same fixtures tier 1 walks, so the shape claims cover every rule branch. */
const FIXTURES: readonly NodeJS.ProcessEnv[] = [
  {},
  { TERM: "dumb" },
  { TERM: "xterm" },
  { TERM: "xterm-256color" },
  { TERM: "xterm-kitty" },
  { TERM: "xterm", COLORTERM: "truecolor" },
  { TERM: "xterm", COLORTERM: "24bit" },
  { TERM: "xterm", TERM_PROGRAM: "iTerm.app" },
  { TERM: "xterm", TERM_PROGRAM: "Apple_Terminal" },
  { TERM: "xterm", TMUX: "/tmp/x" },
  { LANG: "en_GB.UTF-8", TERM: "xterm" },
  { LC_ALL: "C", LANG: "en_GB.UTF-8", TERM: "xterm" },
  { TERM: "xterm", COLORFGBG: "15;0" },
  { TERM: "xterm", COLORFGBG: "0;default;15" },
];

describe("C02 contract", () => {
  it("T2.1 (I1): exactly the nine documented keys, all present, for every fixture", () => {
    for (const env of FIXTURES) {
      const { capabilities } = detectCapabilities(env);
      expect(Object.keys(capabilities).sort(), JSON.stringify(env)).toEqual([...FIELDS].sort());
      for (const field of FIELDS) {
        expect(capabilities[field], `${field} in ${JSON.stringify(env)}`).toBeDefined();
      }
    }
  });

  it("T2.2 (I1): the record is frozen — a mutation attempt does not change it", () => {
    const { capabilities } = detectCapabilities({ TERM: "xterm" });
    expect(Object.isFrozen(capabilities)).toBe(true);

    // The invariant is the value holding, not the throw. Under a module's
    // implicit strict mode this throws; the assertion that matters is below it.
    expect(() => {
      (capabilities as { colourDepth: number }).colourDepth = 24;
    }).toThrow();
    expect(capabilities.colourDepth).toBe(4);
  });

  it("T2.3 (I3): two calls are deeply equal and share no reference", () => {
    const env = { TERM: "xterm-256color", LANG: "en_GB.UTF-8" };
    const first = detectCapabilities(env);
    const second = detectCapabilities(env);

    expect(first.capabilities).toEqual(second.capabilities);
    expect(first.capabilities).not.toBe(second.capabilities);
    expect(first).not.toBe(second);
    expect(first.warnings).not.toBe(second.warnings);
  });

  it("T2.4 (I2): synchronous — no promise, and complete with the clock unmoved", () => {
    vi.useFakeTimers();
    try {
      const result = detectCapabilities({ TERM: "xterm" });
      // Not a thenable: an interactive probe with an await would fail here.
      expect(result).not.toBeInstanceOf(Promise);
      expect((result as { then?: unknown }).then).toBeUndefined();

      vi.advanceTimersByTime(0);
      expect(Object.keys(result.capabilities)).toHaveLength(FIELDS.length);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T2.5 (I5): A03 SS10 finds no terminal env read outside capabilities.ts", () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir)) {
        const path = `${dir}/${entry}`;
        if (statSync(path).isDirectory()) walk(path, out);
        else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(path);
      }
      return out;
    };

    // The scan definition is imported, not restated. A second copy of SS10 here
    // would drift from the one `make enforce` runs, and then this test passes
    // while the build check fails.
    const violations = checkSourceScans(walk("src")).filter((v) => v.rule === "SS10");
    expect(violations, violations.map((v) => `${v.rule} ${v.file}`).join("\n")).toEqual([]);
  });

  it("T2.6 (I6): §4 and the record's fields are a bijection, with a named owner each", () => {
    // §4 parsed from the spec at test time. A hand-maintained second copy is a
    // fork, not a copy — this is brittle against reformatting that one table,
    // and the alternative is brittle against the spec and the code diverging.
    const spec = readFileSync("docs/components/C02_capability_detection.md", "utf8");
    const section = spec.split("## 4. Degradation")[1]?.split("\n## ")[0];
    expect(section, "§4 not found in the spec").toBeDefined();

    // field → the owners §4 gives it. A Set because colourDepth has two rows:
    // it degrades in two stages, and both name C10.
    const specRows = new Map<string, Set<string>>();
    for (const line of section!.split("\n")) {
      // Split on unescaped pipes only: the unicode row's behaviour cell contains
      // `+ - \|` as a code span, and splitting naively drops the row entirely.
      const cells = line.split(/(?<!\\)\|/).map((c) => c.trim());
      // | Absent | Field | Behaviour | Owner |  — four cells plus two empty edges.
      if (cells.length !== 6) continue;
      const [, absent, field, , owner] = cells;
      if (absent === undefined || field === undefined || owner === undefined) continue;
      if (absent === "Absent" || /^-+$/.test(absent)) continue;

      const name = field.replaceAll("`", "");
      const owners = specRows.get(name) ?? new Set<string>();
      owners.add(owner.replaceAll("*", ""));
      specRows.set(name, owners);
    }
    expect(specRows.size, "§4 rows parsed").toBeGreaterThan(0);

    // The bijection, in both directions and against the spec rather than only
    // against ourselves: the eighth field cannot arrive without a row, and a
    // row cannot outlive the field it covers.
    const { capabilities } = detectCapabilities({ TERM: "xterm" });
    expect([...specRows.keys()].sort()).toEqual(Object.keys(capabilities).sort());
    expect(Object.keys(DEGRADATION).sort()).toEqual(Object.keys(capabilities).sort());

    // And every row's owner matches the implementation's, per field.
    for (const [field, owners] of specRows) {
      expect([...owners], `§4 owners for ${field}`).toEqual([
        DEGRADATION[field as keyof TerminalCapabilities].owner,
      ]);
    }

    for (const field of FIELDS) {
      expect(DEGRADATION[field].owner, `${field} owner`).toMatch(/^(C\d\d|L4)( (C\d\d|L4))*$/);
      expect(DEGRADATION[field].behaviour.length, `${field} behaviour`).toBeGreaterThan(0);
    }
  });

  it("T2.8 (I1, I6): §2's interface block and the record are a bijection too", () => {
    // **F214.** T2.6 parses §4 and has been green throughout; §2 — the interface
    // block, the first thing anyone reads — declared seven fields against a
    // record of eight. `ambiguousWidth` shipped with a §3 subsection, a §4 row,
    // an invariant, a commitment and ten test rows and never reached it.
    //
    // Kept separate from T2.6 rather than folded in: the two tables fail
    // separately, T6.4 already cites T2.6 for §4's half, and the message should
    // name which document is behind.
    const spec = readFileSync("docs/components/C02_capability_detection.md", "utf8");
    const section = spec.split("## 2. Public interface")[1]?.split("\n## ")[0];
    expect(section, "§2 not found in the spec").toBeDefined();

    const block = /type TerminalCapabilities = Readonly<\{\n([\s\S]*?)\n\}>;/u.exec(section!);
    expect(block, "§2's TerminalCapabilities block not found").not.toBeNull();

    const declared = [...block![1]!.matchAll(/^\s*([A-Za-z]\w*)\s*:/gmu)].map((m) => m[1]!);
    // Parsed something, and each name once: a regex that matched nothing would
    // make the comparison below vacuous in the direction that matters.
    expect(declared.length, "§2 fields parsed").toBeGreaterThan(0);
    expect(new Set(declared).size).toBe(declared.length);

    const { capabilities } = detectCapabilities({ TERM: "xterm" });
    expect([...declared].sort()).toEqual(Object.keys(capabilities).sort());
    // And in document order, because §2 is read rather than looked up — a field
    // appended to the block while the record grew in the middle is a diff that
    // reads as agreement.
    expect(declared).toEqual(Object.keys(capabilities));
  });

  it("T2.7 (I8): no warning is emitted — every warning is returned", () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      for (const env of FIXTURES) detectCapabilities(env);

      // The one case that definitely produces a warning.
      // `as unknown as` because the type cannot express the invalid value —
      // which is the point: this arrives from a config file, not from a caller.
      const { warnings } = detectCapabilities({ TERM: "xterm" }, {
        colourDepth: 12,
      } as unknown as Partial<TerminalCapabilities>);
      expect(warnings).toHaveLength(1);

      expect(out).not.toHaveBeenCalled();
      expect(err).not.toHaveBeenCalled();
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
  });
});
