/**
 * C09 I127 — a block with every content string neutralised, once per block.
 *
 * **The registry calls this at `#resolve` and nothing else does.** `#resolve`
 * sits under `measure`, `render`, the window seams, `elementsOf` and `copyOf`,
 * so every definition sees the value this returns and no definition can reach
 * the raw one. That is the whole of the argument for doing it here rather than
 * at the call sites: patch's path, hunk header and line text were three sites
 * where `measure` read a stripped string and paint emitted the raw one, and a
 * twentieth render path cannot skip a resolve it has to pass through.
 *
 * **Memoised on identity**, both ways. A block met again costs a lookup, and a
 * clean block — the case every frame is — is its own answer, so the walk runs
 * once per block object and allocates nothing when nothing changes.
 */
import { controlForm, neutraliseControl } from "../../data/text.js";
import type { Block } from "../../data/viewmodel/index.js";

/**
 * The fields that are **not** content, by name (C09 I127, T2.195).
 *
 * Identifiers and cross-references first: `key` names a table column and is the
 * property name in every `row.cells`, `from`/`to` name graph nodes, `target`
 * names a row or block, `current` names a tape member, and `areas` names a
 * mosaic's children cell by cell. Escaping one side of a reference and not the
 * other breaks the lookup, and a property name is never escaped. `kind` is the
 * discriminant, and an unknown kind is escaped where it is drawn — as the
 * fallback's JSON. `digest` is an identity and `data` is base64. A name ending
 * `Id` is an identifier by the model's own convention (`resultId`, `blockId`,
 * `rowId`) and is matched by suffix rather than listed.
 */
export const NOT_NEUTRALISED: ReadonlySet<string> = new Set([
  "id",
  "kind",
  "key",
  "target",
  "from",
  "to",
  "current",
  "areas",
  "digest",
  "data",
]);

const skipped = (name: string): boolean => NOT_NEUTRALISED.has(name) || name.endsWith("Id");

/** A plain record or an array — the only two shapes a block is built from. */
const isPlain = (value: object): boolean => {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * `text`'s offsets in the neutralised string (C04 I83): `at[i]` is where code
 * unit `i` lands, and `at[text.length]` is the new length. The replacement
 * lengths are `controlForm`'s own, so this cannot disagree with the string it
 * describes.
 */
function offsetsOf(text: string): Int32Array {
  const at = new Int32Array(text.length + 1); // cells-ok — a code-unit map
  let to = 0;
  for (let i = 0; i < text.length; i += 1) { // cells-ok — code units
    at[i] = to;
    to += controlForm(text.charCodeAt(i))?.length ?? 1; // cells-ok — code units
  }
  at[text.length] = to; // cells-ok — the end offset
  return at;
}

/** A span list re-based onto the neutralised host — the span moves with its text. */
function rebased(spans: readonly unknown[], host: string): readonly unknown[] {
  const at = offsetsOf(host);
  const clamp = (n: unknown): unknown =>
    typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= host.length ? at[n] : n; // cells-ok — an offset bound
  return spans.map((span) => {
    if (typeof span !== "object" || span === null) return span;
    const s = span as { from?: unknown; to?: unknown };
    return { ...span, from: clamp(s.from), to: clamp(s.to) };
  });
}

/**
 * One value, neutralised — the **same reference** when nothing in it changed.
 *
 * Structural sharing is what keeps a clean child's identity, which the
 * registry's per-call memo and every scratch are keyed on.
 */
function walk(value: unknown): unknown {
  if (typeof value === "string") return neutraliseControl(value);
  if (typeof value !== "object" || value === null) return value;

  // **Arrays before the record test**, whose prototype check an array fails:
  // the first draft asked `isPlain` first and so never descended into one,
  // which left every string below a block's top level raw — found by T2.195
  // on `patch`'s hunk header while the top-level `path` came out clean.
  if (Array.isArray(value)) {
    let out: unknown[] | null = null;
    for (let i = 0; i < value.length; i += 1) { // cells-ok — an array index
      const was: unknown = value[i];
      const now = walk(was);
      if (now !== was && out === null) out = value.slice(0, i);
      if (out !== null) out.push(now);
    }
    return out ?? value;
  }
  if (!isPlain(value)) return value;

  const record = value as Record<string, unknown>;
  // **The exempt kind, wherever it sits** (C09 I56). A `terminal`'s text is
  // emitted without neutralising so a child's colour can cross as `runs`, and
  // C04 I110's gate is what pays for that — a nested one included.
  if (record["kind"] === "terminal") return value;

  let out: Record<string, unknown> | null = null;
  // **The walk's cost is one read of every string, once per block object.**
  // Measured on a 20,000-line patch from `JSON.parse`: no allocation at this
  // site and no change per frame (2.83–2.89 MB a frame, before and after). On
  // strings a template literal built, the first `charCodeAt` flattens each one
  // — 1.6 MB here that the old path, reading only the window's 2,000 rows,
  // never paid. `for…in` in place of `Object.keys` was tried and moved nothing.
  for (const name of Object.keys(record)) {
    if (skipped(name)) continue;
    const was = record[name];
    const now = walk(was);
    if (now === was) continue;
    out ??= { ...record };
    out[name] = now;
  }
  if (out === null) return value;

  // **A span's offsets index its host's text** (C04 I83), and the neutralised
  // text is longer — `ESC` is one code unit and `^[` is two — so a span left
  // alone would colour the wrong characters. `text` hosts the spans everywhere
  // but a heading, whose host is its `label`.
  const host = typeof record["text"] === "string" ? "text" : "label";
  const spans = record["spans"];
  const raw = record[host];
  if (Array.isArray(spans) && typeof raw === "string" && out[host] !== raw) {
    out["spans"] = rebased(spans, raw);
  }
  return out;
}

const NEUTRAL = new WeakMap<object, Block>();

/** `block`, neutralised (C09 I127) — itself when clean, and one walk per block object. */
export function neutralBlock(block: Block): Block {
  const held = NEUTRAL.get(block);
  if (held !== undefined) return held;
  const out = walk(block) as Block;
  NEUTRAL.set(block, out);
  if (out !== block) NEUTRAL.set(out, out);
  return out;
}
