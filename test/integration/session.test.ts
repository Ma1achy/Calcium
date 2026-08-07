// C22 tier 4 — a real `Session`, a real frame, real bytes on the stream.
//
// **Distinct from `buildGraph`, which every other C22 row uses.** That harness
// stubs `render` with a counter, so the graph it builds never paints — and the
// one thing asserted here happens *inside* `Session#render` and nowhere else.
// A row about it written against `buildGraph` would measure the harness.
import { describe, expect, it } from "vitest";

import { buildSession } from "../support/session.js";
import { createExecutionPipeline } from "../../src/shell/execution.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { displayCells } from "../../src/presentation/text.js";

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
      "the prompt sits on the row above the footer",
    ).toBe(22);
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

    const written = stdout.chunks.slice(before).join("");
    expect(written, "the resize produced a write").not.toBe("");
    expect(written, "and it is a whole frame, from HOME").toContain(HOME_SEQ);
    expect(screen().rows, "showing the same thing it showed before").toEqual(rowsBefore);
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
      "the frame reaches the foot of the terminal",
    ).toBe(22);

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
    const { stdout, screen } = await buildSession({ stdin: stdin as never }, { columns: 100, rows: 16 });

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
    const { stdout, clock, screen } = await buildSession(
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
    const { stdout, screen } = await buildSession({ stdin: stdin as never }, { columns: 100, rows: 40 });

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
    expect(text, "the keymap document is on the frame").toContain("c+r");

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
    const { stdout, screen } = await buildSession({
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
    const { stdout, tui, screen } = await buildSession({ clock: () => NOW });

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
    const { stdout, screen } = await buildSession(
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
