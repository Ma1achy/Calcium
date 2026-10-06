#!/usr/bin/env bash
# make check-fast: the local loop. Typecheck, the tests related to what changed, and
# the flow tests (test/flow/<area>*) for the area touched. CI runs everything else.
set -euo pipefail

if [ -n "${BASE:-}" ]; then
  changed=$( { git diff --name-only --diff-filter=d "$BASE"...HEAD; git diff --name-only --diff-filter=d HEAD; git ls-files --others --exclude-standard; } | sort -u)
else
  changed=$( { git diff --name-only --diff-filter=d HEAD; git ls-files --others --exclude-standard; } | sort -u)
  [ -n "$changed" ] || changed=$(git diff --name-only --diff-filter=d HEAD~1 HEAD)
fi
code=$(printf '%s\n' "$changed" | grep -E '^(src|test|examples|tools)/.*\.(ts|tsx|mjs)$' | grep -vE '^(test/(e2e|golden|browser)/)' || true)

echo "== typecheck"
npx tsc --noEmit

echo "== related tests ($(printf '%s\n' "$code" | grep -c . || true) changed files)"
if [ -n "$code" ]; then
  # shellcheck disable=SC2086
  npx vitest related $code --run --passWithNoTests --dir test --exclude '{e2e,golden,browser}/**'
fi

# area = src/<layer> or examples/<name>: shell, interaction, presentation, agent, docker, ...
areas=$(printf '%s\n' "$changed" | sed -nE 's#^(src|examples)/([^/]+)/.*#\2#p' | sort -u)
echo "== flow tests (areas: ${areas:-none})"
for a in $areas; do
  if ls test/flow/"$a"* >/dev/null 2>&1; then
    npx vitest run --dir test/flow --passWithNoTests "$a"
  else
    echo "no flow tests for $a (test/flow/$a*)"
  fi
done
