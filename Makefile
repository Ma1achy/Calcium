# A04 §5 — CI runs these targets, not equivalents.
#
# **`pipefail`, because a pipeline's exit code is its last stage's.** Reporting
# `make all` as green twice on the strength of `make all | tail`'s status is what
# put this line here: the suite had failed and `tail` had not. Recipes here run
# their commands directly, so this guards the ones added later — and
# `examples/docker/VERIFYING.md` carries the rule for invocations, which is where
# the mistake actually lives.
SHELL := /usr/bin/env bash
.SHELLFLAGS := -o pipefail -c

.PHONY: install hooks quantised check design design-check enforce catalogue instruments roadmap regime test golden e2e audit proof all clean

install:            ## npm ci, no install scripts, then the one named build (A04 §3)
	git config core.hooksPath .githooks
	npm ci --ignore-scripts
	npm rebuild node-pty --ignore-scripts=false
	@node -e "require('node-pty')" \
	  || (echo "node-pty did not build — tier 5 cannot run" && exit 1)
	@# **The examples are dependencies of `make check`, and this is where they
	@# arrive** (F156). F150 wired both examples' own `check` scripts into that
	@# target and did not wire their install, so it passed on a machine that had
	@# run them before and failed on the first clean checkout — CI's `fast` job,
	@# 19 seconds in, `TS2307: Cannot find module '@fmx/calcium'`.
	@#
	@# Two things are needed and only one is obvious. Their `node_modules` is
	@# the obvious half. The other is `dist/`: an example resolves the package
	@# through `file:../..`, and this package's `exports` name `dist/index.d.ts`
	@# — so `tsc --noEmit` in an example needs a build that `tsc --noEmit` at the
	@# root never performs. A04 §3 says install ends in *the one named build*,
	@# and it did not.
	npm run build
	cd examples/minimal && npm ci --ignore-scripts
	@# No lockfile here — `npm install` rather than `npm ci`, said out loud so
	@# the asymmetry reads as known rather than as an oversight.
	cd examples/docker && npm install --ignore-scripts --no-audit --no-fund

hooks:              ## point git at .githooks — pre-commit runs `make enforce` (A04 §5)
	git config core.hooksPath .githooks

themes:             ## C10 §4b — the ten themes, projected from the design registry (R-THM-001)
	node tools/theme/from-registry.mjs

quantised:          ## C10 I41 — the shipped themes' quantisations, regenerated from dist/ (T3.73 holds it to the code)
	npm run build
	node tools/theme/quantised.mjs

check:              ## type-check and lint, including the examples
	npm run check
	@# **The examples resolve `@fmx/calcium` to `dist/`, and `dist/` is built by
	@# `e2e` — the LAST target in `all`** (F447). So on any commit that widens a
	@# public type, this target type-checks the examples against the *previous*
	@# commit's build and passes; the failure surfaces on the next run, attributed
	@# to whatever landed in between. Measured: `scatter3d` joined `PlotForm`,
	@# `make check` went green, `make e2e` rebuilt `dist/`, and the example's
	@# `Record<PlotForm, Entry>` failed on the following commit's first check.
	@# **A gate that reads a generated artefact has to generate it.** The cost is
	@# one `tsc -p tsconfig.build.json`, which `e2e` pays again — the same work
	@# once earlier, against correctness that was not there at all.
	npm run build
	@# **The examples have `check` scripts and nothing ran them** (F150). The
	@# minimal example did not typecheck for as long as F58b's narrowing had
	@# been landed: `ProducedMeta` honours three `meta` keys and it supplied ten.
	@# It is the example R01 R4.4's reuse claim rests on and the one the README
	@# quotes, so a check it declares and nobody invokes is F144's class arriving
	@# at the surface a stranger meets first.
	@# **Discovered, not listed** (F150 again, third site). Naming the two by hand
	@# is what left `enforce`'s by-use population blind to a third example while
	@# both Makefile rows were green — so the population is the directory and the
	@# exception is named: a directory under `examples/` with a `package.json` is
	@# a consumer. The loop fails on the first non-zero, which a `for` in `sh`
	@# does not do by default.
	@set -e; for d in examples/*/package.json; do \
	  cd "$$(dirname $$d)" && npm run check && cd - >/dev/null; \
	done

# **The design language's own consistency, and it is a PREREQUISITE of `enforce`.**
# `docs/design/language/calcium-registry.json` is the normative source for appearance,
# interaction and keyboard navigation; the HTML beside it is a projection. A commit that
# moves one and not the other leaves the two disagreeing, and `check-calcium.mjs`
# rebuilds the HTML in memory and compares — so a stale projection is a red gate rather
# than a thing a reader notices later.
#
# **The two scripts cover each other and NEITHER IS SUFFICIENT ALONE** — measured here by
# forging R-STA-002 twice. `lint-immutable.mjs` compares a rule's *stored* `contentDigest`
# against the released baseline, so editing the text and leaving the digest alone passes it:
# it reports `content … intact` having checked a recorded field, not the content. What
# catches that is `check-calcium.mjs`, which RECOMPUTES the digest and fails on
# `immutable rule content drifted`. Invert it — move the text and the digest together, a
# consistent forgery — and the recompute agrees while `lint-immutable` fails on
# `released digest changed`, because the baseline is outside the file being edited.
# So: the checker holds the registry to itself, the lint holds it to the release, and a
# run of one is not a run of the other.
#
# **Beside `enforce` rather than inside `npm run enforce`**, because A03 is the module
# graph and the source scans and this is neither — it is the design's own record checking
# itself. The pre-commit hook runs `make enforce`, so the dependency is what makes the
# rule *regenerate the HTML in the same commit* enforced instead of remembered.
design-check:       ## the registry ↔ HTML projection, and released-rule immutability
	node docs/design/language/check-calcium.mjs
	node docs/design/language/lint-immutable.mjs

design:             ## regenerate the HTML and KEYS.md from the registry
	node docs/design/language/build-calcium.mjs

# **The types are a gate, and they were not one.** `make enforce` ran 402 files
# of source scans, the suite ran 6 416 rows, golden 528, tier 5 136 and three
# examples — all green over a `test/support/` file with a module path that
# resolves to nothing and two tape members whose `state` is not a `CallState`.
# Nothing in the chain compiles the tests: vitest strips types rather than
# checking them, and `npm run check` was a command a person remembered. The
# tape's two members drew **no mark at all**, which is what an unset optional
# field looks like from a frame — a defect the golden recorded and could not
# report, because an absent mark is a legible picture.
typecheck:          ## tsc over src and test — vitest strips types, it does not check them
	npx tsc --noEmit

enforce: design-check typecheck  ## A03 — module graph, source scans, supply chain
	npm run enforce

# **A gate that reads a generated artefact has to generate it** — the `check`
# rule above, arriving at the catalogue. `docs/catalogue/` is gitignored, and
# two of `instruments`' fixtures read it: PC11 sweeps every frame for an SGR
# code without an arm, and F241's counter wants a `colourDepth: 4` frame under
# `status/`. Both were green on every developer machine, where the directory
# had been generated by hand at some point, and `ENOENT: scandir docs/catalogue`
# on every CI run from 2026-08-23 — thirteen days, `main` included — with nobody
# reading the red. The three generators here are the three PC11's own comment
# names as the sources of what it sweeps: the plot frames, `status/`, and
# `interaction/`, where the `7m` it exists to watch for first appeared. **36 s**
# in the container (F806) — 2 440 plot frames, the status set, 120 interaction files.
catalogue:          ## the frames `instruments` and `test` sweep — generated, gitignored, so made here
	npx tsx tools/plot-catalogue.mjs
	npx tsx tools/status-proof.mjs
	npx tsx tools/interaction-catalogue.mjs

# **A prerequisite, not a step in `all`** — the degraded jobs run `make test` alone
# and PC11 lives in the suite too, so the dependency has to travel with the target.
instruments: catalogue  ## every instrument's own fixture, and the inventory by equality (group 9)
	node tools/instruments.mjs

mutate: catalogue     ## every mutation run, serially, the tree hashed either side (F952) — SHARD=k/n ONLY=substr
	@# **`catalogue` for the same reason `test` has it, and the reason is two
	@# targets up**: `docs/catalogue/` is generated and gitignored, and the runs
	@# drive suites that read it. Without it `c12-ascii-alphabet` dies in nine
	@# seconds on `BlindHarnessError: the unmutated suite already fails`, which
	@# is the harness's vacuity guard working and the caller having broken the
	@# baseline — `caught 0 survived 0 expected 0`, a run that measured nothing.
	@# Invisible on any machine that has ever run `make test`, and red on the
	@# first CI run this workflow ever had (F1097).
	@# **Runs weekly in CI as `mutation-sweep`, six shards**, which is what closes
	@# F952: a run with no row that sees a mutation reads exactly like one that
	@# does until the pass is run, and a pass is a session by hand. Here for a
	@# desk: `make mutate ONLY=c12-` runs one component's runs. The anchors
	@# sweep goes first and a red one runs nothing.
	node tools/mutate/sweep.mjs $(if $(SHARD),--shard $(SHARD)) $(if $(ONLY),--only $(ONLY))

roadmap:            ## the Order column's claims, resolved against the tree
	@# **Reports through `make instruments` as well**, where its fixture lives.
	@# Here as a target of its own because the column is edited by hand and this
	@# is the one-line answer to *did I break a citation* — the same reason
	@# `enforce` is separable from `all`.
	node tools/roadmap-status.mjs

profile:            ## A01 Appendix B, filled from a real session (C28 T5.3)
	@# **Reports, never fails** — `regime`'s disposition, for `regime`'s reason: a
	@# budget is a claim about a regime and a runner is not the regime it was
	@# measured in. Four of the appendix's six rows come back measured and two come
	@# back refused naming what they need, which is the output, not a shortfall.
	@#
	@# **Needs `dist/`**, so it builds first: a probe against a stale build gives a
	@# wrong negative and nothing revisits a ruled-out candidate.
	npm run build
	node tools/profile.mjs

regime:             ## what a source-scan pass costs *here*, beside the recorded figures
	@# **Reports, never fails.** A budget is a claim about a regime and a runner
	@# is not the regime it was measured in — so the number a foreign run needs
	@# is its own, printed next to ours. A gate that went red on a busy machine
	@# would teach people to re-run gates, which is the opposite of the point.
	node tools/scan-cost.mjs

test: catalogue               ## tiers 1-4, and the examples' own suites
	npm run test
	@# **The example suites were in no target at all** — `make check` type-checks
	@# them and nothing ran them, so `examples/docker`'s 313 rows could go red
	@# while all seven targets stayed green. That happened: widening
	@# `Series.values` to carry a gap left four rows asserting `NaN` and the gate
	@# reported clean. It is F150's finding one level out — an example's `check`
	@# script that nothing invoked — arriving on the script beside it, which is
	@# the argument for wiring the *pair* rather than the one that bit.
	@set -e; for d in examples/*/package.json; do \
	  cd "$$(dirname $$d)" && npm test --if-present && cd - >/dev/null; \
	done

golden:             ## golden frames, 4 widths x 2 themes x 2 unicode modes
	npm run golden

e2e:                ## tier 5, PTY harness
	npm run e2e

audit:              ## npm audit + dependency manifest
	npm run audit
	npm run enforce

proof:              ## pack, install the tarball clean, run the example against it (R01)
	bash tools/proof.sh

# **`instruments` is in here rather than run by hand**, which is the whole of
# group 9's remedy: eleven fixtures nobody runs is the fifth class in
# `examples/docker/VERIFYING.md` — a gate nobody reports — arriving in the gate
# built to answer it. It costs about ten seconds.
# **`proof` is in here now** (F807). It was CI-only in practice — the first instance the
# gate-not-run note records — and it was red on an npm crash for as long as the fast job
# hid it; the local chain never ran it. About a minute.
all: check enforce audit instruments test golden e2e proof

clean:
	rm -rf dist node_modules

help:
	@grep -E '^[a-z-]+:.*?##' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "};{printf "  \033[36m%-10s\033[0m %s\n",$$1,$$2}'

# **`refdiff` is a gate, not a setup note.** The standing rule is that no plot
# form counts as done until it has been put beside two references — a terminal
# implementation and matplotlib — and a rule remembered per form lapses on the
# thirty-fifth. This automates the half that can be: matplotlib rendered to
# braille on the same cell grid, so the comparison is a text diff rather than
# two pictures. Kept out of `all` because it needs a second container.
refdiff:            ## every form beside its braille-rendered matplotlib twin
	mkdir -p .refdiff
	docker exec calcium-dev npx tsx tools/refdiff/export-fixtures.ts .refdiff
	docker build -q -t calcium-refdiff -f tools/refdiff/Dockerfile tools/refdiff
	cp tools/refdiff/reference.py .refdiff/
	docker run --rm -e RD_COLS=64 -e RD_ROWS=16 -v "$(PWD)/.refdiff:/work" \
	  calcium-refdiff python /work/reference.py
	docker exec calcium-dev npx tsx tools/refdiff/pair.mjs
