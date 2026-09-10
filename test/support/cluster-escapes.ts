/**
 * Where a row's escapes sit against its grapheme clusters (C09 I64, §5a).
 *
 * The cursor in `text.ts` has one corner it does not resolve as the measurer
 * does: an SGR *inside* a cluster — between a base and its combining mark,
 * between the halves of a flag, between a pictograph and its joiner. C09 §5a
 * records it as a corner rather than a path because the layer above promises
 * never to paint one (C04 I84 snaps a span boundary to a cluster end; C07
 * T3.14 strips a far side's own escapes). This is the instrument that asks
 * whether the promise is kept, over every frame the framework ships.
 *
 * **The escapes are stripped first and their positions kept**, because a
 * segmenter run over the styled row would see an escape's final `m` as a
 * letter and join a following mark to it — the very confusion the walk's tail
 * rule exists for (§5a). Each escape is recorded at its index in the *stripped*
 * string, the stripped string is segmented, and an escape is reported when its
 * index is strictly inside a cluster: after the cluster's first code unit and
 * before its last. An escape at a cluster boundary — before a base, after a
 * mark, at the end of the row — is where every renderer puts one and is not a
 * hit.
 *
 * **What it reads is a CSI sequence** — `ESC [`, parameter bytes, intermediate
 * bytes, one final byte — which is every SGR and every cursor address the frame
 * carries. Any other escape byte is left in place as a control character, and
 * UAX #29 breaks a cluster on both sides of a control (GB4, GB5), so a stray
 * `ESC` can neither hide inside a cluster nor manufacture one.
 */

const ESC_UNIT = 0x1b;

/** `ESC [`, then `0-?`* parameters, ` -/`* intermediates, one `@-~` final — the grammar `pty.ts` keeps for the screen model (F966). */
const CSI = /\x1b\[[0-?]*[ -/]*[@-~]/y;

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** An escape that sits strictly inside a cluster: its index in the stripped row, and the cluster it split. */
export type EscapeInsideCluster = Readonly<{ at: number; cluster: string }>;

/**
 * The row with its CSI sequences removed, and each removed sequence's index in
 * the result.
 */
function stripRecording(line: string): Readonly<{ stripped: string; at: readonly number[] }> {
  let stripped = "";
  const at: number[] = [];
  let i = 0;
  while (i < line.length) {
    if (line.charCodeAt(i) === ESC_UNIT) {
      CSI.lastIndex = i;
      const m = CSI.exec(line);
      if (m !== null) {
        at.push(stripped.length);
        i += m[0].length;
        continue;
      }
    }
    stripped += line[i];
    i += 1;
  }
  return { stripped, at };
}

/**
 * Every escape in `line` whose position falls strictly inside a grapheme
 * cluster of the row as the terminal would compose it — empty for a row the
 * framework painted as it promises to (C09 I64).
 */
export function escapesInsideClusters(line: string): readonly EscapeInsideCluster[] {
  const { stripped, at } = stripRecording(line);
  if (at.length === 0) return [];
  const segments = GRAPHEMES.segment(stripped);
  const out: EscapeInsideCluster[] = [];
  for (const index of at) {
    // `containing` answers the cluster with `start <= index < end`, or nothing
    // past the last cluster; so an index after the cluster's start is inside it.
    const found = segments.containing(index);
    if (found === undefined) continue;
    if (found.index < index) out.push({ at: index, cluster: found.segment });
  }
  return out;
}

/**
 * How many CSI sequences `line` carries — the corpus row's control against a
 * corpus that carries none, which the check above would pass without reading
 * anything (A03 §2).
 */
export function csiCount(line: string): number {
  return stripRecording(line).at.length;
}
