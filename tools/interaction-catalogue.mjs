/**
 * Interaction catalogue — the focus and selection states, rendered outside a
 * session, at the plot catalogue's five capability arms.
 *
 * **A second corpus for a second class of frame.** `plot-catalogue.mjs` shows
 * what a *document* looks like; nothing showed what a *reader's position* looks
 * like, and that is how the transcript's selection shipped painted nowhere
 * (F764) and a focused chip drew as an unfocused one. Both are view state that
 * reaches the renderer through `RenderContext.focus`, and `renderToLines` has
 * taken a `focus` since it existed — so the seam was there and no frame went
 * through it. This is that frame, six times over, at every arm.
 *
 * **Settled versus live is not a render input.** `focusFor` decides *which entry*
 * holds focus (C26 I22); the renderer is handed a `FocusState` and cannot tell
 * whether the entry is live. So the "focus on a settled entry" scene is the
 * focus scene: a frame that differed by liveness would be a defect in C11, not a
 * missing fixture here.
 *
 * Written to `docs/catalogue/interaction/`, a subdirectory so `plot-catalogue`'s
 * top-level sweep leaves it alone and `plot-catalogue.test.ts`'s PC11 — which
 * walks recursively — still sees every SGR it emits. PC11 is why the 1-bit arm
 * matters: the selection there is reverse video (`7m`), and the rasteriser had
 * no arm for it until this corpus produced one.
 *
 * Run: npx tsx tools/interaction-catalogue.mjs
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBlockRegistry } from "../src/presentation/blocks/index.js";
import { tableDefinition } from "../src/presentation/table/index.js";
import { renderSequenceToLines } from "../src/presentation/render-lines.js";
import { defaultTheme, loadTheme } from "../src/presentation/theme/index.js";
import { CAPS, stripSgr } from "./plot-catalogue.mjs";
import { ansiToSvg, pngFromSvg } from "./catalogue-png.mjs";

const loaded = loadTheme(defaultTheme, "dark");
if (!loaded.ok) throw new Error("theme failed to load");
const theme = loaded.value.current;

const registry = createBlockRegistry({});
registry.register(tableDefinition);

export const WIDTH = 60;

const COLUMNS = [
  { key: "name", label: "Name", align: "left", priority: 10, minWidth: 12, sortable: false },
  { key: "state", label: "State", align: "left", priority: 5, minWidth: 10, sortable: false },
];
const ROWS = [
  { id: "a", cells: { name: { text: "alpha" }, state: { text: "running", tone: "ok", glyph: "ok" } } },
  { id: "b", cells: { name: { text: "bravo" }, state: { text: "exited", tone: "muted" } } },
  { id: "c", cells: { name: { text: "charlie" }, state: { text: "running", tone: "ok", glyph: "ok" } } },
  { id: "d", cells: { name: { text: "delta" }, state: { text: "paused", tone: "warn", glyph: "warn" } } },
];
const TABLE = { kind: "table", id: "t", columns: COLUMNS, rows: ROWS };
/**
 * The same table with a name the twelve-cell column cannot hold, so row `a`
 * declares a `detail` (C26 §5) and the peek scene has something to show.
 */
const CUT_ROWS = ROWS.map((r) =>
  r.id === "a" ? { ...r, cells: { ...r.cells, name: { text: "alpha-with-a-name-longer-than-its-column" } } } : r,
);
const TABLE_CUT = { kind: "table", id: "t", columns: COLUMNS, rows: CUT_ROWS };
const PILLS = {
  kind: "pills",
  id: "p",
  chips: [
    { label: "all" },
    { label: "running", active: true },
    { label: "exited" },
    { label: "paused", tone: "warn" },
    { label: "dead" },
  ],
};
const notice = (id, text) => ({ kind: "notice", id, tone: "info", text });

/**
 * Scene → the document, the focus it is drawn under, and any scroll offsets.
 *
 * **Indexed by the state a reader can be in**, not by kind: a focused row, a
 * three-row selection, a focused chip, a selection crossing from a table into
 * the chips beside it, a scrolled container mid-stream, and a block-level focus
 * — the last drawn deliberately, because it paints nothing today and a frame
 * that shows nothing is the record of that (C26 §7, owed under a symbol in
 * FINDINGS).
 */
export const SCENES = Object.freeze({
  "table-focus": {
    blocks: [TABLE],
    focus: { blockId: "t", rowId: "b" },
  },
  "table-selection": {
    blocks: [TABLE],
    focus: {
      blockId: "t",
      rowId: "c",
      selected: [
        { blockId: "t", rowId: "a" },
        { blockId: "t", rowId: "b" },
        { blockId: "t", rowId: "c" },
      ],
    },
  },
  "pills-focus": {
    blocks: [PILLS],
    focus: { blockId: "p", rowId: "chip-2" },
  },
  "entry-cross-block-selection": {
    blocks: [TABLE, { ...PILLS, gapBefore: true }],
    focus: {
      blockId: "p",
      rowId: "chip-1",
      selected: [
        { blockId: "t", rowId: "c" },
        { blockId: "t", rowId: "d" },
        { blockId: "p", rowId: "chip-0" },
        { blockId: "p", rowId: "chip-1" },
      ],
    },
  },
  "scroll-midstream": {
    blocks: [
      {
        kind: "scroll",
        id: "s",
        height: 3,
        children: [1, 2, 3, 4, 5, 6].map((n) => notice(`n${String(n)}`, `line ${String(n)} of the stream`)),
      },
    ],
    focus: null,
    scrollOffsets: { s: 2 },
  },
  "table-block-focus": {
    blocks: [TABLE],
    focus: { blockId: "t", rowId: null },
  },
  /**
   * The focused row's detail as C15's peek (C15 §2a): the cut cell on the row,
   * the whole text in a panel directly beneath it. `peek: true` is what makes
   * `frameFor` composite it — the catalogue has no session and no C15, so the
   * layer is spliced in where `place()` puts it for `prefer: "below"` with
   * room beneath, which is the only case this scene constructs.
   */
  "table-peek": {
    blocks: [TABLE_CUT],
    focus: { blockId: "t", rowId: "a" },
    peek: true,
  },
});

/**
 * One rendered frame, as lines — the part with no filesystem in it.
 *
 * Through `renderSequenceToLines` and not `renderToLines`, because the
 * cross-block scene is a *document*: the pairs rule (C11 I14) is only visible
 * when two blocks are handed one extent.
 */
export function frameFor(scene, caps, width = WIDTH) {
  const lines = renderSceneLines(scene, caps, width);
  if (scene.peek !== true) return lines;
  return withPeek(scene, caps, width, lines);
}

/**
 * The peek, composited as `paint.ts` composites a layer — the panel's rows
 * replace the transcript rows beneath the focused element (C15 §4 rule 1).
 *
 * The detail comes from the same `elementsIn` the session walks, so the scene
 * shows what the peek would hold and not a hand-written copy of it. Throws if
 * the focused element declares none: a peek scene over a row that fits would be
 * a frame of nothing labelled as the mechanism.
 */
function withPeek(scene, caps, width, lines) {
  const focus = scene.focus;
  const hit = registry
    .elementsIn(scene.blocks, width)
    .find((p) => p.blockId === focus.blockId && p.element.id === focus.rowId);
  if (hit === undefined || hit.element.detail === undefined) {
    throw new Error(`peek scene: ${focus.blockId}/${focus.rowId} declares no detail`);
  }
  const panel = [{ kind: "panel", id: "peek-panel", title: "Detail", children: [hit.element.detail] }];
  const peekLines = renderSequenceToLines(registry, panel, width, { theme, capabilities: caps, focus: null });
  const out = [...lines];
  const top = hit.element.rows.to; // directly beneath the element's span
  for (let i = 0; i < peekLines.length; i += 1) out[top + i] = peekLines[i];
  return out;
}

function renderSceneLines(scene, caps, width) {
  return renderSequenceToLines(registry, scene.blocks, width, {
    theme,
    capabilities: caps,
    focus: scene.focus ?? null,
    ...(scene.scrollOffsets === undefined ? {} : { scrollOffsets: scene.scrollOffsets }),
  });
}

/** Every scene × capability set, as frames — the loop, once. */
export function* everyFrame() {
  for (const [sceneName, scene] of Object.entries(SCENES)) {
    for (const { name: capsName, caps } of CAPS) {
      const lines = frameFor(scene, caps, WIDTH);
      const header = `── ${sceneName} · ${capsName} · ${String(WIDTH)}w`;
      yield { sceneName, capsName, frame: [header, ...lines].join("\n") };
    }
  }
}

/** Cleared before writing — `plot-catalogue.mjs`'s `clearGenerated`, for this directory. */
export function clearGenerated(dir) {
  let removed = 0;
  for (const f of readdirSync(dir)) {
    if (/\.(txt|plain|png)$/.test(f)) {
      rmSync(join(dir, f));
      removed += 1;
    }
  }
  return removed;
}

/** Every frame, written as `.txt` (ANSI), `.plain` and `.png`. */
export async function renderInteractionCatalogue() {
  const outDir = join(import.meta.dirname, "..", "docs", "catalogue", "interaction");
  mkdirSync(outDir, { recursive: true });
  const stale = clearGenerated(outDir);
  let files = 0;
  for (const { sceneName, capsName, frame } of everyFrame()) {
    const basename = `${sceneName}-${capsName}`;
    writeFileSync(join(outDir, `${basename}.txt`), frame + "\n");
    writeFileSync(join(outDir, `${basename}.plain`), stripSgr(frame) + "\n");
    writeFileSync(join(outDir, `${basename}.png`), await pngFromSvg(ansiToSvg(frame)));
    files += 3;
  }
  console.log(`interaction-catalogue: ${String(files)} files written to docs/catalogue/interaction/ (${String(stale)} stale cleared first)`);
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) await renderInteractionCatalogue();
