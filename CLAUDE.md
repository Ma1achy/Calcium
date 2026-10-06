# Calcium

A terminal UI framework. The goal is simple: **the app looks and behaves like the design.**
The design is `docs/design/language/calcium-design-language.html` (its data is
`calcium-registry.json`). The reference app is `examples/agent`. Work is done when the
flows work and the screens match the design. Nothing else counts as done.

## Run everything in the devcontainer

`node`, `npm`, `make` and tests run inside `.devcontainer`, never on the host.

## How to work

1. Make the change.
2. Run the fast loop: `make check-fast` (typecheck, the tests related to the files you
   changed, and the flow tests for the area you touched). It should take under two minutes.
3. **Look at the screen.** Drive the app with the flow tests or `flow-probe.py` and check
   what is actually drawn. Never say something works without having seen it on screen.
4. Commit with a short, plain message saying what changed and why.

Run the full suite (`make test`) before pushing. Goldens, e2e and the slow checks run in
CI after a push; don't hold up local work waiting for them, and never run several full
suites at once.

## What must always hold

- **measure == render.** A block's measured height equals the rows it draws, at every width.
- **Layering.** No module imports from a layer above it.
- **Flow tests pass.** They drive the real app with keys and assert on the screen: where
  focus is drawn, what the footer says, where the cursor is.
- **Screens match the design.** A screen with a specimen in the design is compared against
  it; any allowed difference is listed with its reason.

## Decisions

The registry is the source of truth for colours, glyphs and key bindings. Where the design
is ambiguous, do what the HTML's picture shows. Where that doesn't settle it, use your
judgement, decide, and list the decision in one line in the PR description. Don't stop to
ask.

Ask first only for: weakening a safety default (anything that could approve, run or send
something the user didn't deliberately choose), adding a dependency, or reversing a ruling
Malachy made.

## Don't

- Don't write new markdown documents: no findings, rulings, ledgers, walks, triage files
  or reports. The PR description is the record.
- Don't amend specs before code. Update a spec only if leaving it would mislead someone;
  delete obsolete text rather than marking it superseded.
- Don't write essay comments or cite rule IDs in code. Comment only a non-obvious *why*,
  in a line or two.
- Don't add enforcement tools, report-only checks, allow-lists or mutation runs unless
  asked.
- Don't build ahead of the screen. If nothing on screen needs it yet, it waits.

The previous instructions are archived in `docs/archive/CLAUDE.v1.md` for reference; they
no longer apply.
