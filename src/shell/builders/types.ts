/**
 * The builders' argument types (C24 §3, §4).
 *
 * Six of these are named in §4's signatures and existed nowhere: a consumer
 * could not write `const s: StepInput = …` against the surface as specified.
 * They are declared here rather than in C04 because they are *inputs to the
 * ergonomic layer*, not part of the view model — C04 owns what a block is, and
 * a `StepInput` is what `b.steps` accepts before it becomes one.
 *
 * The distinction has a consequence worth stating: every one of these is looser
 * than the block field it feeds. `StepInput.state` is optional and the block's
 * is not; `LogLine` is the row shape exactly. Where a type here is *narrower*
 * than the field — `KeyValueInput` — the narrowing is the ruling, not an
 * oversight.
 */

import type { Action, Block, Cell, ErrorLike, Glyph, Tone } from "../../data/viewmodel/index.js";

/**
 * What every block-returning builder accepts, and the only declaration of it
 * (§4, I15).
 *
 * The seventeen positional builders take it last; the five that already take a
 * spec object spread it in. Two declarations of one options shape is the drift
 * a shared type prevents — the same argument that gives the tree one block-id
 * counter rather than two.
 *
 * **`gapBefore` being present at all is the signal**, not its value. A builder
 * that receives `gapBefore: false` has been told something; a builder that
 * receives nothing has not, and `b.seq` resolves only the second (§4a). This is
 * why the option is an argument rather than a post-modifier: a modifier applied
 * after construction cannot distinguish the two, and `b.seq` needs to.
 */
export type BlockOpts = Readonly<{
  /** Supplied when a `replace` or `merge` patch will address this block. */
  id?: string;
  /** An explicit value, which always wins over the builder's default. */
  gapBefore?: boolean;
}>;

/**
 * A cell, or the string that is one with default tone (§4).
 *
 * `{ family: "digit-classifier" }` and `{ status: b.warn("degraded") }` in the
 * same object: most cells carry no tone, and paying `{ text: … }` for all of
 * them is the noise this removes.
 */
export type CellInput = string | Cell;

/**
 * What `b.kv` accepts, and it is deliberately not `CellInput`.
 *
 * `KeyValue` rows are `{ label; value: string; tone? }` — no glyph, no spark —
 * so a `Cell` carrying either has nowhere to put it. Taking `CellInput` here
 * would give `b.kv` a parameter accepting what it cannot honour, and the field
 * would vanish silently.
 *
 * The narrowing costs nothing a caller wants: the cell shorthands set only
 * `text` and `tone`, so `b.warn("degraded")` still passes. A hand-written
 * literal carrying a `glyph` is a compile error under excess property checking,
 * which is where that mistake should be caught.
 */
export type KeyValueInput = Readonly<{ text: string; tone?: Tone }>;

/**
 * A `b.kv` row, addressed positionally rather than by key (I18, §4).
 *
 * **A record cannot hold two rows with the same label, and `KeyValue.rows` is an
 * array.** So the block has always been able to say a label twice and the
 * builder could not — which went unnoticed through eleven builders and a whole
 * application, because C24 already documents a narrowing here and it is a
 * different one: `KeyValueInput` against `CellInput`, about a value with
 * nowhere to go.
 *
 * The consumer that found it is docker-tui's `/port`. A published container
 * port has one binding per address family, so `docker port` on `-p 8080:80`
 * emits `80/tcp` twice, and a record built by `reduce` keeps the second.
 *
 * `value` takes the same union the record arm's does, so the two arms differ in
 * their container and in nothing else.
 */
export type KeyValueRow = Readonly<{ label: string; value: string | KeyValueInput }>;

/**
 * A step, with `state` defaulting to `"pending"` (§4).
 *
 * The block's `state` is required. Most callers building a checklist want every
 * entry pending and would write it twenty times.
 */
export type StepInput = Readonly<{
  label: string;
  detail?: string;
  state?: "pending" | "active" | "done" | "failed";
}>;

/** A log line, exactly as the block carries it (§4). */
export type LogLine = Readonly<{ ts: string; level: string; message: string }>;

/**
 * An event line, exactly as the block carries it (§4).
 *
 * **`tone` is here and absent from `LogLine`** — a fixed vocabulary the renderer
 * knows needs no field, and an open one does (C04 I35, F51). `levelTone` maps a
 * log level; nothing can map a container's actions.
 */
export type EventLine = Readonly<{ ts: string; type: string; message: string; tone?: Tone }>;

/** A chip for `b.pills` (§4). */
export type ChipInput = Readonly<{
  label: string;
  tone?: Tone;
  action?: Action;
  active?: boolean;
}>;

/** A row for `b.comparison` (§4). Two axes, never one (C04 I36). */
export type ComparisonRow = Readonly<{
  field: string;
  a: string;
  b: string;
  change?: "unchanged" | "changed" | "added" | "removed";
  verdict?: "better" | "worse";
}>;

/** Re-exported for the builders' own signatures; C04 owns them. */
export type { Action, Block, Cell, Glyph, Tone };

/**
 * C24 §5 — what `b.live` declares.
 *
 * Looser than what C23 drives, in the way every type here is looser than the
 * field it feeds: `every` and `staleAfter` are optional and the driver's are not,
 * because the defaults are the framework's to choose — one-shot, and twice the
 * interval. `render` returns **one** block (C23 I34), and `title` is required
 * because the panel wrapping it needs one and because that title is where
 * staleness and failure get said.
 */
export type LiveSpec = BlockOpts &
  Readonly<{
    id: string;
    title: string;
    /** Omitted -> one-shot: rendered once, never retried (A02 §7 rule 3). */
    every?: number;
    /**
     * **Required, and `stream` is gone** (C24 I21, F78).
     *
     * `LiveSpec` offered two ways to feed a part and `b.live` threw twice to
     * police the choice — once when neither was given, once when both were. One
     * of the two did nothing: `partOf` built the driver's part with
     * `fetch: spec.fetch ?? (() => Promise.resolve(null))` and **nothing
     * anywhere read `spec.stream`**, so a part declared with it was registered,
     * driven once with a fetch resolving null, and rendered `render(null)`.
     *
     * The failure direction is the worst available — a part that streams
     * nothing looked exactly like a part that produced nothing. A plausible
     * empty panel, not an error.
     *
     * **Two throws guarding a choice is the symptom; a declared option with no
     * implementation is the disease**, and the remedy is to make the state
     * unbuildable rather than reported. A required `fetch` is a compile error
     * where the pair was a runtime throw, and both throws go with it. A
     * streaming part is additive to re-add the day something drives one.
     */
    fetch: () => Promise<unknown>;
    render: (data: unknown) => Block;
    renderError?: (err: ErrorLike, retryInMs: number | null) => Block;
    renderLoading?: () => Block;
    /** Default: twice `every`. Below it, construction throws (C24 T3.6). */
    staleAfter?: number;
  }>;
