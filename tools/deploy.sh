#!/usr/bin/env bash
# Publishes the verified site to the public GitHub Pages repo.
# Run only after tools/verify.mjs passes. Safe to re-run: it commits, pushes and
# re-checks the Pages build. It never force-pushes and never rewrites history.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="HermesAlfredGuy/vesper-website-20261018"
BRANCH="main"
URL="https://hermesalfredguy.github.io/vesper-website-20261018/"

git add -A
if ! git diff --cached --quiet; then
  git commit -q -m "${1:-VESPER: update site}"
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  if gh repo view "$REPO" >/dev/null 2>&1; then
    git remote add origin "https://github.com/$REPO.git"
  else
    gh repo create "$REPO" --public --source=. --remote=origin \
      --description "VESPER — a concept landing page for a fictional sculptural portable light (design study, not a product for sale)."
  fi
fi

git push -u origin "$BRANCH"

# Pages from the branch root, if it is not already enabled.
if ! gh api "repos/$REPO/pages" >/dev/null 2>&1; then
  gh api --method POST "repos/$REPO/pages" -f "source[branch]=$BRANCH" -f "source[path]=/" >/dev/null
fi

for i in $(seq 1 40); do
  STATUS=$(gh api "repos/$REPO/pages/builds/latest" --jq '.status' 2>/dev/null || echo pending)
  echo "pages build: $STATUS"
  if [ "$STATUS" = "built" ]; then break; fi
  sleep 15
done

echo "live: $URL"
curl -sS -o /dev/null -w "index.html -> %{http_code}\n" "$URL"
