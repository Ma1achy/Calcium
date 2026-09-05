// C22 tier 4 — a real `Session`, a real frame, real bytes on the stream.
//
// **Distinct from `buildGraph`, which every other C22 row uses.** That harness
// stubs `render` with a counter, so the graph it builds never paints — and the
// one thing asserted here happens *inside* `Session#render` and nowhere else.
// A row about it written against `buildGraph` would measure the harness.
import { describe, expect, it } from "vitest";

import { buildSession, fakeFs } from "../support/session.js";
import type { TuiConfig } from "../../src/shell/types.js";
import { createExecutionPipeline } from "../../src/shell/execution.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { displayCells } from "../../src/presentation/text.js";
import { MOUSE } from "../../src/terminal/escapes.js";

/** Two macrotask turns, so an ambient `setTimeout(0)` has run. */
/**
 * `HOME` — the marker of a **whole-frame** write.
 *
 * Still exact for the two rows that use it, and for a sharper reason than
 * before: the first frame of a session has no record to diff against, so it is
 * always written whole (C22 I55). "The shell painted at all" is therefore still
 * "a chunk contains HOME"; "what the shell painted" is `screen()`.
 */
const HOME_SEQ = "\u001b[H";

const settle = async (): Promise<void> => {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
};


describe("C22 §6b — the write is a difference", () => {
  it("T4.13 (I55): a keystroke writes less than the frame, and the screen still equals it", async () => {
    const stdin = fakeStdin();
    const { stdout, screen } = await buildSession(
      { stdin: stdin as never },
      { columns: 100, rows: 24 },
    );
    await settle();

    // **The subject before the claim.** A session that never painted satisfies
    // "wrote fewer bytes" perfectly.
    const settled = screen().rows;
    // **The subject, and `toHaveLength` is not it.** A screen has `size.rows`
    // rows whether anything was written to them, so the row count is a fact
    // about the model rather than about the session — a mutation painting one
    // row short survived that assertion, which is how this was found.
    //
    // The claim that distinguishes a full-height frame is **where the prompt
    // sits**: directly above the footer, which is the last row. The default
    // footer is empty by design (`chrome.ts`), so "the footer is non-blank" was
    // the wrong repair and a frame-read is what said so.
    expect(screen().drawn, "the session drew something").toBe(true);
    expect(settled[0]?.trim(), "the header is on the screen").not.toBe("");
    expect(
      settled.findIndex((r) => r.trimStart().startsWith("❯")),
      "the prompt sits between the two rules, above the footer (C22 I81)",
    ).toBe(21);
    const whole = settled.join("\r\n").length;

    const before = stdout.chunks.length;
    stdin.emit("a");
    await settle();

    const written = stdout.chunks.slice(before).join("").length;
    expect(written, "the keystroke did write something").toBeGreaterThan(0);

    // **Both halves, because either alone is satisfied by the wrong thing.** A
    // diff that simply dropped rows passes the byte count; a full repaint passes
    // the screen equality. The claim is the conjunction.
    expect(written, `${String(written)} bytes against a ${String(whole)}-byte frame`).toBeLessThan(
      whole / 2,
    );

    const after = screen().rows;
    expect(after, "the screen is still a whole frame").toHaveLength(24);
    const prompt = after.findIndex((r, i) => i > 0 && r.trimStart().startsWith("❯"));
    expect(prompt, "the prompt is on the screen").toBeGreaterThan(0);
    expect(after[prompt], "and the keystroke is on it").toContain("a");

    // Every row still full width — a diffed row that came up short would leave
    // the previous frame showing through exactly where it was written.
    for (const row of after) expect(displayCells(row)).toBe(100);
  });

  it("T4.14 (I55): a SIGWINCH repaints whole although no row changed", async () => {
    const stdin = fakeStdin();
    const { stdout, screen, resize } = await buildSession(
      { stdin: stdin as never },
      { columns: 100, rows: 24 },
    );
    await settle();
    const rowsBefore = screen().rows;

    const before = stdout.chunks.length;
    // **The same size.** C14 refuses a resize to the size it holds (C14 I21), so
    // nothing about the frame can differ — and `contaminated` is then the only
    // thing that can produce a write at all, which is the point of the row.
    resize({ columns: 100, rows: 24 });
    await settle();
    // **The window** (C03 I15). `settle()` is a `setImmediate` flush, so it
    // returns before a 16 ms timer fires — a resize is coalesced now and the
    // write this row is about happens on the timer, not on the signal.
    await new Promise((done) => setTimeout(done, 40));

    const written = stdout.chunks.slice(before).join("");
    expect(written, "the resize produced a write").not.toBe("");
    expect(written, "and it is a whole frame, from HOME").toContain(HOME_SEQ);
    expect(screen().rows, "showing the same thing it showed before").toEqual(rowsBefore);
  });

  it("T4.33 (C19 I23, C15 I14): a resize moves the open menu with the region", async () => {
    // **Read from the screen, because the anchor number agrees with the wrong
    // place.** An anchored layer stores the row it was placed against, and
    // every writer of that row was a keystroke path: the resize handler
    // resized the viewport and committed a frame, and `redrawMenu` sends
    // content alone. So the menu stayed anchored to the previous region height
    // until the next character. C15 clamps, so nothing faults and no number
    // disagrees with any other — a row asserting `placement.row` passes on the
    // stale value as readily as on the fresh one.
    //
    // The assertion is where the menu sits **relative to the prompt**: it is
    // chrome for the prompt and belongs immediately above it, which is the one
    // relation a stale anchor breaks and the only one a reader would name.
    const stdin = fakeStdin();
    const { screen, resize } = await buildSession({ stdin: stdin as never }, { columns: 100, rows: 24 });
    await settle();

    stdin.emit("/");
    await settle();

    const rowOf = (needle: string, rows: readonly string[]): number =>
      rows.findIndex((r) => r.includes(needle));

    /** The last row with anything on it above `at` — the menu's bottom edge. */
    const bottomAbove = (rows: readonly string[], at: number): number => {
      for (let i = at - 1; i >= 0; i -= 1) if ((rows[i] ?? "").trim() !== "") return i;
      return -1;
    };

    const before = screen().rows;
    const promptBefore = rowOf("❯", before);
    expect(bottomAbove(before, promptBefore), "the menu sits directly above the prompt").toBe(
      promptBefore - 1,
    );

    // **Taller, not shorter, and the direction is the whole row.** On a shrink
    // the clamp pushes a stale anchor to the bottom of the region — which is
    // where the menu belongs anyway — so the defect is invisible. Growing the
    // terminal leaves the stale row where the old region ended, and the menu
    // draws in the middle of the transcript with a gap beneath it.
    resize({ columns: 100, rows: 40 });
    await settle();
    // **The window** (C03 I15). `settle()` is a `setImmediate` flush and the
    // resize's frame is now written on a 16 ms timer, so the screen read below
    // would be the frame from *before* the resize — which is a stale anchor
    // read as a fresh one, exactly the confusion this row exists to catch.
    await new Promise((done) => setTimeout(done, 40));

    const after = screen().rows;
    const promptAfter = rowOf("❯", after);
    expect(promptAfter, "the prompt moved with the region").toBeGreaterThan(promptBefore);
    expect(bottomAbove(after, promptAfter), "and the menu came with it").toBe(promptAfter - 1);
  });

  it("T4.34 (C19 I23, entry 16): the truncated menu's indicator is on the screen", async () => {
    // **Through the real wiring, because that is where it was missing.** The
    // window and the remainder are both unit-tested and both were right; what
    // shipped was a call site that handed C15 every candidate and let the frame
    // cut the tail. A row that calls `menuWindow` agrees with either version —
    // this one drives a session, and the mutation that removes the slice in
    // `keys.ts` is the one it exists to catch.
    const stdin = fakeStdin();
    // Short, so the half-region cap bites on a handful of verbs.
    const { screen } = await buildSession({ stdin: stdin as never }, { columns: 100, rows: 16 });
    await settle();

    stdin.emit("/");
    await settle();

    const rows = screen().rows;
    const prompt = rows.findIndex((r) => r.includes("❯"));
    // The row directly above the prompt is the frame's own rule (C22 I81); the
    // menu's rows end above it.
    const menu = rows.slice(0, prompt - 1);
    expect(menu.some((r) => /\+ \d+ more/u.test(r)), "the indicator is drawn").toBe(true);
    // **And the box closes**, which is the half a row about the indicator alone
    // does not cover: the bottom edge sits between the menu and the prompt, and
    // C19 §6 argues it is what stops the list reading as continuous with the
    // line below it. A window one row too generous keeps the indicator and
    // loses this — the original defect, one row's worth — and the mutation pass
    // is what asked for the assertion.
    expect(menu[menu.length - 1] ?? "", "the rule closes the menu").toMatch(/^[─-]{20,}/u);
    expect(menu[menu.length - 2] ?? "", "with the indicator directly above it").toMatch(
      /\+ \d+ more/u,
    );
  });

  it("T4.15 (I56): a write that throws leaves the next frame whole", async () => {
    const stdin = fakeStdin();
    const { stdout, screen } = await buildSession(
      { stdin: stdin as never },
      { columns: 100, rows: 24 },
    );
    await settle();
    expect(screen().drawn, "a frame is on the screen").toBe(true);
    expect(
      screen().rows.findIndex((r) => r.trimStart().startsWith("❯")),
      "the frame reaches the foot of the terminal — rule, prompt, rule, footer",
    ).toBe(21);

    // The next write throws part-way — the screen keeps a prefix of a frame no
    // record describes. `throwOn` is what makes this constructible at all.
    stdout.throwOn(stdout.chunks.length, new Error("the terminal went away"));
    expect(() => stdin.emit("a"), "the throw reached the writer").toThrow("went away");
    await settle();

    const before = stdout.chunks.length;
    stdin.emit("b");
    await settle();

    const written = stdout.chunks.slice(before).join("");
    expect(written, "something was written after the fault").not.toBe("");
    // **Whole, not a difference.** With the record set after the write rather
    // than cleared before it, this is a diff against the frame *preceding* the
    // failed one, and the rows the partial write got wrong are the rows it skips.
    expect(written, "and it is a full repaint").toContain(HOME_SEQ);
  });
});

describe("C22 integration — the frame's viewport", () => {
  it("T4.12 (I34, with C14): a document taller than the region stays pinned to its last row at every prompt height", async () => {
    // **`/help keys` is the tall document, and it needs no transport.** It is a
    // local route rendering the keymap (C23 I26), so this row exercises the
    // height without a far side, a fixture corpus or a spawn — the three things
    // that would put someone else's failure in this test.
    //
    // It was `/help`, and the keymap moving behind an argument made that
    // document short enough to fit — so the last row became padding and the row
    // failed on its own control (`content, not padding`). **That control is why
    // this was a red test rather than a green one measuring nothing**, which is
    // exactly what it was written for.
    const stdin = fakeStdin();
    const { screen } = await buildSession({ stdin: stdin as never }, { columns: 100, rows: 16 });

    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      // The read loop decodes on the microtask queue; one turn is enough for the
      // batch and its commit, and the scheduler is synchronous under the fake.
      await Promise.resolve();
      await Promise.resolve();
    };

    await type("/help keys\r");
    await Promise.resolve();

    // **The subject before the claim** — a session that failed to draw would
    // satisfy every assertion below with an empty frame.
    const settled = screen().rows;
    // See T4.13 — the row count is the model's rather than the session's. What
    // this row needs from the guard is only that something was drawn; its own
    // control (three prompt heights, and a bottom row that is content rather
    // than padding) is what carries the claim.
    expect(screen().drawn, "the session drew something").toBe(true);
    expect(settled[0]?.trim(), "the header is on the screen").not.toBe("");

    // Not the fallback. With the viewport sized to the terminal it selects three
    // rows more than the region has, `paint` refuses (I35) and `drawFallback`
    // draws `Terminal too small` — so this is the assertion that fails against
    // the defect, and it fails loudly rather than by one row.
    expect(settled.join("\n"), "a real frame, not the fallback").not.toContain("Terminal too small");

    // The transcript region: rows 1 … 12 − 1 footer − promptRows.
    const regionOf = (frame: readonly string[], promptRows: number): readonly string[] =>
      frame.slice(1, frame.length - 1 - promptRows);

    // **Following the tail pins the *bottom* of the document**, so the region's
    // last row is the document's last row — and it is the same row however tall
    // the prompt is. That is the whole claim, and it is what distinguishes the
    // two readings: with the height taken from the terminal, `maxTop` does not
    // move as the prompt grows, so the *top* is what stays put and the bottom
    // walks up the document. One prompt height cannot tell them apart.
    const bottoms: string[] = [];
    const heights: number[] = [];

    for (const typed of ["", "x".repeat(140), "x".repeat(320)]) {
      if (typed !== "") await type(typed.slice(-140));
      const frame = screen().rows;
      expect(frame, `${String(typed.length)}: a frame`).toHaveLength(16);
      expect(frame.join("\n"), `${String(typed.length)}: not the fallback`).not.toContain(
        "Terminal too small",
      );

      // The prompt is every row from the first one wearing the glyph down to the
      // footer — read from the frame rather than computed, so the arithmetic
      // under test is not also the arithmetic doing the reading.
      const first = frame.findIndex((r, i) => i > 0 && r.trimStart().startsWith("❯"));
      expect(first, `${String(typed.length)}: the prompt is on the frame`).toBeGreaterThan(0);
      const promptRows = frame.length - 1 - first;
      heights.push(promptRows);

      const region = regionOf(frame, promptRows);
      expect(region, `${String(typed.length)}: the region is what is left`).toHaveLength(
        16 - 2 - promptRows,
      );
      bottoms.push((region[region.length - 1] ?? "").trimEnd());
    }

    // The control: the three passes really did have different prompt heights.
    // Without it every assertion above holds against a prompt that never grew.
    expect(new Set(heights).size, `three prompt heights, got ${heights.join(", ")}`).toBe(3);

    // And the bottom of the document never moved.
    expect(new Set(bottoms).size, `the document's last row: ${bottoms.join(" | ")}`).toBe(1);
    expect(bottoms[0], "and it is content, not padding").not.toBe("");

    // Every row is still the frame's width — the other axis, asserted because a
    // region computed one way and painted another shows up here first.
    for (const row of screen().rows) {
      expect(displayCells(row)).toBe(100);
    }
  });

  it("T1.18 (C22 I38): the spinner is read at paint and armed at request", async () => {
    // **Off the composed frame, never off the engine.** `completion.spinning`
    // has been correct since C19 and no file under `src/shell` read it — an
    // implementation on one side of the seam, which is what this row is about.
    // Asking the engine would pass against exactly that state.
    let resolveSource: ((c: readonly { value: string }[]) => void) | null = null;
    const slow = {
      id: "slow",
      slots: ["verb"] as const,
      dynamic: true,
      complete: () =>
        new Promise<readonly { value: string }[]>((r) => {
          resolveSource = r;
        }),
    };

    // **The wake is asserted by its effect, not by intercepting the scheduler.**
    // Two reasons, and the second is the better one: `schedule` is ambient
    // rather than a `TuiConfig` field, so it cannot be overridden here at all —
    // and a row asserting *a timer was armed for 500* is an implementation
    // detail a wrong implementation can satisfy while drawing nothing. What the
    // invariant claims is that a frame carrying the spinner arrives **with no
    // further input**, and that is what fails for both mutations.
    const stdin = fakeStdin();
    const { clock, screen } = await buildSession(
      { stdin: stdin as never, completionSources: [slow] } as never,
      // 20 rows, not 12: below C22 §8b's 60×16 gate the session draws
      // `Terminal too small` and every assertion here is about the fallback.
      { columns: 80, rows: 20 },
    );

    const promptOf = (): string => {
      const frame = screen().rows;
      return [...frame].reverse().find((r) => r.trimStart().startsWith("❯")) ?? "";
    };

    stdin.emit("/x");
    await Promise.resolve();
    await Promise.resolve();
    const before = screen().rows;
    const promptRowsBefore = before.length;
    expect(promptOf(), "the line is typed").toContain("/x");
    expect(promptOf(), "and no spinner before the threshold").not.toContain("⠋");

    stdin.emit("\t");
    await Promise.resolve();
    await Promise.resolve();

    // Still nothing on the frame: the clock has not moved.
    expect(promptOf(), "not yet").not.toContain("⠋");

    // Time passes on the injected clock, and the wake fires on its own — **no
    // further input**, which is the half the arming exists for.
    clock.advance(600);
    await new Promise((r) => setTimeout(r, 560));
    await Promise.resolve();

    expect(promptOf(), "the spinner is on the frame, drawn by nothing the user did")
      .toContain("⠋");

    // **Appearance, never geometry.** The prompt is the same height and the
    // frame the same shape as before the request.
    const during = screen().rows;
    expect(during, "the frame is the same height").toHaveLength(promptRowsBefore);
    expect(new Set(during.map((r) => displayCells(r))).size, "one width").toBe(1);
    expect(promptOf(), "and the typed text is untouched").toContain("/x");

    // Settle the source so the session has nothing outstanding at teardown.
    (resolveSource as ((c: readonly { value: string }[]) => void) | null)?.([]);
  });

  it("T4.9b (C16 I23): the scroll keys are in what /help renders", async () => {
    // **The row that says the ruling changed something a user can see.** Before
    // it, PageUp scrolled and `/help` could not mention it — the keys were read
    // out of an `InputEvent` in a `switch`, and help renders from the keymap —
    // while ⌃Home and ⌃End did not work at all. A row asserting the bindings
    // exist is T2.16b's; this asserts they reach the screen.
    //
    // Driven through a real session rather than by calling `bindings()`,
    // because the thunk agreeing with the keymap is not the claim: the claim is
    // that the help a user reads contains them.
    const stdin = fakeStdin();
    const { screen } = await buildSession({ stdin: stdin as never }, { columns: 100, rows: 40 });

    // **`/help keys`, not `/help`.** The keymap moved behind an argument when
    // `/help` was measured at thirty verbs: it emitted every binding last, and
    // the visible frame was entirely bindings with the verbs scrolled off. The
    // claim this row makes — that a scroll key is a binding in the table and is
    // rendered from it (C16 I23) — is unchanged; only which question shows it.
    stdin.emit("/help keys\r");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const frame = screen().rows;
    expect(frame, "a frame was written").toHaveLength(40);
    const text = frame.join("\n");

    // The control: help arrived at all. Without it every assertion below is
    // about an empty screen and the row passes when nothing rendered.
    //
    // **It used to be `toContain("c+r")` and that was positional.** The keys
    // document is longer than a 40-row frame and the frame shows its **tail**,
    // so the control was really asserting *`c+r` is within the last 38
    // bindings* — which two new `liveBlock` rows falsified by pushing it above
    // the fold (C22 I71's camera binding). Nothing about help had broken.
    //
    // **A control that moves when an unrelated binding is added is measuring
    // the ordering, not the arrival.** This counts rendered binding rows
    // instead: it fails on an empty screen, which is its job, and it does not
    // fail on the next binding anybody adds — which the old form would have,
    // for whoever added it rather than for whoever wrote this.
    const bindingRows = frame.filter((r) => /^\S+\s+\w+: \w+/u.test(r.trim())).length;
    expect(bindingRows, "the keymap document is on the frame").toBeGreaterThan(10);

    for (const shown of ["pageup", "pagedown", "c+home", "c+end"]) {
      expect(text, `/help shows ${shown}`).toContain(shown);
    }
  });
});

describe("C22 §7 — identity, from the app through C23", () => {
  // **The clock is passed explicitly rather than read from the harness.**
  // `buildSession` installs its own, starting at a real epoch — and there are
  // two `fakeClock`s under `test/support/` with different shapes, so a token
  // written against "zero" expires seventeen hundred billion milliseconds ago
  // and takes the `remaining <= 0` arm, which sets the same health as the arm
  // this row is about. Health cannot tell them apart; only the notice can.
  const NOW = 1_000_000;
  const nearlyExpired = () => ({
    user: "m",
    email: "m@fmx.io",
    groups: [] as readonly string[],
    // Inside the one-day warning window, and comfortably not expired.
    expiresAt: NOW + 14 * 60 * 60 * 1000,
  });

  it("T1.4e (I43): a supplied identity reaches the transcript as a notice", async () => {
    // **Asserted on the appended document, not on `warned`.** `warned` flips the
    // first time §7 decides a notice is due, whether or not anything is
    // delivered — which is exactly the state this row was written against: the
    // loop composed its text, marked itself as having warned so it would never
    // compose it again, and handed it to `notify: () => undefined`.
    //
    // Two things stood between the mechanism and a reader, and this row needs
    // both gone. The other was the fetcher: a stub returning `null` with no
    // config field behind it, so no token could arrive to be nearly expired.
    // Either alone leaves the behaviour identical, which is why neither was
    // visible as a defect on its own.
    const { screen } = await buildSession({
      clock: () => NOW,
      identity: () => Promise.resolve(nearlyExpired()),
    });

    // **Macrotasks, not microtasks.** `config.schedule` is always the ambient
    // `setTimeout` even when the clock is faked, so C03's commit window is a
    // real timer and no number of `Promise.resolve()`s reaches it.
    await settle();

    const text = screen().rows.join("\n");
    expect(text, "the expiry notice is on the frame").toContain("Token expires in 14h");
  });

  it("T1.4f (I43): omitting `identity` still runs the loop and appends nothing", async () => {
    // The default is a *fetcher*, not an absent loop. Without this half, a
    // "default" that skipped construction entirely would pass T1.4e — and the
    // session would have no health transitions at all.
    const { tui, screen } = await buildSession({ clock: () => NOW });

    await settle();

    expect(screen().rows.join("\n")).not.toContain("Token expires");
    expect(tui.session.identity, "no identity, and no throw getting there").toBeNull();
    expect(tui.session.health, "the loop ran and settled").toBe("live");
  });
});

describe("C23 §3b — the driver is stopped where `stopping` is set", () => {
  it("T4.22 (C23 I12): dispose runs at §8 step 1, before the terminal is released", async () => {
    // **Ordering, not occurrence.** A `dispose` called anywhere in shutdown
    // satisfies "the timers stop"; what I12 requires is that it precede the
    // teardown, because `stopping()` is read at the top of a tick and cannot see
    // a `fetch` already in flight. Called from inside `beforeRelease` it would
    // still be called, still pass a `toHaveBeenCalled`, and still let a resolving
    // fetch patch a transcript being torn down.
    //
    // Asserted against the alternate-screen exit rather than against a spy on
    // `killAll`: the release byte is the observable boundary between step 1 and
    // step 2, and it is on the same stream the frames go to. C22 §8 keeps the
    // same ordering for `killAll()` against `history.drain()`.
    const LEAVE_ALT = "\u001b[?1049l";
    let outputAtDispose: string | null = null;

    const { stdout, tui } = await buildSession({
      pipeline: (deps) => {
        const p = createExecutionPipeline(deps);
        return Object.create(p, {
          dispose: {
            value: () => {
              outputAtDispose = stdout.chunks.join("");
              p.dispose();
            },
          },
        }) as typeof p;
      },
    });
    await settle();

    await tui.stop("exit");

    // The control: the session really did leave the alternate screen, so the
    // assertion below is about ordering rather than about a sequence that was
    // never written at all.
    expect(stdout.chunks.join(""), "the terminal was released").toContain(LEAVE_ALT);
    expect(outputAtDispose, "dispose was reached").not.toBeNull();
    expect(outputAtDispose ?? "", "and reached before the release").not.toContain(LEAVE_ALT);
  });
});

describe("C22 §4 step 7 — the greeting (I44)", () => {
  const doc = (text: string) => ({
    schema: "tui.view/1" as const,
    command: "",
    status: "ok" as const,
    blocks: [{ kind: "raw" as const, id: "greet", text }],
    meta: {
      verb: null,
      adapter: "greeting",
      exitCode: 0,
      durationMs: 0,
      truncated: false,
      argv: [] as readonly string[],
      stderr: "",
      transport: "local" as const,
      origin: "user" as const,
    },
  });

  it("T3.9b (I44): the greeting becomes the session's first entry", async () => {
    // The control for the two rows below: they assert an *absence*, and an
    // absence proves nothing unless the presence is shown first. Step 7 named
    // this for the whole life of the document and fired nothing, so "no entry
    // appeared" was true of every session ever built.
    const { stdout } = await buildSession({
      greeting: () => Promise.resolve(doc("welcome aboard")),
    });
    await settle();

    expect(stdout.chunks.join(""), "the greeting is on the screen").toContain("welcome aboard");
  });

  it("T3.10 (I44): a greeting that never resolves leaves the prompt usable", async () => {
    // **Rewritten from a row that could not be written.** The old wording —
    // "the section renders as unavailable at its timeout" — described a
    // section-level banner renderer C22 does not have and never did. The row
    // had drifted from the design, not the code from the row.
    const { stdout, tui } = await buildSession({
      greeting: () => new Promise<never>(() => undefined),
    });
    await settle();

    // **The claim is that `await tui.start()` above resolved at all**, and the
    // assertions below are almost decoration. `buildSession` awaits `start()`,
    // so a startup that waited on the greeting hangs here and the row times out.
    //
    // Which took two mutations to establish. Making `#open()` async and
    // awaiting the greeting inside it leaves this **green** — `start()` calls
    // `#open()` without awaiting, so the hang never reaches the test, and the
    // row was vacuous against the obvious mutation. It fails only when `start()`
    // awaits `#open()` too. The subject is the whole chain from `start()` to the
    // fetch, not the one `void` that happens to be nearest the fetch.
    expect(tui.session.stopping, "the session is running").toBe(false);
    expect(stdout.chunks.join(""), "the shell painted").toContain(HOME_SEQ);
  });

  it("T3.11 (I44): a greeting that rejects is contained and the session continues", async () => {
    const { stdout, tui } = await buildSession({
      greeting: () => Promise.reject(new Error("the far side is down")),
    });
    await settle();

    expect(tui.session.stopping, "the session survived").toBe(false);
    expect(stdout.chunks.join(""), "the shell painted").toContain(HOME_SEQ);
    // Contained, not swallowed into the frame: a welcome that could not reach
    // its far side is not a startup fault and must not become an error entry.
    expect(stdout.chunks.join(""), "and said nothing about it").not.toContain("far side is down");
  });

  it("T4.x (C23 I37, C16 I26, F21): `enter` on a focused row reaches the dispatcher", async () => {
    // **The mutation that matters is removing the wiring and watching a real
    // keystroke fail**, not removing the handler. `actions.ts` implemented all
    // five arms and `pipeline.onAction` was called only from a unit test, so
    // eleven rows said nothing about whether anything reached it — a suite that
    // builds its own version of the thing under test cannot see whether
    // production builds it correctly.
    //
    // So this drives bytes into a real session and reads the frame. A `fill`
    // action puts its command in the prompt (C04 I19's default kind), which is
    // visible without asserting on any internal.
    const stdin = fakeStdin();
    const { screen } = await buildSession(
      {
        stdin: stdin as never,
        // **The verb is declared here, because C23 I27 refuses a handler with
        // no manifest row** — which is the reconciliation working, and the
        // reason the first draft of this test would not construct at all.
        manifest: {
          schema: "tui.manifest/1",
          binary: "prism",
          version: "1.0.0",
          tools: [
            {
              name: "rows",
              local: true,
              summary: "a table with an action on a row",
              args: [],
              flags: [],
            },
          ],
        },
        localHandlers: {
          rows: () => ({
            schema: "tui.view/1",
            status: "ok",
            blocks: [
              {
                kind: "table",
                id: "t",
                columns: [
                  { key: "name", label: "NAME", align: "left", priority: 1, minWidth: 6 },
                ],
                rows: [
                  {
                    id: "r1",
                    cells: { name: { text: "alpha" } },
                    // **Two, and the second exists to make the ruling
                    // falsifiable.** With one action, *first* and *last* are the
                    // same row and the mutation that takes the wrong one
                    // survives — the convenient setup is the one where both
                    // readings agree (C23 I37, C04 I19).
                    actions: [
                      { kind: "fill", label: "inspect", command: "/inspect alpha" },
                      { kind: "fill", label: "logs", command: "/logs alpha" },
                    ],
                  },
                ],
              },
            ],
          }),
        },
      } as never,
      { columns: 80, rows: 20 },
    );

    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      await Promise.resolve();
      await Promise.resolve();
    };

    const promptOf = (): string => {
      const frame = screen().rows;
      return [...frame].reverse().find((r) => r.trimStart().startsWith("❯")) ?? "";
    };

    await type("/rows\r");
    await Promise.resolve();
    await Promise.resolve();

    // The subject before the claim: without a rendered row there is nothing to
    // focus, and every assertion below would hold on an empty screen.
    expect(screen().rows.join("\n"), "the row is on screen").toContain("alpha");
    expect(promptOf(), "and the prompt is empty before the action").not.toContain("/inspect");

    // `↓` from the bottom of history enters the live block (C16 I22), then
    // `enter` activates — the binding that did not exist.
    await type("\u001b[B");
    await type("\r");

    expect(promptOf(), "the fill action reached C23's dispatcher").toContain("/inspect alpha");
    expect(promptOf(), "the *first* action, not whichever the array ends with").not.toContain("/logs");
  });

});

describe("C22 §8 step 3 — the diagnostics nobody read (I6a, C23 I48, F15)", () => {
  /**
   * A manifest with one local verb, so a handler can be registered without
   * tripping C23 I27's reconciliation.
   */
  const withLocal = (name: string): TuiConfig["manifest"] => ({
    schema: "tui.manifest/1",
    binary: "prism",
    version: "1.0.0",
    tools: [
      { name, local: true, summary: "a verb whose document C04 refuses", args: [], flags: [] },
    ],
  });

  /**
   * **F15's document**, and it is the input rather than a synthetic error: two
   * blocks with the id `running`, which C04 I14 forbids because `ViewPatch`
   * addresses blocks by id. This is what `/dashboard` returned, and what the
   * shell said nothing at all about.
   */
  const duplicateIds = () => ({
    schema: "tui.view/1" as const,
    command: "/fault",
    status: "ok" as const,
    blocks: [
      { kind: "notice" as const, id: "running", tone: "info" as const, glyph: "info" as const, text: "one" },
      { kind: "notice" as const, id: "running", tone: "info" as const, glyph: "info" as const, text: "two" },
    ],
  });

  it("T4.27 (C23 I48, I1): a rejected document is said in the transcript and again at exit", async () => {
    // **The row belongs at the public entry.** Every driver-level assertion
    // could already see this throw and no app author ever could — F15 cost four
    // wrong turns against a framework that had the answer in one sentence.
    const stdin = fakeStdin();
    const { stdout, screen, tui } = await buildSession(
      {
        stdin: stdin as never,
        manifest: withLocal("fault"),
        localHandlers: { fault: () => duplicateIds() },
      },
      { columns: 100, rows: 30 },
    );
    await settle();

    // The control: the session is up and the prompt takes keys, so a blank
    // assertion below would be about this row rather than about the frame.
    expect(screen().rows.join("\n"), "the shell painted").not.toBe("");

    stdin.emit("/fault\r");
    await settle();
    await settle();

    // Channel one — at the moment, where the missing entry should be.
    expect(
      screen().rows.join("\n"),
      "the reason is on screen, not only in a collection",
    ).toContain("running");

    // Channel two — after the release, on the restored primary screen. Taken
    // from what is written *after* stop begins, because the frames before it
    // are on the alternate screen and are discarded with it.
    const before = stdout.chunks.length;
    await tui.stop("exit");
    const after = stdout.chunks.slice(before).join("");

    // **After the release, and the ordering is the assertion** (C22 I6). A
    // diagnostic written before `lifecycle.release()` goes to the alternate
    // screen and is discarded with it — the dev sees a flash and an empty
    // shell. "It appears somewhere after `stop()` began" is satisfied by both
    // orders, which is what the mutation pass showed.
    const LEAVE_ALT = "\u001b[?1049l";
    expect(after, "the terminal was released on this path").toContain(LEAVE_ALT);
    expect(
      after.indexOf("running"),
      "and again at exit, on the restored primary screen",
    ).toBeGreaterThan(after.indexOf(LEAVE_ALT));
  });

  it("T4.20 (I6a, C20 I17): a history warning reaches the same drain", async () => {
    // **C20's half, and it was the older one.** `HistoryStore.warnings` was read
    // by nothing in `src/`: a corrupt file, a read-only home and a full disk
    // were each detected, described and discarded for the life of every session,
    // with T2.9 passing throughout because what it asserts is the silence.
    //
    // Fabricated at the filesystem, which is where the real cause lives.
    const base = fakeFs();
    const fs = {
      ...base,
      appendFile: () => Promise.reject(new Error("EROFS: read-only file system")),
      appendFileSync: () => {
        throw new Error("EROFS: read-only file system");
      },
    };

    const stdin = fakeStdin();
    const { stdout, tui } = await buildSession({ stdin: stdin as never, fs });
    await settle();

    stdin.emit("/help\r");
    await settle();

    const before = stdout.chunks.length;
    await tui.stop("exit");
    const after = stdout.chunks.slice(before).join("");

    const LEAVE_ALT = "\u001b[?1049l";
    expect(after, "the terminal was released on this path").toContain(LEAVE_ALT);
    expect(
      after.indexOf("EROFS"),
      "the write failure is reported, and after the release",
    ).toBeGreaterThan(after.indexOf(LEAVE_ALT));
  });

  it("T4.62 (C22 I83, §6l.2 row 12; C23 I55): a body one cell short of the width wraps once more under the indent, and the frame holds every row of it", async () => {
    // **The wiring row.** T1.41 and T1.42 call `entryLayout` directly and would
    // both pass with a `visibleRows` that never did, or a measurer wrapper that
    // measured flush — the second is the one that drops a row: C14 believes the
    // entry is two rows, the frame draws three, and the last cell is on no row.
    const manifest: NonNullable<TuiConfig["manifest"]> = {
      schema: "tui.manifest/1",
      binary: "prism",
      version: "1.0.0",
      tools: [{ name: "wide", local: true, summary: "one notice, 99 cells", args: [], flags: [] }],
    };
    const localHandlers: NonNullable<TuiConfig["localHandlers"]> = {
      wide: () => ({
        schema: "tui.view/1",
        command: "wide",
        status: "ok",
        blocks: [{ kind: "notice", id: "n", tone: "muted", text: "a".repeat(99) }],
      }),
    };
    const stdin = fakeStdin();
    const { screen } = await buildSession({ manifest, localHandlers, stdin: stdin as never });
    await settle();
    stdin.emit("/wide\r");
    await settle();

    const rows = screen().rows;
    const at = rows.findIndex((r) => r.includes("⏺ wide · ok"));
    expect(at, "the card's header is on the screen").toBeGreaterThan(0);
    expect(rows[at + 1]?.startsWith(`⎿ ${"a".repeat(98)}`), "the body's first row: the hook and 98 cells").toBe(true);
    expect(rows[at + 2]?.trimEnd(), "the wrapped cell, under two blanks").toBe("  a");
    expect(/^[─-]{20,}/u.test(rows[at + 3] ?? ""), "then the upper rule — nothing dropped between").toBe(true);
    expect(rows[at + 4]?.trimStart().startsWith("❯"), "and the prompt").toBe(true);
  });

  it("T4.28 (I6a, C09 I29): a swallowed render reaches the same drain", async () => {
    // **The fourth source, and its absence was structural rather than an
    // omission** (F223). L1 cannot reach this list, so C09's containments had
    // nowhere to report and reported nowhere — while C09's own T3.14 said
    // `logged` for as long as the row had existed. A boundary that hides the
    // bugs it catches is worse than no boundary, because it looks like one.
    //
    // Fabricated at the definition, which is where a renderer's bug lives.
    const manifest: NonNullable<TuiConfig["manifest"]> = {
      schema: "tui.manifest/1",
      binary: "prism",
      version: "1.0.0",
      tools: [{ name: "boom", local: true, summary: "a block that cannot draw", args: [], flags: [] }],
    };
    const localHandlers: NonNullable<TuiConfig["localHandlers"]> = {
      boom: () => ({
        schema: "tui.view/1",
        command: "boom",
        status: "ok",
        blocks: [{ kind: "detonate", id: "d" } as never],
      }),
    };
    const blocks: NonNullable<TuiConfig["blocks"]> = [
      {
        kind: "detonate",
        measure: (): number => 3,
        render: (): never => {
          throw new Error("renderer exploded");
        },
      } as never,
    ];

    const stdin = fakeStdin();
    const { stdout, tui, screen } = await buildSession({
      manifest,
      localHandlers,
      blocks,
      stdin: stdin as never,
    });
    await settle();

    stdin.emit("/boom\r");
    await settle();

    // **The height, read from a real frame rather than from a registry.** The
    // definition measures 3; the error block that replaces it occupies 3, so the
    // rows below sit where the measurement put them. This is C09 I11 through the
    // whole stack, and it is the assertion the unit rows cannot make — every
    // count agreed while the frame was one row tall.
    const rows = screen().rows;
    const at = rows.findIndex((r) => r.includes("failed to render"));
    expect(at, "the containment is on the screen").toBeGreaterThan(0);

    // **The figure moved and the claim did not** (C09 I31). The boundary used to
    // draw a bare message with blank rows below it, which is indistinguishable
    // from a block that under-drew — so it now draws the `status` box, and the
    // border is the evidence the height was honoured. The definition measures 3,
    // so the box is border · message · border and the rows below sit where the
    // measurement put them.
    // The box is a card's body (C23 I55), so its first row carries the hook (C22
    // I83) — required, not optional: a `visibleRows` that skipped the layout
    // survived this row while the hook was `(⎿ )?`.
    expect(/^\s*⎿ ┌/u.test(rows[at - 1] ?? ""), "the box opens above it, under the hook").toBe(true);
    expect(rows[at + 1]?.trimStart().startsWith("└"), "and closes below it").toBe(true);
    // **The prompt directly below the closing border is the height assertion.**
    // Three rows measured, three drawn, and nothing between the box and what
    // follows it — a stronger claim than a blank row, which a box one row short
    // would also satisfy.
    // The rule bounding the prompt follows the box (C22 I81), and the prompt it.
    expect(/^[─-]{20,}/u.test(rows[at + 2] ?? ""), "the upper rule follows the box").toBe(true);
    expect(rows[at + 3]?.trimStart().startsWith("❯"), "the prompt follows the rule").toBe(true);

    const before = stdout.chunks.length;
    await tui.stop("exit");
    const after = stdout.chunks.slice(before).join("");

    const LEAVE_ALT = "\u001b[?1049l";
    expect(after, "the terminal was released on this path").toContain(LEAVE_ALT);
    expect(
      after.indexOf("renderer exploded"),
      "what the containment swallowed is reported, and after the release",
    ).toBeGreaterThan(after.indexOf(LEAVE_ALT));
  });
});

describe("C22 — copy mode, entered and left (C16 §5b, C03 §4a)", () => {
  it("T4.30 (C16 §5b B1): ⌥v enters, the header says COPY, mouse tracking goes off", async () => {
    // **B1 is the row this file owes.** `copyMode` and `exitCopyMode` were both
    // stubs for the length of C26 — routed, ordered, unreachable — and the
    // producer landing alone would have given a mode the ⌃c rung consumes and
    // does not end. The pair is asserted as a pair for that reason.
    const stdin = fakeStdin();
    const { stdout, screen } = await buildSession({ stdin: stdin as never });

    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      await Promise.resolve();
      await Promise.resolve();
    };

    // The control: the indicator is not there before the key, so the assertion
    // below is about the key rather than about the header always saying COPY.
    expect(screen().rows[0], "no indicator before entry").not.toContain("COPY");

    const before = stdout.output;
    await type("\u001bv");

    expect(screen().rows[0], "the mode is on screen, in the row always drawn").toContain("COPY");
    expect(
      stdout.output.slice(before.length),
      "tracking off, so the terminal's own selection works",
    ).toContain("[?1002l");

    // **The indicator's frame is up before the hold takes effect** — otherwise
    // the reader is told nothing and simply finds the mouse dead.
    expect(screen().rows[0]).toContain("COPY");
  });

  it("T4.31 (C16 §5b B1): ⌃c leaves it, and the screen comes back", async () => {
    const stdin = fakeStdin();
    const { stdout, screen } = await buildSession({ stdin: stdin as never });

    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      await Promise.resolve();
      await Promise.resolve();
    };

    await type("\u001bv");
    expect(screen().rows[0]).toContain("COPY");

    const before = stdout.output;
    await type("\u0003");

    expect(screen().rows[0], "the indicator goes with the mode").not.toContain("COPY");
    expect(stdout.output.slice(before.length), "tracking back on").toContain("[?1002h");
  });

  it("T4.32 (C03 I13): while copy mode is up, output does not move the screen", async () => {
    // The whole point of the suspension, at the level where it is visible:
    // a selection the reader is taking must not come to mean other text.
    const stdin = fakeStdin();
    const { stdout, screen } = await buildSession({ stdin: stdin as never });

    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      await Promise.resolve();
      await Promise.resolve();
    };

    // A control first: typing moves the screen when copy mode is NOT up, so the
    // assertion after it is about the mode and not about typing being invisible.
    const base = screen().rows.join("\n");
    await type("abc");
    expect(screen().rows.join("\n"), "typing normally repaints").not.toBe(base);

    await type("\u001bv");
    const held = stdout.output;

    await type("def");
    expect(stdout.output, "nothing reaches the terminal while suspended").toBe(held);

    await type("\u0003");
    expect(stdout.output.length, "and resume writes the catching-up frame").toBeGreaterThan(
      held.length,
    );
    // **The length is a proxy and the tracking pair satisfies it.** Measured
    // 2026-09-05 with `resume()` deleted from the exit: `1002h 1006h` still
    // arrives, the length grows, and the assertion above passed while the
    // screen stayed frozen with `COPY` in the header. The frame is the subject,
    // so the frame is what is read.
    expect(screen().rows[0], "the catching-up frame took the indicator down").not.toContain("COPY");
  });
});

describe("C22 — copy mode: the order inside the exit, and the far side under the hold (C16 §5b, §5c)", () => {
  // Four microtasks rather than two: a settle runs through C23's continuation
  // before the store moves, and a row reading `stdout` one tick early would
  // report "nothing written" for a frame that had not been composed yet.
  const typer =
    (stdin: ReturnType<typeof fakeStdin>) =>
    async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
    };

  const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

  it("T4.31b (C16 §5b B1, C01 I10): after ⌃c the tracking pair is the first thing written, before any byte of the frame", async () => {
    const stdin = fakeStdin();
    const { stdout, screen } = await buildSession({ stdin: stdin as never });
    const type = typer(stdin);

    await type("\u001bv");
    expect(screen().rows[0], "in copy mode").toContain("COPY");

    const before = stdout.output.length;
    await type("\u0003");
    const after = stdout.output.slice(before);

    // **The control comes first**: a frame did follow the pair. Without it,
    // "starts with the pair" is satisfied by a session that wrote the pair and
    // then nothing — which is exactly what dropping `resume()` produces.
    expect(after.length, "a catching-up frame followed").toBeGreaterThan(MOUSE.enter.length);
    expect(screen().rows[0], "and it removed the indicator").not.toContain("COPY");

    // The reader has finished selecting; the app takes the mouse back before it
    // takes the screen. T4.31 asserts both bytes arrived and cannot see which
    // came first — the swap passes it.
    expect(
      after.startsWith(MOUSE.enter),
      `the first bytes after ⌃c are 1002h 1006h, got ${JSON.stringify(after.slice(0, 48))}`,
    ).toBe(true);
  });

  it("T4.32b (C03 I13, C16 §5b B4): a verb settling during copy mode writes nothing; the exit's one frame carries it", async () => {
    const stdin = fakeStdin();
    let settle: ((doc: unknown) => void) | null = null;
    const { stdout, screen } = await buildSession({
      stdin: stdin as never,
      manifest: {
        schema: "tui.manifest/1",
        binary: "prism",
        version: "1.0.0",
        tools: [{ name: "slow", local: true, summary: "settles when told", args: [], flags: [] }],
      },
      localHandlers: {
        slow: () =>
          new Promise((resolve) => {
            settle = resolve;
          }),
      },
    } as never);
    const type = typer(stdin);
    const TEXT = "SETTLED-UNDER-THE-HOLD";

    await type("/slow\r");
    expect(settle, "the verb is in flight").not.toBeNull();
    expect(screen().text.join("\n"), "and has not settled").not.toContain(TEXT);

    await type("\u001bv");
    expect(screen().rows[0]).toContain("COPY");
    const held = stdout.output;

    // **The far side is not frozen.** The store moves; the screen does not.
    settle!({ schema: "tui.view/1", status: "ok", blocks: [{ kind: "raw", id: "r1", text: TEXT }] });
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    expect(stdout.output, "the store moved and nothing reached the terminal").toBe(held);
    expect(
      screen().text.join("\n"),
      "the screen still holds the frame the reader is selecting from",
    ).not.toContain(TEXT);

    await type("\u0003");
    expect(stdout.output.length, "one catching-up frame").toBeGreaterThan(held.length);
    expect(screen().text.join("\n"), "and it carries what settled under the hold").toContain(TEXT);
  });

  it("T4.32c (C16 §5c C5): ⌥v a second time in copy mode writes nothing — one 1002l, not two", async () => {
    const stdin = fakeStdin();
    const { stdout, screen } = await buildSession({ stdin: stdin as never });
    const type = typer(stdin);

    await type("\u001bv");
    expect(screen().rows[0]).toContain("COPY");
    const once = stdout.output;
    expect(count(once, MOUSE.leave), "the leave pair, once").toBe(1);

    await type("\u001bv");
    expect(stdout.output, "the second press writes nothing at all").toBe(once);
  });

  // **RED UNTIL LANE S LANDS THE ROW — and `it.fails` is how it says so.** The
  // ruling is C16 §5c: `Esc` leaves copy mode. It needs a `copyMode`/`escape`
  // row in `keymap.ts`, `"exitCopyMode"` in `KeyAction`, and one effect line in
  // `keys.ts`, none of which this lane owns. The body asserts the *ruling*; the
  // wrapper asserts that the tree does not yet satisfy it. The day the three
  // lines land this row goes red, which is the signal to flip it to `it` — a
  // deferral that expires on the change it waits for, where an `it.todo` would
  // not (`todo-expiry` is indexed by component, and every component here exists).
  it.todo("T4.63 (C22 I84, I85; C23 I57; §6l.6 rows 16–19): frame read — a continuation notice and a settled card with a default-gap table put both hooks at column 2, the card's hook row carries the table header, one blank row between the entries and one above the upper rule — not deferred on a component: the same round's code commit replaces this row");

  it("T4.68 (C16 §5c C1): Esc leaves copy mode — the tracking pair is the first bytes written, then the frame", async () => {
    const stdin = fakeStdin();
    const { stdout, screen, clock } = await buildSession({ stdin: stdin as never });
    const type = typer(stdin);

    await type("\u001bv");
    expect(screen().rows[0]).toContain("COPY");
    const before = stdout.output.length;

    // A lone `Esc` waits C16 §2's 50 ms to be told apart from a sequence
    // prefix; the wake is a real timer against the injected clock.
    stdin.emit("\u001b");
    clock.advance(80);
    await new Promise((r) => setTimeout(r, 80));
    for (let i = 0; i < 4; i += 1) await Promise.resolve();

    expect(stdout.output.slice(before), "tracking back on Esc").toContain(MOUSE.enter);
    expect(screen().rows[0], "the indicator goes with the mode").not.toContain("COPY");
  });
});
