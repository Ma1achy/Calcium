// AUTHORITY.md §Browser conformance — the generated design page in the pinned
// headless Chromium. **Not in `make test`**: `package.json` excludes this
// directory as it does `e2e` and `golden`, because every row needs the browser
// `make chromium` fetches, and a row that skipped without it would be a silent
// pass. `make design-browser` runs it, after the install; so does CI.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { checkPage, selfTest } from "../../tools/design/chromium.mjs";

const PAGE = "docs/design/language/calcium-design-language-revised.html";

describe("AUTHORITY §Browser conformance — the page's own checks, executed", () => {
  // **One row per case, so a mutation names the row that must catch it.** The
  // runner reports each problem prefixed by its case; each row takes its own.
  let problems: string[] = [];
  let cases = 0;
  beforeAll(async () => {
    ({ cases, problems } = await selfTest());
  });
  const mine = (prefix: string) => problems.filter((p) => p.startsWith(`${prefix}:`));

  it("self-test: every case was run — seven fabricated pages and two clean controls", () => {
    expect(cases).toBe(9);
    // Nothing reported under a name no row below reads.
    const named = ["clean", "a flag reads fail", "a flag is absent", "an unexpected flag", "console.error", "an uncaught throw",
      "router-clean", "router-ignores-query", "router-skips-a-set", "archive", "record"];
    expect(problems.filter((p) => !named.some((n) => p.startsWith(`${n}:`)))).toEqual([]);
  });
  it("self-test: the clean page passes (the control)", () => { expect(mine("clean")).toEqual([]); });
  it("self-test: a flag reading fail is refused", () => { expect(mine("a flag reads fail")).toEqual([]); });
  it("self-test: an absent flag is refused", () => { expect(mine("a flag is absent")).toEqual([]); });
  it("self-test: an unexpected flag is refused", () => { expect(mine("an unexpected flag")).toEqual([]); });
  it("self-test: a console.error is refused", () => { expect(mine("console.error")).toEqual([]); });
  it("self-test: an uncaught throw is refused", () => { expect(mine("an uncaught throw")).toEqual([]); });
  it("self-test: the routing page passes on every route (the control)", () => { expect(mine("router-clean")).toEqual([]); });
  it("self-test: a page ignoring the query is refused on the ascii route", () => { expect(mine("router-ignores-query")).toEqual([]); });
  it("self-test: a spinner the auto route skipped is refused", () => { expect(mine("router-skips-a-set")).toEqual([]); });
  it("self-test: a changed archive is refused and removed before unpacking", () => { expect(mine("archive")).toEqual([]); });
  it("self-test: DEPENDENCIES.md names the pinned version and both digests", () => { expect(mine("record")).toEqual([]); });

  it("the generated page: on every route, all five flags pass, the resolver answers the route, no console error", async () => {
    expect(await checkPage(PAGE)).toEqual([]);
  });

  it("the page with one probe widened to `undefined` is refused as dded6ee0's defect was — glyphGridCheck fails, uncaught", async () => {
    // The page's own control, built from the page: a probe value of nine cells
    // in a one-cell slot is what the builder wrote before dded6ee0.
    const html = readFileSync(PAGE, "utf8");
    const probe = /(data-glyph-grid-probe="([^"]+)" data-glyph-form="ascii" data-reserved-cells="1"><span class="glyph-grid-slot"[^>]*><span class="glyph-grid-value">)[^<]*</u;
    const hit = probe.exec(html);
    expect(hit, "a one-cell ASCII probe exists to widen").not.toBeNull();
    const dir = mkdtempSync(join(tmpdir(), "calcium-widened-"));
    const file = join(dir, "page.html");
    writeFileSync(file, html.replace(probe, "$1undefined<"));
    try {
      const reasons = await checkPage(file);
      expect(reasons.some((r) => r === "(default) glyphGridCheck = fail"), reasons.join("\n")).toBe(true);
      expect(reasons.some((r) => r.includes(`${hit![2]} ascii overflows reservedCells`)), reasons.join("\n")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
