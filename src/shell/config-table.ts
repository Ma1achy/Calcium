/**
 * C23 I80 — the configuration table, `key · value · source` (§075, `R-HON-008`).
 *
 * *A config view without a source column is one you cannot debug — the
 * commonest question is not what is it, it is WHY is it that.* The third column
 * is the one this block exists for, and its tone is the ladder.
 *
 * **Its verb is `/config`** (ruling 43), the framework's ninth (C05 §3).
 * docker-tui's own `/config` was renamed `/filediff` first, because a framework
 * verb of an app's name is a parse error for that app (C05 I6, I28).
 */

import { block, type Block, type Tone } from "../data/viewmodel/index.js";
import type { Provenance, Setting } from "./config.js";

/**
 * §075's ladder — *the later it is applied, the louder it is, because a flag
 * beating your config file is the thing you forget you did.*
 */
export const PROVENANCE_TONE: Readonly<Record<Provenance, Tone>> = Object.freeze({
  default: "muted",
  config: "meta",
  env: "warn",
  flag: "error",
});

/** The ladder's keys, as the source column's vocabulary (C04 I6, ruling 44). */
const PROVENANCE_WORDS: readonly string[] = Object.freeze(Object.keys(PROVENANCE_TONE));

/**
 * One `table` block, one row per setting in the order given. **No `⏎ edit`
 * and no `r reset`** (§075 draws both): nothing writes a setting, and an
 * affordance naming a key that does nothing is C16 I19's second keymap.
 */
export function configBlock(settings: readonly Setting[], id: string): Block {
  return block({
    kind: "table",
    // The caller's, because a second `/config` is a second block and ids are
    // addressed by `ViewPatch` (C04 I14).
    id,
    columns: [
      { key: "key", label: "key", align: "left", priority: 3, minWidth: 3, sortable: false },
      { key: "value", label: "value", align: "left", priority: 1, minWidth: 5, flex: true, sortable: false },
      // **The ladder's four words, declared as the column's closed vocabulary**
      // (C04 I6, ruling 44): `env` and `flag` carry `warn` and `error` on the
      // word itself, which is the fact, so no glyph is owed beside it.
      { key: "source", label: "source", align: "left", priority: 2, minWidth: 7, sortable: false, vocabulary: PROVENANCE_WORDS },
    ],
    rows: settings.map((s) => ({
      id: `config-${s.key}`,
      cells: {
        key: { text: s.key },
        value: { text: s.value },
        source: { text: s.source, tone: PROVENANCE_TONE[s.source] },
      },
    })),
  });
}
