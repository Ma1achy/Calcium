// C22 I115, C23 I80 — where a configuration value came from (parked 28).
//
// **The premise is asserted, not only the default.** A caller's value is
// `default` to the reader, and the reading it rules out — a caller's value is
// `config` — is exactly what a record that only ever saw the minimal config
// could not tell apart.
import { describe, expect, it } from "vitest";

import { DEFAULT_MAX_BLOCK_ROWS } from "../../src/presentation/blocks/index.js";
import { DEFAULT_STATE_DIR, resolveConfig, type Setting } from "../../src/shell/config.js";
import { configBlock, PROVENANCE_TONE } from "../../src/shell/config-table.js";
import type { FileSystem, TuiConfig } from "../../src/shell/types.js";
import { defaultTheme } from "../../src/presentation/theme/index.js";
import { ASCII_CAPS, measurable } from "../support/render.js";
import { tableDefinition } from "../../src/presentation/table/index.js";

const MANIFEST = { schemaVersion: 1, tools: [] } as unknown as TuiConfig["manifest"];
const minimal = (): TuiConfig => ({ name: "prism", binary: "prism", manifest: MANIFEST, theme: defaultTheme });
const AMBIENT = Object.freeze({
  clock: (): number => 1_700_000_000_000,
  elapsed: () => 0,
  cwd: "/ambient",
  fs: {} as unknown as FileSystem,
  schedule: (): Disposable => ({ [Symbol.dispose]: () => undefined }),
  platform: "linux" as NodeJS.Platform,
});

const SGR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "gu");

describe("C22 I115 / C23 I80 — provenance", () => {
  it("T1.72 (C22 I115, R-HON-008): resolveConfig records four settings, every one default", () => {
    expect(resolveConfig(minimal(), AMBIENT).settings).toEqual([
      { key: "motion", value: "full", source: "default" },
      { key: "hover", value: "false", source: "default" },
      { key: "maxBlockRows", value: String(DEFAULT_MAX_BLOCK_ROWS), source: "default" },
      { key: "stateDir", value: DEFAULT_STATE_DIR, source: "default" },
    ]);
    // **The premise**: the application chose `reduced`, the reader did not.
    const caller = resolveConfig({ ...minimal(), motion: "reduced" }, AMBIENT).settings[0];
    expect(caller, "a caller's value is recorded").toEqual({ key: "motion", value: "reduced", source: "default" });
  });

  it("T1.75 (C23 I80, R-HON-008): the ladder is §075's; default and config draw, env and flag meet C04 I6 (parked 44)", () => {
    expect(PROVENANCE_TONE, "§075's ladder, quietest first").toEqual({ default: "muted", config: "meta", env: "warn", flag: "error" });

    const two: Setting[] = [
      { key: "a", value: "1", source: "default" },
      { key: "b", value: "2", source: "config" },
    ];
    const tones = (settings: readonly Setting[]): unknown[] => {
      const b = configBlock(settings);
      return b.kind === "table" ? b.rows.map((r) => r.cells["source"]?.tone) : [];
    };
    expect(tones(two)).toEqual(["muted", "meta"]);

    // Read off the frame too: a header and one row each, the source last.
    const rows = measurable({ capabilities: ASCII_CAPS, definitions: [tableDefinition] }).renderToLines(configBlock(two), 60).map((l) => l.replace(SGR, "").trim()); // the focus gutter leads every row
    expect(rows[0]?.split(/\s+/u), "the header").toEqual(["key", "value", "source"]);
    expect(rows.slice(-2).map((r) => r.split(/\s+/u).at(-1)), "one row per setting, source last").toEqual(["default", "config"]);

    // **The state parked as 44, recorded rather than hidden**: C04 I6 refuses a
    // `warn` or `error` cell with no glyph. When 44 is answered this goes red.
    for (const source of ["env", "flag"] as const) {
      expect(() => configBlock([{ key: "k", value: "v", source }]), source).toThrow(/C04 I6/u);
    }

    // **The control**: two `default`s are two `muted`s, so the row is about the
    // ladder and not a column that is always one tone.
    expect(tones(two.map((s) => ({ ...s, source: "default" as const })))).toEqual(["muted", "muted"]);
  });
});
