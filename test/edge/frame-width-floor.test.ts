// C22 §6u.3 — what the 60 protects (I156).
//
// **The question was whether the gate's 60 is what keeps a row from wrapping.** It is
// not: measured at b6ce58a2 with the gate lowered, the widest row any scene wrote
// was the terminal's width at every width from 20 up. This row keeps that answer
// as a gate rather than a recollection, so the day `MIN_COLUMNS` moves the
// row-width half of the question is already closed and only the surfaces the
// 60 states `nothing drops` against (S14, S15) remain to walk.
//
// The gate's number is mocked below the widths drawn: the session would otherwise
// draw the fallback, and a frame that is never composed has no row to measure.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/shell/config.js", async (orig) => ({ ...(await orig<Record<string, unknown>>()), MIN_COLUMNS: 20 }));

import { cells } from "../../src/presentation/text.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { settle } from "../support/frame-golden.js";
import { buildSession } from "../support/session.js";

const ESC = String.fromCharCode(27);
const CSI = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, "gu");
const CUP = new RegExp(`${ESC}\\[\\d+;\\d+H`, "gu");

/** Eight scenes: empty, a listing, a wrapping line, a key table, a table, two reports and the history. */
const SCENES: Readonly<Record<string, readonly string[]>> = {
  boot: [],
  help: ["/help\r"],
  typed: ["/promote a3f9b21 --open-mr --since=yesterday"],
  keys: ["/help keys\r"],
  ps: ["/ps\r"],
  capabilities: ["/capabilities\r"],
  config: ["/config\r"],
  history: ["/history\r"],
};

describe("C22 I156 — no painted row is wider than the terminal", () => {
  for (const columns of [20, 40, 59]) {
    for (const [name, drive] of Object.entries(SCENES)) {
      it(`T4.124 (C22 I156): ${name} at ${String(columns)} columns`, async () => {
        const stdin = fakeStdin();
        const built = await buildSession(
          { name: "calcium", binary: "prism", stdin: stdin as never },
          { columns, rows: 24 },
        );
        await settle();
        for (const bytes of drive) {
          stdin.emit(bytes);
          await settle();
        }
        await settle();

        let widest = 0;
        let rows = 0;
        for (const chunk of built.stdout.chunks) {
          // Rows are what a cursor address or a CRLF separates; control sequences take no cell.
          const text = String(chunk).replace(CUP, "\n").replace(CSI, "").replaceAll("\r\n", "\n");
          for (const row of text.split("\n")) {
            rows += 1;
            widest = Math.max(widest, cells(row.replace(/\s+$/u, "")));
          }
        }
        // The subject is shown to respond: rows were read, and the rules reach the edge.
        expect(rows, "the frame wrote rows").toBeGreaterThan(20);
        expect(widest, "the rules reach the terminal's width").toBe(columns);
      });
    }
  }
});
