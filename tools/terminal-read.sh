#!/usr/bin/env bash
# The terminal read — C09 §4c's blind spot, and the ten image checks.
#
# **Every gate in this repository compares bytes.** None can see a flicker, a
# jump, a colour that reads badly, or an image that does not appear. C09 §4c
# names the moment this closes in its own words: *the third is the terminal's own
# guarantee about a plane-16 private-use character, and it is not measurable in
# this repository. The first real-terminal test is where it is checked.*
#
# **Every case prints what the FAILURE looks like, not only what to look for.**
# That is the difference between a reader confirming a picture is there and a
# reader noticing it is subtly wrong — and the wrong ones here are all plausible:
# a squashed image still looks like an image.
#
# `node` stays in the container. This shells into `calcium-dev`, so the PTY is
# the terminal's and the runtime is Node 22 with the toolchain.
#
#   bash tools/terminal-read.sh          every case, in order
#   bash tools/terminal-read.sh 4        one case
set -u

C=calcium-dev
OUT="docs/catalogue/images/real"
B=$'\033[1m'; D=$'\033[2m'; CY=$'\033[36m'; YE=$'\033[33m'; RE=$'\033[31m'; O=$'\033[0m'

docker ps --format '{{.Names}}' | grep -qx "$C" || {
  printf 'the devcontainer %s is not running\n' "$C" >&2; exit 1; }
mkdir -p "$OUT"

pause() { printf '\n%s[ %s ]%s ' "$D" "${1:-screenshot, then Enter}" "$O"; read -r _; }
head2() { printf '\n%s%s%s\n%s%s%s\n' "$B" "$1" "$O" "$D" "$2" "$O"; }
looks() { printf '\n  %sTHE FAILURE LOOKS LIKE%s\n' "$YE" "$O"; while IFS= read -r l; do printf '    %s\n' "$l"; done; }
demo()  { docker exec -it "$C" bash -lc "cd /workspace/examples/plots && $1"; }

# --- the record, because a placeholder's width is a font question ------------
record() {
  local term ver font
  term="${TERM_PROGRAM:-${TERM:-unknown}}"
  ver="${TERM_PROGRAM_VERSION:-}"
  [ -z "$ver" ] && [ -x /Applications/Ghostty.app/Contents/MacOS/ghostty ] &&
    ver=$(/Applications/Ghostty.app/Contents/MacOS/ghostty --version 2>/dev/null | head -1)
  font=$(/Applications/Ghostty.app/Contents/MacOS/ghostty +show-config 2>/dev/null |
         grep -E '^font-family|^font-size' | tr '\n' ' ')
  [ -z "$font" ] && font=$(kitty +runpy 'print(1)' >/dev/null 2>&1 &&
         kitty @ get-colors >/dev/null 2>&1 && echo "kitty, font unread")

  printf '\n%sthe record%s — a placeholder is one cell only if the FONT says so\n' "$B" "$O"
  printf '  terminal  %s\n  version   %s\n  font      %s\n' \
    "$term" "${ver:-unknown}" "${font:-unread}"
  printf '\n%sif any line above says unknown or unread, type it now%s\n' "$D" "$O"
  printf '  terminal + version [%s %s]: ' "$term" "${ver:-?}"; read -r t2
  printf '  font family and size: '; read -r f2
  [ -n "$t2" ] && term="$t2"
  [ -n "$f2" ] && font="$f2"

  cat > "$OUT/README.md" <<TXT
# The terminal read — $(date -u '+%Y-%m-%d')

**Recorded by \`tools/terminal-read.sh\` as it ran.** A placeholder's width is a
font question, so the font is part of the measurement rather than a note about
the machine.

| | |
|---|---|
| terminal | ${term} |
| version | ${ver:-see terminal} |
| font | ${font:-unrecorded} |
| size | $(tput cols) x $(tput lines) cells |
| protocol | kitty graphics, \`f=100\` PNG, plane-16 placeholders |

## The cases, in the order they were run

| # | case | what it decides |
|---|---|---|
| 4 | does it scroll | **the architecture's premise** — if it fails, the reason iTerm2 was refused applies to kitty too |
| 10 | the ten checks | 2, 4 and 9 change the design; the rest are defects |
| d | the demo | \`/all\`, \`/rungs\`, \`/faults\`, \`/monitor\` — in colour and in motion |
| g7 | the refused PNGs | conformance: does the terminal draw what our decoder will not |
| dither | the same images one rung down | the two arms on one subject |

## What was seen

<!-- A paragraph per figure: what it shows, what is wrong with it, and whether
     the fault is the DEMO'S DATA, the RENDERER'S, or the THEME'S. The third
     column is the one that is wrong when written from memory.

     And anything that looked wrong that no case asked about — which is the
     whole reason a person is doing this rather than a script. -->

## Screenshots

<!-- NN-slug.png beside this file. -->
TXT
  printf '\n%swritten: %s/README.md%s\n' "$CY" "$OUT" "$O"
}

case_4() {
  head2 "4 · DOES IT SCROLL — first, because it decides what the arm is" \
    "Scroll the image out of view and back. It must move WITH the rows around it."
  cat <<'TXT'

  a  the image is on screen, whole
  b  scroll up until it is gone — rows above arrive normally
  c  scroll back down — it is there, same place, undamaged
  d  scroll it HALF off the top
TXT
  looks <<'TXT'
(d) shows a SQUASHED WHOLE IMAGE instead of its bottom half. That is a
protocol redrawing the whole picture into a clipped region — and it still
looks like a picture, which is why it is the one to check.
(b) the image STAYS PINNED while text scrolls past it. Sixel does this.
(c) it comes back as garbage, a blank rectangle, or in the wrong column.
(a) rows above or below are eaten — the image occupies more than it declared.
TXT
  pause "Enter to start the demo — then /image, then scroll"
  demo "npm start" || true
}

case_ten() {
  head2 "10 · the ten checks" "2, 4 and 9 change the design. The rest are defects."
  cat <<'TXT'

   1  does it draw at all
   2  is it the RIGHT SIZE — the plane-16 guarantee, observed
   3  is it in the right place — rows above and below undisturbed
   4  does it scroll (done)
   5  does a resize survive — drag the window narrower and back
   6  do two images coexist — /image has eight on one screen
   7  the same image twice — one transmission, two placements
   8  does a partial redraw hold — type at the prompt with an image on screen
   9  is the cursor where the next write expects it — the row AFTER the image
  10  does an eviction release — scroll far enough that early ones are dropped
TXT
  looks <<'TXT'
 2  the image is one cell WIDER or NARROWER per row than the caption above
    it, or drifts diagonally — the font is not giving the placeholder one
    cell, and the whole geometry is derived from that assumption.
 3  the caption row is overwritten, or a blank band appears under the image.
 5  after a resize the image is stretched, doubled, or leaves a ghost of its
    old rectangle. A CORRECT result is a re-laid-out image at the new width.
 6  the last image drawn replaces the others, or all eight show the SAME
    picture — one id colliding, which is the wrong picture rather than none.
 7  the second copy is blank — the transmission was skipped as already sent
    and the placement addresses nothing.
 8  typing corrupts the image, or the image's rows are re-emitted as literal
    placeholder CHARACTERS — little boxes or blanks where the picture was.
 9  the prompt lands ON the image, or several rows below where it should.
10  an early image turns blank while a later one is fine.
TXT
  pause "Enter for /image"
  demo "npm start" || true
}

case_demo() {
  head2 "the demo — in colour and in motion" \
    "/all · /rungs · /faults · /monitor for a full minute"
  cat <<'TXT'

  /all        every form at its rungs
  /rungs      the six error heights AND the four widths, one screen
  /faults     the spinner mid-frame, the countdown, the elapsed counter
  /monitor    leave it a minute

  A paragraph per figure, and the third column is the one that is wrong when
  written from memory: is the fault the DEMO'S DATA, the RENDERER'S, or the
  THEME'S?
TXT
  looks <<'TXT'
/rungs   a box that is a RED LINE rather than a box. That is F406 returning:
         tag and border coupled, so a framed box has no rung of its own.
         And at the narrow column: the tag ` ERROR ` cut mid-word rather
         than dropped — the width ladder degrades rule, bare, none, and a
         truncated tag means it did not.
/faults  the countdown FROZEN while the spinner turns. That is F407, and it
         is why the spinner matters: it proves frames are arriving, so a
         still number is the number and not the frame.
         And `loading (Ns)` never appearing at all — F408, invisible for
         arcs because the writes worked and only the read-back was blind.
/monitor a row per core that stops updating while others continue, or the
         whole panel re-drawing with a visible flash each second.
/all     a form drawing the SAME picture for every dataset — plausible, and
         F269's shape. Two forms drawing an identical figure is the tell.
TXT
  pause "Enter to start the demo"
  demo "npm start" || true
}

case_g7() {
  head2 "g7 · a 16-bit and an interlaced PNG in front of a real decoder" \
    "Our decoder refuses both by name. The terminal's is libpng, which may not."
  cat <<'TXT'

  The architecture half is settled in the container (F413): the protocol arm
  needs the decoder only for the aspect, and the IHDR survives the refusal. So
  at kitty these PLACE, and one rung down they show the box with the reason.

  In /image, the last three:

    palette.png     THE CONTROL — we read this one, so it must draw on BOTH
                    arms. If it is blank, the run says nothing about the two
                    below it.
    depth16.png     does the terminal draw it?
    interlaced.png  the same question for Adam7.
TXT
  looks <<'TXT'
A BLANK RECTANGLE where the picture should be. That is the answer 'no', and
it is C09 §4c's loud failure — the placement addresses an image the terminal
failed to load. The remedy would be a CAPABILITY, not a re-gate on our own
decoder's opinion.

The quiet failure to watch for: the region shows the PREVIOUS image in the
list instead of blank. That is an id collision, not a decode failure, and it
means something quite different.

And if palette.png is blank, stop — the control failed and nothing below it
can be read.
TXT
  pause "Enter for /image"
  demo "npm start" || true
}

case_dither() {
  head2 "dither · the same images, one rung down" \
    "--ambiguous-wide, which demotes the half block by C09 I37's own gate"
  cat <<'TXT'

  Both arms on ONE subject. `▀` is East_Asian_Width=Ambiguous, so declaring
  `wide` is the honest way to say 'this terminal cannot spend a cell on two
  colours' — and the ladder falls to braille: 8 dots at 1 bit against 2 pixels
  at 24.

  Screenshot this beside the last one. The photograph is where they separate;
  the diagram is where braille wins, and that is not a defect.
TXT
  looks <<'TXT'
The two screenshots are THE SAME. Then the flag did not reach the config and
the comparison is one arm photographed twice — check the braille glyphs are
actually there.

The braille arm drawn at DOUBLE WIDTH, running off the right edge. Then
something in the fall-through is still emitting `▀` under `wide`, which is
the exact hazard the gate exists for.

And the honest non-failure: the diagram reading BETTER here than at the half
block. That is the trade, not a defect — braille resolves a one-pixel rule
that a half block averages away.
TXT
  pause "Enter for the dither arm"
  demo "npm start -- --ambiguous-wide" || true
}

run() { case "$1" in
  4) case_4 ;; 10) case_ten ;; d) case_demo ;; g7) case_g7 ;; dither) case_dither ;;
  *) printf 'unknown case: %s\n' "$1" >&2; return 1 ;; esac; }

if [ $# -gt 0 ]; then run "$1"; else
  clear
  printf '%sthe terminal read — what no gate here can do%s\n' "$B" "$O"
  printf '%severy case prints what the FAILURE looks like, not only what to look for%s\n' "$D" "$O"
  record
  printf '\n%sthe machine half is already run%s — %sdocs/catalogue/images/real/README.md%s\n' "$D" "$O" "$B" "$O"
  printf '  G7 answered, checks 2 and 9 hold, and the control failed as it must.\n'
  printf '  %sre-run it on this terminal with:%s python3 tools/terminal-probe/probe.py out.txt\n' "$D" "$O"
  pause "Enter to begin the human half — case 4 first"
  for c in 4 10 d g7 dither; do run "$c"; done
  printf '\n%sdone%s — screenshots as %sNN-slug.png%s in %s\n' "$CY" "$O" "$B" "$O" "$OUT"
  printf '%sthe README is written; the "What was seen" section is yours%s\n\n' "$D" "$O"
fi
