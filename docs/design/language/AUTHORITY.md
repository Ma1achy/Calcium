# 00 · Authority

## The design language is normative for three domains

```
APPEARANCE    glyphs, marks, tones, grounds, spinners, bars, ramps, animation
INTERACTION   ownership, arming, activation, selection, copy, keys and chords
NAVIGATION    focus, scroll ownership, layers, dismissal, the tape
```

Its authoritative form is `docs/design/language/calcium-registry.json` (landed by
T00). The generated `calcium-design-language.html` is its projection. Rule IDs
(`R-XXX-NNN`) are stable forever; a superseded rule keeps its ID.

## Precedence

```
1  the registry, status: current            normative
2  the C-specs, AMENDED to agree with (1)    normative, and cite the R-IDs
3  the code                                   must agree with (2)
```

**Outside those three domains the repository is untouched by this kit.** Transport,
manifest, adapters, process runner, history, profiler — C04–C08, C18, C20, C21, C23,
C28 — keep their current authority.

## The repository's own rule still governs HOW

CLAUDE.md: *"If the spec is wrong, change the spec first."* That is exactly the
mechanism. For every conflict:

```
1  amend the C-spec section: new commitment/invariant text, citing the R-ID
2  mark the replaced text superseded in place — do not silently delete it
3  change the code to the amended spec
4  tests cite BOTH the invariant and the rule:  T16.4 (I12, R-OWN-003): …
```

**A premise check is a check, not a veto** (CLAUDE.md). If a task's premise is wrong
against the current code, report the correction and build the corrected thing. If a
rule itself looks wrong, stop and ask — do not substitute a different design.

## What the registry does NOT override

- **Invariants about measurement.** `measure(block, width) == rows rendered` and the
  "appearance animates; geometry never does" rule stay absolute. The design language
  agrees with both; nothing here may weaken them.
- **The layering rules** (imports go down, L0 halves independent). Any task that needs
  an upward edge is routed through L4, per A02 Seam 4.
- **`make enforce`.** Every task leaves it green.
