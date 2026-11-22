# One entry point for every quality gate. Hooks, pre-push and CI all run these recipes.

set shell := ["bash", "-euo", "pipefail", "-c"]

jscpd := "game/node_modules/.bin/jscpd"

# Run every gate
check: lint types complexity dupes deadcode test

# Install Python and TypeScript dependencies from the lockfiles
install:
    uv sync --frozen
    pnpm -C game install --frozen-lockfile
    lefthook install

# Lint and format checks (includes TypeScript complexity and size limits)
lint:
    uv run ruff format --check .
    uv run ruff check .
    pnpm -C game exec prettier --check .
    pnpm -C game exec eslint . --max-warnings 0
    uv run actionlint

# Strict type checks
types:
    uv run mypy
    pnpm -C game exec tsc --noEmit

# Python cognitive complexity and file length (Python cyclomatic limits run in lint)
complexity:
    uv run complexipy
    uv run python -m scripts.file_length

# Copy-paste detection across both languages
dupes:
    {{jscpd}} --config .jscpd.json

# Unused code, exports and dependencies
deadcode:
    uv run vulture
    pnpm -C game exec knip

# Tests with coverage thresholds
test:
    uv run pytest --cov --cov-report=term --cov-report=xml
    pnpm -C game exec vitest run --coverage

# Fast checks on specific files, for hooks and quick iteration
check-files +paths:
    #!/usr/bin/env bash
    set -euo pipefail
    py=(); ts=()
    for p in {{paths}}; do
      p="${p#"$PWD"/}"
      case "$p" in
        *.py) py+=("$p") ;;
        game/*.ts) ts+=("${p#game/}") ;;
      esac
    done
    if ((${#py[@]})); then
      uv run ruff format --check "${py[@]}"
      uv run ruff check "${py[@]}"
      uv run mypy "${py[@]}"
      uv run complexipy "${py[@]}"
    fi
    if ((${#ts[@]})); then
      pnpm -C game exec prettier --check "${ts[@]}"
      pnpm -C game exec eslint --max-warnings 0 "${ts[@]}"
    fi

# Apply automatic formatting and lint fixes
fix:
    uv run ruff format .
    uv run ruff check --fix .
    pnpm -C game exec prettier --write .
    pnpm -C game exec eslint . --fix

# Run every gate and write .quality/report.json with each violation's file, line and rule
report:
    uv run python -m scripts.quality_report

# Apply rebase-only merging, auto-merge and the main ruleset to GitHub (owner only)
github-settings:
    #!/usr/bin/env bash
    set -euo pipefail
    repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
    gh api -X PATCH "repos/$repo" -F allow_rebase_merge=true -F allow_squash_merge=false \
      -F allow_merge_commit=false -F delete_branch_on_merge=true -F allow_auto_merge=true >/dev/null
    gh api -X PUT "repos/$repo/vulnerability-alerts"  # turns on the dependency graph for dependency review
    gh api -X PUT "repos/$repo/actions/permissions/workflow" -f default_workflow_permissions=read \
      -F can_approve_pull_request_reviews=true >/dev/null  # lets the review job post verdicts
    id=$(gh api "repos/$repo/rulesets" --jq '.[] | select(.name == "main") | .id')
    if [ -n "$id" ]; then
      gh api -X PUT "repos/$repo/rulesets/$id" --input .github/rulesets/main.json >/dev/null
    else
      gh api -X POST "repos/$repo/rulesets" --input .github/rulesets/main.json >/dev/null
    fi
    echo "Applied merge settings and the main ruleset to $repo"

# Coverage of the lines changed since a base ref (CI runs this on PRs)
diff-coverage base="origin/main":
    uv run diff-cover coverage.xml game/coverage/cobertura-coverage.xml --compare-branch={{base}} --fail-under=90
