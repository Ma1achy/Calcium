/**
 * The frame locator — a sampled frame's `src/` file and line from a bundled
 * chunk's position, through the chunk's linked source map (C28 I65, F1193).
 *
 * **Read when the card is folded, never at start.** A04 §5's bundle names
 * every frame `dist/bundle/chunk-*.js:N`; enabling Node's source-map support
 * for the process would name them properly and cost the start 15–60 ms in five
 * pairs — to repair a card drawn on request. So the map beside the chunk is
 * read on the first frame that asks, once per chunk for the life of the
 * locator, through `node:module`'s own `SourceMap`; esbuild composes `tsc`'s
 * maps, so the answer is the `src/` file and line the deck shows under vitest.
 *
 * **A frame it cannot locate is `null`, and the fold keeps the URL** — a chunk
 * with no `.map` beside it, a map that does not parse, a position before the
 * map's first mapping. A card that dropped the frame would lie about where the
 * time went (I34 from the other side); a card that shows a chunk name tells the
 * truth less well, which is the right failure.
 */
import { readFileSync } from "node:fs";
import { SourceMap } from "node:module";
import { fileURLToPath } from "node:url";

/** Where a frame was written: the original file as a URL and its 0-based line. */
export type Located = Readonly<{ url: string; line: number }>;

/** `(url, line, column)` of a `callFrame`, 0-based as V8 emits them. */
export type FrameLocator = (url: string, line: number, column: number) => Located | null;

type Reader = (path: string) => string;

const parse = (text: string): SourceMap | null => {
  try {
    const payload = JSON.parse(text) as unknown;
    if (typeof payload !== "object" || payload === null) return null;
    return new SourceMap(payload as ConstructorParameters<typeof SourceMap>[0]);
  } catch {
    return null;
  }
};

/**
 * A locator over the maps beside the chunks it is asked about. `read` is the
 * file read, a parameter so T1.129 can count it and hand it a missing file.
 */
export function createSourceLocator(read: Reader = (p) => readFileSync(p, "utf8")): FrameLocator {
  const maps = new Map<string, SourceMap | null>();
  const mapFor = (url: string): SourceMap | null => {
    const held = maps.get(url);
    if (held !== undefined) return held;
    let map: SourceMap | null = null;
    try {
      map = url.startsWith("file:") ? parse(read(`${fileURLToPath(url)}.map`)) : null;
    } catch {
      map = null;
    }
    maps.set(url, map);
    return map;
  };
  return (url, line, column) => {
    const map = mapFor(url);
    if (map === null) return null;
    // `findEntry` answers `{}` for a position before the map's first mapping.
    const entry: Partial<Readonly<{ originalSource: string; originalLine: number }>> = map.findEntry(line, column);
    if (typeof entry.originalSource !== "string" || entry.originalSource === "") return null;
    if (typeof entry.originalLine !== "number") return null;
    // `sources` are relative to the map, which sits beside the chunk.
    return Object.freeze({ url: new URL(entry.originalSource, `${url}.map`).href, line: entry.originalLine });
  };
}
