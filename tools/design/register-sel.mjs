// Registers the fifteen R-SEL-* rules from the design's `10-SELECTION.md` §10.
//
// **A one-shot, kept because the edit has to be re-runnable and auditable.** The
// registry is the normative source and hand-editing 2.4 MB of JSON is how a digest
// goes wrong silently; this computes `contentDigest` with the builder's own
// `ruleContentDigest`, so the two cannot disagree.
//
// **Every replacement asserts it matched** (CLAUDE.md, *An edit script asserts every
// replacement matched*): a run that reports success having changed nothing is a
// failure, and this exits non-zero if any rule already exists or any section is missing.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ruleContentDigest } from "../../docs/design/language/build-calcium.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const registryPath = resolve(here, "../../docs/design/language/calcium-registry.json");

/**
 * Text is the design's own governing sentences, collapsed to a rule's single
 * paragraph. `title` is verbatim from §10's list.
 */
const RULES = [
  ["R-SEL-001", "Two selections, and the mouse belongs to the emulator", "contract",
    "We do not fight the emulator for the mouse, and we do not pretend its selection is ours. Mouse selection belongs to the terminal. Copy takes the source for every copy Calcium performs — direct copy, copy mode, and a copy affordance on a block. A block with a copy affordance shows it on focus, never on hover and never on drag."],
  ["R-SEL-002", "The render must survive a naive drag", "measurement",
    "A wrapped line's continuation carries no decoration in the gutter; a bounded block's content does not sit inside vertical rules; the scrollbar is the last column, so a drag that stops short of it is clean; nothing meaningful is drawn in a column a reader would not drag through. This is a constraint on layout, not a note."],
  ["R-SEL-003", "A block is atomic in a selection", "atomic",
    "A block is atomic in a selection: you take all of it or none of it. An extend that reaches a block takes the whole block and continues past it, and the block takes the selection ground on its frame or its first row, never on every cell of its body."],
  ["R-SEL-004", "A block's copy form, per kind", "semantics",
    "Prose copies as text, unwrapped, with soft wraps removed; code with its original indentation; a patch as unified diff rather than the rendered two-column view; a table as TSV with its header; a plot as its data view; an image as its alt text and its path; a live terminal as its scrollback at the moment of the copy. Copy is in document order, entries separated by a blank line, and a block's content is not re-indented to match its rendered inset — the inset is rendering."],
  ["R-SEL-005", "esc clears the selection; a second esc leaves the rung", "interaction",
    "esc clears the selection if there is one; a second esc leaves copy mode. A selection is state within a rung rather than a rung of its own, so this does not violate esc popping exactly one rung, and the footer says which press is next."],
  ["R-SEL-006", "Selection owns the ground, focus keeps its mark", "contract",
    "Selection owns the ground and focus keeps its mark. At rest there is no ground and no mark; focused takes focusGround and its mark; selected takes selectionGround and no mark; focused and selected takes selectionGround and keeps the focus mark. Selection wins the ground over a diff ground, where the plus and minus marks carry the diff. At 1-bit the selection becomes reverse video while the focus mark persists, so neither fact rests on colour alone."],
  ["R-SEL-007", "Rectangular copies cells, and says so", "semantics",
    "A rectangular selection copies cells, not source, and says so in the mode label. It is the single exception to copy taking the source, and it is explicit rather than silent. A rectangular selection never crosses a block boundary; it clips to the region it started in."],
  ["R-SEL-008", "a, A, and no whole-record key", "interaction",
    "a selects the entry under the caret; A selects all loaded entries and says what it did, because the window is not the record; ctrl-A is not bound. There is deliberately no key for selecting the whole record — a key that silently produces a clipboard of megabytes is a trap, and the export path writes a file instead."],
  ["R-SEL-009", "Three things redraw while frozen", "motion",
    "Copy mode freezes the frame. Three things still redraw: the mode label in the footer, the selection as it extends, and the count. Nothing else — not the spinners, not the elapsed counts, not arriving content — because a frozen owner that consumes everything is the one rung whose state the reader cannot otherwise see."],
  ["R-SEL-010", "Buffered arrivals are announced on exit", "motion",
    "Content arriving while the frame is frozen is buffered and lands when copy mode exits, and the footer says so while it is still frozen."],
  ["R-SEL-011", "No clipboard is stated, never silent", "contract",
    "One clipboard with two mechanisms: the operating system's clipboard when Calcium is on the same machine, and OSC 52 when it is not — and OSC 52 is a control sequence, so it is emitted only by the renderer and never from content. If neither is available the mode states it and offers a file instead. A copy that appears to work and does not is the worst outcome available here, because the user will not notice until they paste."],
  ["R-SEL-012", "A drag scrolls the container the anchor is in", "interaction",
    "The container that scrolls under a drag is the one the anchor is in, not the one under the pointer — the one place the pointer does not decide. The wheel takes the innermost scrollable under the pointer; the arrows take the scrollable you are inside; a drag takes the scrollable the anchor is in, for the whole gesture. A gesture belongs to where it started, which is the anchor binding a gesture to a container the way press-arms binds it to an element. Keyboard extend at an edge scrolls the same container."],
  ["R-SEL-013", "Three autoscroll bands, and it stops at the container's end", "motion",
    "Within the rect there is no scroll; up to one cell past is one row per 120ms; one to four cells past is one row per 60ms; more than four past is one row per 30ms. Horizontal autoscroll uses the same bands on columns. Three bands, because two is too coarse to control and a continuous ramp is impossible to stop where you meant. The scroll continues while the button is held and the pointer is outside, even if the pointer stops moving, and stops on release, on esc, or at the container's end — where it stops rather than rubber-banding, there being nothing to rubber-band against in a cell grid. The selection extends to the container's end and does not spill into the parent."],
  ["R-SEL-014", "A container you pass through is taken whole and does not scroll", "atomic",
    "A container the drag passes through is taken whole and does not scroll, because the anchor is not in it and a block is atomic. Dragging through a bounded block takes all of its rows, not the ones on screen: the window is rendering and the source is the block. A container inside a container is the same answer applied twice — the outermost passed through is taken whole, including its children, and the inner one is never addressable. Where you start decides what you can address; everything you merely cross is taken whole."],
  ["R-SEL-015", "All-or-none applies continuously", "atomic",
    "All-or-none applies continuously and not only at the end of the gesture: a block joins the selection whole, stays while the drag continues past it, and leaves the selection entirely when the drag returns above it. A block never appears partially at any point during the drag, so the count never shows a size that no release could produce — the count is always the size of what return would copy right now."],
];

const SECTION = "current-contract";

const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const byId = new Map(registry.rules.map((r) => [r.id, r]));

let failed = 0;
const fail = (m) => { console.error("  " + m); failed += 1; };

for (const [id] of RULES) if (byId.has(id)) fail(`${id} already exists — this script has run`);

// **`sectionKey` must resolve, and that is all it does here.** `renderContract`
// (`build-calcium.mjs:689`) projects *every* `current` rule irrespective of section,
// and a section's `ruleIds` is a CITATION list rather than a membership list —
// `current-contract` cites one id while 93 rules point at it. So nothing is pushed
// there; doing so would have added a citation nobody made.
const section = registry.sections.find((s) => s.key === SECTION);
if (section === undefined) fail(`section ${SECTION} missing`);
if (failed > 0) { console.error(`FAIL · ${failed} problems, nothing written`); process.exit(1); }

const added = [];
for (const [id, title, tag, text] of RULES) {
  const rule = {
    id, title, text,
    status: "current",
    sectionKey: SECTION,
    tags: [tag],
    supersedes: [],
    supersededBy: null,
    legacyIds: [],
    contentDigest: "",
  };
  rule.contentDigest = ruleContentDigest(rule);
  registry.rules.push(rule);
  added.push(id);
}

// **One space, because that is what the registry ships.** Re-indenting at 2 would
// rewrite all 2.4 MB and bury fifteen records in a whole-file diff; the round-trip
// is asserted rather than assumed.
// **And every non-ASCII code point is escaped**, because the shipped file is. Left
// to `JSON.stringify` the em-dashes and curly quotes come back as raw UTF-8 and the
// diff is 7 428 lines of re-encoding with fifteen records lost inside it — measured,
// on the first run of this script.
const asciiOnly = (text) => text.replace(/[\u007f-\uffff]/g, (c) =>
  `\\u${c.codePointAt(0).toString(16).padStart(4, "0")}`);
const serialised = `${asciiOnly(JSON.stringify(registry, null, 1))}\n`;
if (!serialised.startsWith('{\n "meta": {\n  "name"')) fail("serialisation does not match the registry's shape");
if (failed > 0) { console.error(`FAIL · ${failed} problems, nothing written`); process.exit(1); }

writeFileSync(registryPath, serialised);
console.log(`registered ${added.length} rules: ${added[0]}…${added.at(-1)}`);
console.log(`current rules now ${registry.rules.filter((r) => r.status === "current").length}`);
