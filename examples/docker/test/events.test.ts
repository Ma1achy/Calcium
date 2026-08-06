/**
 * S11 `/events` — the eight rows of `S11_WALK.md` §8b, one test each.
 *
 * The far side is **injected**, which is what makes the trace reachable: a
 * failed tick, a ring that fills, an event that ages out of the window and an
 * empty daemon are all states a real docker will not produce on demand, and an
 * arm that cannot be driven is an arm that never runs.
 *
 * The corpus is real: `docker events --since 2h --format json` with the
 * lifecycle filters, twenty objects.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LocalDocument, Block, Events, Group, Notice, Panel, ViewDocument } from "@fmx/calcium";
import {
  ACTIONS,
  CAP,
  WINDOW,
  argv,
  body,
  clockOf,
  createEventsHandler,
  createRing,
  lineOf,
  seenOf,
} from "../src/events.ts";
import { parseNdjson } from "../src/ndjson.ts";
import type { Row } from "../src/ndjson.ts";

const CORPUS = parseNdjson(
  readFileSync(new URL("./corpus/events-real.ndjson", import.meta.url), "utf8"),
).rows;

/** A synthetic event, for the states the daemon will not produce to order. */
const event = (at: number, action: string, name = "web", extra: Record<string, string> = {}): Row => ({
  Type: "container",
  Action: action,
  Actor: { ID: `id-${name}`, Attributes: { name, ...extra } },
  time: at,
  timeNano: at * 1_000_000_000,
});

/**
 * **`b.live` returns a `panel`, not a `live` block**, and its behaviour is held
 * beside the document rather than inside it — so a test cannot call `fetch` or
 * `render` off the block, and reaches the rendering through the panel's
 * children instead. Found by asserting `kind` and being wrong about it.
 */
const descend = (blk: Block, kind: string): Block | undefined => {
  if (blk.kind === kind) return blk;
  const children =
    blk.kind === "panel"
      ? (blk as Panel).children
      : blk.kind === "group"
        ? (blk as Group).children
        : [];
  for (const child of children) {
    const found = descend(child, kind);
    if (found !== undefined) return found;
  }
  return undefined;
};

const eventsIn = (blk: Block): Events => {
  const found = descend(blk, "events");
  if (found === undefined) throw new Error(`no events block in ${blk.kind}`);
  return found as Events;
};
const noticeIn = (blk: Block): Notice => {
  const found = descend(blk, "notice");
  if (found === undefined) throw new Error(`no notice in ${blk.kind}`);
  return found as Notice;
};

describe("the window, not the stream", () => {
  it("V1 (§8b): the invocation is bounded at both ends and reads no clock", () => {
    // **The whole ruling in one assertion.** `--until` is what makes this a
    // request/response verb rather than a follow, and both bounds being
    // relative is what keeps a clock out of an app that has none to read
    // (C07 I1). An absolute timestamp here would be the app reading the time.
    const a = argv();
    expect(a).toContain("--until");
    expect(a[a.indexOf("--since") + 1]).toBe(WINDOW);
    expect(a[a.indexOf("--until") + 1]).toBe("0s");
    expect(a.join(" ")).not.toMatch(/\d{4}-\d{2}-\d{2}/u);
  });

  it("V2: the filters are the lifecycle, and exec is not in them", () => {
    // Content rather than performance: unfiltered, four-fifths of a window on
    // this machine is exec_create/exec_start/exec_die from the session doing
    // the measuring.
    expect(argv().filter((x) => x.startsWith("event="))).toHaveLength(ACTIONS.length);
    expect(argv().join(" ")).not.toContain("exec");
    expect(argv()).toContain("type=container");
  });
});

describe("the ring — §8b's trace", () => {
  it("E1: a window with nothing new leaves the ring unchanged", () => {
    const ring = createRing();
    expect(ring.absorb(CORPUS)).toBe(CORPUS.length);
    const before = ring.events;
    expect(ring.absorb(CORPUS)).toBe(0);
    // The same array, not merely an equal one: a re-render that rebuilt the
    // list every tick would flicker even when nothing had happened.
    expect(ring.events).toBe(before);
  });

  it("E2: the overlap a rolling window produces is deduped, not doubled", () => {
    const ring = createRing();
    ring.absorb([event(100, "start"), event(101, "die")]);
    // The next tick's window still contains both, plus one new.
    ring.absorb([event(100, "start"), event(101, "die"), event(102, "start")]);
    expect(ring.events).toHaveLength(3);
  });

  it("E3: an event older than the window stays in the ring", () => {
    // **The window is the fetch; the ring is the record.** Backwards, the list
    // forgets at ten minutes with nothing on screen saying so.
    const ring = createRing();
    ring.absorb([event(100, "start", "old")]);
    ring.absorb([event(900, "die", "new")]);
    expect(ring.events.map((e) => e.name)).toEqual(["new", "old"]);
  });

  it("E4: the ring drops its oldest, which is the end nobody is watching", () => {
    const ring = createRing(3);
    ring.absorb([event(1, "start", "a"), event(2, "start", "b")]);
    ring.absorb([event(3, "start", "c"), event(4, "start", "d")]);
    expect(ring.events.map((e) => e.name)).toEqual(["d", "c", "b"]);
    // And the dropped key is forgotten, so an event that returns in a later
    // window is not silently refused as a duplicate.
    expect(ring.absorb([event(1, "start", "a")])).toBe(1);
  });

  it("E5: a fetch that fails leaves the events alone and the surface up", async () => {
    // **Driven through the handler, not through the ring.** The ring is shared
    // across invocations by construction, so the second command exercises the
    // same object a tick would — and a test that called `absorb` directly would
    // pass against a handler that rebuilt the ring every time.
    let calls = 0;
    const handler = createEventsHandler(() => {
      calls += 1;
      return calls === 1
        ? Promise.resolve(CORPUS.map((r) => JSON.stringify(r)).join("\n"))
        : Promise.reject(new Error("daemon down"));
    });

    const first = await handler([], { command: "/events" });
    const before = eventsIn(first.blocks[0] as Block).events.length;
    expect(before).toBeGreaterThan(0);

    // The failing fetch does not reject the command: refusing to render would
    // take the surface away for a condition that clears in three seconds.
    const second = await handler([], { command: "/events" });
    expect(eventsIn(second.blocks[0] as Block).events).toHaveLength(before);
    expect(calls).toBe(2);
  });

  it("E8: two events sharing a nanosecond are both kept", () => {
    const ring = createRing();
    const a = event(500, "die", "one");
    const b = event(500, "die", "two");
    ring.absorb([a, b]);
    expect(ring.events).toHaveLength(2);
    // And the same event twice is still one.
    expect(ring.absorb([a])).toBe(0);
  });
});

describe("the rendering", () => {
  it("E6: no events renders a sentence, because an empty events block is blank", () => {
    // `eventsDefinition.measure` is `atLeastOne(length)`, so a `b.events` block
    // with no rows occupies a row and draws nothing — the exact frame that
    // reads as a broken fetch. Sixth instance of the empty-block class — the
    // count was one low until the roadmap totalled them, because /port's was
    // filed as a variant of the class rather than a member of it.
    const ring = createRing();
    expect(body(ring).kind).toBe("notice");
    expect(noticeIn(body(ring)).text).toContain("waiting for the first window");

    ring.began();
    ring.absorb([]);
    expect(noticeIn(body(ring)).text).toContain("no container lifecycle events");
  });

  it("E7: the first frame carries the events the handler already fetched", async () => {
    const handler = createEventsHandler(() =>
      Promise.resolve(CORPUS.map((r) => JSON.stringify(r)).join("\n")),
    );
    const doc = await handler([], { command: "/events" });
    // `loading…` as the opening frame of a surface whose data is in hand is the
    // dashboard's ruling, one verb over — and `b.live` calls `renderLoading` at
    // construction, so the events are in the panel the document carries.
    expect(eventsIn(doc.blocks[0] as Block).events.length).toBeGreaterThan(0);
    expect(JSON.stringify(doc.blocks[0])).not.toContain("loading…");
  });

  it("R1: a line is the event's own stamp, its action, and what docker said", () => {
    const line = lineOf(
      seenOf(event(1_700_000_000, "die", "web", { exitCode: "137", image: "nginx" })) as never,
    );
    expect(line.type).toBe("die");
    expect(line.message).toBe("web · exit 137 · nginx");
    // The time comes from the far side, which is why this surface can order
    // itself without asking what time it is.
    expect(line.ts).toBe(clockOf(1_700_000_000));
    expect(line.ts).toMatch(/^\d{2}:\d{2}:\d{2}$/u);
  });

  it("R2: an event with no name falls back to the actor id, never to blank", () => {
    const seen = seenOf({
      Action: "start",
      Actor: { ID: "0123456789abcdefgh", Attributes: {} },
      time: 5,
    });
    expect(seen?.name).toBe("0123456789ab");
  });

  it("R3: a row without a time or an action is not an event", () => {
    expect(seenOf({ Action: "start" })).toBeNull();
    expect(seenOf({ time: 5 })).toBeNull();
    expect(seenOf({})).toBeNull();
  });

  it("R4: the summary says how many and over what, and names the cap only at it", () => {
    // **This row found the defect it was written to describe.** `body` inferred
    // the drop from `events.length >= CAP`, comparing a ring's contents against
    // the module constant rather than against that ring's own cap — so a ring
    // of two holding two said nothing had been dropped, and a full default ring
    // said something had whether or not it ever did. The ring counts now.
    const ring = createRing(2);
    ring.absorb([event(1, "start", "a"), event(2, "start", "b")]);
    expect(noticeIn(body(ring)).text).toBe(`2 events · last ${WINDOW}`);

    ring.absorb([event(3, "start", "c")]);
    expect(noticeIn(body(ring)).text).toBe(`2 events · last ${WINDOW} · 1 older dropped`);

    const small = createRing();
    small.absorb([event(1, "start", "a")]);
    expect(noticeIn(body(small)).text).toBe(`1 event · last ${WINDOW}`);
    expect(CAP).toBeGreaterThan(2);
  });

  it("R5: the real corpus renders every event, newest first", () => {
    const ring = createRing();
    ring.absorb(CORPUS);
    const block = eventsIn(body(ring));
    expect(block.events).toHaveLength(CORPUS.length);

    const stamps = ring.events.map((e) => e.at);
    expect([...stamps].sort((a, z) => z - a)).toEqual(stamps);
  });

  it("R6: an empty daemon still produces a document, and it says so", async () => {
    const handler = createEventsHandler(() => Promise.resolve(""));
    // `LocalDocument`: a handler's answer is not a document until `runLocal`
    // fills the seven `meta` fields the shell owns (F13). This row asserts
    // `status` and a block, neither of which the fill touches.
    const doc: LocalDocument = await handler([], { command: "/events" });
    expect(doc.status).toBe("ok");
    expect(noticeIn(doc.blocks[0] as Block).text).toContain("no container lifecycle events");
  });
});
