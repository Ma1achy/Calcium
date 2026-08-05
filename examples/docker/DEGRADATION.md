# S12 — the same view at five depths

The claim under test: **the same information, five terminals, nothing lost — only how it
is said changes.** The subject is S3's live single-container view, because a plot and a
bar degrade more visibly than a table does: a table is text in columns at every depth, and
a plot is a shape.

Every frame below is a real capture from a real PTY against a real container under load,
read with `tools/screen.py`. The colour axis is C02's `colourDepth`; the unicode axis is
C02's `unicode`. Nothing is composed by hand.

```sh
python3 tools/capture.py 100 30 out.raw "/container stats dtui-load" 22 \
  COLORTERM=truecolor LANG=en_GB.UTF-8            # and the four below
```

---

## What is on the wire

The frames are the demonstration; **this table is the evidence**, because four of the five
rows look identical in a stripped capture and differ only in bytes the reader never sees
as characters.

| depth | how it says it | typographic attributes |
|---|---|---|
| truecolour | 1216 × `ESC[38;2;r;g;b` | none |
| 256 | 1174 × `ESC[38;5;n` | none |
| 16 | 1118 × `ESC[3x` / `ESC[9x` | none |
| **1-bit** | **none** | **155 bold, 855 dim** |
| ASCII (1-bit) | none | 140 bold, 746 dim |

Four disjoint encodings, nothing bleeding across. And the row that matters: **at one bit
the meaning moves channel.** 1010 typographic sequences appear exactly where 1118 colour
ones disappear — C10's `monochrome: "typographic"` doing the thing the claim asserts,
measured rather than asserted.

---

## truecolour — `COLORTERM=truecolor`

```
┌ CPU ─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                  │
│60 │⠉⠒⠒⠤⢄⣀                         ⢀⣀⡠⠤⠒⠒⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉│
│   │      ⠉⠉⠒⠢⠤⣀⣀            ⣀⡠⠤⠔⠒⠉⠁                                                              │
│   │             ⠉⠑⠒⠤⠤⣀⡠⠤⠔⠒⠉⠉                                                                     │
│30 │                                                                                              │
│ 0 │                                                                                              │
│   └──────────────────────────────────────────────────────────────────────────────────────────────│
│6 ticks · 2s each                                                                                 │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
┌ MEMORY · NETWORK · BLOCK ────────────────────────────────────────────────────────────────────────┐
│MEM   ░░░░░░░░ 0.0%    688KiB / 7.75GiB                                                           │
```

## 256 — `TERM=xterm-256color`, no `COLORTERM`

```
│76 │                                                                      ⣀⡠⠤⠒⠊⠉⠒⠤⢄⣀              │
│   │⣀⡀                                                              ⢀⣀⠤⠒⠊⠉          ⠉⠒⠢⠤⣀         │
│   │ ⠈⠉⠉⠒⠒⠒⠤⠤⢄⣀⣀                                              ⢀⣀⠤⠔⠒⠉⠁                    ⠉⠑⠒⠤⣀⡀   │
│38 │            ⠉⠉⠉⠒⠒⠢⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠔⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠉⠁                               ⠈⠉⠒⠤│
```

## 16 — `TERM=xterm`

```
│89 │                                                   ⣀⣀⠤⠤⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠒⠒⠤⢄⣀             │
│   │                                           ⣀⣀⠤⠤⠒⠒⠉⠉                              ⠉⠉⠒⠢⠤⣀⣀      │
│   │⠤⢄⣀⣀                             ⢀⣀⣀⡠⠤⠤⠒⠒⠉⠉                                             ⠉⠑⠒⠤⠤⣀│
│45 │    ⠉⠉⠉⠒⠒⠢⠤⠤⣀⣀⣀        ⣀⣀⡠⠤⠤⠔⠒⠒⠉⠉⠁                                                            │
```

## 1-bit — `DOCKER_TUI_DEPTH=1`

**This row could not be produced by any application until this step.** The only rule
yielding `colourDepth: 1` is C02's `dumb` gate, and that gate also clears `altScreen`,
which C02 I7 makes the one refusal that stops the shell — measured, `TERM=dumb` exits with
a stack trace before drawing anything. C22 I49 gave C02's override parameter a producer.

```
│54 │      ⣀⣀⣀⡠⠤⠤⠤⠒⠒⠒⠒⠉⠉⠉⠑⠒⠒⠢⠤⠤⢄⣀⣀⣀                                                                │
│   │⠒⠒⠉⠉⠉⠉                        ⠉⠉⠉⠒⠒⠒⠤⠤⠤⠤⠤⠤⢄⣀⣀⣀⣀⣀⣀⣀⣀⡀                                     ⣀⣀⣀⣀⣀│
│   │                                                   ⠈⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠉⠉⠉⠉⠉⠉⠉⠉⠉     │
│27 │                                                                                              │
```

The braille plot is unchanged — it never carried meaning in colour. What changed is
everything around it, and none of it stopped saying anything.

## ASCII — `LANG=C`, at one bit

```
+ CPU ---------------------------------------------------------------------------------------------+
|60 |@##*++==-::.              ..:--=++*##@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@|
|   |            @@##*++=++*##@                                                                    |
|30 |                                                                                              |
| 0 |                                                                                              |
|   +----------------------------------------------------------------------------------------------|
|6 ticks - 2s each                                                                                 |
+--------------------------------------------------------------------------------------------------+
+ MEMORY - NETWORK - BLOCK ------------------------------------------------------------------------+
|MEM   ........ 0.0%    696KiB / 7.75GiB                                                           |
```

The plot becomes a density ramp — `.::-==++**##@@` — and reads as the same curve. The
borders become `+--+`. **The bar becomes `........` and `#####...`, and that took a code
change**: see F54 below.

---

## The banner, at both ends of the unicode axis

```
       /""""""""""""""""\___/ ===            ██    ██   ▄████▄    ▄█████▄  ██ ▄██▀    ▄████▄
  ~~~ {~~ ~~~~ ~~~ ~~~~ ~~ ~ /  ===- ~~~     ██    ██  ██▀  ▀██  ██▀    ▀  ██▄██     ██▄▄▄▄██
       \______ o          __/                ██    ██  ██    ██  ██        ██▀██▄    ██▀▀▀▀▀▀
```

```
       /""""""""""""""""\___/ ===            ____             _
  ~~~ {~~ ~~~~ ~~~ ~~~~ ~~ ~ /  ===- ~~~    |  _ \  ___   ___| | _____ _ __
       \______ o          __/               | | | |/ _ \ / __| |/ / _ \ '__|
```

The wordmark falls back and the whale does not, because the whale was always ASCII.
**The substitution is the app's, and that is the design rather than a shortfall**: C09
substitutes the glyphs *it* picks, and `▄▀█` in a `raw` block is text an adapter supplied.
An app carrying an ASCII variant is the correct answer — and it is only correct because
the app can find out, which it does by reading the environment itself (F43).

---

## Where something was lost — three findings

The claim survives, and it did not survive on the first reading of the frames.

### F54 — the app drew five characters an ASCII terminal cannot show

At `LANG=C` the first capture kept `░░░░░░░░` beside a plot that had correctly become
`.::-==++**##@@` and borders that had correctly become `+--+`. The framework was right
about everything it owns; `█ ░ — · …` were text the app supplied, and capability
substitution does not reach them. Step 1's em-dash finding, four surfaces later.

**Each of the five was found by a different method, which is the interesting part:**

| character | how it was found |
|---|---|
| `░` `█` | reading the ASCII frame |
| `—` | fixing `░`, in the same function |
| `·` | scanning the frame for codepoints > 127 |
| `…` | a test asserting the *range* rather than the four already known |

The fourth row is the lesson. The first version of that assertion listed `█ ░ —` — a
coverage set drawn from the defects already found, which covers exactly those. Changing it
to *no codepoint above 127* found `loading…` immediately, and `loading…` is not even the
app's.

Fixed app-side, and the fix is a flag threaded by hand from `main.ts` through four
functions, because `AdapterContext` carries `width` and no capabilities. **That thread is
F43's price**, and it is what makes F43 a finding rather than a preference.

### F55 — the framework draws two characters it does not substitute

After the app's five are gone, the ASCII dashboard contains exactly **one** non-ASCII
character, twice, and it is Calcium's:

```
U+276F '❯' x2      the prompt — src/shell/config.ts, a string constant
U+2026 '…'         `loading…` — b.live's default renderLoading
```

Both are constants concatenated into a frame with no capability substitution behind them.
The prompt is the sharper half: it is on every frame the shell ever draws, on the one line
the reader types into, and there is nothing an application can do about it. The app can
and does supply its own `renderLoading`; it cannot supply a prompt.

### F52 — 1-bit was unreachable, which is the depth the claim rests on

Fixed as C22 I49 before the showcase could exist. It is listed here because **the
showcase is what found it**: four depths came from the environment and the fifth came from
nowhere, and no amount of testing the parameter would have surfaced that — C02's own rows
all passed.

---

## The check, beside the demonstration

`test/degradation.test.ts` runs `expectDocument(doc).degradesTo1Bit()` over every document
this app produces — the first time an application has run B04's compliance sweep. It makes
two claims the frames cannot: that **geometry is depth-independent**, and that **no
element carries meaning in colour alone** (D29).

Ten documents pass. The eleventh row is the control: a notice toned `error` with no glyph
and no text, which must throw — because every row above would pass against an assertion
that returned `this`, and that is a different defect with the same green suite.

**The two answer different questions and neither replaces the other.** A frame shows that
the plot still reads at one bit. Only the sweep can say that no element stopped saying
what it said. And only the frame could find F54, because the sweep varies colour and the
loss was on the other axis.
