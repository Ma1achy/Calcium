/**
 * S11 `/events` — **gap 2's surface, and gap 2 does not survive it.**
 *
 * Gap 2 was filed as *a live table that appends*: `b.live` re-renders from the
 * latest fetch, `/events` accumulates, and the question was whether Calcium
 * needed an append primitive. The premise underneath is that the far side
 * produces only deltas, and measurement says otherwise:
 *
 *     $ docker events --since 10m --until 0s --format json
 *     … 20 objects, exit 0
 *
 * `--until` terminates it, and **both bounds take relative durations**, so this
 * verb reads no clock — which matters, because the app has none to read (C07 I1;
 * `history.ts` counts tick indices for the same reason). `/events` is therefore
 * a **window**, not a stream, and a window is a snapshot, which is what `b.live`
 * is for.
 *
 * > Before asking for an append primitive, ask whether the far side can be asked
 * > for a window.
 *
 * The limit, stated rather than left for someone else to find: this holds for a
 * source with a bounded historical query and **fails for one without**.
 * `docker logs` has no `--until` that leaves the follow running, which is why S9
 * went the view+streams route. So both halves of gap 2 have an answer and
 * neither is an append primitive. `S11_WALK.md` §8b carries the ruling and the
 * eight-row trace.
 */

import { b } from "@fmx/calcium";
import type { Block, EventLine, ViewDocument } from "@fmx/calcium";
import { parseNdjson, str } from "./ndjson.ts";
import type { Row } from "./ndjson.ts";

/** The tick, the window, and the ring — three numbers, and they are ordered. */
export const TICK_MS = 3000;
/**
 * **The window must be far larger than the tick, and that is what makes E2 and
 * E5 work.** Each fetch re-delivers almost everything the last one did; the
 * dedupe turns that into nothing, and the overlap is what lets a tick fail
 * without losing an event.
 */
export const WINDOW = "10m";
/** Newest on top, so the ring drops from the end the reader is not watching. */
export const CAP = 200;

/**
 * The lifecycle actions, and **the filter is content rather than performance.**
 *
 * Unfiltered, a two-hour window on this machine is 82 events and ~330 KB, of
 * which the bulk is `exec_create`/`exec_start`/`exec_die` from the very session
 * doing the measuring. With these it is 20 events and 10 KB. A surface titled
 * *container lifecycle* that is four-fifths `exec` noise is not showing the
 * lifecycle; the smaller payload is a consequence, not the reason.
 */
export const ACTIONS: readonly string[] = [
  "create",
  "start",
  "stop",
  "kill",
  "die",
  "destroy",
  "restart",
  "pause",
  "unpause",
  "oom",
];

/** The argv, as one place, because the test and the handler must agree. */
export const argv = (): readonly string[] => [
  "events",
  "--since",
  WINDOW,
  "--until",
  "0s",
  "--filter",
  "type=container",
  ...ACTIONS.flatMap((a) => ["--filter", `event=${a}`]),
  "--format",
  "json",
];

/** One event, reduced to what the surface shows. */
export interface Seen {
  readonly key: string;
  readonly at: number;
  readonly action: string;
  readonly name: string;
  readonly detail: string;
}

/**
 * The dedupe key.
 *
 * `timeNano` alone would be enough almost always, and **almost** is the wrong
 * standard for a key: two daemon goroutines can stamp the same nanosecond, and
 * the failure mode is an event silently never appearing. Adding the action and
 * the actor keeps a genuine pair while still collapsing the re-delivery a
 * rolling window produces every tick (walk E8).
 */
const keyOf = (raw: Row): string =>
  `${String(raw["timeNano"] ?? raw["time"] ?? "")}·${str(raw, "Action")}·${actorId(raw)}`;

const actor = (raw: Row): Row => {
  const a = raw["Actor"];
  return a !== null && typeof a === "object" ? (a as Row) : {};
};
const actorId = (raw: Row): string => str(actor(raw), "ID");
const attribute = (raw: Row, key: string): string => {
  const attrs = actor(raw)["Attributes"];
  return attrs !== null && typeof attrs === "object" ? str(attrs as Row, key) : "";
};

/**
 * Docker's `time` is epoch seconds. Formatting one is **not reading a clock** —
 * the value comes from the far side, which is the whole reason the surface can
 * order its own rows without asking what time it is.
 */
export const clockOf = (seconds: number): string =>
  new Date(seconds * 1000).toISOString().slice(11, 19);

export function seenOf(raw: Row): Seen | null {
  const at = typeof raw["time"] === "number" ? raw["time"] : null;
  const action = str(raw, "Action");
  if (at === null || action === "") return null;

  const name = attribute(raw, "name") || actorId(raw).slice(0, 12) || "—";
  const code = attribute(raw, "exitCode");
  const image = attribute(raw, "image");
  return {
    key: keyOf(raw),
    at,
    action,
    name,
    // An exit code is the thing a reader is looking for on a `die`, and it is
    // the one attribute docker supplies that a name does not already say.
    detail: code === "" ? image : `exit ${code}${image === "" ? "" : ` · ${image}`}`,
  };
}

/**
 * The ring — **and it is the record, where the window is only the fetch**
 * (walk E3).
 *
 * An event that ages out of the ten-minute window stays here. Getting that
 * backwards makes the list forget at ten minutes with nothing on screen saying
 * so, which is the same class as `/logs`' view that would not follow: correct
 * arithmetic, a frame that is quietly wrong.
 */
export interface EventRing {
  /** Merges a fetched window; returns how many of them were new. */
  absorb(rows: readonly Row[]): number;
  /** Newest first, at most `CAP`. */
  readonly events: readonly Seen[];
  /** Fetches attempted, including the ones that produced nothing (walk E5). */
  readonly ticks: number;
  /**
   * Events the ring has discarded to stay within its cap — **counted, never
   * derived.**
   *
   * The first version inferred it in `body` from `events.length >= CAP`, using
   * the module constant against a ring that takes its cap as an argument. A
   * ring of two holding two said nothing had been dropped while a ring of two
   * hundred holding two hundred said it had, and both were guesses. `history.ts`
   * has the same rule for the same reason.
   */
  readonly dropped: number;
  began(): void;
}

export function createRing(cap = CAP): EventRing {
  const seen = new Set<string>();
  let held: Seen[] = [];
  let ticks = 0;
  let dropped = 0;

  return {
    began() {
      ticks += 1;
    },
    absorb(rows) {
      let fresh = 0;
      for (const raw of rows) {
        const event = seenOf(raw);
        if (event === null || seen.has(event.key)) continue;
        seen.add(event.key);
        held.push(event);
        fresh += 1;
      }
      if (fresh === 0) return 0;
      // Newest first is the surface's order, so the drop is off the end the
      // reader is not watching (walk E4). Sorted rather than assumed: a window
      // arrives oldest-first and a re-fetch can interleave.
      held.sort((x, y) => y.at - x.at);
      if (held.length > cap) {
        for (const gone of held.slice(cap)) seen.delete(gone.key);
        dropped += held.length - cap;
        held = held.slice(0, cap);
      }
      return fresh;
    },
    get events() {
      return held;
    },
    get ticks() {
      return ticks;
    },
    get dropped() {
      return dropped;
    },
  };
}

// ── The rendering ───────────────────────────────────────────────────────────

/**
 * `b.events` — **a block kind with no consumer anywhere until now.**
 *
 * `{ ts, type, message }` per line, which is this surface exactly: the time from
 * the event's own stamp, the action as the type, and the container plus whatever
 * docker said about why.
 *
 * **What it cannot say is which events are bad.** `EventLine` is
 * `{ ts, type, message }` with no tone, and `eventsDefinition` paints `type` in
 * `accent` for every row — while its sibling `logs` tones its `level` column
 * from a fixed vocabulary (`error`, `warn`, `debug`, …). Two kinds of the same
 * shape, one with severity and one without, so a `die` and a `create` are the
 * same colour on the surface the kind is named for. FINDINGS F51, filed with
 * this as the consumer.
 */
export const lineOf = (event: Seen): EventLine => ({
  ts: clockOf(event.at),
  type: event.action,
  message: event.detail === "" ? event.name : `${event.name} · ${event.detail}`,
});

/**
 * **One block, because `render` returns one** (C23 I34) — and the empty arm is
 * the reason this is a function rather than a `map`.
 *
 * `eventsDefinition.measure` is `atLeastOne(length)`, so a `b.events` block with
 * no events occupies a row and draws **blank**: the exact frame that reads as a
 * broken fetch. Walk E6, and the empty-block class a fifth time.
 */
export function body(ring: EventRing): Block {
  if (ring.events.length === 0) {
    return b.notice(
      "muted",
      ring.ticks === 0
        ? "waiting for the first window…"
        : `no container lifecycle events in the last ${WINDOW}`,
    );
  }

  return b.group("column", [
    b.events(ring.events.map(lineOf), { id: "event-lines" }),
    b.notice(
      "muted",
      `${String(ring.events.length)} event${ring.events.length === 1 ? "" : "s"} · last ${WINDOW}` +
        (ring.dropped === 0 ? "" : ` · ${String(ring.dropped)} older dropped`),
      undefined,
      { gapBefore: true },
    ),
  ]);
}

// ── The handler ─────────────────────────────────────────────────────────────

/** The far side, injected so every arm of the trace is reachable in a test. */
export type Fetch = () => Promise<string>;

export function createEventsHandler(
  fetchWindow: Fetch,
): (argvIn: readonly string[], ctx: { command: string }) => Promise<ViewDocument> {
  const ring = createRing();

  const tick = async (): Promise<unknown> => {
    // Counted before the await, so a rejection is a tick too — `history.ts`'s
    // ruling, and the reason a stall can be reported at all (walk E5).
    ring.began();
    const raw = await fetchWindow();
    ring.absorb(parseNdjson(raw).rows);
    return ring;
  };

  return async (_argvIn, ctx) => {
    // The first window is fetched here rather than left to the driver, so the
    // opening frame is the events and not `loading…` — the dashboard's ruling,
    // and the handler is holding them either way.
    try {
      await tick();
    } catch {
      // A first fetch that fails is not a failed command: the block reports it
      // on its own next tick, and refusing to render would take the surface
      // away for a condition that clears in three seconds.
    }

    return {
      schema: "tui.view/1",
      command: ctx.command,
      status: "ok",
      blocks: [
        b.live({
          id: "events",
          title: "CONTAINER LIFECYCLE",
          every: TICK_MS,
          fetch: tick,
          render: () => body(ring),
          renderLoading: () => body(ring),
        }),
      ],
      meta: {
        verb: "events",
        adapter: "events",
        exitCode: 0,
        durationMs: 0,
        truncated: false,
        argv: ["docker", ...argv()],
        stderr: "",
        transport: "local",
        origin: "user",
      },
    };
  };
}
