# A04 §5 — CI runs these targets, not equivalents.
.PHONY: install hooks check enforce test golden e2e audit all clean

install:            ## npm ci, no install scripts, then the one named build (A04 §3)
	git config core.hooksPath .githooks
	npm ci --ignore-scripts
	npm rebuild node-pty --ignore-scripts=false
	@node -e "require('node-pty')" \
	  || (echo "node-pty did not build — tier 5 cannot run" && exit 1)

hooks:              ## point git at .githooks — pre-commit runs `make enforce` (A04 §5)
	git config core.hooksPath .githooks

check:              ## type-check and lint
	npm run check

enforce:            ## A03 — module graph, source scans, supply chain
	npm run enforce

test:               ## tiers 1-4
	npm run test

golden:             ## golden frames, 4 widths x 2 themes x 2 unicode modes
	npm run golden

e2e:                ## tier 5, PTY harness
	npm run e2e

audit:              ## npm audit + dependency manifest
	npm run audit
	npm run enforce

all: check enforce audit test golden e2e

clean:
	rm -rf dist node_modules

help:
	@grep -E '^[a-z-]+:.*?##' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "};{printf "  \033[36m%-10s\033[0m %s\n",$$1,$$2}'
