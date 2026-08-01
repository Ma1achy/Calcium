import { describe, expect, it } from "vitest";
import { interactivePty } from "../support/pty.js";

describe("probe", () => {
  it("submits a verb", async () => {
    const pty = interactivePty("node test/support/fixture.mjs session", { cols: 90, rows: 24 });
    await pty.waitFor(/❯/, 8000);
    pty.type("/guide\r");
    await new Promise((r) => setTimeout(r, 800));
    const out = pty.output;
    pty.kill();
    expect(out.slice(-900)).toBe("");
  }, 20000);
});
