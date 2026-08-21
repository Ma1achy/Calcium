// C02 tier 6 — fail-on-revert. Each test names the *change* that makes it fail,
// not merely the assertion it makes.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCANS } from "../../tools/enforce/source-scans.mjs";
import { GLYPH_REQUIRED_TONES } from "../../src/data/viewmodel/index.js";
import { resolveTone } from "../../src/presentation/theme/index.js";
import { store } from "../support/theme.js";
import {
  DEGRADATION,
  detectCapabilities,
  type TerminalCapabilities,
} from "../../src/terminal/capabilities.js";

describe("C02 fail-on-revert", () => {
  it("T6.1 (I2): adding an interactive probe with an await → this and T2.4 fail", () => {
    const result = detectCapabilities({ TERM: "xterm" });
    expect(result).not.toBeInstanceOf(Promise);
    expect((result as { then?: unknown }).then).toBeUndefined();
    expect(result.capabilities.colourDepth).toBe(4);
  });

  it("T6.2 (I5): reading the environment from a renderer → T2.5 fails, naming the file", () => {
    const ss10 = SCANS.find((s) => s.id === "SS10");
    expect(ss10, "SS10 is gone from A03").toBeDefined();

    // In scope for a renderer, and exempting only C02 — the two ways SS10 could
    // silently stop guarding anything.
    expect("src/presentation/blocks/index.ts".startsWith(ss10!.scope)).toBe(true);
    expect(ss10!.allow).toEqual(["src/terminal/capabilities.ts"]);

    // Every form, not just the member read. A pattern narrow enough to miss
    // destructuring or a computed key documents the hole instead of closing it.
    for (const form of [
      "const t = process.env.TERM;",
      'const t = process.env["TERM"];',
      "const { TERM } = process.env;",
      "const t = process.env[key];",
      "const e = process.env;",
    ]) {
      expect(ss10!.pattern.test(form), form).toBe(true);
    }
  });

  it("T6.2b: removing SS33 → a stray console write in src/ stops failing the build", () => {
    const ss33 = SCANS.find((s) => s.id === "SS33");
    expect(ss33, "SS33 is gone from A03").toBeDefined();
    expect(ss33!.allow).toEqual([]);

    // The forms eslint's no-console did not catch are why this moved.
    for (const form of ["console.log(x)", "console.error(x)", "console.warn(x)"]) {
      expect(ss33!.pattern.test(form), form).toBe(true);
    }
  });

  it("T6.3 (I4): making detection win over overrides for any field → T1.9 fails", () => {
    const { capabilities } = detectCapabilities({ TERM: "dumb" }, { altScreen: true });
    expect(capabilities.altScreen).toBe(true);
  });

  it("T6.4 (I6): adding a capability without a §4 fallback row → T2.6 fails", () => {
    const { capabilities } = detectCapabilities({ TERM: "xterm" });
    expect(Object.keys(DEGRADATION).sort()).toEqual(Object.keys(capabilities).sort());

    // The check has to be a bijection, or a further field slips through: this is
    // the shape T2.6 asserts, exercised here against a record that has one.
    const withExtra = { ...capabilities, kittyKeyboard: true };
    expect(Object.keys(DEGRADATION).sort()).not.toEqual(Object.keys(withExtra).sort());
  });

  it("T6.5 (I1): making any field optional → T2.1 fails", () => {
    // The worst env is where an optional field would most plausibly be dropped.
    const { capabilities } = detectCapabilities({});
    const fields: readonly (keyof TerminalCapabilities)[] = [
      "colourDepth",
      "unicode",
      "synchronisedUpdate",
      "bracketedPaste",
      "mouse",
      "imageProtocol",
      "altScreen",
    ];
    for (const field of fields) {
      expect(Object.hasOwn(capabilities, field), field).toBe(true);
      expect(capabilities[field], field).toBeDefined();
    }
  });

  it("T6.6 (D29): a status carried by colour alone → T4.3's depth-1 case loses it", () => {
    // The revert is a block that says `tone: "error"` and nothing else. At
    // depth 1 the tone resolves to bold and the row is indistinguishable from a
    // warning, so the distinction has to be in the glyph — which is why C04 I6
    // obliges one for `error` and `warn` at construction, and why this test
    // reads C04's set rather than restating it.
    const themes = store();
    const mono = detectCapabilities({ TERM: "dumb" }).capabilities;

    const error = resolveTone("error", themes.current, mono);
    const warn = resolveTone("warn", themes.current, mono);

    expect(error.colour, "no colour survives at depth 1").toBeUndefined();
    expect(error, "error and warn are one style once colour is gone").toEqual(warn);

    // So the glyph is the whole distinction, and C04 is where that is enforced.
    expect([...GLYPH_REQUIRED_TONES].sort()).toEqual(["error", "warn"]);
  });

  it("T6.7 (I3): caching detection in module scope → T2.3 fails on the shared reference", () => {
    const env = { TERM: "xterm" };
    const first = detectCapabilities(env);
    const second = detectCapabilities(env);
    expect(first.capabilities).toEqual(second.capabilities);
    expect(first.capabilities).not.toBe(second.capabilities);
  });

  it("T6.8 (C02 I10): taking COLORFGBG's second field instead of its last → T1.11 fails", () => {
    // **One fixture disagrees with the second-field rule and every other one
    // agrees with it.** rxvt writes `fg;default;bg`, so the second field is the
    // word `default` and the answer would be `unknown` on a terminal that
    // stated a background plainly.
    const rxvt = detectCapabilities({ TERM: "xterm", COLORFGBG: "0;default;15" }).capabilities;
    expect(rxvt.backgroundPolarity).toBe("light");

    // The control, and it is the reason this row exists separately: the ordinary
    // two-field form answers the same under both rules, so a suite without the
    // line above tests the last-field rule against itself.
    const plain = detectCapabilities({ TERM: "xterm", COLORFGBG: "0;15" }).capabilities;
    expect(plain.backgroundPolarity).toBe("light");
  });

  it("T6.9 (C02 I10): collapsing `unknown` into `dark` → T1.11 fails and C22's T1.20c does not", () => {
    // **The asymmetry is the row's content.** A two-valued field is wrong only
    // where nothing is stated, and there the wrong answer happens to be the one
    // the reader would have got anyway — so every frame agrees and only the
    // *reason* is gone. It is C22 that pays: C22 I68 branches on this value, and a
    // field that never says `unknown` makes it choose from a guess.
    expect(detectCapabilities({ TERM: "xterm" }).capabilities.backgroundPolarity).toBe("unknown");
    expect(detectCapabilities({ TERM: "xterm", COLORFGBG: "15;default" }).capabilities.backgroundPolarity)
      .toBe("unknown");
    // And the value is reachable at all, which a collapsed field would fail.
    const all = new Set(
      ["15;0", "0;15", "15;default", "15;235"].map(
        (v) => detectCapabilities({ TERM: "xterm", COLORFGBG: v }).capabilities.backgroundPolarity,
      ),
    );
    expect([...all].sort()).toEqual(["dark", "light", "unknown"]);
  });

  it("T6.10 (I1): a field declared in §4 and not in §2 → T2.8 fails and T2.6 does not", () => {
    // **F214, as a row.** This is the state `ambiguousWidth` shipped in: §3, §4,
    // an invariant, a commitment, ten test rows, and §2 declaring seven fields.
    // Asserted by asking both sections about a field neither has, so the row
    // fails the day one of the two parses stops locating its table.
    const spec = readFileSync("docs/components/C02_capability_detection.md", "utf8");
    const iface = spec.split("## 2. Public interface")[1]?.split("\n## ")[0] ?? "";
    const degrade = spec.split("## 4. Degradation")[1]?.split("\n## ")[0] ?? "";

    // Both sections were found, and each names every field the record has.
    const { capabilities } = detectCapabilities({ TERM: "xterm" });
    for (const field of Object.keys(capabilities)) {
      expect(iface, `§2 declares ${field}`).toContain(`${field}:`);
      expect(degrade, `§4 has a row for ${field}`).toContain(`\`${field}\``);
    }
    // And neither names one it does not — the direction a stale row survives in.
    expect(iface).not.toContain("kittyKeyboard");
    expect(degrade).not.toContain("kittyKeyboard");
  });
});
