import json, re, io

# section -> (class, target, why)
#   frame : a golden file draws this surface today
#   owed  : the design specifies a surface an MR builds; the MR is the target
#   prose : a rule table or an explanation; nothing is drawn
#   app   : the reference application's surface, not the framework's
M = {
 1:("prose","—","the rule list itself"),
 2:("prose","—","where each primitive is defined"),
 3:("frame","session-frame.test.ts","the five regions with activity present"),
 4:("frame","session-frame.test.ts","idle — the activity region and its rule gone"),
 5:("frame","session-frame.test.ts","cancelled — the spinner stops, the region stays"),
 6:("owed","M4","the twelve canonical marks, as a glyph census"),
 7:("frame","states.test.ts","a subagent's nested calls"),
 8:("frame","blocks.test.ts","a message entry"),
 9:("frame","states.test.ts","queued, and what a queue draws"),
 10:("frame","session-frame.test.ts","startup and resume"),
 11:("owed","M13","@ mentions are chips, and the chip's halves have never met"),
 12:("frame","blocks.test.ts","multi-line and transient feedback"),
 13:("frame","states.test.ts","reviewing what auto wrote"),
 14:("frame","session-frame.test.ts","away, and what the frame says while you are"),
 15:("prose","—","four interaction principles"),
 16:("prose","—","scopes, as an ownership table"),
 17:("owed","M3","the focus treatment follows the shape — `focusGround`"),
 18:("owed","M3","focus on things that are not rows"),
 19:("owed","M6","the keys — `docs/KEYS.md`, generated from the registry"),
 20:("prose","—","DAS and ARR as figures"),
 21:("owed","M14","the scrollbar, absent from `src/` entirely"),
 22:("owed","M9","the help view, which becomes a transcript entry"),
 23:("frame","blocks.test.ts","at 40 columns"),
 24:("frame","states.test.ts","reasoning"),
 26:("owed","M13","the trail and the mark at the head — §025's live specimen"),
 27:("frame","plot-forms.test.ts","the context composition bar"),
 28:("frame","question-slot.test.ts","approval replaces the prompt — C23 I74"),
 29:("frame","session-frame.test.ts","completion expands the prompt"),
 30:("owed","M4","the dot, the cursor and the running state — the head mark's three rungs"),
 31:("owed","M4","every reusable spinner set at its own interval"),
 32:("prose","—","the four spinner rules"),
 33:("owed","M4","nine alphabets, and where each belongs"),
 34:("frame","design-surfaces.test.ts","active progress bars"),
 35:("owed","M4","quantity, granularity and liveness as three axes"),
 36:("owed","M4","the operation and budget presets"),
 37:("owed","M2","every ink ramp, including the four one-shots"),
 38:("owed","M2","the agent's mark and the verb's ramp"),
 39:("prose","—","one interval, one family"),
 41:("prose","—","the spinner is chosen by the verb"),
 42:("frame","blocks.test.ts","widgets"),
 43:("prose","—","spans, as the substrate four things wait on"),
 44:("owed","M10","two kinds of selection, one clipboard"),
 45:("frame","blocks.test.ts","the live terminal block"),
 46:("frame","session-frame.test.ts","history, search and ghost text"),
 47:("frame","containment.test.ts","empty, too small, stale, interrupted, refused"),
 48:("frame","design-surfaces.test.ts","block states, including the `empty` form"),
 49:("frame","blocks.test.ts","one block of every kind"),
 50:("frame","blocks.test.ts","the tool-result gallery"),
 51:("frame","question-slot.test.ts","approval overflow — the inspection (C23 I75)"),
 52:("frame","question-slot.test.ts","a question that wants a sentence (C23 I73)"),
 53:("prose","—","the mouse, as a ruling table"),
 54:("frame","blocks.test.ts","links"),
 55:("frame","states.test.ts","a link's states"),
 56:("prose","—","six pointer rulings"),
 57:("prose","—","⌃C across five contexts"),
 58:("owed","M10","what copy takes"),
 59:("frame","session-frame.test.ts","find"),
 60:("frame","session-frame.test.ts","resize"),
 61:("prose","—","eight cases that are not edge cases"),
 62:("prose","—","latency, and the window that causes it"),
 63:("prose","—","three refusals, and what stays rebindable"),
 64:("prose","—","undo"),
 65:("prose","—","compaction — which turns go"),
 66:("frame","states.test.ts","tool failures against model failures"),
 67:("frame","session-frame.test.ts","scrolled back while a turn runs"),
 68:("frame","compositions.test.ts","one exchange at three capability rungs"),
 69:("owed","M16","the prompt's upper rule, labelled — built and wired through `frame.label`, and no golden sets one: every rule in the frame corpus is bare"),
 70:("owed","M2","/colour, tinting the chrome"),
 71:("prose","—","the five permission postures"),
 72:("owed","M3","the background as a second channel"),
 73:("owed","M3","painted chrome — buttons, titles, widgets, headers"),
 74:("owed","M3","weight, and why it is not free"),
 75:("frame","blocks.test.ts","/config, and where a value came from"),
 76:("owed","M2","per-token values"),
 77:("frame","blocks.test.ts","syntax highlighting"),
 78:("frame","table.test.ts","tables"),
 79:("owed","M2","tones and surfaces, across ten themes"),
 80:("app","examples/","Prism — the rework in one sentence"),
 81:("app","examples/","Prism — /ps"),
 82:("owed","M9","no pushed views"),
 83:("app","examples/","Prism — submit"),
 84:("app","examples/","Prism — logs, as a block"),
 85:("app","examples/","Prism — the six-hour run"),
 86:("app","examples/","Prism — which plots it actually needs"),
 87:("prose","—","reconciling with C16 and C26"),
 88:("prose","—","four major things this document owed"),
 89:("prose","—","one hierarchy, and what sits beside it"),
 90:("prose","—","semantic names against visual aliases"),
 91:("prose","—","state tables — seven core facts per component"),
 92:("prose","—","state tables — six more"),
 93:("prose","—","three major rules it broke in its own examples"),
 94:("prose","—","three tiers — content, representation, decoration"),
 95:("frame","design-surfaces.test.ts","a tape, where a row of peers would shed"),
 96:("frame","design-surfaces.test.ts","a status has three parts, and the frame is separate"),
 97:("frame","design-surfaces.test.ts","a transient panel floats, between two rules"),
 98:("prose","—","input ownership — what was in flight"),
 99:("owed","M13","wrapping, truncation and the atomic chip"),
 100:("frame","table.test.ts","a table that cannot shed, and two columns"),
 101:("frame","question-slot.test.ts","replace or float; the chip preview is M13's"),
 102:("prose","—","view state is not liveness"),
 103:("prose","—","the ownership ladder"),
 104:("prose","—","focus survives a drop, and ←→'s five jobs"),
 105:("prose","—","five primitives the harness never needed"),
 106:("prose","—","where two rules meet — six composition cases"),
 107:("prose","—","the semantic tree and the terminal boundary"),
 108:("prose","—","capability vectors resolve actions"),
 109:("prose","—","responsive space and international text"),
 110:("prose","—","three records, a state product and the extension door"),
 111:("prose","—","the rules, condensed"),
}


PROBE = {
 3:"overlayRegion", 4:"spinning|SPINNER_SETS", 5:"spinning|SPINNER_SETS",
 6:"GLYPH_TABLE", 7:"descendants", 8:"questionNotice", 9:"CALL_STATE_GLYPH",
 10:"emptySnapshot", 11:"insertChip", 12:"questionNotice", 13:"CALL_STATE_GLYPH",
 14:"emptySnapshot", 17:"focusGround", 18:"focusGround", 19:"keyboardProtocol",
 21:"scrollbar", 22:"R-KEY-005", 23:"displayRows", 24:"CALL_STATE_GLYPH",
 26:"hotEdge|hot-edge", 27:"barCells|BAR_STYLES", 28:"promptReplaced",
 29:"menuWindow", 30:"headMark", 31:"SPINNER_SETS", 33:"BAR_STYLES",
 34:"BAR_STYLES", 35:"granularity", 36:"granularity", 37:"RampAnimation",
 38:"RampAnimation", 42:"kind: \"pills\"", 45:"kind: \"terminal\"",
 44:"nativeSelection", 46:"searchOpen", 47:"assertContainerPremise|containment", 48:"CALL_STATE_GLYPH",
 49:"kind: \"panel\"", 50:"kind: \"panel\"", 51:"confirm-source", 52:"questionConsumer",
 54:None, 55:None, 58:"nativeSelection", 59:"searchOpen",
 60:"refreshAnchors", 66:"FAILURE_WORDS", 67:"viewport", 68:"degradesTo1Bit",
 69:"labelSpansOf", 70:"REGISTRY_THEMES", 72:"resolveBackground",
 73:"bgElev", 74:"weight", 75:"kind: \"table\"", 76:"REGISTRY_THEMES",
 77:"registerGrammar", 78:"kind: \"table\"", 79:"REGISTRY_THEMES",
 82:"R-EXA-082", 95:"tapeStart", 96:"MESSAGE_LINE_CAP|widthRung", 97:"kind: \"panel\"",
 99:"chipSpans", 100:"kind: \"table\"", 101:"routingFor",
}

idx = json.load(open("docs/design/language/fixtures/INDEX.json"))
reg = json.load(open("docs/design/language/calcium-registry.json"))
have = {e["section"]: e for e in idx}
missing = sorted({s["order"] + 1 for s in reg["sections"]} - set(have))

out = io.StringIO()
w = out.write
w("""# The design fixtures, mapped

**109 fixtures across 111 sections, and every one has a row here.** The table is
parsed by `design-fixtures.test.ts` and compared against
`docs/design/language/fixtures/` **by equality**, so a fixture with no row is a
failure and a row naming no fixture is a failure. That is the whole reason this is a
file rather than a paragraph: *mapped, surface by surface* is a claim about a corpus,
and a claim about a corpus that nothing counts is one nobody can check (F163, and
`corpus.test.ts` is the precedent).

**The plan said 130 and the number is 109.** A count is what a reader checks coverage
against, so a wrong one reads as a bigger corpus than exists and makes any partial
mapping look worse than it is. 111 sections, 109 with a fixture — §025 and §040 have
none, and that is **not** a gap: both are the design's live animations (*"Drag the
clock to scrub it"*), so their specimen is motion rather than a frame. The corpus omits
exactly the two that could not be a picture.

## Three facts, and the first draft carried them in two columns

**This table was wrong when it was written, and wrong in the way it warns about.**
Its first version had one column that meant both *is this surface built* and *does a
golden frame draw it*, and it answered the first from the **plan** rather than from the
tree. Measured against HEAD, most of what it called outstanding was already built:
`focusGround` has 53 references, `dismissal` is split, `kind: "view"` is retired with
its finding number on it, `nativeSelection` has 31, and `scrollbar.ts`, `tape.ts`,
`headMark` and `REGISTRY_THEMES` all exist. Two columns carrying three facts is
exactly what `dismissable` was doing before M8 split it, and the fix is the same one.

| column | what it answers | how |
|---|---|---|
| **class** | is there a surface here at all | a judgement, stated as one |
| **built** | does the subject exist in the tree | a **probe** — a symbol whose presence is checked |
| **target** | does a golden frame draw it, with the fixture as its target appearance | a path that must exist |

**And a probe answers less than it looks like it does.** It says *a subject with this
name is in the tree*; it does not say the subject matches the design. `granularity`
resolving somewhere does not make §035's three axes independent. That is what the
**target** column is for, and it is why raising `built` is not the remaining work of
this MR — raising `target` is.

**Seven of sixty-five probes were wrong on their first run, and a probe that does not
resolve indicts the probe before the tree.** `ONE_PER_KIND` lives in `test/` and the
probe searched `src/`. There is no `link` or `widget` block kind, so two probes named
nothing the repo ever had. And §069's labelled rule — which the plan lists as unbuilt —
is built as `rule(width, deps, label)` with `labelSpansOf` and §069's own 60-column
shed; the probe simply guessed the wrong symbol. Every one of those reads, from the
outside, exactly like an absence.

**What is genuinely absent is links** (§054, §055). OSC 8 appears in the tree once, in
`decode.ts`, as a comment about bytes arriving *from* a terminal-aware pager. Nothing
emits one.

## The classes

| class | what it means |
|---|---|
| **surface** | the design draws something here; `built` and `target` say how far it has come |
| **prose** | a rule table or an explanation. Nothing is drawn, so there is nothing for a frame to be wrong about |
| **app** | the reference application's surface, drawn by `examples/`, not by the framework |

**The class cannot be derived from the fixture, and the obvious derivation fails in
both directions.** `corpus.test.ts` derives its kind from imports and says why —
*otherwise the row asserts itself* — so the first draft tried the same: prose is a
fixture whose own text carries no drawn frame. Wrong twice. **Ten surface fixtures
carry no box-drawing**, because a call head is a line of text and not a box; **eight
prose fixtures carry plenty**, because a rule table is often drawn in one. §063 draws
312 box characters and specifies no surface; §030 draws none and specifies the
most-drawn line in the application.

## The table

| § | class | built | target | what the fixture specifies |
|---|---|---|---|---|
""")
for sec in sorted(M):
    cls, tgt, why = M[sec]
    if sec in missing:
        continue
    surface = cls in ("frame", "owed")
    pr = PROBE.get(sec)
    # **A literal pipe ends a markdown cell**, so the alternation is escaped —
    # the first draft of this table lost two rows to it and the membership row
    # is what said so.
    built = "—" if not surface else ("no" if pr is None else "`" + pr.replace("|", "\\|") + "`")
    target = f"`{tgt}`" if cls == "frame" else ("`examples/`" if cls == "app" else "—")
    w(f"| {sec} | {'surface' if surface else cls} | {built} | {target} | {why} |\n")
w("""
## The two with no fixture

| § | why |
|---|---|
""")
reg_by_order = {s["order"] + 1: s for s in reg["sections"]}
for sec in missing:
    w(f"| {sec} | `{reg_by_order[sec]['key']}` — a live animation, so its specimen is motion rather than a frame |\n")

import collections
c = collections.Counter(M[s][0] for s in M if s not in missing)
surfaces = [x for x in M if x not in missing and M[x][0] in ("frame", "owed")]
built_n = sum(1 for x in surfaces if PROBE.get(x) is not None)
framed_n = sum(1 for x in surfaces if M[x][0] == "frame")
w(f"""
## The census

**Compared by equality, not by bound.** A subset check lets a class drain into another
one without anything saying so, and the direction that matters here is `owed` → `frame`:
that is the reconciliation working, and it should be visible as a number moving rather
than inferred from a suite staying green.

    surface {len(surfaces)} · prose {c['prose']} · app {c['app']} · total {sum(c.values())}
    of the surfaces: built {built_n} · unbuilt {len(surfaces) - built_n} · framed {framed_n}

**`framed` is the figure this MR moves, and `built` is the one that was already
nearly closed.** 64 of the 66 surface rows carry a probe that resolves; the two that do
not are §054 and §055, which want OSC 8 hyperlinks nothing in the tree emits, and they
are the only genuine absence the sweep found. Raising `built` is not the work — a probe says a
subject exists and not that it matches the design. Raising `framed` is.
""")
open("test/golden/DESIGN_FIXTURES.md", "w").write(out.getvalue())
print("frame", c["frame"], "owed", c["owed"], "prose", c["prose"], "app", c["app"], "total", sum(c.values()))
print("missing:", missing)
print("unclassified:", sorted(set(have) - set(M)))
print("rows naming no fixture:", sorted(set(M) - set(have) - set(missing)))
