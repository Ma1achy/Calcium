# The fixture containers — the set the surfaces were designed against.
#
# **"Fixtures" means two different things in this repository and this file means
# the containers.** R01 §7's fixtures are a recorded corpus under `test/corpus/`,
# which is what lets CI run the app's suite with no docker at all. These are live
# containers, and nothing here is needed to run the tests.
#
# An empty daemon is a bad demo and an unreadable frame-read: `/ps` on nothing is
# the empty-block class rather than the table, `/drift` has nothing to drift from,
# and S3's plot draws a flat line at zero for a container that is idle rather than
# absent — which DASHBOARD_WALK A3 spends a page distinguishing.
SHELL := /usr/bin/env bash
.SHELLFLAGS := -o pipefail -c

.PHONY: fixtures fixtures-down load-down fixtures-status help

# ── The host path, and it is not a detail ────────────────────────────────────
#
# **A bind mount created from inside this container names a path in the *host's*
# filesystem.** The devcontainer talks to the host's daemon (outside-of-docker,
# A04 §4), so `-v /workspaces/tui-kit/…` is resolved by the daemon against the
# host, where nothing of that name exists. Measured:
#
#     docker run -v /workspaces/tui-kit/examples/docker:/probe alpine ls /probe
#     -> mounts denied: the path /workspaces/tui-kit/examples/docker is not
#        shared from the host and is not known to Docker.
#
# The same string means two different directories depending on which side of the
# socket reads it, and the failure is a refusal rather than an empty mount — which
# is the good case and is not guaranteed for every path.
#
# So the host's view is asked for rather than assumed. The dev container carries
# `devcontainer.local_folder` as a label, and `hostname` inside a container is its
# own id, so the daemon can be asked where this checkout really lives. Outside a
# container both lookups fail and `$(CURDIR)` is already the host's path.
HOST_ROOT := $(shell docker inspect "$$(hostname)" \
	--format '{{index .Config.Labels "devcontainer.local_folder"}}' 2>/dev/null)
ifeq ($(strip $(HOST_ROOT)),)
HOST_ROOT := $(patsubst %/,%,$(dir $(patsubst %/,%,$(dir $(CURDIR)))))
endif
FIX := $(HOST_ROOT)/examples/docker/fixtures

fixtures:           ## bring up the demo containers (idempotent — removes any first)
	@$(MAKE) --no-print-directory fixtures-down
	@echo "host checkout: $(HOST_ROOT)"
	@# S2, S3, S7 — a published port, a bind mount, and one environment variable
	@# the image does not set, so `/drift` has a row that is the operator's rather
	@# than the daemon's.
	docker run -d --name dtui-web \
	  -p 8080:80 \
	  -e LOG_LEVEL=debug \
	  -v "$(FIX)/index.html:/usr/share/nginx/html/index.html:ro" \
	  nginx:alpine >/dev/null
	@# S8 — 16 lines over the image's 44, which is what makes the patch block
	@# show hunks with context rather than a whole-file replacement.
	docker run -d --name dtui-cfg \
	  -v "$(FIX)/nginx-default.conf:/etc/nginx/conf.d/default.conf:ro" \
	  nginx:alpine >/dev/null
	@# S2's stopped pill and S11's `/events` die row. It must **exit**, so it is
	@# started and left to finish rather than run with `--rm`.
	docker run -d --name dtui-quiet alpine \
	  sh -c 'echo "dtui-quiet: started, and about to stop"; sleep 2' >/dev/null
	@# S3's plot needs a curve. See `load-down` — this one is not like the others.
	docker run -d --name dtui-load alpine \
	  sh -c 'while :; do :; done' >/dev/null
	@$(MAKE) --no-print-directory fixtures-status

fixtures-down:      ## remove all four, running or not
	@docker rm -f dtui-web dtui-cfg dtui-quiet dtui-load >/dev/null 2>&1 || true

# **The teardown is the load-bearing half of this file, and it has its own
# target so it can be run without losing the rest of the set.**
#
# A busy container made tier 5's `T5.3a` fail during step 4. It passed when run
# alone and `make all` went green the moment the container was removed —
# `load introduced is not flakiness found`, and VERIFYING.md §7 carries the full
# account. The failure reads exactly like "my change broke it", and it was wrong
# in both directions: first the change was blamed, then the machine.
#
# **Re-measured when this target was written, and it did not reproduce**: tier 5
# ran green with `dtui-load` up, 94 passed and 7 todo, `E2E_WITH_LOAD_EXIT=0`.
# Both results are real, and the honest reading is that C03's thresholds have
# margin on an idle multi-core host and had none on a busy one. So this target is
# **a precaution against a hazard that has fired once, not a reproducer** — which
# is worth stating, because a rule justified by a failure nobody can reproduce is
# the kind that gets deleted by the next person who checks.
#
# It stays for the asymmetry rather than the odds. Running it costs a second;
# not running it costs a timing failure diagnosed as a code change, which is the
# most expensive wrong answer in this repository's history.
#
# `dtui-load` spins a shell in a tight loop, so it takes a whole core for as long
# as it exists. Nothing else here perturbs a timing assertion.
load-down:          ## remove ONLY the load generator — run this before any timing tier
	@docker rm -f dtui-load >/dev/null 2>&1 || true
	@echo "dtui-load removed — tier 5 is safe to run"

fixtures-status:    ## what is up
	@docker ps -a --filter 'name=dtui-' \
	  --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

help:
	@grep -E '^[a-z-]+:.*?##' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "};{printf "  \033[36m%-16s\033[0m %s\n",$$1,$$2}'
