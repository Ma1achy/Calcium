// Every helper parameter that shapes the environment under test, asserted to
// take effect.
//
// **The bar is not "the helper works".** It is: for each parameter, an
// assertion that fails if the parameter is ignored. A helper that silently
// discards an option is worse than one that lacks it — the caller writes a test
// that reads as covering a case it never ran, and the test passes.
//
// This exists because `runInPty` did exactly that. It accepted an `env` record
// and passed `name: "xterm-256color"` to node-pty unconditionally, and `name`
// *is* the child's TERM as far as node-pty is concerned. So C02's tier 5 set
// `TERM=dumb` and ran under xterm-256color; three assertions that were correct
// failed, and had they been written more loosely they would have passed while
// testing nothing. Nothing had noticed because those were the first tests ever
// to pass `env`.
//
// **This is A03 §2's vacuity class from the other side.** That list is about
// mechanisms that cannot fail; a harness parameter nobody has exercised is a
// mechanism that cannot be *seen* to have worked. Same defect, one layer out:
// the vacuity suite checks rules, and rules run inside harnesses it does not
// check.
//
// Non-PTY only. The two PTY runners are asserted in `test/e2e/harness.test.ts`,
// because spawning a pseudo-terminal per parameter belongs where the 60-second
// budget already lives.
import { spawn as spawnRaw } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { measureSequence, rowsDoc, wrappingDoc } from "../support/viewport.js";
import { capabilities, fakeDebug, fakeStdin, fakeStdout } from "../support/fake-terminal.js";
import {
  groupMembers,
  openDescriptorCount,
  run,
  scripts,
  waitForGroupEmpty,
} from "../support/process.js";
import { fakeClock, harness } from "../support/fake-scheduler.js";
import {
  clockOf,
  fakeChild,
  fakeRunner,
  invocation,
  recorded,
  result,
} from "../support/transport.js";
import { fakeWorld, steppableClock, worldResult } from "../support/world.js";
import {
  entry,
  fakeClock as historyClock,
  fakeFs,
  seedFiles,
} from "../support/history.js";
import { load } from "../../src/interaction/history/index.js";
import { doc, psColumns, psTable, tableOf } from "../support/blocks.js";
import { block } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { DARK_THEME, LIGHT_THEME, MONO_CAPS, measurable, visible } from "../support/render.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { cells } from "../../src/presentation/text.js";
import { caps, mutable, store, withTone } from "../support/theme.js";
import { largeManifest, toolNamed } from "../support/manifest.js";
import { inkWidth } from "../support/ink.js";

describe("harness parameters — fake-terminal", () => {
  it("capabilities(over): each field of the override reaches the record", () => {
    // Every field, not a sample. A spread that dropped one key would pass a
    // spot check on the other six.
    const all = capabilities({
      colourDepth: 1,
      unicode: "ascii",
      synchronisedUpdate: false,
      bracketedPaste: false,
      mouse: false,
      imageProtocol: "sixel",
      altScreen: false,
    });
    expect(all).toEqual({
      colourDepth: 1,
      unicode: "ascii",
      synchronisedUpdate: false,
      bracketedPaste: false,
      mouse: false,
      imageProtocol: "sixel",
      altScreen: false,
    });
    // And the defaults are not the override values, or the assertion above
    // would hold for a helper that ignored its argument entirely.
    expect(capabilities()).not.toEqual(all);
  });

  it("fakeStdout(size): the dimensions are the ones asked for, and are read live", () => {
    const stdout = fakeStdout({ columns: 132, rows: 43 });
    expect(stdout.columns).toBe(132);
    expect(stdout.rows).toBe(43);
    // Not the default, so a helper ignoring `size` fails here.
    expect(fakeStdout().columns).toBe(80);
  });

  it("fakeStdout().throwOn(at): the throw lands on that write and no other", () => {
    const stdout = fakeStdout();
    stdout.throwOn(2, new Error("boom"));

    stdout.write("one");
    stdout.write("two");
    expect(() => stdout.write("three")).toThrow(/boom/);
    // Once, not always — the parameter is a position, not a mode.
    expect(() => stdout.write("four")).not.toThrow();
  });

  it("fakeStdout().duringWrite(at, fn): the hook runs inside that write", () => {
    const stdout = fakeStdout();
    const order: string[] = [];
    stdout.duringWrite(1, () => order.push("hook"));

    stdout.write("first");
    order.push("after-first");
    stdout.write("second");

    // Inside the second write, which is index 1 — so the hook precedes the
    // caller's next statement and follows the first write.
    expect(order).toEqual(["after-first", "hook"]);
  });

  it("fakeStdin({ tty }): the flag reaches isTTY in both directions", () => {
    expect(fakeStdin().isTTY).toBe(true);
    expect(fakeStdin({ tty: false }).isTTY).toBe(false);
  });

  // **T1.16b (C01 I18a) — a property of the double, not a case of T1.16.**
  //
  // `pause` and `resume` were `() => stream` and `emit` delivered to any
  // listener, so the double had no flowing state for the source to get wrong.
  // T1.16 asserts that bytes arrive again after `resume()`, drove this fake,
  // and passed for a whole stretch against a `lifecycle.ts` that re-attached
  // its listener to a paused stream. The session drew frames and took no input.
  //
  // The three clauses below are the three that were no-ops, and the middle one
  // is the one nobody would think to model: adding a `data` listener resumes a
  // stream **only when `flowing` is not already false**, which is exactly the
  // state `pause()` leaves behind.
  it("fakeStdin(): models Node's flowing, so a paused stream can be got wrong", () => {
    const stdin = fakeStdin();
    const seen: string[] = [];
    const listener = (chunk: Buffer): void => void seen.push(chunk.toString());

    stdin.on("data", listener);
    stdin.emit("a");
    expect(seen, "a listener on a fresh stream flows").toEqual(["a"]);

    stdin.pause();
    stdin.emit("b");
    expect(seen, "a paused stream delivers to nobody").toEqual(["a"]);
    expect(stdin.isPaused()).toBe(true);

    // The clause the source got wrong: re-attaching is not enough.
    stdin.off("data", listener);
    stdin.on("data", listener);
    stdin.emit("c");
    expect(seen, "re-adding a listener does not restart a paused stream").toEqual(["a"]);

    stdin.resume();
    stdin.emit("d");
    expect(seen, "and resume() is what does").toEqual(["a", "d"]);
  });

  it("fakeDebug(): lines are captured rather than discarded", () => {
    const debug = fakeDebug();
    debug("a line");
    expect(debug.lines).toEqual(["a line"]);
  });
});

describe("harness parameters — fake-scheduler", () => {
  it("fakeClock(): scheduled work runs on tick and not before", () => {
    const clock = fakeClock();
    const ran = vi.fn();
    clock.schedule(ran, 50);

    expect(clock.outstanding).toBe(1);
    expect(clock.armed).toEqual([50]);

    clock.advance(49);
    expect(ran).not.toHaveBeenCalled();
    clock.advance(1);
    expect(ran).toHaveBeenCalledOnce();
    expect(clock.outstanding).toBe(0);
  });

  it("harness({ acquired: false }): nothing is written", () => {
    const h = harness({ acquired: false });
    h.scheduler.commit("input");
    expect(h.written).toEqual([]);

    // The same commit does write when acquired, so the assertion is about the
    // flag rather than about `commit` doing nothing.
    const live = harness({ acquired: true });
    live.scheduler.commit("input");
    expect(live.written.length).toBeGreaterThan(0);
  });

  it("harness({ windows }): a custom window changes when the frame lands", () => {
    // The parameter most likely to be silently dropped, because every test that
    // uses the defaults passes either way.
    const h = harness({ windows: { stream: 500 } });
    h.scheduler.commit("stream");

    // Armed with the supplied window, not the default. This is the assertion
    // that fails if `windows` is dropped — every other test uses the defaults
    // and passes either way.
    expect(h.clock.armed, "armed with the 33 ms default despite a 500 ms window").toEqual([500]);

    h.clock.advance(499);
    expect(h.render).not.toHaveBeenCalled();
    h.clock.advance(1);
    expect(h.render).toHaveBeenCalledOnce();
  });

  it("harness({ capabilities }): the record reaches the sync-update decision", () => {
    const off = harness({ capabilities: { synchronisedUpdate: false } });
    off.scheduler.commit("input");
    expect(off.written.join("")).not.toContain("2026h");

    const on = harness({ capabilities: { synchronisedUpdate: true } });
    on.scheduler.commit("input");
    expect(on.written.join("")).toContain("2026h");
  });

  it("harness({ render, repaint }): the supplied callbacks are the ones invoked", () => {
    const render = vi.fn();
    const repaint = vi.fn();
    const h = harness({ render, repaint });

    h.scheduler.commit("input");
    expect(render).toHaveBeenCalledOnce();

    h.scheduler.invalidate();
    h.scheduler.commit("input");
    expect(repaint).toHaveBeenCalledOnce();
  });

  it("harness({ snapshotLifecycle }): the view is captured rather than live", () => {
    // The option exists so one test can assert the mistake it names is real.
    // If it were ignored, that test would pass against correct behaviour and
    // prove nothing — the worst outcome for a test whose subject is a warning.
    const snap = harness({ snapshotLifecycle: true, acquired: true });
    snap.setAcquired(false);
    snap.scheduler.commit("input");
    expect(snap.written.length, "a snapshot view saw a later change").toBeGreaterThan(0);

    const live = harness({ acquired: true });
    live.setAcquired(false);
    live.scheduler.commit("input");
    expect(live.written).toEqual([]);
  });
});

describe("harness parameters — transport", () => {
  it("fakeChild({ stdout, stderr }): the scripted chunks are what the streams yield", async () => {
    const child = fakeChild({ stdout: ["a", "b"], stderr: ["e"] });
    const out: string[] = [];
    for await (const chunk of child.stdout) out.push(chunk);
    expect(out).toEqual(["a", "b"]);

    const err: string[] = [];
    for await (const chunk of child.stderr) err.push(chunk);
    expect(err).toEqual(["e"]);
  });

  it("fakeChild({ exit }): the scripted exit is the one reported", async () => {
    expect(await fakeChild({ exit: { code: 7, signal: null } }).exited).toEqual({
      code: 7,
      signal: null,
    });
  });

  it("fakeChild({ ignores }): an ignored signal is recorded and does not end the child", async () => {
    // The escalation ladder's whole subject. A helper that ignored `ignores`
    // would make every rung test pass at the first signal.
    const child = fakeChild({ ignores: ["SIGINT", "SIGTERM"] });

    expect(child.signal("SIGINT")).toBe(true);
    expect(child.running, "an ignored SIGINT ended the child").toBe(true);
    expect(child.signal("SIGTERM")).toBe(true);
    expect(child.running).toBe(true);

    child.signal("SIGKILL");
    expect(child.running).toBe(false);
    expect(child.signals).toEqual(["SIGINT", "SIGTERM", "SIGKILL"]);
  });

  it("fakeChild({ onSignal }): the mapped exit is the one reported", async () => {
    const child = fakeChild({ onSignal: (sig) => ({ code: 128, signal: `mapped-${sig}` }) });
    child.signal("SIGTERM");
    expect(await child.exited).toEqual({ code: 128, signal: "mapped-SIGTERM" });
  });

  it("fakeChild().emit / .close: post-construction control reaches the stream", async () => {
    const child = fakeChild({ ignores: ["SIGINT"] });
    const seen: string[] = [];
    const reading = (async (): Promise<void> => {
      for await (const chunk of child.stdout) seen.push(chunk);
    })();

    child.emit("late");
    child.close({ code: 3, signal: null });
    await reading;

    expect(seen).toEqual(["late"]);
    expect(await child.exited).toEqual({ code: 3, signal: null });
  });

  it("fakeRunner(next): the factory decides each child, and sees argv and the index", () => {
    const seen: { argv: readonly string[]; n: number }[] = [];
    const runner = fakeRunner((argv, n) => {
      seen.push({ argv, n });
      return { exit: { code: n, signal: null } };
    });

    runner.spawn(["a"], { cwd: () => "/one" });
    runner.spawn(["b"], { cwd: () => "/two" });

    expect(seen).toEqual([
      { argv: ["a"], n: 0 },
      { argv: ["b"], n: 1 },
    ]);
    // `cwd` is read at spawn and recorded, which is C21 I10's assertion surface.
    expect(runner.spawns.map((s) => s.cwd)).toEqual(["/one", "/two"]);
  });

  it("invocation / result / recorded (over): each override reaches the value", () => {
    expect(invocation({ verb: "logs", streams: true, timeoutMs: 5 })).toMatchObject({
      verb: "logs",
      streams: true,
      timeoutMs: 5,
    });
    expect(result({ exitCode: 2, stderr: "bad" })).toMatchObject({ exitCode: 2, stderr: "bad" });
    expect(recorded({ id: "x", provenance: "derived" })).toMatchObject({
      id: "x",
      provenance: "derived",
    });
    // Defaults differ from the overrides, so a builder ignoring its argument
    // fails rather than coincidentally matching.
    expect(invocation().verb).not.toBe("logs");
    expect(result().exitCode).not.toBe(2);
  });
});

describe("harness parameters — world", () => {
  it("fakeWorld(answers): the table decides what each verb returns", () => {
    const answer = worldResult();
    const world = fakeWorld({ ps: answer });

    expect(world.query(invocation({ verb: "ps" }))).toBe(answer);
    expect(world.query(invocation({ verb: "logs" })), "an unlisted verb answered").toBeNull();
    expect(world.queried).toEqual(["ps", "logs"]);
  });

  it("worldResult(over): the override reaches the result", () => {
    expect(worldResult({ exitCode: 4 }).exitCode).toBe(4);
    expect(worldResult().stdout).toEqual({ from: "world" });
  });

  it("steppableClock(start): the start is where it starts, and set moves it", () => {
    const clock = steppableClock(7_000);
    expect(clock.now()).toBe(7_000);
    clock.set(9_000);
    expect(clock.now()).toBe(9_000);
    // Not the default, so a helper ignoring `start` fails.
    expect(steppableClock().now()).toBe(1_000);
  });
});

describe("harness parameters — blocks, render, theme, manifest, ink", () => {
  it("doc(overrides): the override reaches the document", () => {
    expect(doc({ command: "ps", status: "partial" })).toMatchObject({
      command: "ps",
      status: "partial",
    });
    expect(doc().command).not.toBe("ps");
  });

  it("tableOf(n, id): the row count and id are the ones asked for", () => {
    const t = tableOf(5, "custom");
    expect(t.rows).toHaveLength(5);
    expect(t.id).toBe("custom");
    expect(tableOf(2).id).toBe("t");
  });

  it("measurable({ definitions }): the kind reaches the registry, and the frame", () => {
    // **The parameter that could have been inert.** An unregistered kind still
    // renders — as `raw`, C09 §2's fallback — and still produces rows, so a test
    // that registers `table`, draws one and counts lines passes whether or not the
    // option arrived. The assertion is therefore on `kinds` and on content only the
    // real renderer emits, with a default that genuinely lacks the kind.
    const without = measurable({});
    const with_ = measurable({ definitions: [tableDefinition] });

    expect(without.kinds, "the default already had table").not.toContain("table");
    expect(with_.kinds).toContain("table");

    const block = psTable({ rows: 2 });
    const bare = without.renderToLines(block, 100).join("\n");
    const drawn = with_.renderToLines(block, 100).join("\n");

    // `raw` prints the block as JSON; a table prints a header of column labels.
    expect(bare).toContain('"kind":"table"');
    expect(drawn).not.toContain('"kind":"table"');
    expect(drawn).toContain("family");
  });

  it("measurable({ focus }): the focused row is drawn differently, and only it", () => {
    const block = psTable({ rows: 3 });
    const plain = measurable({ definitions: [tableDefinition] }).renderToLines(block, 100);
    const focused = measurable({
      definitions: [tableDefinition],
      focus: { blockId: "ps", rowId: "r2" },
    }).renderToLines(block, 100);

    // The default is no focus, which is a different value from the one asked for.
    expect(plain[2]).not.toBe(focused[2]);
    // And focus changes appearance only: the geometry is identical, because
    // `measure` never sees focus (C11 I14).
    expect(focused.length).toBe(plain.length); // cells-ok
    expect(focused.map((l) => cells(visible(l)))).toEqual(plain.map((l) => cells(visible(l))));
    // The rows that do not hold focus are untouched.
    expect(focused[1]).toBe(plain[1]);
    expect(focused[3]).toBe(plain[3]);
  });

  it("psColumns() and psTable(...): each argument reaches the fixture", () => {
    expect(psColumns().map((c) => c.key)).toContain("mr");
    expect(psColumns().find((c) => c.key === "expand")?.role).toBe("expand");

    // Defaults differ from every value asked for, so a builder ignoring its
    // argument fails rather than passing quietly.
    expect(psTable().rows).toHaveLength(4);
    expect(psTable({ rows: 7 }).rows).toHaveLength(7);

    expect(psTable().id).toBe("ps");
    expect(psTable({ id: "other" }).id).toBe("other");

    expect(psTable().rows.some((r) => r.expanded === true)).toBe(false);
    expect(psTable({ rows: 3, expanded: [2] }).rows.map((r) => r.expanded)).toEqual([
      undefined,
      true,
      undefined,
    ]);

    expect(psTable().rows.every((r) => r.detail === undefined)).toBe(true);
    expect(psTable({ detail: true }).rows.every((r) => r.detail !== undefined)).toBe(true);

    expect(psTable().sort).toBeUndefined();
    expect(psTable({ sort: { key: "age", direction: "desc" } }).sort).toEqual({
      key: "age",
      direction: "desc",
    });
  });

  // A `notice`, not a `table`. When this was written C11 was a stub; now C11
  // exists and the reasoning is unchanged, because `measurable()` still has no
  // `table` unless one is passed to `definitions` — C11 registers rather than
  // shipping as a default (C09 §3). So a table block here would still fall
  // through to `raw` and paint the same bytes under any theme, which is the
  // fallback working and would have made both assertions below vacuous.
  const toned: Block = {
    kind: "notice",
    id: "n",
    tone: "error",
    glyph: "error",
    text: "a failure",
    gapBefore: false,
  };

  it("measurable({ theme }): the theme reaches the rendered bytes", () => {
    const dark = measurable({ theme: DARK_THEME }).renderToLines(toned, 40).join("");
    const light = measurable({ theme: LIGHT_THEME }).renderToLines(toned, 40).join("");
    expect(dark, "both themes rendered identically").not.toBe(light);
  });

  it("measurable({ capabilities }): the record reaches the rendered bytes", () => {
    const full = measurable().renderToLines(toned, 40).join("");
    const mono = measurable({ capabilities: MONO_CAPS }).renderToLines(toned, 40).join("");
    expect(mono, "a 1-bit record still emitted colour").not.toContain("\x1b[38");
    expect(full).not.toBe(mono);
  });

  it("caps(depth) and store(variant) and withTone(...): each argument reaches the value", () => {
    expect(caps(4).colourDepth).toBe(4);
    expect(caps(24).colourDepth).toBe(24);

    expect(store("dark").current.variant).toBe("dark");
    expect(store("light").current.variant).toBe("light");

    const themed = withTone("ok", "#123456", "light");
    expect(themed["light"]!.palettes["tone"]?.slots["ok"]).toBe("#123456");
    expect(themed["dark"]!.palettes["tone"]?.slots["ok"]).not.toBe("#123456");
  });

  it("measurable({ tick }): the tick reaches an animating renderer", () => {
    // `steps` is the only kind that reads `ctx.tick` — an `active` step draws a
    // spinner frame indexed by it. Every other kind is tick-invariant by
    // design (C09 I8: animation changes appearance, geometry never), so this is
    // the one block that can observe the parameter at all.
    //
    // Chosen deliberately over a `progress`: a determinate bar looks animated
    // and is not, and a test written against one would pass whatever `tick`
    // did.
    const animating: Block = {
      kind: "steps",
      id: "s",
      steps: [{ label: "working", state: "active" }],
      gapBefore: false,
    } as Block;

    const frames = new Set(
      [0, 1, 2, 3].map((tick) => measurable({ tick }).renderToLines(animating, 40).join("")),
    );
    expect(frames.size, "every tick drew the same frame").toBeGreaterThan(1);

    // And geometry does not move with it — C09 I8 from the other side, which is
    // what makes the parameter safe to vary.
    const heights = new Set([0, 1, 2, 3].map(() => measurable().measure(animating, 40)));
    expect(heights.size).toBe(1);
  });

  it("clockOf(fake): the adapter exposes the fake's time and its scheduling", () => {
    const fake = fakeClock();
    const clock = clockOf(fake);
    const ran = vi.fn();

    expect(clock.now()).toBe(0);
    clock.schedule(ran, 40);
    expect(fake.armed, "the adapter armed a different clock").toEqual([40]);

    clock.tick(40);
    expect(ran).toHaveBeenCalledOnce();
    expect(clock.now()).toBe(40);
  });

  it("toolNamed(name) and mutable(variant): each argument selects what it says", () => {
    expect(toolNamed("ps").name).toBe("ps");
    expect(toolNamed("promote").name).toBe("promote");
    expect(toolNamed("serving scale").name).toBe("serving scale");

    expect(mutable("dark")["variant"]).toBe("dark");
    expect(mutable("light")["variant"]).toBe("light");
    // A deep copy, so a caller breaking one field cannot reach the shipped
    // tokens — which is the whole reason the helper exists.
    const copy = mutable("dark");
    (copy["surfaces"] as Record<string, string>)["bg"] = "#000000";
    expect(mutable("dark")["surfaces"]).not.toEqual(copy["surfaces"]);
  });

  it("largeManifest(count): the count is the number of tools produced", () => {
    expect((largeManifest(3)["tools"] as unknown[]).length).toBe(3);
    expect((largeManifest(50)["tools"] as unknown[]).length).toBe(50);
  });

  it("inkWidth(text, box): the box width changes what fits", () => {
    // A box narrower than the text wraps it, so the reported width differs.
    expect(inkWidth("hello")).toBe(5);
    expect(inkWidth("a".repeat(40), 10)).toBeLessThanOrEqual(10);
  });
});

/**
 * The real-process harness (C21).
 *
 * `groupMembers` is the one that needed this most, and it is a different failure
 * from `runInPty`'s. That one silently ignored a parameter; this one could
 * silently answer "empty" — `ps` exits 1 both for a group with no members and
 * for a `ps` that could not run at all. A helper reading the status as "empty"
 * returns `[]` from an image with no `procps` installed, and T3.1, whose entire
 * assertion is that a process group is empty, passes having spawned nothing it
 * could see.
 *
 * So the positive control is the test: a group known to hold a process, seen.
 * Without it, every group assertion in the suite rests on an unchecked `[]`.
 */
describe("harness parameters — real processes", () => {
  it("groupMembers: a live group is seen, and an empty one is distinguished from a broken ps", async () => {
    // Detached, so the child leads its own group and its pid is the pgid — the
    // same shape C21 spawns in, which is what makes this a control for T3.1
    // rather than for some other arrangement of processes.
    const child = spawnRaw("node", ["-e", "setInterval(()=>{},1000)"], { detached: true });
    const pgid = child.pid!;

    try {
      const members = await groupMembers(pgid);
      expect(members, "a group holding a live child read as empty").toContain(pgid);
    } finally {
      process.kill(-pgid, "SIGKILL");
    }

    await new Promise<void>((resolve) => void child.on("close", () => resolve()));
    await waitForGroupEmpty(pgid);

    // And the other direction: a pgid nothing can be in. Empty, not a throw.
    expect(await groupMembers(0x7fffffff)).toEqual([]);
  });

  it("groupMembers: a ps that cannot run throws rather than reporting an empty group", async () => {
    // The vacuity case, forced. `-g` with a non-numeric argument is a usage
    // error, not an empty group, and the two are indistinguishable by exit
    // status alone — which is the whole reason the helper inspects more than
    // the status.
    await expect(groupMembers(NaN)).rejects.toThrow(/harness failure/);
  });

  it("waitForGroupEmpty(attempts): a group that never empties fails, naming the survivors", async () => {
    const child = spawnRaw("node", ["-e", "setInterval(()=>{},1000)"], { detached: true });
    const pgid = child.pid!;

    try {
      // One attempt, so the failure is prompt. The default is 400 — a value the
      // assertion below would not reach — so a helper ignoring the parameter
      // hangs for a fraction of a second and then fails on the wrong message.
      await expect(waitForGroupEmpty(pgid, 1)).rejects.toThrow(new RegExp(`${pgid}`));
    } finally {
      process.kill(-pgid, "SIGKILL");
      await new Promise<void>((resolve) => void child.on("close", () => resolve()));
    }
  });

  it("openDescriptorCount: opening a descriptor moves the count", () => {
    const before = openDescriptorCount();
    const fd = openSync("/dev/null", "r");
    try {
      expect(openDescriptorCount()).toBeGreaterThan(before);
    } finally {
      closeSync(fd);
    }
    expect(openDescriptorCount()).toBe(before);
  });

  it("scripts.emit(text): the argument is what the child writes", async () => {
    expect((await run(scripts.emit("asked-for"))).stdout).toBe("asked-for");
    // The default differs, so a builder ignoring its argument fails here.
    expect((await run(scripts.emit())).stdout).not.toBe("asked-for");
  });

  it("scripts.emitBoth(out, err): each argument reaches its own stream", async () => {
    const ran = await run(scripts.emitBoth("to-out", "to-err"));
    expect(ran.stdout).toBe("to-out");
    expect(ran.stderr).toBe("to-err");
  });

  it("scripts.emitBytes(bytes, chunk): both arguments change what arrives", async () => {
    const ran = await run(scripts.emitBytes(4096, "ab"));
    expect(ran.stdout.length).toBeGreaterThanOrEqual(4096);
    expect(ran.stdout.startsWith("abab")).toBe(true);
    // The default is 1 KiB of "x", which neither assertion above would accept.
    expect((await run(scripts.emitBytes())).stdout.length).toBeLessThan(4096);
  });

  it("scripts.emitRepeated(unit, times): both arguments shape the payload, and it survives past the argv limit", async () => {
    expect((await run(scripts.emitRepeated("ab", 3))).stdout).toBe("ababab");
    expect((await run(scripts.emitRepeated())).stdout).toBe("harnessharness");

    // The reason this exists. `emit(unit.repeat(times))` at this size fails the
    // spawn with E2BIG — Linux caps one argument at 128 KiB — and the empty
    // output reads like the reader dropped it rather than like the spawn failed.
    const big = await run(scripts.emitRepeated("日本語🚀", 20_000));
    expect(big.stdout.length).toBe("日本語🚀".length * 20_000);
  });

  it("scripts.exit(code): the code is the child's", async () => {
    expect((await run(scripts.exit(7))).code).toBe(7);
    expect((await run(scripts.exit())).code).toBe(3);
  });

  it("scripts.readEnv(name): the named variable is the one read", async () => {
    const argv = scripts.readEnv("HARNESS_PROBE");
    const child = spawnRaw(argv[0]!, [...argv.slice(1)], {
      env: { ...process.env, HARNESS_PROBE: "reached" },
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => (out += chunk));
    await new Promise<void>((resolve) => void child.on("close", () => resolve()));

    expect(out).toBe("reached");
  });

  it("scripts.ignoring(signals): the named signals are survived and others are not", async () => {
    const argv = scripts.ignoring(["SIGTERM"]);
    const child = spawnRaw(argv[0]!, [...argv.slice(1)], { stdio: ["ignore", "pipe", "ignore"] });
    child.stdout!.setEncoding("utf8");
    await new Promise<void>((resolve) => void child.stdout!.once("data", () => resolve()));

    // The announcement, not `child.killed`. That flag says a signal was *sent*
    // and is true whether the child survived it or died of it — an assertion
    // indistinguishable from its own negation. A line written after delivery
    // cannot come from a dead process.
    const caught = new Promise<string>((resolve) => {
      let seen = "";
      child.stdout!.on("data", (chunk: string) => {
        seen += chunk;
        if (seen.includes("caught:SIGTERM")) resolve(seen);
      });
    });
    child.kill("SIGTERM");
    expect(await caught, "SIGTERM was not ignored").toContain("caught:SIGTERM");

    child.kill("SIGKILL");
    const [code, signal] = await new Promise<[number | null, string | null]>((resolve) =>
      child.on("close", (c, s) => resolve([c, s as string | null])),
    );

    expect(code).toBeNull();
    expect(signal).toBe("SIGKILL");
  });

  it("scripts.ndjson(count, text): both arguments shape the lines", async () => {
    const ran = await run(scripts.ndjson(4, "ünïcode"));
    const lines = ran.stdout.trimEnd().split("\n");

    expect(lines).toHaveLength(4);
    expect(JSON.parse(lines[0]!)).toEqual({ i: 0, text: "ünïcode" });
    expect((await run(scripts.ndjson())).stdout.trimEnd().split("\n")).toHaveLength(3);
  });

  it("scripts.emitHex(hex): the exact bytes arrive, null bytes included", async () => {
    const argv = scripts.emitHex("610062");
    const child = spawnRaw(argv[0]!, [...argv.slice(1)], { stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    child.stdout!.on("data", (chunk: Buffer) => chunks.push(chunk));
    await new Promise<void>((resolve) => void child.on("close", () => resolve()));

    expect([...Buffer.concat(chunks)]).toEqual([0x61, 0x00, 0x62]);
  });
});

/**
 * The other half of `test/support/README.md`'s rule: a parameter can reach the
 * thing it names and the *subject* still not respond.
 *
 * These are positive controls for C14's fixtures, and both are here because their
 * absence let two tests pass while exercising nothing. Neither defect was a
 * discarded option — `render.ts` honoured `definitions`, and `rowsDoc` built
 * exactly the blocks it was asked for. The fixtures were simply inert with
 * respect to what the tests varied, and the numbers agreed at every step.
 *
 * `groupMembers` is the same shape one layer down: an observation that returns a
 * plausible answer from an environment where it saw nothing.
 */
describe("C14 fixtures respond to what their tests vary", () => {
  it("wrappingDoc's height actually differs across widths", () => {
    // The control for every resize assertion. A `raw` block measures one row at
    // every width — it carries its text verbatim and never wraps — so a fixture
    // built from `raw` reports "the width changed and nothing moved", which is
    // indistinguishable from a viewport that ignored the resize.
    const narrow = measureSequence(wrappingDoc("w").blocks, 20);
    const wide = measureSequence(wrappingDoc("w").blocks, 200);

    expect(narrow, "the fixture must wrap, or a resize test resizes nothing").toBeGreaterThan(wide);
    expect(wide).toBeGreaterThanOrEqual(1);

    // And the negative control, naming what the fixture must not be built from.
    const raw = rowsDoc(1, "r");
    expect(measureSequence(raw.blocks, 20)).toBe(measureSequence(raw.blocks, 200));
  });

  it("the viewport kit measures a table as a table, not as a fallback raw", () => {
    // `table` is not a default kind — C11 registers it, which is what proves
    // C09 §3's extension path — and an unregistered kind still renders, as
    // `raw`, one row. So a kit without C11 measures a four-row table as 1 and
    // reports that expanding a row changed no height.
    const table = tableOf(4, "t");
    expect(measureSequence([table], 80), "a four-row table is not one row").toBeGreaterThan(1);

    const expanded = {
      ...table,
      rows: table.rows.map((r) =>
        r.id === "r1"
          ? { ...r, expanded: true, detail: [block({ kind: "raw", id: "d", text: "detail" })] }
          : r,
      ),
    };
    expect(
      measureSequence([expanded], 80),
      "expansion must change the height, or the index test asserts nothing",
    ).toBeGreaterThan(measureSequence([table], 80));
  });
});

describe("test/support/history.ts — every option is asserted to take effect", () => {
  // The rule this directory's README states, and C20's fake is exactly the
  // shape that likes to fail it: five options, each of which a careless
  // implementation discards silently, and two of them are the whole of T3.7 and
  // T3.8. A fake that cannot fail makes those tests read as covering a
  // read-only home and a full disk while running neither.
  it("`fail` really refuses, and `none` really restores", async () => {
    const fs = fakeFs();
    await expect(fs.appendFile("/f", "a")).resolves.toBeUndefined();

    fs.fail("readOnly");
    await expect(fs.appendFile("/f", "b")).rejects.toThrow(/EACCES/);
    await expect(fs.writeFile("/f", "b")).rejects.toThrow(/EACCES/);
    expect(() => {
      fs.appendFileSync("/f", "b");
    }).toThrow(/EACCES/);

    fs.fail("full");
    await expect(fs.appendFile("/f", "c")).rejects.toThrow(/ENOSPC/);

    fs.fail("none");
    await fs.appendFile("/f", "d");
    expect(fs.files.get("/f")).toBe("ad");
  });

  it("`jitter` really settles writes out of order", async () => {
    const fs = fakeFs();
    fs.jitter(true);
    const order: string[] = [];
    // Issued first, second, third — and if `jitter` were inert they would
    // settle in that order, which is the state T3.19 exists to rule out.
    await Promise.all(
      ["a", "b", "c"].map(async (name) => {
        await fs.appendFile(`/${name}`, name);
        order.push(name);
      }),
    );
    expect(order).not.toEqual(["a", "b", "c"]);
  });

  it("`seedFiles` produces a file the loader accepts, escaping included", () => {
    const seeded = seedFiles([entry("/deploy \\\n  --now", 5), entry("/ps", 6)]);
    const loaded = load(seeded["/state/history"] ?? "", seeded["/state/history.meta"] ?? "");

    expect(loaded.warnings, "a seed the loader warns about is not a fixture").toEqual([]);
    expect(loaded.entries.map((e) => [e.command, e.ts])).toEqual([
      ["/deploy \\\n  --now", 5],
      ["/ps", 6],
    ]);
  });

  it("`fakeClock` never repeats, so a stamp names the append that produced it", () => {
    const clock = historyClock(1_000, 7);
    expect([clock(), clock(), clock()]).toEqual([1_000, 1_007, 1_014]);
  });
});
