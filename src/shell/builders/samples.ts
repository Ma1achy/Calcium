/**
 * `b.samples` — N images with a label under each (C04 §3f, §3g).
 *
 * **A builder over the mosaic, not a twenty-second kind**, and the premise was
 * re-taken with kitty placing rather than inherited from the dither: `areas`
 * names 62 regions, and a 2x2 captioned grid renders at `measured 10 · rendered
 * 10` under both arms with the captions on their own rows. So this composes what
 * exists and adds no definition, no enumeration sweep and no walk.
 *
 * **What makes it worth building here rather than in a notebook is the label.**
 * A sample grid without predictions under it is a contact sheet; the prediction
 * beside the picture is the thing an ML reader is actually looking at, and it is
 * why the caption row is not optional.
 *
 * **The band's height is declared and the width follows.** That is how every
 * other block in this tree works, and the alternative was measured and refused:
 * a generous height makes `imageCells` scale the image to fill its column
 * exactly — but then the row count depends on the render width, which a mosaic's
 * declared row shares cannot express. So an image fits its band vertically and
 * may be narrower than its column, left-aligned. **It does not reopen C12 I1**:
 * that forbids a *plot* deriving a height from a width, and an image's clamp
 * already does the opposite for its own reasons (C04 I73 §3g.3).
 */
import type { Block, Image, Mosaic, Share } from "../../data/viewmodel/index.js";

/** The characters `areas` can name a region with — 62, measured. */
const POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** One sample: the picture, and the thing a reader is looking at beside it. */
export type Sample = Readonly<{
  /** PNG bytes, base64, or a path the builder reads. Exactly one. */
  data?: string;
  path?: string;
  /** Required, on `Image.alt`'s argument: it is what a reader without pixels gets. */
  alt: string;
  /** The caption under the picture — a prediction, a score, a class. */
  label: string;
}>;

export type SamplesOptions = Readonly<{
  items: readonly Sample[];
  /** How many across. A positive integer. */
  columns: number;
  /** Rows per image band. The caption takes one more. */
  cellRows?: number;
}>;

/**
 * The grid a sample set needs: the spec string, the row shares and the children
 * in reading order.
 *
 * **Separated from the builder so both gates see the same arithmetic.** The
 * builder throws and the validator refuses, and a second computation of the
 * layout is how the two come to disagree about what they are refusing.
 */
export function samplesLayout(
  count: number,
  columns: number,
  cellRows: number,
): Readonly<{ areas: string; rows: readonly Share[]; height: number }> | string {
  if (!Number.isInteger(columns) || columns < 1) {
    return `columns is a positive integer — got ${JSON.stringify(columns)}`;
  }
  if (!Number.isInteger(cellRows) || cellRows < 1) {
    return `cellRows is a positive integer — got ${JSON.stringify(cellRows)}`;
  }
  if (count < 1) return "a sample grid needs at least one item";
  // **Two regions per item — the picture and its label — so the pool is the
  // bound.** Refused rather than wrapped: reusing a character would merge two
  // samples into one region, which draws a plausible grid of the wrong pictures.
  if (count * 2 > POOL.length) {
    return (
      `${String(count)} samples need ${String(count * 2)} regions and \`areas\` names ` +
      `${String(POOL.length)} — split the grid rather than reusing a name`
    );
  }
  const bands = Math.ceil(count / columns); // cells-ok — a band count
  const lines: string[] = [];
  const shares: Share[] = [];
  for (let band = 0; band < bands; band += 1) { // cells-ok — a band index
    let pics = "";
    let caps = "";
    for (let c = 0; c < columns; c += 1) { // cells-ok — a column index
      const i = band * columns + c; // cells-ok — an item index
      // **A short last band is holes, not blanks.** A `.` is named by no child,
      // so the arity check stays exact and nothing is drawn where nothing is.
      pics += i < count ? (POOL[i * 2] ?? ".") : ".";
      caps += i < count ? (POOL[i * 2 + 1] ?? ".") : ".";
    }
    lines.push(pics, caps);
    shares.push({ cells: cellRows }, { cells: 1 });
  }
  return {
    areas: lines.join("/"),
    rows: Object.freeze(shares),
    height: bands * (cellRows + 1), // cells-ok — a row count
  };
}

/**
 * The children a layout wants, in **reading order** — which is what `areas`
 * maps onto positionally (C04 I71).
 *
 * Reading order over `AB/ab` is `A B a b`, so a band contributes its pictures
 * and then its labels. Getting that wrong draws every caption under the wrong
 * picture with every count agreeing, which is the failure a test has to read the
 * frame to see.
 */
export function samplesChildren(
  count: number,
  columns: number,
  picture: (i: number) => Block,
  caption: (i: number) => Block,
): readonly Block[] {
  const bands = Math.ceil(count / columns); // cells-ok — a band count
  const out: Block[] = [];
  for (let band = 0; band < bands; band += 1) { // cells-ok — a band index
    for (const make of [picture, caption]) {
      for (let c = 0; c < columns; c += 1) { // cells-ok — a column index
        const i = band * columns + c; // cells-ok — an item index
        if (i < count) out.push(make(i));
      }
    }
  }
  return out;
}

/** The narrowed shape the builder hands back, so `b.samples` returns a `Mosaic`. */
export type SamplesResult = Mosaic;

/** What a caller needs to construct the two block kinds this composes. */
export type SamplesMakers = Readonly<{
  image: (opts: { id: string; data?: string; path?: string; height: number; alt: string }) => Image;
  raw: (text: string, opts?: { id?: string }) => Block;
  mosaic: (opts: {
    id?: string;
    height: number;
    areas: string;
    children: readonly Block[];
    rows?: readonly Share[];
  }) => Mosaic;
}>;
