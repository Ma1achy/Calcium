/**
 * The chrome cache — header, footer and overlay layers rendered once per
 * content, never once per frame (C22 I102).
 *
 * **Structure for the chrome, identity for a layer, and the difference is who
 * builds the blocks.** A chrome function is called every frame and builds its
 * blocks afresh (C22 I82, I86), so two frames' headers are never the same
 * objects and are almost always the same document; the key is the blocks'
 * serialised structure, the width and the theme's name. A layer's content is
 * set by its owner and replaced when it changes (C15 I2) — a `WeakMap` on the
 * array is the key, and it dies with the content.
 *
 * **The footer's height is held beside its lines under the same key** (C22
 * I82): `compose` measures before `paint` renders, and a footer whose blocks
 * came back equal is neither measured nor rendered again.
 *
 * Three slots by role and the live layers — bounded by the frame, and nothing
 * evicts because there is nothing to grow. Misses are reported as `chrome`
 * with the axis that rejected the slot (C28 I8): `absent` on the first frame,
 * `rev` when the content changed — the clock's second — `width` on a resize,
 * `theme` on a switch.
 */

import { NO_PROBE } from "../data/viewmodel/index.js";
import type { Block, Probe } from "../data/viewmodel/index.js";

export type ChromeRole = "header" | "footer";

type Rows = Readonly<{ key: string; width: number; rows: number }>;
type Lines = Readonly<{ key: string; width: number; theme: string; lines: readonly string[] }>;
type Layer = Readonly<{ width: number; theme: string; lines: readonly string[] }>;

export class ChromeCache {
  readonly #rows = new Map<ChromeRole, Rows>();
  readonly #lines = new Map<ChromeRole, Lines>();
  readonly #layers = new WeakMap<readonly Block[], Layer>();
  readonly #probe: Probe;

  constructor(probe: Probe = NO_PROBE) {
    this.#probe = probe;
  }

  /** The key: the blocks as a document. Deterministic for blocks built the same way in the same order, which chrome is (I86). */
  static keyOf(blocks: readonly Block[]): string {
    return JSON.stringify(blocks);
  }

  /**
   * The role's measured rows for `blocks` at `width` — from the slot when the
   * structure and the width agree, else measured now and held. Reports
   * nothing: the render is the reported step, and the height's observable is
   * the measure that did not happen (T4.90a).
   */
  measure(
    role: ChromeRole,
    blocks: readonly Block[],
    width: number,
    measure: (blocks: readonly Block[], width: number) => number,
  ): number {
    const key = ChromeCache.keyOf(blocks);
    const held = this.#rows.get(role);
    if (held !== undefined && held.key === key && held.width === width) return held.rows;
    const rows = measure(blocks, width);
    this.#rows.set(role, Object.freeze({ key, width, rows }));
    return rows;
  }

  /**
   * The role's rendered lines — the slot's when structure, width and theme
   * agree, else rendered now and held. One hit or one miss per call.
   */
  lines(
    role: ChromeRole,
    blocks: readonly Block[],
    width: number,
    theme: string,
    render: (blocks: readonly Block[], width: number) => readonly string[],
  ): readonly string[] {
    const key = ChromeCache.keyOf(blocks);
    const held = this.#lines.get(role);
    if (held === undefined) this.#probe.miss("chrome", "absent");
    else if (held.key !== key) this.#probe.miss("chrome", "rev");
    else if (held.width !== width) this.#probe.miss("chrome", "width");
    else if (held.theme !== theme) this.#probe.miss("chrome", "theme");
    else {
      this.#probe.hit("chrome");
      return held.lines;
    }
    const lines = render(blocks, width);
    this.#lines.set(role, Object.freeze({ key, width, theme, lines }));
    return lines;
  }

  /**
   * A layer's lines, keyed by its content's identity: rendered once per
   * content at a width and theme, and dropped with the content.
   */
  layer(
    content: readonly Block[],
    width: number,
    theme: string,
    render: (blocks: readonly Block[], width: number) => readonly string[],
  ): readonly string[] {
    const held = this.#layers.get(content);
    if (held === undefined) this.#probe.miss("chrome", "absent");
    else if (held.width !== width) this.#probe.miss("chrome", "width");
    else if (held.theme !== theme) this.#probe.miss("chrome", "theme");
    else {
      this.#probe.hit("chrome");
      return held.lines;
    }
    const lines = render(content, width);
    this.#layers.set(content, Object.freeze({ width, theme, lines }));
    return lines;
  }
}
