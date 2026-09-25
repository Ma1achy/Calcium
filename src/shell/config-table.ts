/**
 * C23 I80 — the configuration table, `key · value · source` (§075, `R-HON-008`).
 *
 * *A config view without a source column is one you cannot debug — the
 * commonest question is not what is it, it is WHY is it that.* The third column
 * is the one this block exists for, and its tone is the ladder.
 *
 * **Its verb is parked as 43**: §075 names it `/config`, and docker-tui ships a
 * `/config` of its own, which a framework verb of that name makes a parse error
 * (C05 I6). The block is built ahead of the verb, and `UNCONSUMED_MEMBERS`
 * names the handler as its queued consumer.
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

/**
 * One `table` block, one row per setting in the order given. **No `⏎ edit`
 * and no `r reset`** (§075 draws both): nothing writes a setting, and an
 * affordance naming a key that does nothing is C16 I19's second keymap.
 */
export function configBlock(settings: readonly Setting[]): Block {
  return block({
    kind: "table",
    id: "config-settings",
    columns: [
      { key: "key", label: "key", align: "left", priority: 3, minWidth: 3, sortable: false },
      { key: "value", label: "value", align: "left", priority: 1, minWidth: 5, flex: true, sortable: false },
      { key: "source", label: "source", align: "left", priority: 2, minWidth: 7, sortable: false },
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
