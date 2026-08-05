# S1's banner — the whale and the wordmark

An addition to S1, the landing dashboard. A banner above the dashboard panel, the way a
CLI's welcome screen carries its name — the logo and the wordmark side by side.

It is a `raw` block, chosen at document-build time from `ctx.width` and
`ctx.capabilities`. **It is chrome: it must never cost the dashboard its density.**

---

## The art

### The whale (the logo) — pure ASCII, survives every depth

```
                    ##        .            
              ## ## ##       ==            
           ## ## ## ##      ===            
       /""""""""""""""""\___/ ===        
  ~~~ {~~ ~~~~ ~~~ ~~~~ ~~ ~ /  ===- ~~~   
       \______ o          __/            
         \    \        __/             
          \____\______/ 
```

8 rows, **40 cells once padded**. The lines are ragged as written — content extents **31, 31, 31, 33, 40, 29, 26, 23**, corrected from the figures first recorded here, four of which were wrong — *and* the block carries trailing whitespace out to 43. So storing it padded is **two operations, trim then pad**: padding alone leaves three rows wider than the rest. Every character is ASCII (`# / \ ~ { } " _ o = .`), so it needs no
variant — it renders identically at truecolour and at ASCII depth.

### The wordmark — block elements, needs an ASCII variant

```
                                                            
 ▄▄▄▄▄                         ▄▄                           
 ██▀▀▀██                       ██                           
 ██    ██   ▄████▄    ▄█████▄  ██ ▄██▀    ▄████▄    ██▄████ 
 ██    ██  ██▀  ▀██  ██▀    ▀  ██▄██     ██▄▄▄▄██   ██▀     
 ██    ██  ██    ██  ██        ██▀██▄    ██▀▀▀▀▀▀   ██      
 ██▄▄▄██   ▀██▄▄██▀  ▀██▄▄▄▄█  ██  ▀█▄   ▀██▄▄▄▄█   ██      
 ▀▀▀▀▀       ▀▀▀▀      ▀▀▀▀▀   ▀▀   ▀▀▀    ▀▀▀▀▀    ▀▀      
```

**8 rows as stored — one blank, then 7 of content — and a uniform 60 cells as written, 59 of content.** The top pad **is the blank first line above**, already present. It must not be stripped and must not be added again: this section first read as an instruction to add one, which would have produced nine. Uses `▄ ▀ █` — **block elements, not ASCII.**

### The ASCII wordmark — the variant the above needs

```
 ____             _             
|  _ \  ___   ___| | _____ _ __ 
| | | |/ _ \ / __| |/ / _ \ '__|
| |_| | (_) | (__|   <  __/ |   
|____/ \___/ \___|_|\_\___|_|   
```

5 rows, 32 cells. Pure ASCII, pairs with the whale at any depth.

---

## Composed, side by side

**Measured, not estimated: 103 cells wide, 8 rows, and no tab characters anywhere.**

```
                    ##        .
              ## ## ##       ==              ▄▄▄▄▄                         ▄▄
           ## ## ## ##      ===              ██▀▀▀██                       ██
       /""""""""""""""""\___/ ===            ██    ██   ▄████▄    ▄█████▄  ██ ▄██▀    ▄████▄    ██▄████
  ~~~ {~~ ~~~~ ~~~ ~~~~ ~~ ~ /  ===- ~~~     ██    ██  ██▀  ▀██  ██▀    ▀  ██▄██     ██▄▄▄▄██   ██▀
       \______ o          __/                ██    ██  ██    ██  ██        ██▀██▄    ██▀▀▀▀▀▀   ██
         \    \        __/                   ██▄▄▄██   ▀██▄▄██▀  ▀██▄▄▄▄█  ██  ▀█▄   ▀██▄▄▄▄█   ██
          \____\______/                      ▀▀▀▀▀       ▀▀▀▀      ▀▀▀▀▀   ▀▀   ▀▀▀    ▀▀▀▀▀    ▀▀
```

`whale(40) + gap(4) + wordmark(59) = 103`. The wordmark's *content* is 59 cells and its stored width 60, so the arithmetic first written here — `+ 60` — came to 104 and disagreed with the measured 103 beside it. The gap is a choice; 4 reads well, 2 is tight.

### Three things that had to be fixed to compose it, all the app's job at build time

**No tabs. This one is a real hazard, not tidiness.** A tab counts as **one cell** to
`cells()` and advances the terminal to its next tab stop — 8 columns, or whatever the
terminal is set to. So measurement and rendering disagree, *and the disagreement varies by
machine*. A line that measured 16 cells drew at 51. **This is the project's own defect class
arriving inside the art**, and it belongs in a test: the banner's constants contain no
`\t`.

**The whale's lines are ragged** — 40, 31, 31, 33, 40, 28, 25, 22 cells as written. Fine
standalone, because trailing space does not show; **fatal side by side**, because the
wordmark then starts at a different column on every row. Store it **padded to a uniform 40**.

**The row counts differ** — the whale is 8 rows, the wordmark 7. The wordmark is
**top-padded by one row**, putting its baseline on the whale's hull rather than its spout.

## The width tiers

**Stacking is rejected**: whale above wordmark is 15 rows, and on a dense landing dashboard
that is most of the screen spent on decoration. The tiers preserve step 2's density
decision.

**The threshold is each variant's own width, not a constant** — corrected after building it,
and the frame at 80 is the evidence.

| variant | width | drawn when | rows |
|---|---|---|---|
| whale + block wordmark | **103** | width ≥ 103 and block elements available | 8 |
| whale + ASCII wordmark | **76** | width ≥ 76 otherwise | 8 |
| whale alone | **40** | width ≥ 40 otherwise | 8 |
| nothing | — | below 40 | 0 |

The table first written here reserved 80–102 for the whale alone. That is right for the
block wordmark and **wrong for the ASCII one**: whale + ASCII wordmark is 76 cells and fits
an 80-column terminal with four to spare, so a fixed 103 would have drawn a lone whale with
the name's space empty beside it. Frame-read at 80 shows the name where the table said it
could not go.

## The depth variants

Selected from `ctx.capabilities`, not from the substitution table — **and that is the
point**. Per step 1's em-dash finding, *capability substitution covers glyphs the framework
picks, not text an adapter supplies.* So `▄▀█` in a `raw` block pass through untouched and
render as garbage on a terminal that cannot show them. The app must choose.

```
block-elements available   the wordmark above
ASCII only                 the ASCII wordmark
the whale                  unchanged either way — it is already ASCII
```

**Four selections, three renderings**: (wide | narrow) × (blocks | ASCII), and the whale is already ASCII, so narrow×blocks and narrow×ASCII are the same picture. Recorded rather than left as an off-by-one in the count.

---

## What it strengthens — and why it is worth the rows

### F24, made concrete

`LiveSpec.render` receives no width. The landing dashboard is a `b.live` entry, so **the
banner tier is chosen once at document build and cannot follow a resize.** Widen a
narrow terminal and the whale does not gain its wordmark; narrow a wide one and the banner
**overflows or truncates** rather than dropping a tier.

That is F24 biting a second consumer, and a far more visible one. *"The plot's cap is stale
after a resize"* is abstract. **"The banner overflows when you resize"** is a screenshot,
and it is the version of F24 that argues for itself.

### The em-dash class, one layer up

Step 1 found that an adapter's em-dash placeholder reaches a 1-bit terminal untouched,
because substitution covers framework glyphs and not adapter text. The wordmark is the same
class at eight rows instead of one character — and the app carrying its own ASCII variant is
the correct app-side answer, recorded rather than mistaken for a framework gap.

---

## Where it goes

`examples/docker/src/banner.ts` — the four variants as string constants, and one function
`banner(width, caps): Block | null` returning a `raw` block or nothing below 80.

`dashboard.ts` composes it above the panel. **It must not push the running list off the
screen at any width** — that is the thing to check in the frame-read, at 120 and at 80,
because a banner that costs a dashboard its rows has failed at being chrome.
