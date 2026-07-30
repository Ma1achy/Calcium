# Note — image support

| | |
|---|---|
| **Status** | Working note. Nothing committed. Phase 1B at the earliest |
| **Prompted by** | [`ink-picture`](https://github.com/endernoke/ink-picture) — good reference, unusable as a dependency |
| **Already there** | C02 detects `imageProtocol` (`iterm2` \| `kitty` \| `sixel` \| `none`); C09 §4 has its degradation row |

Nothing in the fifteen surfaces wants an image. This is recorded because C02 already
detects the capability — deliberately, so a later pass needs no second detection —
and because checking the obvious library clarified the design cheaply.

---

## Why `ink-picture` cannot be the dependency

Three hard incompatibilities, and the first is the interesting one.

**It queries the terminal.** `queryTerminal.ts` parses escape-sequence responses to
detect protocol support. C02 I2 says detection is synchronous and performs no I/O, and
§3 rejects interactive probes explicitly: a probe writes and reads, which races with
the application's own input and can leave a stray response in the input stream on a
terminal that does not answer. C02 detects `imageProtocol` from `TERM_PROGRAM` alone
for that reason. Its detection is precisely what we rejected.

**Height is `"100%"`, resolved against `stdout.rows`.** C09 I1 needs
`measure(block, width)` → rows, pure, without rendering. A height expressed as a
fraction of the terminal has no answer independent of the frame it is in.

**132 packages, 70 MB, against three runtime dependencies.** `jimp` is most of it.

It is also an Ink component, which by the measurement argument cannot live in a block
at all.

---

## The design that falls out, and it is cheap

Invert who decides the size. The **producer declares the cell rectangle** and the
terminal scales the image into it — which is how kitty and iTerm2's protocols are
meant to be driven, since both take explicit cell dimensions.

```typescript
type Image = Readonly<{
  kind: "image";
  id:   string;
  data: Uint8Array | string;   // bytes, or a path the renderer reads
  rows: number;                // declared by the producer
  cols: number;                // declared
  alt:  string;                // required — see below
}>;
```

`measure` returns `rows`. Pure, no query, no decoding, no terminal round trip.

### Formats come free, because the terminal decodes

**PNG, JPEG, GIF, WebP and anything else the terminal accepts** — because the bytes
are passed through rather than decoded. kitty takes PNG directly and raw RGB/RGBA;
iTerm2's inline protocol takes whatever the OS image stack reads, which on macOS is
everything. The framework never parses an image.

That is the whole reason this is cheap:

| | Cost |
|---|---|
| iTerm2 | base64 the bytes, emit the escape sequence. **No dependency** |
| kitty | base64, emit the graphics sequence with explicit rows and cols. **No dependency** |
| sixel | needs a real encoder. **This is what costs** |
| none | render `alt` |

So the two modern protocols are close to free and **sixel is the whole expense**.
Never a bundled decoder.

On ordering, see the scroll discussion below: **kitty's Unicode-placeholder path is
first**, not because it is cheapest but because it is the only one that composes with
a scrolling transcript.

### `alt` is required, not optional

No protocol means render the text. An image with no `alt` would be **information
lost** rather than convenience lost, which is the one thing B04's degradation rule
forbids — and it is the same argument that makes `error`-toned blocks carry a glyph.

A half-block or ASCII rendering of the image is a *nicer* fallback and needs a
decoder, so it is a later, optional thing. `alt` is the floor and it costs nothing.

---

## What would need deciding, if this is ever built

**Does the transcript retain image bytes?** C13 caps at 100,000 blocks. A block
holding a megabyte of PNG changes what that cap means, and C08's fixture corpus would
carry them too. Probably: blocks hold a *path* and the renderer reads it, with the
lifetime being the app's problem — the same shape as `RawResult` holding `stdoutRaw`
rather than the framework caching payloads.

**What happens on scroll — answered for kitty, open for the others.**

A terminal is a character grid with no notion of a layer or a canvas, so an image has
nowhere to anchor except the cursor. Sixel dates from DEC terminals in the 1980s and
predates the question; iTerm2 treats the image as an oversized character.

**Kitty solved it in 0.28.0 with Unicode placeholders**, and the mechanism is exactly
what this architecture wants:

1. transmit the image once and create a **virtual** placement (`U=1`), in quiet mode
   (`q=2`) so the terminal sends no response
2. print `U+10EEEE` characters, with combining diacritics encoding row and column and
   the **image ID in the cell's foreground colour**
3. the terminal sees ordinary Unicode text in its grid and renders the image tile
   there

From the protocol docs: *"Placeholders reflow with surrounding text when the terminal
is resized, scroll naturally with the screen buffer, and can be overwritten like any
other character."*

Four things fall out, and together they make the transcript case tractable:

| | |
|---|---|
| **Measurement is free** | The placeholder grid *is* `rows` × `cols` of ordinary characters. `measure` returns `rows` because that is literally how many rows of text were emitted |
| **Scrolling is free** | The placeholders are text; C14's virtualisation moves them like any other content |
| **Resize is free** | They reflow, and C03's `contaminated` full repaint re-emits them anyway |
| **No probe** | `q=2` exists precisely to avoid responses that would confuse a host application — which is the same reason C02 refuses interactive probes |

It also works through **tmux**, which is what the placeholder mechanism was built for.

Supported: kitty, WezTerm, Ghostty, Rio, Konsole (partial).

**Still open for iTerm2 and sixel.** Neither has an equivalent, so an image in a
scrolling transcript is kitty-only. The honest phasing is therefore not "iTerm2 and
kitty first" as recorded above — it is **kitty-with-placeholders first**, because it
is the only one that composes with a scrolling transcript at all, and iTerm2's
character-like model is second and only viable in a fixed layout.

**Whether `cols` is honoured or advisory.** `rows` must be exact or measurement
breaks. `cols` narrower than the frame is fine; wider is the width hazard, so it
should be clamped at plan time like any other block.

---

## What is already in place

- C02 detects the protocol, without a probe, and that detection is tested
- C09 §4's degradation row records "nothing renders an image in v1, so its absence
  costs nothing; detected now so Phase 1B does not need a second detection pass"
- `raw` already renders arbitrary text, so an app wanting an image today can emit
  its own escape sequence into one and own the consequences

That last point is the honest answer for now: it is possible today, unsupported, and
the app carries the measurement problem.
