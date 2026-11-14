#!/usr/bin/env bash
# Publishing for GitHub Pages. Pages serves the `release` branch:
#   /LUNI/        the released version (what the judges and everyone else see)
#   /LUNI/next/   the newest work in progress, for trying things before they are released
#
#   tools/release.sh next      copy the current commit into next/ only (the public version does not change)
#   tools/release.sh promote   make the current commit the public version too, and tag it r1, r2, ...
#
# Run from the repository, on a clean, committed tree. Never edits files on `main`.
set -euo pipefail
mode="${1:-}"; [[ "$mode" == "next" || "$mode" == "promote" ]] || { echo "usage: tools/release.sh next|promote"; exit 2; }
root="$(git rev-parse --show-toplevel)"; cd "$root"
[[ -z "$(git status --porcelain)" ]] || { echo "commit your changes first"; exit 1; }
src="$(git rev-parse HEAD)"; short="$(git rev-parse --short HEAD)"
tmp="$(mktemp -d)"; trap 'git worktree remove --force "$tmp" >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT

git fetch -q origin release 2>/dev/null || true
if git rev-parse -q --verify origin/release >/dev/null; then
  git worktree add -q --detach "$tmp" origin/release
else                                    # first time: an empty branch
  git worktree add -q --detach "$tmp" "$src"
  git -C "$tmp" checkout -q --orphan release-new; git -C "$tmp" rm -rq --cached . ; find "$tmp" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  mode="promote"
fi

fill() { mkdir -p "$1"; git archive "$src" | tar -x -C "$1"; }
if [[ "$mode" == "promote" ]]; then
  find "$tmp" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  fill "$tmp"
fi
rm -rf "$tmp/next"; fill "$tmp/next"
printf '%s\n' "$src" > "$tmp/next/VERSION"; [[ "$mode" == "promote" ]] && printf '%s\n' "$src" > "$tmp/VERSION"

git -C "$tmp" add -A
if git -C "$tmp" diff --cached --quiet; then echo "nothing to publish: release already has $short"; exit 0; fi
n=$(( $(git tag -l 'r[0-9]*' | sed 's/^r//' | sort -n | tail -1) + 0 ))
if [[ "$mode" == "promote" ]]; then n=$((n + 1)); msg="Release r$n from main $short"; else msg="Work in progress (next/) from main $short"; fi
git -C "$tmp" -c user.name="LUNO team" -c user.email="luno@users.noreply.github.com" commit -q -m "$msg"
git push -q origin "$(git -C "$tmp" rev-parse HEAD):refs/heads/release"
if [[ "$mode" == "promote" ]]; then git tag -a "r$n" -m "Public release r$n" "$src"; git push -q origin "r$n"; fi
echo "$msg -> pushed to the release branch"
