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

.PHONY: install hooks check enforce instruments regime test golden e2e audit proof all clean

install:            ## npm ci, no install scripts, then the one named build (A04 §3)
	git config core.hooksPath .githooks
	npm ci --ignore-scripts
	npm rebuild node-pty --ignore-scripts=false
	@node -e "require('node-pty')" \
	  || (echo "node-pty did not build — tier 5 cannot run" && exit 1)

hooks:              ## point git at .githooks — pre-commit runs `make enforce` (A04 §5)
	git config core.hooksPath .githooks

check:              ## type-check and lint, including the examples
	npm run check
	@# **The examples have `check` scripts and nothing ran them** (F150). The
	@# minimal example did not typecheck for as long as F58b's narrowing had
	@# been landed: `ProducedMeta` honours three `meta` keys and it supplied ten.
	@# It is the example R01 R4.4's reuse claim rests on and the one the README
	@# quotes, so a check it declares and nobody invokes is F144's class arriving
	@# at the surface a stranger meets first.
	cd examples/minimal && npm run check
	cd examples/docker && npm run check

enforce:            ## A03 — module graph, source scans, supply chain
	npm run enforce

instruments:        ## every instrument's own fixture, and the inventory by equality (group 9)
	node tools/instruments.mjs

regime:             ## what a source-scan pass costs *here*, beside the recorded figures
	@# **Reports, never fails.** A budget is a claim about a regime and a runner
	@# is not the regime it was measured in — so the number a foreign run needs
	@# is its own, printed next to ours. A gate that went red on a busy machine
	@# would teach people to re-run gates, which is the opposite of the point.
	node tools/scan-cost.mjs

test:               ## tiers 1-4
	npm run test

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
all: check enforce audit instruments test golden e2e

clean:
	rm -rf dist node_modules

help:
	@grep -E '^[a-z-]+:.*?##' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "};{printf "  \033[36m%-10s\033[0m %s\n",$$1,$$2}'
