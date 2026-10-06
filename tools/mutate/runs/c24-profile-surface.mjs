// C24 I33's deck surface, after ruling 78 unpublished `profileDeck` (F1327).
//
// **The row is C24 T1.11 and its new half is an absence**: the published
// surface names no `profileDeck`. An absence assertion is satisfied by a
// surface that never had the name, so the mutation puts one back — the
// cheapest re-publication, `deckOf` re-exported under the old name — and the
// row has to see it. The control breaks the half of the row that was already
// there, so a run whose filter reached nothing cannot read as a kill.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = 'npx vitest run --maxWorkers=3 test/unit/profile-deck.test.ts -t "T1.11"';
const INDEX = "src/index.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **Ruling 78 reverted**: the deck seam back on the root under its old name.
    name: "profileDeck re-published on the root",
    file: INDEX,
    from: 'export { CARDS, SECTIONS, profileCard } from "./shell/profiling/panes/index.js";',
    to: 'export { CARDS, SECTIONS, profileCard, deckOf as profileDeck } from "./shell/profiling/panes/index.js";',
    expect: "T1.11",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // `CARDS` off the root: C24 T1.11's register half reads `api.CARDS` and fails.
    file: INDEX,
    from: 'export { CARDS, SECTIONS, profileCard } from "./shell/profiling/panes/index.js";',
    to: 'export { SECTIONS, profileCard } from "./shell/profiling/panes/index.js";',
    why: "C24 T1.11 reads api.CARDS — if this survives, the run's filter reaches no row",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
