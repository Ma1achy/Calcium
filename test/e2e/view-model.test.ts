// C04 tier 5 — e2e. A real session, a real terminal, real widths.
//
// Every one of C04's tier-5 tests is a *drift* test: does the number the
// measurer returned match the rows the terminal actually shows? That needs a
// render tree, a viewport and a PTY. A registry measures a block, and only a
// viewport can drift.
//
// **What the drift is, read from outside.** In-process, C14 T5.1 compares the
// selected range against a rendered document and the two are the same
// arithmetic. From a PTY there is no document to compare against — only frames —
// so the claim is the one a user could make: paging from the top reaches the
// bottom, every screenful advances by exactly `height − 1` rows (C14 I17), no
// row is skipped and none is shown twice out of order, and the last screenful
// ends on the document's last row.
//
// That final clause is not decoration. The viewport was three rows taller than
// the region it draws into (C22 I34), so it stopped scrolling short by exactly
// the chrome and the document's last rows were unreachable by `End`, `PageDown`
// or `↓` — arithmetically self-consistent everywhere, and visible only here.
import { describe, expect, it } from "vitest";

import { interactivePty, PROMPT, promptRow, type InteractivePty } from "../support/pty.js";

const FIXTURE = "node test/support/fixture.mjs session subprocess";

// **This file found that `Home` and `End` could not reach a document's
// extremes**, and the ruling that followed is C16 I23. `scrollToTop` and
// `scrollToBottom` had callers in the shell and no route from a keyboard,
// because the keymap binds both keys to the prompt's cursor motions and the
// prompt is dispatched ahead of `global` at every moment it has focus. The
// document's extremes are `⌃Home`/`⌃End` now, T5.1b drives them, and T5.1's
// walk still pages to the top rather than jumping — a walk that starts where a
// user's paging would start.
const KEY = {
  pageDown: "\u001b[6~",
  pageUp: "\u001b[5~",
  // C16 I23. `Home` and `End` are the prompt's line motions and resolve ahead
  // of `global` at every moment the prompt has focus, so the document's
  // extremes are the modified pair — the distinction every editor draws. This
  // file is where the absence was found: T5.1 was written against `Home`, could
  // not reach the top of a document, and the walk below pages there instead.
  //
  // xterm's form. rxvt sends `CSI 7;5~`/`CSI 8;5~`, which the decoder names as
  // the same key; T2.16 covers both and a PTY row can only send one.
  scrollTop: "\u001b[1;5H",
  scrollBottom: "\u001b[1;5F",
} as const;

const COLS = 100;
const ROWS = 24;

const session = (cols = COLS, rows = ROWS): InteractivePty =>
  interactivePty(FIXTURE, { cols, rows });

/**
 * The transcript region of a frame: everything between the header and the
 * prompt, with the footer below it (S01 §3).
 *
 * Derived from where the prompt actually is rather than from `rows − 3`, so the
 * helper does not encode the arithmetic the rows are checking. `promptRow` takes
 * the **last** row wearing the glyph, because since C22 I33 the transcript draws
 * each entry with the command that produced it and the first one is that echo.
 */
function region(frame: readonly string[]): readonly string[] {
  const prompt = promptRow(frame);
  const at = frame.lastIndexOf(prompt);
  return frame.slice(1, at).map((r) => r.trimEnd());
}

/**
 * Page to the top, then walk down to the bottom, returning every screenful.
 *
 * Shared by T5.1 and T5.2 because the property is the same at every width and a
 * second copy is where the two would drift apart. `lastRow` is the document's
 * final row, captured from a tail-following frame rather than computed — so
 * nothing here has to know the document's height, which is the quantity under
 * test.
 */
async function walk(pty: InteractivePty, lastRow: string): Promise<(readonly string[])[]> {
  // To the top by paging, since `Home` cannot get there (see `KEY`). Paged
  // rather than jumped, so the walk starts from a position reached the way a
  // user would reach it.
  for (let i = 0; i < 400; i += 1) {
    const before = region(pty.frame).join("\n");
    pty.type(KEY.pageUp);
    try {
      await pty.waitForFrame((f) => region(f).join("\n") !== before, 2_000);
    } catch {
      break; // the top: the frame stopped changing
    }
  }

  const screens: (readonly string[])[] = [];
  for (let guard = 0; guard <= 200; guard += 1) {
    const here = region(pty.frame);
    screens.push(here);
    if (here[here.length - 1] === lastRow) return screens;

    pty.type(KEY.pageDown);
    // The frame after the key, not the stream: the bytes for the previous frame
    // are already in `output`, so a stream match would resolve before the frame
    // this key caused had been written.
    const before = here.join("\n");
    await pty.waitForFrame((f) => region(f).join("\n") !== before, 20_000);
  }
  throw new Error(`the walk never reached ${JSON.stringify(lastRow)}`);
}

/**
 * The two claims every screenful must satisfy, at any width.
 *
 * `height − 1` per page (C14 I17) — the overlap is the point, because a
 * full-height page turn leaves a reader with no anchor in what they just read —
 * and the last screenful ends on the document's last row, which is the clause a
 * viewport sized to the terminal rather than the region cannot satisfy.
 */
function expectCoherent(screens: (readonly string[])[], lastRow: string, at: string): void {
  expect(screens.length, `${at}: a tall document is many screenfuls`).toBeGreaterThan(3);
  expect(screens[screens.length - 1]?.at(-1), `${at}: the last row is reachable`).toBe(lastRow);

  // Between every consecutive pair rather than on the total: a compensating pair
  // of errors sums correctly. The final pair is exempt — the bottom clamps, so
  // the last page is short by whatever was left.
  for (let i = 1; i < screens.length - 1; i += 1) {
    const prev = screens[i - 1] ?? [];
    const here = screens[i] ?? [];
    expect(here[0], `${at}: screen ${String(i)} starts where ${String(i - 1)} ended`).toBe(
      prev[prev.length - 1],
    );
  }

  // And no screenful is short, which is what makes the overlap check a claim
  // about scrolling rather than about padding.
  const heights = new Set(screens.map((s) => s.length));
  expect(heights.size, `${at}: every screenful is ${[...heights].join(", ")} rows`).toBe(1);
}

describe("C04 e2e — the drift tests", () => {
  it("T5.1 (C22 I34, C14 I17): a tall transcript pages from top to bottom, and the last row is reachable", async () => {
    const pty = session();
    try {
      await pty.waitFor(PROMPT, 20_000);

      // A document far taller than the region, from the real far side. 400 rows
      // against a 21-row region is nineteen screenfuls, which is enough for a
      // per-page off-by-one to accumulate into something unmistakable.
      pty.type("/ps --limit 400\r");
      await pty.waitForFrame((f) => region(f).some((r) => r.includes("0000399")), 30_000);

      // **Following the tail, so the settled frame already ends on the document's
      // last row.** That row is the subject of the whole test: it is what the
      // mis-sized viewport could not reach, and capturing it here rather than
      // computing it means the assertion does not depend on knowing the
      // document's height.
      const tail = region(pty.frame);
      const lastRow = tail[tail.length - 1] ?? "";
      expect(lastRow, "the tail is content, not padding").not.toBe("");

      const screens = await walk(pty, lastRow);
      expectCoherent(screens, lastRow, "100 columns");

      // **And paging past the bottom does not move it.** The clamp, from the
      // outside: a viewport that kept scrolling would show blank rows below the
      // document, which is what a `#maxTop()` computed from the wrong height
      // produces in the other direction.
      pty.type(KEY.pageDown);
      pty.type(KEY.pageDown);
      await new Promise((r) => setTimeout(r, 300));
      expect(region(pty.frame).at(-1), "the bottom is the bottom").toBe(lastRow);
    } finally {
      pty.kill();
    }
  }, 120_000);

  it("T5.1b (C16 I23): ⌃Home and ⌃End reach the document's extremes, and Home still edits", async () => {
    // **The keys the walk above had to page around.** `scrollToTop` and
    // `scrollToBottom` had callers in the shell and no route from a keyboard,
    // because `Home` and `End` are the prompt's and the prompt resolves first.
    // Written here rather than beside the keymap because the unit rows can only
    // assert what resolves — this is the row that says the viewport moves.
    const pty = session();
    try {
      await pty.waitFor(PROMPT, 20_000);
      pty.type("/ps --limit 400\r");
      await pty.waitForFrame((f) => region(f).some((r) => r.includes("0000399")), 30_000);

      const tail = region(pty.frame);
      const lastRow = tail[tail.length - 1] ?? "";
      expect(lastRow, "the tail is content, not padding").not.toBe("");

      // One jump, where the walk needs a page per screenful.
      pty.type(KEY.scrollTop);
      await pty.waitForFrame((f) => region(f).join("\n") !== tail.join("\n"), 20_000);
      // **The document's first row is the command echo, not the first data
      // row** — C22 I33 draws each entry with the command that produced it, and
      // the top of the transcript is the top of the *entry*. Asserting
      // `0000000` here failed against a correct jump, which is the assertion
      // being wrong rather than the key.
      const top = region(pty.frame);
      expect(top[0], "⌃Home reaches the transcript's first row").toContain("/ps --limit 400");
      expect(top.join("\n"), "and the document's earliest data row is on it").toContain("0000000");

      pty.type(KEY.scrollBottom);
      await pty.waitForFrame((f) => region(f).at(-1) === lastRow, 20_000);
      expect(region(pty.frame).at(-1), "⌃End reaches its last").toBe(lastRow);

      // **The control, and it is what makes the ruling a ruling.** Unmodified
      // `Home` must still be the *line's* start: it moves the cursor inside the
      // prompt and does not scroll. Binding the extremes without the modifier
      // would pass every assertion above and break this one.
      pty.type(KEY.scrollTop);
      await pty.waitForFrame((f) => region(f).join("\n").includes("0000000"), 20_000);

      pty.type("second");
      await pty.waitForFrame((f) => promptRow(f).includes("second"), 20_000);
      pty.type("\u001b[Hfirst-"); // Home, then type at the line's start
      await pty.waitForFrame((f) => promptRow(f).includes("first-second"), 20_000);
      expect(region(pty.frame).join("\n"), "and the viewport did not move").toContain("0000000");
    } finally {
      pty.kill();
    }
  }, 120_000);

  it("T5.2 (C14 I8): the same at four widths, with a resize between every pass", async () => {
    // **The width axis, and the one that wraps.** A width change invalidates
    // every cached height (C14 I8), so each pass below walks a document that was
    // remeasured between it and the last — which is the state a cache bug
    // produces and a single-width run can never reach.
    //
    // The resize is `pty.resize`, so the path is the real one: the kernel
    // delivers `SIGWINCH`, C01 snapshots, C22 hands the width down. Setting a
    // size without the signal would exercise a path nothing takes.
    const pty = session(120, 24);
    try {
      await pty.waitFor(PROMPT, 20_000);
      // **`--search`, so the document wraps.** A `ps` table does not: C11
      // truncates a cell to its column, so the same document is the same number
      // of rows at every width and four passes over it would satisfy every
      // assertion below while proving nothing about a resize. The far side's
      // `--search` arm answers with prose for exactly this row.
      pty.type("/ps --limit 200 --search=prose\r");
      await pty.waitForFrame((f) => region(f).some((r) => r.includes("0000199")), 30_000);

      const seen: number[] = [];
      for (const cols of [120, 80, 64, 100]) {
        pty.resize(cols, 24);

        // **Wait for the frame at the new width, not for a beat.** Every row is
        // squared off to the terminal's width (C22 §6), so the width of a
        // painted row is what says the resize has been composed — and reading
        // before it has is how a resize test asserts against the previous frame.
        await pty.waitForFrame((f) => f.length === 24 && (f[0] ?? "").length === cols, 20_000);

        // Back to the tail after the resize, so `lastRow` is the document's last
        // row at *this* width. It differs per width — the rows re-wrap — which
        // is why it is captured per pass rather than once.
        pty.type(KEY.pageDown);
        pty.type(KEY.pageDown);
        await new Promise((r) => setTimeout(r, 300));

        const tail = region(pty.frame);
        const lastRow = tail[tail.length - 1] ?? "";
        expect(lastRow, `${String(cols)}: the tail is content`).not.toBe("");
        expect(region(pty.frame).join("\n"), `${String(cols)}: and it is the document's end`).toContain("0000199");

        const screens = await walk(pty, lastRow);
        expectCoherent(screens, lastRow, `${String(cols)} columns`);
        seen.push(screens.length);
      }

      // **The control: the widths really did change what the walk walked.** Four
      // passes over an identical layout would satisfy every assertion above, and
      // that is exactly what a resize that never reached C14 would look like —
      // the defect this row is for.
      expect(new Set(seen).size, `four widths, screenful counts ${seen.join(", ")}`).toBeGreaterThan(
        1,
      );
    } finally {
      pty.kill();
    }
  }, 180_000);
  it("T5.3a (C14 I4): a live stream appending above a detached viewport does not move it", async () => {
    // **The single most noticeable correctness property in C14** (C14 §3), and
    // the half of T5.3 that is reachable today. A frozen streaming entry that
    // gains rows while the reader is looking further up must move only the
    // content *below* — the anchor is what prevents the shove, and from outside
    // the claim is simply that the rows on the screen are the same rows.
    const pty = session();
    try {
      await pty.waitFor(PROMPT, 20_000);

      // Something tall to be detached *within*, then the live stream above it.
      pty.type("/ps --limit 120\r");
      await pty.waitForFrame((f) => region(f).some((r) => r.includes("0000119")), 30_000);
      pty.type("/tail\r");
      await pty.waitForFrame((f) => region(f).some((r) => r.includes("tail 3")), 30_000);

      /** The highest `tail N` on the screen right now. */
      const streamedTo = (): number =>
        Math.max(
          0,
          ...(pty.frame.join("\n").match(/tail (\d+)/g) ?? []).map((m) => Number(m.slice(5))),
        );
      const atDetach = streamedTo();
      expect(atDetach, "the stream is running").toBeGreaterThan(0);

      // Detach: page up, so the viewport holds an anchor and stops following.
      pty.type(KEY.pageUp);
      pty.type(KEY.pageUp);
      await new Promise((r) => setTimeout(r, 400));

      const before = region(pty.frame);
      // Detached *within* the `ps` entry rather than at the stream: its rows are
      // numbered, the stream's are `tail N`, so the two are told apart by what
      // is on the screen and not by a row count.
      expect(
        before.filter((r) => /^\d{7}\b/.test(r)).length,
        "detached inside the older entry",
      ).toBeGreaterThan(5);
      expect(before.join("\n"), "and not at the live stream").not.toContain("tail ");

      await new Promise((r) => setTimeout(r, 1_500));

      // The claim: the screen is the same screen.
      expect(region(pty.frame), "the detached view did not move").toEqual(before);

      // **And the control, which has to come afterwards.** "The frame did not
      // change" is equally satisfied by a far side that died, and the obvious
      // check — counting `tail N` in the captured bytes — cannot work here: the
      // lines that arrived while detached were never *drawn*, which is the very
      // property being asserted. So the stream is read from the bottom, after
      // re-attaching, where the rows it wrote while nobody was looking are.
      for (let i = 0; i < 60; i += 1) pty.type(KEY.pageDown);
      await pty.waitForFrame((f) => f.join("\n").includes("tail "), 20_000);
      expect(streamedTo(), `the stream advanced past ${String(atDetach)} unseen`).toBeGreaterThan(
        atDetach + 3,
      );
    } finally {
      pty.kill();
    }
  }, 90_000);

  it.todo(
    "T5.3b: a --watch stream applying *merge* patches — an expanded row stays expanded and stays put. Not deferred on a component: what it needs is two harness parameters, and every component involved is built. The append half is T5.3a. What this needs is a patch that is not an append: the default stream adapter maps every `data` patch to `op: \"append\"` (`src/data/adapters/stream.ts`), and `op: \"merge\"` is only reachable through an app adapter's `adaptPatch`. So it needs two harness parameters — a registered adapter in `fixture.mjs` mapping a far-side line onto an existing table row, and a `tail` that emits rows rather than notices — and neither exists. Split from T5.3 rather than left bundled: the append half was reachable and was waiting behind the merge half's blocker",
  );
});
