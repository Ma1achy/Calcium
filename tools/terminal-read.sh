#!/usr/bin/env bash
# The terminal read — C09 §4c's blind spot, and the ten image checks.
#
# **Every gate in this repository compares bytes.** None of them can see a
# flicker, a jump, a colour that reads badly, or an image that does not appear.
# C09 §4c names the moment this closes in its own words: *the third is the
# terminal's own guarantee about a plane-16 private-use character, and it is not
# measurable in this repository. The first real-terminal test is where it is
# checked.*
#
# Run it in Ghostty, kitty, WezTerm or Konsole. `node` stays in the container —
# this shells into `calcium-dev`, so the PTY is the terminal's and the runtime is
# Node 22 with the toolchain, which is CLAUDE.md's rule kept rather than bent.
#
#   bash tools/terminal-read.sh          every case, in order
#   bash tools/terminal-read.sh 4        one case by number
#
# Screenshots: Cmd-Shift-4, drag the window. Name them `NN-slug.png` and drop
# them in `docs/catalogue/images/real/`.
set -u

C=calcium-dev
BOLD=$'\033[1m'; DIM=$'\033[2m'; CYAN=$'\033[36m'; YEL=$'\033[33m'; OFF=$'\033[0m'

if ! docker ps --format '{{.Names}}' | grep -qx "$C"; then
  printf '%s\n' "the devcontainer '$C' is not running — start it and re-run" >&2
  exit 1
fi

pause() { printf '\n%s[ %s ]%s  ' "$DIM" "${1:-screenshot, then Enter}" "$OFF"; read -r _; }
title() { printf '\n%s%s%s\n%s%s%s\n' "$BOLD" "$1" "$OFF" "$DIM" "$2" "$OFF"; }
demo()  { docker exec -it "$C" bash -lc "cd /workspace/examples/plots && $1"; }

banner() {
  clear
  cat <<'TXT'
  the terminal read — what no gate here can do

  Every check below is a LOOK, not an assertion. Three of them change the
  design rather than reporting a defect:

    2   is it the RIGHT SIZE          the plane-16 guarantee, observed
    4   DOES IT SCROLL                the architecture's premise
    9   is the cursor where the next write expects it

  Item 4 is the one to run first. If an image does not scroll with the
  transcript, the reason iTerm2 was refused applies to kitty too, and the
  protocol arm is a different feature from the one C09 §4c describes.
TXT
  printf '\n  %sterminal%s %s   %ssize%s %sx%s\n' "$DIM" "$OFF" "${TERM_PROGRAM:-$TERM}" \
    "$DIM" "$OFF" "$(tput cols)" "$(tput lines)"
  pause "Enter to begin"
}

case_4() {
  title "4 · DOES IT SCROLL — run this one first" \
    "Scroll the image out of view and back. It must move WITH the rows around it."
  cat <<'TXT'

  What to look for, in this order:

    a  the image is on screen, whole
    b  scroll up until it is gone — the rows above it arrive normally
    c  scroll back down — it is THERE, in the same place, undamaged
    d  scroll it half off the top — the visible half is the BOTTOM half,
       not a squashed whole image and not a stale full one

  (d) is the one to watch. A protocol that redraws the whole image into a
  clipped region gives a squashed picture that still looks like a picture.

TXT
  pause "Enter to open /compare, then scroll"
  demo "npm start" || true
}

case_ten() {
  title "the ten image checks" "2, 4 and 9 change the design. The rest are defects."
  cat <<'TXT'

    1   does it draw at all
    2   is it the RIGHT SIZE — the plane-16 guarantee, observed
    3   is it in the right place — rows above and below undisturbed
    4   DOES IT SCROLL — out of view and back
    5   does a resize survive
    6   do two images coexist
    7   the same image twice — one transmission, two placements
    8   does a partial redraw hold — type at the prompt with an image on screen
    9   is the cursor where the next write expects it — the row AFTER the image
    10  does an eviction release

  8 is the one no probe in this repository could reach: Ink full-frames in the
  test harness, so a partial redraw has never been exercised.

TXT
  pause "Enter for the image gallery"
  demo "npm start" || true
}

case_demo() {
  title "the demo, in colour and in motion" \
    "/all · the six error heights · the four widths · the spinner · /monitor"
  cat <<'TXT'

  Drive it yourself, and screenshot each:

    /all        every form at its rungs
    /rungs      the six error heights AND the four widths, one screen
    /faults     the spinner mid-frame, the countdown, the elapsed counter
    /monitor    leave it a full minute

  A paragraph per figure: what it shows, what is wrong with it, and whether
  the fault is the DEMO'S DATA, the RENDERER'S, or the THEME'S. The third
  column is the one that is wrong when written from memory.

TXT
  pause "Enter to start the demo"
  demo "npm start" || true
}

case_g7() {
  title "G7 · a 16-bit and an interlaced PNG in front of a real decoder" \
    "Our decoder refuses both by name. The terminal's is libpng, which may not."
  cat <<'TXT'

  The architecture half is settled in the container (F413): the protocol arm
  needs the decoder only for the aspect, and the IHDR survives the refusal. So
  these now PLACE at kitty and refuse at the dither.

  What is left is conformance, and only a terminal answers it:

    depth16.png       does the terminal draw it, or is the region blank?
    interlaced.png    the same question for Adam7
    palette.png       the control — we decode this one, so it must draw
                      on BOTH arms

  A blank region is the answer 'no', and it is C09 §4c's loud failure. If
  either is blank, the remedy is a capability, NOT a re-gate on our decoder.

TXT
  pause "Enter for /image"
  demo "npm start" || true
}

case_dither() {
  title "the same images, one rung down" \
    "TuiConfig.capabilities, ambiguousWidth: wide — which demotes the half block"
  cat <<'TXT'

  The comparison you asked for: both arms on ONE subject. `▀` is
  East_Asian_Width=Ambiguous, so declaring `wide` is the honest way to say
  'this terminal cannot spend a cell on two colours' — and the ladder falls to
  braille, which is 8 dots at 1 bit against 2 pixels at 24.

  Screenshot this beside the last one. The photograph is where they separate;
  the diagram is where braille wins.

TXT
  pause "Enter for the dither arm"
  demo "npm start -- --ambiguous-wide" || true
}

run() {
  case "$1" in
    4)  case_4 ;;
    10) case_ten ;;
    d)  case_demo ;;
    g7) case_g7 ;;
    dither) case_dither ;;
    *)  printf 'unknown case: %s\n' "$1" >&2; return 1 ;;
  esac
}

if [ $# -gt 0 ]; then
  run "$1"
else
  banner
  for c in 4 10 d g7 dither; do run "$c"; done
  printf '\n%sdone — screenshots go in docs/catalogue/images/real/%s\n' "$CYAN" "$OFF"
  printf '%sand the README there wants the terminal, its version and the font%s\n\n' "$DIM" "$OFF"
fi
