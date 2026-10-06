// C14 I61 tier 5 — the OSC 52 payload read off a PTY's bytes.
//
// Every other clipboard row reads a fake stdout's chunks. This one reads the
// bytes a terminal would receive, from the process that wrote them, and decodes
// the payload a terminal would put on the clipboard — which is the one place
// the claim *the clipboard holds exactly these rows* can be checked at all.
//
// **The fixture responds to the thing under test first** (F759): a session
// that never took the declaration routes the copy to a file and writes no
// OSC 52, so the first assertion is that the toast says *sent*.
import { describe, expect, it } from "vitest";

import { interactivePty } from "../support/pty.js";
import { hangGuard } from "../support/budget.js";

const FIXTURE = "node test/support/fixture.mjs session";
const PROMPT = /❯/;
const ESC = "\u001b";

const uuidRows = (frame: readonly string[]): number =>
  frame.filter((r) => r.includes("a3f9b21") || r.includes("7c2d4e1")).length;
const beat = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("C14 e2e — the clipboard through a PTY", () => {
  it(
    "T5.6 (C14 I61, R-SEL-004, R-SEL-011): three entries, A, y → the OSC 52 payload decoded from the PTY is their copy text in document order",
    async () => {
      const pty = interactivePty(FIXTURE, { cols: 100, rows: 40, env: { FORCE_CLIPBOARD: "osc52" } });
      try {
        await pty.waitFor(PROMPT, 15_000);
        for (let n = 1; n <= 3; n += 1) {
          pty.type("/ps --mine\r");
          await pty.waitForFrame((f) => uuidRows(f) === 2 * n, 15_000);
        }
        await beat(300);

        pty.type(`${ESC}V`);
        await pty.waitForFrame((f) => (f[0] ?? "").includes("COPY"), 15_000);
        pty.type("A");
        await beat(200);
        const before = pty.output.length;
        pty.type("y");
        await pty.waitForFrame((f) => f.some((r) => r.includes("sent to the terminal's clipboard")), 15_000);

        const written = pty.output.slice(before);
        const payloads = [...written.matchAll(/\u001b\]52;c;([A-Za-z0-9+/=]*)\u0007/gu)].map((m) =>
          Buffer.from(m[1] ?? "", "base64").toString("utf8"),
        );
        expect(payloads, "one OSC 52 write for one y").toHaveLength(1);
        const text = payloads[0] ?? "";

        // **Plain text** — the payload is the copy, not the rendering (R-SEL-004).
        expect(text).not.toContain(ESC);
        // **Three entries, in document order, a blank line between each** — the
        // separator nothing inside an entry may produce (§6a).
        const entries = text.split("\n\n");
        expect(entries, "three entries, two blank lines").toHaveLength(3);
        for (const [i, entry] of entries.entries()) {
          expect(entry, `entry ${String(i + 1)} holds its first row`).toContain("a3f9b21");
          expect(entry.indexOf("a3f9b21"), `entry ${String(i + 1)}'s rows in order`).toBeLessThan(entry.indexOf("7c2d4e1"));
        }
      } finally {
        pty.kill();
      }
    },
    hangGuard(60_000),
  );
});
