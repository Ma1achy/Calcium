// C24 I41, C22 I110, C14 I56 — the room a child is told, the frame its close
// commits, and the entry kept whole while it is attached (review batch 3, M9
// items 2 and 3). Mutated (C22 T6.133, C14 T6.27).
//
// **Every row here reads the frame.** The defect the context mutation restores
// was arithmetically self-consistent: the context, the entry's measure and the
// viewport all agreed, and the screen showed rows 2–12 of 13 cut to the rails.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/integration/child-size.test.ts test/unit/viewport-keep-whole.test.ts " +
  "test/contract/surface.test.ts";
const CONSTRUCT = "src/shell/construct.ts";
const SURFACE = "src/shell/surface.ts";
const CONTAINERS = "src/presentation/blocks/kinds/containers.ts";
const VIEWPORT = "src/viewport/viewport/viewport.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: CONSTRUCT,
    from: "        width: room.width,\n        height: room.height,\n",
    to: "        width: 1,\n        height: 1,\n",
    why: "a child told one cell draws one — every row reading a numbered body row fails, so if this survives no row reaches the context",
  },
  mutations: [
    {
      // The plan's named target (construct.ts's `context`, lines 4228–4229 at
      // its HEAD): the region handed down as it was before C24 I41.
      name: "REGION: the context is the region again (C22 T6.133)",
      file: CONSTRUCT,
      from: "        width: room.width,\n        height: room.height,\n",
      to: "        width: region.width,\n        height: region.height,\n",
      expect: "T4.94c",
    },
    {
      name: "NO-GAP: the entry's closing blank is not taken off the height",
      file: CONSTRUCT,
      from: "{ command: childCommand(id) } }, region.width) + ENTRY_GAP;",
      to: "{ command: childCommand(id) } }, region.width);",
      expect: "T4.94c",
    },
    {
      name: "NO-COMMAND: the command row is not taken off the height",
      file: CONSTRUCT,
      from: "      const chrome = chromeRowsOf({ doc: { command: childCommand(id) } }, region.width) + ENTRY_GAP;",
      to: "      const chrome = 1 + ENTRY_GAP;",
      expect: "T4.22",
    },
    {
      name: "NO-RAILS: the panel's borders are not taken off the height",
      file: CONTAINERS,
      from: "    height: Math.max(1, Math.floor(height) - rails),",
      to: "    height: Math.max(1, Math.floor(height)),",
      expect: "T4.94c",
    },
    {
      name: "STALE-OWNER: the close's frame is committed before ownership returns (C22 T6.133)",
      file: SURFACE,
      // Re-anchored when C16 I73's generation joined the close (df1658a2).
      from:
        "      current = null;\n" +
        "      generation += 1;\n" +
        "      closeCurrent = null;\n" +
        "      options.attachment.closed(entryId, outcome.reason);\n" +
        "      // **The frame after ownership returns, not before** (C22 I110). The\n" +
        "      // commit composes at once, so above `current = null` it drew `attached`\n" +
        "      // and `keys → child` into the frame that ended the capture — and an\n" +
        "      // application's own `close()` has no key behind it to draw another.\n" +
        "      options.invalidate();\n",
      to:
        "      options.invalidate();\n" +
        "      current = null;\n" +
        "      generation += 1;\n" +
        "      closeCurrent = null;\n" +
        "      options.attachment.closed(entryId, outcome.reason);\n",
      expect: "T4.94c",
    },
    {
      name: "UNHELD: following ignores the hold (C14 T6.27)",
      file: VIEWPORT,
      from: "    if (this.#held !== null && stop !== null && stop < this.#maxTop()) {",
      to: "    if (false && this.#held !== null && stop !== null && stop < this.#maxTop()) {",
      expect: "T1.76",
    },
    {
      name: "NO-HOLD: the composition root takes no hold on the child's entry",
      file: CONSTRUCT,
      from: "        childHold = stores.viewport.keepWhole(entryId);\n",
      to: "",
      expect: "T4.38",
    },
    {
      name: "KEPT-DETACHED: the release does not give back the tail",
      file: VIEWPORT,
      from: "        if (!this.#heldDetached) return;\n",
      to: "        return;\n",
      expect: "T1.76",
    },
    {
      name: "READER-IGNORED: scrolling does not end the hold",
      file: VIEWPORT,
      from: "  scrollToBottom(): void {\n    this.#readerMoved();\n",
      to: "  scrollToBottom(): void {\n",
      expect: "T1.76",
    },
    {
      name: "RELEASE-MOVES-READER: the release returns to the tail even after the reader moved",
      file: VIEWPORT,
      from: "  scrollBy(rows: number): void {\n    if (rows === 0) return;\n    this.#readerMoved();\n",
      to: "  scrollBy(rows: number): void {\n    if (rows === 0) return;\n",
      expect: "T1.76",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
