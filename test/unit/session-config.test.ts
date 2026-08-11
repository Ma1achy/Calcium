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
  promptFor,
  PROMPT_SUBSTITUTION,
  PROMPT_GUTTER,
  resolveConfig,
  validateConfig,
} from "../../src/shell/config.js";
import { cells } from "../../src/presentation/text.js";
import { ConfigError, type FileSystem, type TuiConfig } from "../../src/shell/types.js";
import { defaultTheme } from "../../src/presentation/theme/index.js";

const MANIFEST = { version: "1", tools: [] } as unknown as TuiConfig["manifest"];

const minimal = (): TuiConfig => ({
  name: "prism",
  binary: "prism",
  manifest: MANIFEST,
  theme: defaultTheme,
});

/** The five ambient values, faked. `session.ts` supplies the real ones. */
const AMBIENT = Object.freeze({
  clock: (): number => 1_700_000_000_000,
  cwd: "/ambient",
  fs: {} as unknown as FileSystem,
  schedule: (): Disposable => ({ [Symbol.dispose]: () => undefined }),
  platform: "linux" as NodeJS.Platform,
});

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
    const r = resolveConfig(minimal(), AMBIENT);

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
    expect(resolveConfig({ ...minimal(), clock: injected }, AMBIENT).clock()).toBe(42);
    expect(resolveConfig(minimal(), AMBIENT).clock()).toBe(1_700_000_000_000);
  });

  it("T1.5f (I10): the injected filesystem and cwd win over the ambient ones", () => {
    // The clock's siblings. `fs` and `cwd` enter the graph here and nowhere
    // else, and a test covering only the clock leaves two of the three ambient
    // values free to be read directly with nothing objecting.
    const injected = { readFile: () => Promise.resolve("injected") } as unknown as FileSystem;
    expect(resolveConfig({ ...minimal(), fs: injected }, AMBIENT).fs).toBe(injected);
    expect(resolveConfig(minimal(), AMBIENT).fs).toBe(AMBIENT.fs);

    expect(resolveConfig({ ...minimal(), cwd: "/given" }, AMBIENT).cwd).toBe("/given");
    expect(resolveConfig(minimal(), AMBIENT).cwd).toBe("/ambient");
  });

  it("T1.5g (I20): env defaults to an empty record and is never read ambiently", () => {
    // `{}` degrades the shell to ASCII, which is the safe direction — and the
    // assertion is that the default is empty rather than absent, so C02 gets a
    // record it can answer from rather than `undefined`.
    expect(resolveConfig(minimal(), AMBIENT).env).toEqual({});
    expect(resolveConfig({ ...minimal(), env: { TERM: "xterm" } }, AMBIENT).env).toEqual({
      TERM: "xterm",
    });
  });

  it("T1.5c (C13 §5a): retention is off, then 50, then the given count", () => {
    // Three states from two fields, and the middle one is the one a `??` chain
    // gets wrong: `debug: {}` means on-with-the-default, not off.
    expect(resolveConfig(minimal(), AMBIENT).retainPayloads).toBe(0);
    expect(resolveConfig({ ...minimal(), debug: {} }, AMBIENT).retainPayloads).toBe(
      DEFAULT_RETAIN_PAYLOADS,
    );
    expect(
      resolveConfig({ ...minimal(), debug: { retainPayloads: 7 } }, AMBIENT).retainPayloads,
    ).toBe(7);
  });

  it("T1.5d (I20): stateDir defaults and no environment is read", () => {
    expect(resolveConfig(minimal(), AMBIENT).stateDir).toBe(".calcium");
    expect(resolveConfig({ ...minimal(), stateDir: "/tmp/x" }, AMBIENT).stateDir).toBe("/tmp/x");
  });

  it("T1.5e (I11): cluster and version default to empty and come from config", () => {
    // The two fields with no writer. They enter here or nowhere, which is what
    // makes "set at construction and never written after" constructible.
    expect(resolveConfig(minimal(), AMBIENT).cluster).toBe("");
    const r = resolveConfig({ ...minimal(), cluster: "fmx-prod", version: "1.0.0" }, AMBIENT);
    expect([r.cluster, r.version]).toEqual(["fmx-prod", "1.0.0"]);
  });

  it("the numbers C22 owns are C22's, and stated once", () => {
    // C02 §8 assigns the threshold to L4, and C17 must not assume a gutter
    // (I13). Asserted so that a second copy anywhere else has something to
    // disagree with.
    expect([MIN_COLUMNS, MIN_ROWS]).toEqual([60, 16]);
    expect(PROMPT_GUTTER).toEqual({ first: 2, cont: 2 });

    // **The pair, and both forms are the gutter's width** (C22 I52, C09 I22).
    // The equality is the load-bearing half: `commandRows` draws the prompt and
    // `construct.ts` calls the same function for `chromeRows`, so a form of a
    // different width puts the measurer and the composer on different rows for
    // one entry — and only on a terminal nobody develops on.
    expect(promptFor({ unicode: "full" })).toBe("❯ ");
    expect(promptFor({ unicode: "bmp" })).toBe("❯ ");
    expect(promptFor({ unicode: "ascii" })).toBe("> ");
    expect(PROMPT_SUBSTITUTION.map((f) => cells(f))).toEqual([2, 2]);
  });
});
