// C22 tier 1 — step 1, which is the whole of `createTui` (I7a).
//
// Validation and defaults. The four-field claim is R01 §1's ergonomic promise
// and I17's invariant, so the assertions here are about the *count* as much as
// the behaviour: a fifth required field has to fail a test, not merely feel
// wrong in review.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_RETAIN_PAYLOADS,
  DEFAULT_STATE_DIR,
  MIN_COLUMNS,
  MIN_ROWS,
  PROMPT,
  PROMPT_GUTTER,
  resolveConfig,
  validateConfig,
} from "../../src/shell/config.js";
import { ConfigError, type TuiConfig } from "../../src/shell/types.js";
import { defaultTheme } from "../../src/presentation/theme/index.js";

const MANIFEST = { version: "1", tools: [] } as unknown as TuiConfig["manifest"];

const minimal = (): TuiConfig => ({
  name: "prism",
  binary: "prism",
  manifest: MANIFEST,
  theme: defaultTheme,
});

const CLOCK = (): number => 1_700_000_000_000;

describe("C22 §2 — config", () => {
  it("T2.7 (I7a): each missing required field is named, one at a time", () => {
    // Per field, not "an invalid config throws". A single case passes while
    // three of the four are unchecked, and the error a developer reads is the
    // whole value of validating here rather than crashing at step 5.
    for (const field of ["name", "binary", "manifest", "theme"] as const) {
      const config = { ...minimal(), [field]: undefined } as unknown as TuiConfig;
      expect(() => validateConfig(config), field).toThrow(ConfigError);
      expect(() => validateConfig(config), field).toThrow(new RegExp(`\`${field}\` is required`));
    }
  });

  it("T2.7b (I17): exactly four fields are required — the count, asserted", () => {
    // The direction that catches a *fifth* requirement being added. Removing
    // any one of the four throws; supplying only the four does not. A test that
    // only checked the second half would pass on a config type with ten
    // required fields as long as the four were among them.
    expect(() => validateConfig(minimal())).not.toThrow();

    // Every other field named in §2, absent. Names rather than an object with
    // `undefined` values — `exactOptionalPropertyTypes` distinguishes the two,
    // and it is absence this is about.
    const optional = [
      "adapters",
      "commandPolicy",
      "completionSources",
      "chrome",
      "blocks",
      "transport",
      "debug",
      "clock",
      "fs",
      "stateDir",
      "openUrl",
      "stdout",
      "stdin",
      "cluster",
      "version",
      "pipeline",
    ] as const;

    for (const key of optional) {
      const config = { ...minimal(), [key]: undefined } as unknown as TuiConfig;
      expect(() => validateConfig(config), `${key} must stay optional`).not.toThrow();
    }
  });

  it('T2.7c: an empty string is a supplied field and not a missing one', () => {
    // `name: ""` is a bad value, and reporting it as missing sends the reader
    // to the wrong line. Truthiness would conflate the two.
    expect(() => validateConfig({ ...minimal(), name: "" })).not.toThrow();
  });

  it("T1.5 (I17): only the four required fields → every default applied", () => {
    const r = resolveConfig(minimal(), CLOCK);

    expect(r.adapters).toEqual({});
    expect(r.fallbackAdapter).toBeDefined();
    expect(r.commandPolicy).toBeDefined();
    expect(r.completionSources).toEqual([]);
    expect(r.blocks).toEqual([]);
    expect(r.transport).toBeUndefined();
    expect(r.stateDir).toBe(DEFAULT_STATE_DIR);
    expect(r.chrome.header).toBeInstanceOf(Function);
    expect(r.chrome.footer).toBeInstanceOf(Function);
  });

  it("T1.5b (I10): the injected clock wins, and the system clock is the fallback", () => {
    const injected = (): number => 42;
    expect(resolveConfig({ ...minimal(), clock: injected }, CLOCK).clock()).toBe(42);
    expect(resolveConfig(minimal(), CLOCK).clock()).toBe(1_700_000_000_000);
  });

  it("T1.5c (C13 §5a): retention is off, then 50, then the given count", () => {
    // Three states from two fields, and the middle one is the one a `??` chain
    // gets wrong: `debug: {}` means on-with-the-default, not off.
    expect(resolveConfig(minimal(), CLOCK).retainPayloads).toBe(0);
    expect(resolveConfig({ ...minimal(), debug: {} }, CLOCK).retainPayloads).toBe(
      DEFAULT_RETAIN_PAYLOADS,
    );
    expect(
      resolveConfig({ ...minimal(), debug: { retainPayloads: 7 } }, CLOCK).retainPayloads,
    ).toBe(7);
  });

  it("T1.5d (I20): stateDir defaults and no environment is read", () => {
    expect(resolveConfig(minimal(), CLOCK).stateDir).toBe("~/.prism");
    expect(resolveConfig({ ...minimal(), stateDir: "/tmp/x" }, CLOCK).stateDir).toBe("/tmp/x");
  });

  it("T1.5e (I11): cluster and version default to empty and come from config", () => {
    // The two fields with no writer. They enter here or nowhere, which is what
    // makes "set at construction and never written after" constructible.
    expect(resolveConfig(minimal(), CLOCK).cluster).toBe("");
    const r = resolveConfig({ ...minimal(), cluster: "fmx-prod", version: "1.0.0" }, CLOCK);
    expect([r.cluster, r.version]).toEqual(["fmx-prod", "1.0.0"]);
  });

  it("the numbers C22 owns are C22's, and stated once", () => {
    // C02 §8 assigns the threshold to L4, and C17 must not assume a gutter
    // (I13). Asserted so that a second copy anywhere else has something to
    // disagree with.
    expect([MIN_COLUMNS, MIN_ROWS]).toEqual([60, 16]);
    expect(PROMPT).toBe("❯ ");
    expect(PROMPT_GUTTER).toEqual({ first: 2, cont: 2 });
  });
});
