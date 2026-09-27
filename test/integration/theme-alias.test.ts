// C10 I63 through the composition root — the persisted preference and /theme.
// The pipeline harness supplies `/theme`'s enum from `theme.names`, which by
// I63 carries no alias, so both halves run through the real construct.
import { describe, expect, it } from "vitest";

import { defaultTheme } from "../../src/presentation/theme/index.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { buildGraph, buildSession, fakeFs } from "../support/session.js";

describe("C10 I63 — the high-contrast alias, end to end", () => {
  it("T4.38 (C10 I63, C22 I68): a persisted high-contrast opens hcDark with no notice, and /theme high-contrast persists hcDark", async () => {
    const fs = fakeFs();
    await fs.mkdir("/state");
    await fs.writeFile("/state/theme", "high-contrast\n");
    const built = await buildGraph({ fs, stateDir: "/state" });
    expect(built.graph.theme.current.tokens, "the preference resolves").toBe(defaultTheme["hcDark"]);
    const opened = await buildSession({ fs, stdin: fakeStdin() as never, stateDir: "/state" });
    expect(opened.stdout.chunks.join(""), "and is honoured, not ignored").not.toContain("theme preference ignored");

    const typed = fakeFs();
    const stdin = fakeStdin();
    await buildSession({ fs: typed, stdin: stdin as never, stateDir: "/state" });
    stdin.emit("/theme high-contrast\r");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect((await typed.readFile("/state/theme")).trim(), "the resolved name is written back").toBe("hcDark");
  });
});
